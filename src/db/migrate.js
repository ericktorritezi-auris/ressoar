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

// Diagnostico adicionado em 2026-09-28: o isolamento por RLS (municipios,
// usuarios, indicadores, snapshots_linha_base — Bug #7) foi testado e
// confirmado localmente contra um role sem privilegio de superusuario,
// mas o Postgres NUNCA aplica Row-Level Security a um role superusuario
// (nem com FORCE ROW LEVEL SECURITY) ou com o atributo BYPASSRLS — mesmo
// que todas as policies estejam corretas. Bancos gerenciados (como o do
// Railway) as vezes provisionam o usuario padrao da aplicacao como
// superusuario. Se for o caso aqui, TODO o isolamento multi-tenant vira
// decorativo silenciosamente, sem nenhum erro — exatamente o sintoma
// relatado (gestor de carteira continua vendo todos os municipios mesmo
// com a policy corrigida). Isso roda a cada deploy e grita no log do
// Railway se detectar o problema, porque nao ha como eu verificar o role
// de producao a partir daqui.
async function verificarBypassDeRLS(client) {
  // Uma unica chamada de console (nao 9 chamadas separadas): alguns
  // agregadores de log (Railway incluso) agrupam uma rajada de
  // console.error() sincronos numa unica entrada visual e so mostram um
  // preview — foi o que aconteceu na primeira versao deste diagnostico
  // (so a linha de "====" apareceu no log). Uma string multi-linha numa
  // chamada so evita essa ambiguidade.
  const { rows } = await client.query(
    `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
  );
  const role = rows[0];
  console.log(`[migrate] diagnostico RLS — role de conexao: ${role ? role.rolname : '?'} | rolsuper=${role ? role.rolsuper : '?'} | rolbypassrls=${role ? role.rolbypassrls : '?'}`);

  if (role && (role.rolsuper || role.rolbypassrls)) {
    console.error([
      '==================================================================',
      '[migrate] ALERTA CRITICO DE SEGURANCA: o role de conexao da aplicacao',
      `[migrate] ("${role.rolname}") tem rolsuper=${role.rolsuper} rolbypassrls=${role.rolbypassrls}.`,
      '[migrate] O Postgres NUNCA aplica Row-Level Security a um role nessas',
      '[migrate] condicoes — TODAS as policies de isolamento por municipio',
      '[migrate] (municipios, usuarios, indicadores, snapshots_linha_base) ficam',
      '[migrate] sem efeito, mesmo corretas. Master e gestor_carteira veem TUDO.',
      '[migrate] Correcao: criar um role de aplicacao dedicado, sem SUPERUSER e',
      '[migrate] sem BYPASSRLS, e apontar DATABASE_URL pra ele — nunca usar o role',
      '[migrate] administrativo padrao do provedor para a conexao da aplicacao.',
      '==================================================================',
    ].join('\n'));
  } else {
    console.log(`[migrate] ok: role de conexao ("${role ? role.rolname : '?'}") respeita RLS (sem SUPERUSER/BYPASSRLS).`);
  }
}

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

    await verificarBypassDeRLS(client);
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
