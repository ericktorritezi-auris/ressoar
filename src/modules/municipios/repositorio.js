// Acesso a dados de municipios. Sempre dentro de withTenantContext: um
// gestor_carteira so consegue ver/editar o proprio municipio; o master ve
// todos (secao 2 e 8 do mapeamento).

const { withTenantContext } = require('../../config/db');

function contextoDe(tenant) {
  return { municipioId: tenant.municipioId, isMaster: tenant.isMaster, usuarioId: tenant.usuarioId };
}

async function listar(tenant) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT id, codigo_ibge, nome, uf, populacao, brasao_url,
              contrato_inicio, contrato_vigencia, gestor_carteira_id,
              prefeito_nome, prefeito_partido, mandato_inicio, mandato_fim,
              eh_municipio_teste, criado_em
         FROM municipios
        ORDER BY nome`
    );
    return rows;
  });
}

async function buscarPorId(tenant, id) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT id, codigo_ibge, nome, uf, populacao, brasao_url,
              contrato_inicio, contrato_vigencia, gestor_carteira_id,
              prefeito_nome, prefeito_partido, mandato_inicio, mandato_fim,
              eh_municipio_teste, criado_em, mapa_svg, mapa_atualizado_em
         FROM municipios
        WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  });
}

async function criar(tenant, dados) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `INSERT INTO municipios
         (codigo_ibge, nome, uf, populacao, brasao_url, contrato_inicio,
          contrato_vigencia, gestor_carteira_id, prefeito_nome,
          prefeito_partido, mandato_inicio, mandato_fim)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        dados.codigoIbge || null,
        dados.nome,
        dados.uf,
        dados.populacao || null,
        dados.brasaoUrl || null,
        dados.contratoInicio || null,
        dados.contratoVigencia || null,
        dados.gestorCarteiraId || null,
        dados.prefeitoNome || null,
        dados.prefeitoPartido || null,
        dados.mandatoInicio || null,
        dados.mandatoFim || null,
      ]
    );
    return rows[0].id;
  });
}

async function atualizar(tenant, id, dados) {
  return withTenantContext(contextoDe(tenant), (client) =>
    client.query(
      `UPDATE municipios
          SET nome = $1, uf = $2, populacao = $3, brasao_url = $4,
              contrato_inicio = $5, contrato_vigencia = $6, gestor_carteira_id = $7,
              prefeito_nome = $8, prefeito_partido = $9, mandato_inicio = $10,
              mandato_fim = $11
        WHERE id = $12`,
      [
        dados.nome,
        dados.uf,
        dados.populacao || null,
        dados.brasaoUrl || null,
        dados.contratoInicio || null,
        dados.contratoVigencia || null,
        dados.gestorCarteiraId || null,
        dados.prefeitoNome || null,
        dados.prefeitoPartido || null,
        dados.mandatoInicio || null,
        dados.mandatoFim || null,
        id,
      ]
    )
  );
}

async function atualizarPopulacao(tenant, id, populacao) {
  return withTenantContext(contextoDe(tenant), (client) =>
    client.query('UPDATE municipios SET populacao = $1 WHERE id = $2', [populacao, id])
  );
}

// Painel de Localização (seção 4 do mapeamento, novo UX 2026-09-29):
// guarda o SVG do contorno do município, buscado uma única vez do IBGE.
async function atualizarMapa(tenant, id, svgTexto) {
  return withTenantContext(contextoDe(tenant), (client) =>
    client.query('UPDATE municipios SET mapa_svg = $1, mapa_atualizado_em = now() WHERE id = $2', [svgTexto, id])
  );
}

// Reconcilia, numa unica operacao, quais municipios um gestor_carteira
// administra — usado pelo checklist "Municípios sob esta carteira" na
// tela do usuário (module usuarios), complementar ao campo "Gestor de
// carteira responsável" na tela do município: os dois editam a MESMA
// coluna (municipios.gestor_carteira_id), só que a partir de lados
// diferentes.
async function definirCarteiraDoGestor(tenant, gestorId, municipioIds) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    await client.query('BEGIN');
    try {
      // Tira o gestor de qualquer municipio que ele administrava antes e
      // que nao esta mais marcado.
      await client.query(
        `UPDATE municipios SET gestor_carteira_id = NULL
          WHERE gestor_carteira_id = $1 AND NOT (id = ANY($2::uuid[]))`,
        [gestorId, municipioIds]
      );
      if (municipioIds.length > 0) {
        await client.query(
          `UPDATE municipios SET gestor_carteira_id = $1 WHERE id = ANY($2::uuid[])`,
          [gestorId, municipioIds]
        );
      }
      await client.query('COMMIT');
    } catch (erro) {
      await client.query('ROLLBACK');
      throw erro;
    }
  });
}

async function listarGestoresCarteira(tenant) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT id, nome FROM usuarios WHERE perfil IN ('master', 'gestor_carteira') AND ativo ORDER BY nome`
    );
    return rows;
  });
}

async function salvarSnapshotLinhaBase(tenant, municipioId, codigoIbge, valores) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    await client.query('BEGIN');
    try {
      for (const v of valores) {
        await client.query(
          `INSERT INTO snapshots_linha_base (municipio_id, codigo_ibge, chave, valor_numerico, valor_texto)
           VALUES ($1, $2, $3, $4, $5)`,
          [municipioId, codigoIbge, v.chave, v.valorNumerico ?? null, v.valorTexto ?? null]
        );
      }
      await client.query('COMMIT');
    } catch (erro) {
      await client.query('ROLLBACK');
      throw erro;
    }
  });
}

async function buscarSnapshotLinhaBase(tenant, municipioId) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT chave, valor_numerico, valor_texto, congelado_em
         FROM snapshots_linha_base
        WHERE municipio_id = $1
        ORDER BY congelado_em DESC`,
      [municipioId]
    );
    return rows;
  });
}

module.exports = {
  listar,
  buscarPorId,
  criar,
  atualizar,
  atualizarPopulacao,
  atualizarMapa,
  listarGestoresCarteira,
  definirCarteiraDoGestor,
  salvarSnapshotLinhaBase,
  buscarSnapshotLinhaBase,
};
