// Pool de conexao unico com o PostgreSQL.
// Multi-tenant em banco unico (secao 8 do mapeamento): o isolamento entre
// municipios NAO depende so do codigo da aplicacao, depende de Row-Level
// Security no Postgres (ver src/db/migrations/0001_init.sql). Por isso todo
// acesso a dado de municipio passa por withTenantContext() abaixo, que seta
// as variaveis de sessao que as policies de RLS leem.

const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Em desenvolvimento local (fora do Railway) o Postgres pode nao ter SSL;
  // em producao o Railway exige.
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (erro) => {
  // Erro numa conexao ociosa do pool nunca pode derrubar o processo inteiro.
  // eslint-disable-next-line no-console
  console.error('[db] erro inesperado em conexao ociosa do pool', erro);
});

/**
 * Roda `fn` dentro de uma transacao com o contexto de tenant (municipio)
 * setado para as policies de Row-Level Security.
 *
 * @param {object} contexto
 * @param {string|null} contexto.municipioId - uuid do municipio, ou null para master/gestor_carteira
 * @param {boolean} contexto.isMaster - true SOMENTE para o perfil master (visibilidade total nas policies de RLS)
 * @param {string|null} contexto.usuarioId - uuid do usuario logado; usado pelas policies para escopar
 *   o gestor_carteira aos municipios em que ele e o gestor_carteira_id (secao 2 do mapeamento, Bug #7)
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 */
async function withTenantContext({ municipioId = null, isMaster = false, usuarioId = null }, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // SET LOCAL só vale dentro da transacao atual — nunca vaza pra outra
    // conexao reaproveitada do pool.
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_municipio_id',
      municipioId || '',
    ]);
    await client.query('SELECT set_config($1, $2, true)', [
      'app.is_master',
      isMaster ? 'true' : 'false',
    ]);
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_usuario_id',
      usuarioId || '',
    ]);
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTenantContext };
