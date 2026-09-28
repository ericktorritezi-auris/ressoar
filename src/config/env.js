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
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-nao-usar-em-producao',
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_REMETENTE: process.env.EMAIL_REMETENTE || 'naoresponda@ressoar.belleplanner.com.br',
  // Versao exibida automaticamente no rodape de todas as paginas (secao 8 do mapeamento).
  RESSOAR_VERSION: process.env.RESSOAR_VERSION || '0.1.0-dev',
  // Quantos dias um dispositivo fica "confiavel" sem pedir novo codigo de 2FA
  // (mitigacao de volume de e-mail, secao 13 do mapeamento).
  TRUSTED_DEVICE_DIAS: parseInt(process.env.TRUSTED_DEVICE_DIAS || '30', 10),
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
