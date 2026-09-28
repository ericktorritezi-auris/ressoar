// Acesso ao catalogo de indicadores por eixo/municipio (secao 3.3).

const { pool, withTenantContext } = require('../../config/db');

function contextoDe(tenant) {
  return { municipioId: tenant.municipioId, isMaster: tenant.isMaster, usuarioId: tenant.usuarioId };
}

// eixos e fixo e publico (A a E) — nao precisa de RLS nem de tenant.
async function listarEixos() {
  const { rows } = await pool.query('SELECT id, codigo, nome, ordem FROM eixos ORDER BY ordem');
  return rows;
}

async function listarPorMunicipio(tenant, municipioId) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT i.id, i.nome, i.linha_base, i.meta, i.unidade, i.periodicidade,
              i.fonte_dado, i.ativo, i.criado_em, e.codigo AS eixo_codigo, e.nome AS eixo_nome
         FROM indicadores i
         JOIN eixos e ON e.id = i.eixo_id
        WHERE i.municipio_id = $1
        ORDER BY e.ordem, i.nome`,
      [municipioId]
    );
    return rows;
  });
}

async function buscarPorId(tenant, id) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query('SELECT * FROM indicadores WHERE id = $1', [id]);
    return rows[0] || null;
  });
}

async function criar(tenant, municipioId, dados) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `INSERT INTO indicadores
         (municipio_id, eixo_id, nome, linha_base, meta, unidade, periodicidade, fonte_dado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        municipioId,
        dados.eixoId,
        dados.nome,
        dados.linhaBase || null,
        dados.meta || null,
        dados.unidade || null,
        dados.periodicidade,
        dados.fonteDado,
      ]
    );
    return rows[0].id;
  });
}

async function atualizar(tenant, id, dados) {
  return withTenantContext(contextoDe(tenant), (client) =>
    client.query(
      `UPDATE indicadores
          SET eixo_id = $1, nome = $2, linha_base = $3, meta = $4, unidade = $5,
              periodicidade = $6, fonte_dado = $7, ativo = $8, atualizado_em = now()
        WHERE id = $9`,
      [
        dados.eixoId,
        dados.nome,
        dados.linhaBase || null,
        dados.meta || null,
        dados.unidade || null,
        dados.periodicidade,
        dados.fonteDado,
        dados.ativo !== false,
        id,
      ]
    )
  );
}

module.exports = { listarEixos, listarPorMunicipio, buscarPorId, criar, atualizar };
