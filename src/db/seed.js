// Cria o primeiro usuario master do sistema, se ainda nao existir nenhum.
// Roda automaticamente no start (depois das migrations, ver package.json)
// — sem isso, o sistema fica com tela de login mas ninguem consegue
// entrar. Idempotente: se ja existe QUALQUER usuario master, nao faz nada
// (nunca sobrescreve senha de quem ja existe).
//
// Depende de MASTER_EMAIL e MASTER_SENHA nas variaveis de ambiente. Se
// faltarem, apenas avisa e segue em frente — nao derruba o deploy, porque
// isso travaria o healthcheck do Railway para sempre.

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

const RODADAS_BCRYPT = 12;

async function seed() {
  if (!env.MASTER_EMAIL || !env.MASTER_SENHA) {
    console.warn(
      '[seed] MASTER_EMAIL/MASTER_SENHA ausentes — nenhum usuario master criado. ' +
        'Configure as duas variaveis e faca um novo deploy para criar o primeiro acesso.'
    );
    return;
  }

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  try {
    // Seed roda fora do contexto de tenant normal da aplicacao (nao ha
    // sessao HTTP aqui) — seta app.is_master direto nesta conexao, do
    // mesmo jeito que withTenantContext faria, para a policy de RLS
    // liberar a leitura/escrita em usuarios.
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.is_master', 'true', true)");
    await client.query("SELECT set_config('app.current_municipio_id', '', true)");

    const { rows: existentes } = await client.query(
      "SELECT id FROM usuarios WHERE perfil = 'master' LIMIT 1"
    );

    if (existentes.length > 0) {
      console.log('[seed] ja existe usuario master — nada a fazer.');
      await client.query('COMMIT');
      return;
    }

    const senhaHash = await bcrypt.hash(env.MASTER_SENHA, RODADAS_BCRYPT);
    await client.query(
      `INSERT INTO usuarios (perfil, nome, email, senha_hash, ativo, requer_2fa)
       VALUES ('master', $1, $2, $3, TRUE, FALSE)`,
      [env.MASTER_NOME, env.MASTER_EMAIL.trim().toLowerCase(), senhaHash]
    );

    await client.query('COMMIT');
    console.log(`[seed] usuario master criado: ${env.MASTER_EMAIL.trim().toLowerCase()}`);
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((erro) => {
      // Erro no seed nao pode travar o deploy (o servidor ainda deve
      // subir mesmo sem master criado) — so loga bem visivel.
      console.error('[seed] erro ao criar usuario master:', erro.message);
      process.exit(0);
    });
}

module.exports = { seed };
