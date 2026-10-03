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

// Serie temporal (Fase 4 — docs/mapeamento-fase4-bi-dashboards.md): valor
// realizado de um indicador num periodo. E a base tecnica que alimenta os
// dashboards fixos e o cubo de self-service BI; antes desta fase so
// existia o metadado (meta/linha de base/periodicidade).
async function registrarValor(tenant, indicadorId, dados) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `INSERT INTO indicador_valores (municipio_id, indicador_id, periodo_referencia, valor_numerico, registrado_por)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (indicador_id, periodo_referencia)
         DO UPDATE SET valor_numerico = EXCLUDED.valor_numerico, registrado_por = EXCLUDED.registrado_por, registrado_em = now()
       RETURNING id`,
      [dados.municipioId, indicadorId, dados.periodoReferencia, dados.valorNumerico, tenant.usuarioId || null]
    );
    return rows[0].id;
  });
}

// Serie completa de um indicador, mais antigo primeiro — ordem que o
// calculo de media historica/anomalia (modulo alertas) e o grafico do
// dashboard esperam.
async function listarValoresPorIndicador(tenant, indicadorId) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT id, periodo_referencia, valor_numerico, registrado_em
         FROM indicador_valores
        WHERE indicador_id = $1
        ORDER BY registrado_em ASC`,
      [indicadorId]
    );
    return rows;
  });
}

// Visao usada pelos dashboards fixos: para cada indicador ativo do
// municipio, o ultimo valor lancado e o eixo a que pertence.
async function listarUltimosValoresPorMunicipio(tenant, municipioId) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT DISTINCT ON (iv.indicador_id)
              iv.indicador_id, iv.periodo_referencia, iv.valor_numerico, iv.registrado_em,
              i.nome AS indicador_nome, i.meta, i.unidade, e.codigo AS eixo_codigo, e.nome AS eixo_nome
         FROM indicador_valores iv
         JOIN indicadores i ON i.id = iv.indicador_id
         JOIN eixos e ON e.id = i.eixo_id
        WHERE iv.municipio_id = $1 AND i.ativo = TRUE
        ORDER BY iv.indicador_id, iv.registrado_em DESC`,
      [municipioId]
    );
    return rows;
  });
}

// Historico completo (todos os valores, nao so o ultimo) de todos os
// indicadores ativos de um municipio, com o eixo junto — usado pelos
// dashboards fixos (modulo dashboards) pra montar tendencia (ultimo vs.
// penultimo valor) sem precisar de uma consulta por indicador.
async function listarHistoricoComEixoPorMunicipio(tenant, municipioId) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT iv.indicador_id, iv.periodo_referencia, iv.valor_numerico, iv.registrado_em,
              i.nome AS indicador_nome, i.meta, i.unidade, e.codigo AS eixo_codigo, e.nome AS eixo_nome
         FROM indicador_valores iv
         JOIN indicadores i ON i.id = iv.indicador_id
         JOIN eixos e ON e.id = i.eixo_id
        WHERE iv.municipio_id = $1 AND i.ativo = TRUE
        ORDER BY iv.indicador_id, iv.registrado_em ASC`,
      [municipioId]
    );
    return rows;
  });
}

module.exports = {
  listarEixos,
  listarPorMunicipio,
  buscarPorId,
  criar,
  atualizar,
  registrarValor,
  listarValoresPorIndicador,
  listarUltimosValoresPorMunicipio,
  listarHistoricoComEixoPorMunicipio,
};
