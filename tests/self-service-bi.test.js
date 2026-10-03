const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCruzamento, FONTES } = require('../src/modules/self-service-bi/catalogo');

// Guardrail (Fase 4, secao 4 do mapeamento) — requisito explicito do
// usuario: antes de renderizar, validar se dimensao x metrica realmente se
// cruzam (mesma granularidade/fonte), avisando claramente em vez de
// mostrar grafico vazio/zerado/enganoso. Esta e a peca mais critica desta
// fase, entao os cruzamentos validos E invalidos sao testados
// explicitamente para cada fonte.

test('indicador aceita as 3 dimensoes (municipio, eixo, periodo)', () => {
  for (const dimensao of ['municipio', 'eixo', 'periodo']) {
    const r = validarCruzamento({ fonte: 'indicador', metrica: 'valor_indicador', dimensao });
    assert.equal(r.valido, true, `indicador x ${dimensao} deveria ser valido`);
    assert.equal(r.motivo, null);
  }
});

test('dado_publico NAO aceita a dimensao eixo (nao existe esse conceito pra dado publico)', () => {
  const r = validarCruzamento({ fonte: 'dado_publico', metrica: 'valor_dado_publico', dimensao: 'eixo' });
  assert.equal(r.valido, false);
  assert.match(r.motivo, /não existe para/);
});

test('dado_publico aceita municipio e periodo', () => {
  for (const dimensao of ['municipio', 'periodo']) {
    const r = validarCruzamento({ fonte: 'dado_publico', metrica: 'valor_dado_publico', dimensao });
    assert.equal(r.valido, true, `dado_publico x ${dimensao} deveria ser valido`);
  }
});

test('formulario_planilha NAO aceita a dimensao eixo', () => {
  const r = validarCruzamento({ fonte: 'formulario_planilha', metrica: 'quantidade_submissoes', dimensao: 'eixo' });
  assert.equal(r.valido, false);
  assert.match(r.motivo, /não existe para/);
});

test('rejeita metrica que nao pertence a fonte escolhida', () => {
  const r = validarCruzamento({ fonte: 'dado_publico', metrica: 'valor_indicador', dimensao: 'municipio' });
  assert.equal(r.valido, false);
  assert.match(r.motivo, /não pertence/);
});

test('rejeita fonte desconhecida', () => {
  const r = validarCruzamento({ fonte: 'fonte_que_nao_existe', metrica: 'x', dimensao: 'municipio' });
  assert.equal(r.valido, false);
  assert.match(r.motivo, /desconhecida/);
});

test('catalogo de fontes cobre indicador + dado_publico + formulario_planilha (decisao do usuario: cubo cobre as 3 fontes)', () => {
  assert.deepEqual(Object.keys(FONTES).sort(), ['dado_publico', 'formulario_planilha', 'indicador']);
});
