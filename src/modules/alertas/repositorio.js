// Persistencia do sino de alertas (Fase 4 — docs/mapeamento-fase4-bi-dashboards.md,
// secao 5). Alertas de mandato e de indicador fora do padrao sao
// materializados aqui (via upsert idempotente por chave_dedup — ver
// servico.js); formulario pendente e refletido ao vivo pela tabela
// formularios existente, sem precisar de uma linha propria.

const { withTenantContext } = require('../../config/db');

function contextoDe(tenant) {
  return { municipioId: tenant.municipioId, isMaster: tenant.isMaster, usuarioId: tenant.usuarioId };
}

// Idempotente: se a mesma chave_dedup ja existe para o municipio, nao
// duplica nem reabre um alerta ja lido (ON CONFLICT DO NOTHING) — recalcular
// com frequencia (ex.: toda vez que o sino e aberto) e seguro.
async function upsertAlerta(tenant, municipioId, alerta) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    await client.query(
      `INSERT INTO alertas (municipio_id, tipo, nivel, titulo, mensagem, chave_dedup)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (municipio_id, chave_dedup) DO NOTHING`,
      [municipioId, alerta.tipo, alerta.nivel, alerta.titulo, alerta.mensagem, alerta.chaveDedup]
    );
  });
}

// Lista os alertas visiveis para o tenant (RLS: master ve todos, gestor de
// carteira so os da propria carteira, demais perfis so o proprio
// municipio), mais recentes primeiro, com o nome do municipio junto (util
// pro master/gestor que enxergam varios).
async function listarAtivos(tenant) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT a.id, a.tipo, a.nivel, a.titulo, a.mensagem, a.gerado_em, a.lido_em,
              a.municipio_id, m.nome AS municipio_nome
         FROM alertas a
         JOIN municipios m ON m.id = a.municipio_id
        ORDER BY a.lido_em IS NOT NULL, a.gerado_em DESC`
    );
    return rows;
  });
}

async function contarNaoLidos(tenant) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query('SELECT count(*)::int AS total FROM alertas WHERE lido_em IS NULL');
    return rows[0].total;
  });
}

async function marcarLido(tenant, id) {
  return withTenantContext(contextoDe(tenant), (client) =>
    client.query('UPDATE alertas SET lido_em = now() WHERE id = $1 AND lido_em IS NULL', [id])
  );
}

// Formularios pendentes visiveis ao tenant — fonte "ao vivo" (nao
// materializada), ja que a tabela formularios e quem sabe a verdade sobre
// pendencia (ver comentario de bug em formularios/repositorio.js sobre o
// status nao refletir sozinho a revisao).
async function listarFormulariosPendentes(tenant) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT f.id, f.nome, f.criado_em, f.municipio_id, m.nome AS municipio_nome, d.nome AS destinatario_nome
         FROM formularios f
         JOIN municipios m ON m.id = f.municipio_id
         JOIN usuarios d ON d.id = f.destinatario_id
        WHERE f.status = 'pendente'
        ORDER BY f.criado_em ASC`
    );
    return rows;
  });
}

module.exports = {
  upsertAlerta,
  listarAtivos,
  contarNaoLidos,
  marcarLido,
  listarFormulariosPendentes,
};
