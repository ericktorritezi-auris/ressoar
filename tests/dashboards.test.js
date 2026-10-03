const test = require('node:test');
const assert = require('node:assert/strict');
const { montarRelatoriosPorEixo, filtrarPorPreferencia, EIXOS_ORDEM } = require('../src/modules/dashboards/servico');

function linha({ indicadorId, eixoCodigo, eixoNome, periodo, valor, meta = null, unidade = null, nome = 'Indicador' }) {
  return {
    indicador_id: indicadorId,
    eixo_codigo: eixoCodigo,
    eixo_nome: eixoNome,
    periodo_referencia: periodo,
    valor_numerico: valor,
    meta,
    unidade,
    indicador_nome: nome,
  };
}

test('agrupa por eixo e mantem a ordem fixa A..E mesmo que o historico chegue fora de ordem', () => {
  const historico = [
    linha({ indicadorId: 'i-e', eixoCodigo: 'E', eixoNome: 'NR-1', periodo: '2026-01', valor: 5 }),
    linha({ indicadorId: 'i-a', eixoCodigo: 'A', eixoNome: 'Escola Emocional', periodo: '2026-01', valor: 10 }),
  ];
  const relatorios = montarRelatoriosPorEixo(historico);
  assert.deepEqual(relatorios.map((r) => r.eixoCodigo), ['A', 'E']);
});

test('usa o ultimo valor de cada indicador e calcula tendencia comparando com o penultimo', () => {
  const historico = [
    linha({ indicadorId: 'i1', eixoCodigo: 'A', eixoNome: 'Escola Emocional', periodo: '2026-01', valor: 10 }),
    linha({ indicadorId: 'i1', eixoCodigo: 'A', eixoNome: 'Escola Emocional', periodo: '2026-02', valor: 15 }),
  ];
  const [relatorio] = montarRelatoriosPorEixo(historico);
  assert.equal(relatorio.indicadores[0].valorAtual, 15);
  assert.equal(relatorio.indicadores[0].tendencia, 'subiu');
});

test('sem valor anterior, tendencia fica null (nao inventa seta)', () => {
  const historico = [linha({ indicadorId: 'i1', eixoCodigo: 'A', eixoNome: 'Escola Emocional', periodo: '2026-01', valor: 10 })];
  const [relatorio] = montarRelatoriosPorEixo(historico);
  assert.equal(relatorio.indicadores[0].tendencia, null);
});

test('filtrarPorPreferencia sem customizacao (null/vazio) mantem todos os relatorios', () => {
  const relatorios = [{ eixoCodigo: 'A' }, { eixoCodigo: 'B' }];
  assert.deepEqual(filtrarPorPreferencia(relatorios, null), relatorios);
  assert.deepEqual(filtrarPorPreferencia(relatorios, []), relatorios);
});

test('filtrarPorPreferencia respeita a escolha do usuario de quais eixos mostrar', () => {
  const relatorios = [{ eixoCodigo: 'A' }, { eixoCodigo: 'B' }, { eixoCodigo: 'C' }];
  const filtrado = filtrarPorPreferencia(relatorios, ['B']);
  assert.deepEqual(filtrado.map((r) => r.eixoCodigo), ['B']);
});

test('EIXOS_ORDEM cobre os 5 eixos do programa', () => {
  assert.deepEqual(EIXOS_ORDEM, ['A', 'B', 'C', 'D', 'E']);
});
