// Acesso a tabela submissoes (secao 5 do mapeamento): fila unica de
// aprovacao para planilhas importadas E respostas de formulario. Usada
// pelos modulos planilhas/ e formularios/ — nao tem rotas proprias.

const { withTenantContext } = require('../../config/db');

function contextoDe(tenant) {
  return { municipioId: tenant.municipioId, isMaster: tenant.isMaster, usuarioId: tenant.usuarioId };
}

async function proximaVersao(tenant, municipioId, tipo, formularioId = null) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const condicaoFormulario = formularioId ? 'AND formulario_id = $3' : 'AND formulario_id IS NULL';
    const parametros = formularioId ? [municipioId, tipo, formularioId] : [municipioId, tipo];
    const { rows } = await client.query(
      `SELECT COALESCE(MAX(versao), 0) AS max_versao
         FROM submissoes
        WHERE municipio_id = $1 AND tipo = $2 ${condicaoFormulario}`,
      parametros
    );
    return Number(rows[0].max_versao) + 1;
  });
}

async function criar(tenant, dados) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `INSERT INTO submissoes
         (municipio_id, tipo, formulario_id, origem, versao, dados, enviado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        dados.municipioId,
        dados.tipo,
        dados.formularioId || null,
        dados.origem,
        dados.versao,
        JSON.stringify(dados.dados),
        tenant.usuarioId,
      ]
    );
    return rows[0].id;
  });
}

async function listarPorMunicipio(tenant, municipioId, tipo) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT s.id, s.tipo, s.origem, s.versao, s.status, s.enviado_em, s.revisado_em,
              s.motivo_rejeicao, u.nome AS enviado_por_nome, r.nome AS revisado_por_nome,
              f.nome AS formulario_nome
         FROM submissoes s
         JOIN usuarios u ON u.id = s.enviado_por
         LEFT JOIN usuarios r ON r.id = s.revisado_por
         LEFT JOIN formularios f ON f.id = s.formulario_id
        WHERE s.municipio_id = $1 AND s.tipo = $2
        ORDER BY s.enviado_em DESC`,
      [municipioId, tipo]
    );
    return rows;
  });
}

async function listarPorFormulario(tenant, formularioId) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT s.id, s.versao, s.status, s.dados, s.enviado_em, s.revisado_em, s.motivo_rejeicao,
              u.nome AS enviado_por_nome, r.nome AS revisado_por_nome
         FROM submissoes s
         JOIN usuarios u ON u.id = s.enviado_por
         LEFT JOIN usuarios r ON r.id = s.revisado_por
        WHERE s.formulario_id = $1
        ORDER BY s.versao DESC`,
      [formularioId]
    );
    return rows;
  });
}

async function buscarPorId(tenant, id) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT s.*, u.nome AS enviado_por_nome, r.nome AS revisado_por_nome, f.nome AS formulario_nome
         FROM submissoes s
         JOIN usuarios u ON u.id = s.enviado_por
         LEFT JOIN usuarios r ON r.id = s.revisado_por
         LEFT JOIN formularios f ON f.id = s.formulario_id
        WHERE s.id = $1`,
      [id]
    );
    return rows[0] || null;
  });
}

async function aprovar(tenant, id) {
  return withTenantContext(contextoDe(tenant), (client) =>
    client.query(
      `UPDATE submissoes SET status = 'aprovado', revisado_por = $1, revisado_em = now()
        WHERE id = $2 AND status = 'rascunho_pendente'`,
      [tenant.usuarioId, id]
    )
  );
}

async function rejeitar(tenant, id, motivo) {
  return withTenantContext(contextoDe(tenant), (client) =>
    client.query(
      `UPDATE submissoes
          SET status = 'rejeitado', revisado_por = $1, revisado_em = now(), motivo_rejeicao = $2
        WHERE id = $3 AND status = 'rascunho_pendente'`,
      [tenant.usuarioId, motivo || null, id]
    )
  );
}

module.exports = {
  proximaVersao,
  criar,
  listarPorMunicipio,
  listarPorFormulario,
  buscarPorId,
  aprovar,
  rejeitar,
};
