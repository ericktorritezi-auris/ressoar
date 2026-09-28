// Carrega e valida as variaveis de ambiente do Ressoar.
// Nada de valor sensivel tem default aqui: se faltar algo obrigatorio,
// o servidor recusa subir (falha rapido, falha visivel).

require('dotenv').config();

const REQUIRED_EM_PRODUCAO = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'RESEND_API_KEY',
  'EMAIL_REMETENTE',
];

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATABASE_URL: process.env.DATABASE_URL,
  // Bug #7 (achado em 2026-09-28): o DATABASE_URL do Railway conecta como
  // o role administrativo do banco ("postgres"), que e SUPERUSER — e o
  // Postgres NUNCA aplica Row-Level Security a um role superusuario,
  // mesmo com as policies corretas (confirmado no log de deploy:
  // rolsuper=true, rolbypassrls=true). Por isso o isolamento entre
  // municipios nunca funcionou em producao, apesar da policy estar certa.
  // APP_DATABASE_URL e a conexao de um role dedicado, sem privilegios
  // administrativos, criado por src/db/criar-role-app.js — e o tráfego
  // real da aplicacao (src/config/db.js) passa a usar ELE, nao mais o
  // DATABASE_URL. migrate.js e seed.js continuam no DATABASE_URL porque
  // precisam de privilegio de dono de tabela pra rodar DDL. Enquanto
  // APP_DATABASE_URL nao estiver configurado, cai no DATABASE_URL (mesmo
  // comportamento de antes — RLS continua sem efeito ate essa variavel
  // ser configurada, ver aviso no log de deploy).
  APP_DATABASE_URL: process.env.APP_DATABASE_URL || process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-nao-usar-em-producao',
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_REMETENTE: process.env.EMAIL_REMETENTE || 'noreply@belleplanner.com.br',
  // Base usada para montar links em e-mail (convite, redefinicao de senha).
  APP_URL: process.env.APP_URL || 'https://ressoar.belleplanner.com.br',
  // Versao exibida automaticamente no rodape de todas as paginas (secao 8 do mapeamento).
  RESSOAR_VERSION: process.env.RESSOAR_VERSION || '0.1.0-dev',
  // Quantos dias um dispositivo fica "confiavel" sem pedir novo codigo de 2FA
  // (mitigacao de volume de e-mail, secao 13 do mapeamento).
  TRUSTED_DEVICE_DIAS: parseInt(process.env.TRUSTED_DEVICE_DIAS || '30', 10),
  // Usadas so por src/db/seed.js para criar o primeiro usuario master, na
  // primeira vez que o sistema sobe (sem elas, o seed avisa e nao cria
  // ninguem — nao ha usuario nenhum ate isso acontecer). Nao sao
  // obrigatorias aqui porque, depois do master criado, podem ser
  // removidas do ambiente sem quebrar nada.
  MASTER_EMAIL: process.env.MASTER_EMAIL,
  MASTER_SENHA: process.env.MASTER_SENHA,
  MASTER_NOME: process.env.MASTER_NOME || 'Erick Torritezi',
};

function validar() {
  if (env.NODE_ENV !== 'production') return;
  const faltando = REQUIRED_EM_PRODUCAO.filter((chave) => !process.env[chave]);
  if (faltando.length > 0) {
    throw new Error(
      `Variaveis de ambiente obrigatorias ausentes em producao: ${faltando.join(', ')}`
    );
  }
}

validar();

module.exports = env;
