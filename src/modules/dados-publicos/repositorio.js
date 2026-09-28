// Acesso a dados_publicos e fontes_dados_publicos (secao 4 do mapeamento).
// dados_publicos e compartilhado por codigo_ibge (nao por municipio_id) —
// por isso essas queries nao passam por withTenantContext/RLS: o
// isolamento por tenant ja aconteceu antes, quando o chamador buscou o
// codigo_ibge do municipio (esse sim protegido por RLS em `municipios`).

const { pool } = require('../../config/db');

async function listarFontes() {
  const { rows } = await pool.query(
    'SELECT id, codigo, nome, dado_trazido, integracao, ordem FROM fontes_dados_publicos ORDER BY ordem'
  );
  return rows;
}

async function buscarFontePorCodigo(codigo) {
  const { rows } = await pool.query(
    'SELECT id, codigo, nome, dado_trazido, integracao FROM fontes_dados_publicos WHERE codigo = $1',
    [codigo]
  );
  return rows[0] || null;
}

/** Todos os valores mais recentes (1 por chave) coletados para um codigo IBGE. */
async function buscarValoresPorCodigoIbge(codigoIbge) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (dp.chave, dp.fonte_id)
            dp.chave, dp.valor_numerico, dp.valor_texto, dp.periodo_referencia,
            dp.coletado_em, f.codigo AS fonte_codigo, f.nome AS fonte_nome
       FROM dados_publicos dp
       JOIN fontes_dados_publicos f ON f.id = dp.fonte_id
      WHERE dp.codigo_ibge = $1
      ORDER BY dp.chave, dp.fonte_id, dp.coletado_em DESC`,
    [codigoIbge]
  );
  return rows;
}

async function buscarUltimaColetaPorFonte(codigoIbge) {
  const { rows } = await pool.query(
    `SELECT f.codigo AS fonte_codigo, MAX(dp.coletado_em) AS ultima_coleta
       FROM fontes_dados_publicos f
       LEFT JOIN dados_publicos dp ON dp.fonte_id = f.id AND dp.codigo_ibge = $1
      GROUP BY f.codigo`,
    [codigoIbge]
  );
  return rows;
}

/**
 * Grava um lote de valores para um codigo IBGE + fonte. `valores` e uma
 * lista de { chave, valorNumerico?, valorTexto?, periodoReferencia? }.
 * Faz upsert por (codigo_ibge, fonte_id, chave, periodo_referencia).
 */
async function salvarValores(codigoIbge, fonteId, valores) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const v of valores) {
      await client.query(
        `INSERT INTO dados_publicos
           (codigo_ibge, fonte_id, chave, valor_numerico, valor_texto, periodo_referencia)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (codigo_ibge, fonte_id, chave, periodo_referencia)
         DO UPDATE SET valor_numerico = EXCLUDED.valor_numerico,
                        valor_texto = EXCLUDED.valor_texto,
                        coletado_em = now()`,
        [
          codigoIbge,
          fonteId,
          v.chave,
          v.valorNumerico ?? null,
          v.valorTexto ?? null,
          v.periodoReferencia ?? null,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
  }
}

// Apaga TODO o historico de uma chave, pra uma fonte especifica, de um
// municipio — pedido pelo usuario em 2026-09-28: um arquivo importado
// errado na Central de Atualizações precisa poder ser removido, não só
// sobrescrito por um novo upload. Some com o "card" inteiro (não só o
// valor mais recente), porque manter periodos antigos escondidos de um
// dado que o usuário pediu pra tirar da tela seria enganoso.
async function excluirValor(codigoIbge, fonteId, chave) {
  await pool.query(
    'DELETE FROM dados_publicos WHERE codigo_ibge = $1 AND fonte_id = $2 AND chave = $3',
    [codigoIbge, fonteId, chave]
  );
}

module.exports = {
  listarFontes,
  buscarFontePorCodigo,
  buscarValoresPorCodigoIbge,
  buscarUltimaColetaPorFonte,
  salvarValores,
  excluirValor,
};
