const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCabecalho, detectarDelimitador } = require('../src/modules/planilhas/servico');

// Guarda-corpo da secao 5.1 do mapeamento: a planilha de indicadores so
// pode trazer numero agregado, nunca dado individual/identificavel.
test('validarCabecalho rejeita coluna de CPF', () => {
  assert.throws(() => validarCabecalho(['indicador', 'cpf', 'valor']), /identificável/);
});

test('validarCabecalho rejeita coluna de nome', () => {
  assert.throws(() => validarCabecalho(['indicador', 'nome', 'valor']), /identificável/);
});

test('validarCabecalho aceita o cabecalho padrao do modelo', () => {
  assert.doesNotThrow(() => validarCabecalho(['indicador', 'valor', 'periodo_referencia']));
});

test('detectarDelimitador reconhece ponto-e-virgula (pt-BR)', () => {
  assert.equal(detectarDelimitador('indicador;valor;periodo_referencia'), ';');
});

test('detectarDelimitador reconhece virgula', () => {
  assert.equal(detectarDelimitador('indicador,valor,periodo_referencia'), ',');
});
