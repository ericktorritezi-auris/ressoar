const test = require('node:test');
const assert = require('node:assert/strict');
const {
  diasEntre,
  calcularAlertasMandato,
  calcularAnomaliaIndicador,
  LIMIARES_MANDATO_DIAS,
} = require('../src/modules/alertas/servico');

test('diasEntre conta em dias inteiros, ignorando hora do dia', () => {
  const hoje = new Date('2026-10-01T23:50:00Z');
  const fim = new Date('2026-10-02T00:05:00Z');
  assert.equal(diasEntre(hoje, fim), 1);
});

test('calcularAlertasMandato nao gera nada se faltam mais de 360 dias', () => {
  const hoje = new Date('2026-01-01T00:00:00Z');
  const municipio = { mandatoFim: new Date('2028-01-01T00:00:00Z') };
  assert.deepEqual(calcularAlertasMandato(municipio, hoje), []);
});

test('calcularAlertasMandato gera um alerta por limiar ja cruzado (acumulativo)', () => {
  const hoje = new Date('2026-10-01T00:00:00Z');
  // 45 dias restantes: cruzou 360,180,90,60 mas ainda nao 30 nem 15
  const mandatoFim = new Date(hoje.getTime() + 45 * 24 * 60 * 60 * 1000);
  const alertas = calcularAlertasMandato({ mandatoFim, prefeitoNome: 'Fulano' }, hoje);
  const limiaresGerados = alertas.map((a) => a.chaveDedup.split(':')[2]).map(Number).sort((a, b) => a - b);
  assert.deepEqual(limiaresGerados, [60, 90, 180, 360]);
});

test('calcularAlertasMandato nivel critico apenas para os limiares mais proximos (<=30 dias)', () => {
  const hoje = new Date('2026-10-01T00:00:00Z');
  const mandatoFim = new Date(hoje.getTime() + 10 * 24 * 60 * 60 * 1000);
  const alertas = calcularAlertasMandato({ mandatoFim }, hoje);
  const criticos = alertas.filter((a) => a.nivel === 'critico');
  assert.ok(criticos.length >= 1);
  assert.ok(criticos.every((a) => Number(a.chaveDedup.split(':')[2]) <= 30));
});

test('calcularAlertasMandato nao gera nada se o mandato ja encerrou', () => {
  const hoje = new Date('2026-10-01T00:00:00Z');
  const mandatoFim = new Date('2025-01-01T00:00:00Z');
  assert.deepEqual(calcularAlertasMandato({ mandatoFim }, hoje), []);
});

test('chave_dedup inclui a data do mandato — troca de prefeito gera chave nova (para de disparar o ciclo antigo)', () => {
  const hoje = new Date('2026-10-01T00:00:00Z');
  const mandatoAntigo = calcularAlertasMandato({ mandatoFim: new Date(hoje.getTime() + 10 * 86400000) }, hoje);
  const mandatoNovo = calcularAlertasMandato({ mandatoFim: new Date(hoje.getTime() + 10 * 86400000 + 86400000 * 365) }, hoje);
  assert.notDeepEqual(mandatoAntigo.map((a) => a.chaveDedup), mandatoNovo.map((a) => a.chaveDedup));
});

test('todos os 6 limiares pedidos pelo usuario estao implementados', () => {
  assert.deepEqual(LIMIARES_MANDATO_DIAS, [360, 180, 90, 60, 30, 15]);
});

test('calcularAnomaliaIndicador nao dispara com historico insuficiente (total de pontos <= minimo exigido)', () => {
  const indicador = { id: 'i1', nome: 'Teste' };
  const valores = [
    { periodoReferencia: '2026-01', valorNumerico: 10 },
    { periodoReferencia: '2026-02', valorNumerico: 10 },
    { periodoReferencia: '2026-03', valorNumerico: 100 }, // so 2 pontos antes — nao e suficiente
  ];
  assert.equal(calcularAnomaliaIndicador(indicador, valores), null);
});

test('calcularAnomaliaIndicador dispara quando o ultimo valor foge do historico do proprio municipio', () => {
  const indicador = { id: 'i1', nome: 'Atendimentos realizados' };
  const valores = [
    { periodoReferencia: '2026-01', valorNumerico: 10 },
    { periodoReferencia: '2026-02', valorNumerico: 11 },
    { periodoReferencia: '2026-03', valorNumerico: 9 },
    { periodoReferencia: '2026-04', valorNumerico: 10 },
    { periodoReferencia: '2026-05', valorNumerico: 40 }, // bem acima da media historica (~10)
  ];
  const anomalia = calcularAnomaliaIndicador(indicador, valores);
  assert.ok(anomalia);
  assert.equal(anomalia.chaveDedup, 'indicador:i1:2026-05');
  assert.match(anomalia.mensagem, /acima da média histórica/);
});

test('calcularAnomaliaIndicador NAO dispara para uma variacao pequena (abaixo do limiar de 30%)', () => {
  const indicador = { id: 'i1', nome: 'Teste' };
  const valores = [
    { periodoReferencia: '2026-01', valorNumerico: 100 },
    { periodoReferencia: '2026-02', valorNumerico: 102 },
    { periodoReferencia: '2026-03', valorNumerico: 98 },
    { periodoReferencia: '2026-04', valorNumerico: 101 },
    { periodoReferencia: '2026-05', valorNumerico: 115 }, // ~15% de desvio, abaixo do limiar
  ];
  assert.equal(calcularAnomaliaIndicador(indicador, valores), null);
});
