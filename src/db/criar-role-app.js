// Bug #7 (isolamento entre municipios nunca funcionou em producao, achado
// em 2026-09-28): o log de deploy confirmou que o role usado em
// DATABASE_URL ("postgres", o role administrativo padrao do Railway) tem
// rolsuper=true e rolbypassrls=true — o Postgres NUNCA aplica Row-Level
// Security a um role nessas condicoes, entao TODAS as policies de
// isolamento (municipios, usuarios, indicadores, snapshots_linha_base)
// ficavam sem efeito, mesmo corretas. Master e gestor_carteira sempre
// viam tudo.
//
// Este script cria (uma unica vez — e idempotente) um role de aplicacao
// dedicado, SEM privilegio nenhum de superusuario, e concede a ele
// exatamente o necessario pra rodar a aplicacao (nao DDL — isso continua
// por conta do DATABASE_URL administrativo, usado só por migrate.js/
// seed.js). Roda automaticamente a cada deploy, depois das migrations
// (ver package.json): se o role ja existe, so re-aplica os GRANTs (util
// pra cobrir tabelas novas de migrations futuras) e nao mexe na senha.
//
// Depois do PRIMEIRO deploy com este script, a string de conexao do novo
// role aparece UMA VEZ no log — ela nao e mostrada de novo depois (nao
// fica gravada em nenhum lugar, por seguranca). Copie e configure como a
// variavel de ambiente APP_DATABASE_URL no Railway; até isso ser feito, a
// aplicacao continua usando o DATABASE_URL antigo (superusuario) e o
// isolamento continua sem efeito — o alerta de migrate.js volta a
// aparecer no proximo deploy pra lembrar.

const crypto = require('crypto');
const { Pool } = require('pg');
const env = require('../config/env');

const NOME_ROLE = 'ressoar_app';

function montarConnectionStringComNovoRole(pass) {
  const url = new URL(env.DATABASE_URL);
  url.username = NOME_ROLE;
  url.password = pass;
  return url.toString();
}

async function criarRoleApp() {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  const client = await pool.connect();

  try {
    const { rows } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [NOME_ROLE]);
    const jaExiste = rows.length > 0;

    if (!jaExiste) {
      const senha = crypto.randomBytes(24).toString('hex');
      // CREATE ROLE nao aceita parametro bind ($1) pro nome/senha — o
      // nome e uma constante fixa aqui (nunca vem de fora) e a senha e
      // gerada por nos mesmos (nunca do usuario), entao a interpolacao
      // direta e segura neste caso especifico.
      await client.query(
        `CREATE ROLE ${NOME_ROLE} WITH LOGIN PASSWORD '${senha}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`
      );
      const novaConnectionString = montarConnectionStringComNovoRole(senha);
      console.log('==================================================================');
      console.log(`[criar-role-app] role "${NOME_ROLE}" criado (sem SUPERUSER/BYPASSRLS).`);
      console.log('[criar-role-app] ACAO NECESSARIA: copie a linha abaixo AGORA — ela so');
      console.log('[criar-role-app] aparece nesta unica vez — e configure como a variavel');
      console.log('[criar-role-app] de ambiente APP_DATABASE_URL no Railway. Ate isso ser');
      console.log('[criar-role-app] feito, a aplicacao continua no DATABASE_URL antigo e o');
      console.log('[criar-role-app] isolamento entre municipios continua sem efeito.');
      console.log(`[criar-role-app] APP_DATABASE_URL=${novaConnectionString}`);
      console.log('==================================================================');
    } else {
      console.log(`[criar-role-app] role "${NOME_ROLE}" ja existe — senha mantida, so reaplicando GRANTs.`);
    }

    // Reaplicado sempre (idempotente): cobre tabelas criadas por
    // migrations posteriores a criacao do role.
    const nomeBanco = new URL(env.DATABASE_URL).pathname.replace(/^\//, '');
    await client.query(`GRANT CONNECT ON DATABASE "${nomeBanco}" TO ${NOME_ROLE}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${NOME_ROLE}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${NOME_ROLE}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${NOME_ROLE}`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${NOME_ROLE}`
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${NOME_ROLE}`
    );
    console.log(`[criar-role-app] grants aplicados em "${NOME_ROLE}".`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  criarRoleApp()
    .then(() => process.exit(0))
    .catch((erro) => {
      // Nao pode travar o deploy: sem isso, a app ainda sobe (so continua
      // usando o DATABASE_URL de superusuario ate alguem resolver a mao).
      console.error('[criar-role-app] erro:', erro.message);
      process.exit(0);
    });
}

module.exports = { criarRoleApp };
