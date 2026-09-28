const test = require('node:test');
const assert = require('node:assert/strict');
const {
  gerarHashSenha,
  verificarSenha,
  gerarCodigo2FA,
  gerarHashToken,
} = require('../src/modules/auth/senhas');

test('gera e verifica hash de senha corretamente', async () => {
  const hash = await gerarHashSenha('minhaSenhaForte123');
  assert.ok(await verificarSenha('minhaSenhaForte123', hash));
  assert.equal(await verificarSenha('senhaErrada', hash), false);
});

test('codigo de 2FA sempre tem 6 digitos numericos', () => {
  for (let i = 0; i < 20; i += 1) {
    const codigo = gerarCodigo2FA();
    assert.match(codigo, /^\d{6}$/);
  }
});

test('hash de token e deterministico para o mesmo valor', () => {
  const a = gerarHashToken('abc123');
  const b = gerarHashToken('abc123');
  const c = gerarHashToken('outro-valor');
  assert.equal(a, b);
  assert.notEqual(a, c);
});
