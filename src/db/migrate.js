// Runner de migrations minimo e sem dependencias externas: le os arquivos
// .sql de src/db/migrations em ordem alfabetica e aplica os que ainda nao
// estao registrados em schema_migrations. Roda automaticamente no deploy
// (ver .github/workflows/ci.yml e o start do Railway) — nunca precisa ser
// rodado a mao (secao 8 do mapeamento: zero ambiente local).

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const env = require('../config/env');

const PASTA_MIGRATIONS = path.join(__dirname, 'migrations');

async function migrar() {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        versao TEXT PRIMARY KEY,
        aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows: aplicadas } = await client.query('SELECT versao FROM schema_migrations');
    const jaAplicadas = new Set(aplicadas.map((r) => r.versao));

    const arquivos = fs
      .readdirSync(PASTA_MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const arquivo of arquivos) {
      if (jaAplicadas.has(arquivo)) {
        console.log(`[migrate] ja aplicada, pulando: ${arquivo}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(PASTA_MIGRATIONS, arquivo), 'utf8');
      console.log(`[migrate] aplicando ${arquivo}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (versao) VALUES ($1)', [arquivo]);
        await client.query('COMMIT');
        console.log(`[migrate] ok: ${arquivo}`);
      } catch (erro) {
        await client.query('ROLLBACK');
        throw new Error(`Falha ao aplicar ${arquivo}: ${erro.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  migrar()
    .then(() => {
      console.log('[migrate] todas as migrations aplicadas');
      process.exit(0);
    })
    .catch((erro) => {
      console.error('[migrate] erro:', erro.message);
      process.exit(1);
    });
}

module.exports = { migrar };
