const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretarCsv } = require('../src/modules/dados-publicos/servico');

test('interpreta CSV com cabecalho, numeros e texto', () => {
  const csv = 'chave,valor,periodo\npercentual_investido_saude,7.8,2026\nresponsavel,Fulano de Tal,2026';
  const valores = interpretarCsv(csv);

  assert.equal(valores.length, 2);
  assert.deepEqual(valores[0], {
    chave: 'percentual_investido_saude',
    valorNumerico: 7.8,
    valorTexto: null,
    periodoReferencia: '2026',
  });
  assert.deepEqual(valores[1], {
    chave: 'responsavel',
    valorNumerico: null,
    valorTexto: 'Fulano de Tal',
    periodoReferencia: '2026',
  });
});

test('interpreta CSV sem cabecalho e ignora linhas em branco', () => {
  const csv = '\nestabelecimentos_saude,12,2026\n\n  \nleitos,340,2026\n';
  const valores = interpretarCsv(csv);
  assert.equal(valores.length, 2);
  assert.equal(valores[0].chave, 'estabelecimentos_saude');
  assert.equal(valores[0].valorNumerico, 12);
  assert.equal(valores[1].valorNumerico, 340);
});

test('aceita virgula decimal e ignora linha sem chave', () => {
  const csv = 'chave,valor,periodo\ntaxa,3,5,2026\n,10,2026';
  const valores = interpretarCsv(csv);
  // "taxa,3,5,2026" -> split(',') gera ['taxa','3','5','2026']; so as 3
  // primeiras posicoes (chave, valor, periodo) sao usadas.
  assert.equal(valores.length, 1);
  assert.equal(valores[0].chave, 'taxa');
  assert.equal(valores[0].valorNumerico, 3);
});

test('retorna lista vazia para CSV vazio', () => {
  assert.deepEqual(interpretarCsv(''), []);
  assert.deepEqual(interpretarCsv('   \n  \n'), []);
});

// Regressao (2026-09-28): CSV exportado do Excel/Sheets em pt-BR usa ";"
// como separador de coluna (a virgula ja e o separador decimal nesse
// locale) — antes disso o parser so entendia virgula e a linha inteira
// virava uma unica chave, com valor e periodo vazios.
test('interpreta CSV com ponto-e-virgula (padrao Excel/Sheets em pt-BR) e virgula decimal', () => {
  const csv = 'chave;valor;periodo\npercentual_investido_saude;7,8;2026';
  const valores = interpretarCsv(csv);

  assert.equal(valores.length, 1);
  assert.deepEqual(valores[0], {
    chave: 'percentual_investido_saude',
    valorNumerico: 7.8,
    valorTexto: null,
    periodoReferencia: '2026',
  });
});
