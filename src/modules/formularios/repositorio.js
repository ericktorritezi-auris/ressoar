// Acesso a tabela formularios (secao 5.2 do mapeamento): disparo de um
// formulario (template pronto ou personalizado) para um destinatario
// dentro de um municipio. A resposta em si vira uma linha em submissoes
// (src/modules/submissoes/repositorio.js), nao aqui.

const { withTenantContext } = require('../../config/db');

function contextoDe(tenant) {
  return { municipioId: tenant.municipioId, isMaster: tenant.isMaster, usuarioId: tenant.usuarioId };
}

async function criar(tenant, dados) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `INSERT INTO formularios (municipio_id, modelo, nome, descricao, campos, destinatario_id, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        dados.municipioId,
        dados.modelo,
        dados.nome,
        dados.descricao || null,
        JSON.stringify(dados.campos),
        dados.destinatarioId,
        tenant.usuarioId,
      ]
    );
    return rows[0].id;
  });
}

async function listarPorMunicipio(tenant, municipioId) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT f.id, f.modelo, f.nome, f.status, f.criado_em, f.respondido_em,
              d.nome AS destinatario_nome, c.nome AS criado_por_nome
         FROM formularios f
         JOIN usuarios d ON d.id = f.destinatario_id
         JOIN usuarios c ON c.id = f.criado_por
        WHERE f.municipio_id = $1
        ORDER BY f.criado_em DESC`,
      [municipioId]
    );
    return rows;
  });
}

// "Meus formularios": os disparados para o usuario logado, em qualquer
// municipio que ele enxergue via RLS (na pratica, so o proprio).
//
// Bug encontrado em 2026-09-29 (relatado pelo usuario com print de tela):
// f.status so tem 'pendente'/'respondido' — quando o master aprova a
// resposta, so submissoes.status muda (fica 'aprovado'), NADA em
// formularios e tocado. Resultado: pro destinatario, a tela ficava travada
// em "Respondido — aguardando revisão" pra sempre, mesmo depois de
// aprovado (so saia dessa mensagem se fosse REJEITADO, que reabre pra
// 'pendente'). Corrigido trazendo junto o status da submissao mais
// recente vinculada a cada formulario (LATERAL), que e quem de fato sabe
// se foi aprovado — a view usa esse campo pra decidir o rotulo certo, em
// vez de so f.status.
async function listarParaDestinatario(tenant) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT f.id, f.modelo, f.nome, f.descricao, f.status, f.criado_em, f.respondido_em,
              m.nome AS municipio_nome, s.status AS submissao_status
         FROM formularios f
         JOIN municipios m ON m.id = f.municipio_id
         LEFT JOIN LATERAL (
           SELECT status FROM submissoes
            WHERE formulario_id = f.id
            ORDER BY versao DESC
            LIMIT 1
         ) s ON true
        WHERE f.destinatario_id = $1
        ORDER BY f.status ASC, f.criado_em DESC`,
      [tenant.usuarioId]
    );
    return rows;
  });
}

async function buscarPorId(tenant, id) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT f.*, d.nome AS destinatario_nome, m.nome AS municipio_nome
         FROM formularios f
         JOIN usuarios d ON d.id = f.destinatario_id
         JOIN municipios m ON m.id = f.municipio_id
        WHERE f.id = $1`,
      [id]
    );
    return rows[0] || null;
  });
}

async function marcarRespondido(tenant, id) {
  return withTenantContext(contextoDe(tenant), (client) =>
    client.query(`UPDATE formularios SET status = 'respondido', respondido_em = now() WHERE id = $1`, [id])
  );
}

// Rejeitada a resposta (pela mesma fila de submissoes), o formulario
// volta a ficar pendente para o destinatario responder de novo — mesma
// logica de reenvio/versionamento da planilha (secao 5.1 e 5.2).
async function reabrirParaNovaResposta(tenant, id) {
  return withTenantContext(contextoDe(tenant), (client) =>
    client.query(`UPDATE formularios SET status = 'pendente', respondido_em = NULL WHERE id = $1`, [id])
  );
}

module.exports = {
  criar,
  listarPorMunicipio,
  listarParaDestinatario,
  buscarPorId,
  marcarRespondido,
  reabrirParaNovaResposta,
};
