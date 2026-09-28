// Smoke test: o servidor sobe e responde no /health sem precisar de banco
// real (nenhuma dessas rotas toca o Postgres).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'segredo-de-teste';

const app = require('../src/server');

test('GET /health responde 200 com status ok', async () => {
  const servidor = http.createServer(app);
  await new Promise((resolve) => servidor.listen(0, resolve));
  const { port } = servidor.address();

  const resposta = await fetch(`http://127.0.0.1:${port}/health`);
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.status, 'ok');

  await new Promise((resolve) => servidor.close(resolve));
});

test('GET /login responde 200 (tela publica)', async () => {
  const servidor = http.createServer(app);
  await new Promise((resolve) => servidor.listen(0, resolve));
  const { port } = servidor.address();

  const resposta = await fetch(`http://127.0.0.1:${port}/login`);

  assert.equal(resposta.status, 200);

  await new Promise((resolve) => servidor.close(resolve));
});

// Regressao: sem "trust proxy", o Express nao reconhece que o Railway
// termina o HTTPS na borda e o cookie-session recusa gravar o cookie
// "secure" (login "funciona" mas ninguem fica autenticado — foi exatamente
// o bug encontrado em producao na Fase 2). Nao da pra testar o fluxo
// completo aqui sem banco, mas a config em si nao pode regredir sem aviso.
test('app confia no proxy (necessario para o cookie de sessao "secure" funcionar atras do Railway)', () => {
  assert.ok(app.get('trust proxy'), 'app.set("trust proxy", ...) precisa estar configurado em src/server.js');
});

// As rotas da Fase 2 (municipios, usuarios, indicadores, central de
// atualizacoes) exigem autenticacao antes de qualquer coisa — nenhuma
// delas deve responder sem sessao, mesmo sem banco disponivel neste teste.
test('rotas protegidas da Fase 2 redirecionam para /login sem sessao', async () => {
  const servidor = http.createServer(app);
  await new Promise((resolve) => servidor.listen(0, resolve));
  const { port } = servidor.address();

  const rotas = ['/municipios', '/usuarios', '/central-atualizacoes'];
  for (const rota of rotas) {
    // eslint-disable-next-line no-await-in-loop
    const resposta = await fetch(`http://127.0.0.1:${port}${rota}`, { redirect: 'manual' });
    assert.equal(resposta.status, 302, `${rota} deveria redirecionar sem sessao`);
    assert.match(resposta.headers.get('location'), /\/login$/);
  }

  await new Promise((resolve) => servidor.close(resolve));
});
