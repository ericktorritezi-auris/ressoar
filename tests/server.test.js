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
