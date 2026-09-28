// Funcoes puras de hash/verificacao — sem tocar em banco ou rede, para
// serem faceis de testar (ver tests/senhas.test.js).

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const RODADAS_BCRYPT = 12;

async function gerarHashSenha(senhaEmTexto) {
  return bcrypt.hash(senhaEmTexto, RODADAS_BCRYPT);
}

async function verificarSenha(senhaEmTexto, hash) {
  return bcrypt.compare(senhaEmTexto, hash);
}

/** Gera um codigo numerico de 6 digitos para o 2FA por e-mail. */
function gerarCodigo2FA() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Hash de token/codigo de uso unico (reset de senha, codigo 2FA). */
function gerarHashToken(tokenEmTexto) {
  return crypto.createHash('sha256').update(tokenEmTexto).digest('hex');
}

function gerarTokenAleatorio() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  gerarHashSenha,
  verificarSenha,
  gerarCodigo2FA,
  gerarHashToken,
  gerarTokenAleatorio,
};
