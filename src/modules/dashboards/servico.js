// Logica pura de montagem dos 5 relatorios fixos por eixo (Fase 4 —
// docs/mapeamento-fase4-bi-dashboards.md, secao 3). Mantida sem
// dependencia de banco para poder ser testada isoladamente.

const EIXOS_ORDEM = ['A', 'B', 'C', 'D', 'E'];

/**
 * Agrupa o historico (ja ordenado por indicador, mais antigo primeiro) em
 * um relatorio por eixo: cada indicador entra com o ultimo valor, a meta,
 * e a tendencia (comparando com o penultimo valor, quando existir).
 *
 * @param {Array} historico - linhas de listarHistoricoComEixoPorMunicipio
 * @returns {Array<{ eixoCodigo: string, eixoNome: string, indicadores: Array }>}
 */
function montarRelatoriosPorEixo(historico) {
  const porIndicador = new Map();
  for (const linha of historico) {
    if (!porIndicador.has(linha.indicador_id)) porIndicador.set(linha.indicador_id, []);
    porIndicador.get(linha.indicador_id).push(linha);
  }

  const porEixo = new Map();
  for (const pontos of porIndicador.values()) {
    const ultimo = pontos[pontos.length - 1];
    const penultimo = pontos.length > 1 ? pontos[pontos.length - 2] : null;
    const tendencia = penultimo
      ? Number(ultimo.valor_numerico) > Number(penultimo.valor_numerico)
        ? 'subiu'
        : Number(ultimo.valor_numerico) < Number(penultimo.valor_numerico)
          ? 'desceu'
          : 'estavel'
      : null;

    if (!porEixo.has(ultimo.eixo_codigo)) {
      porEixo.set(ultimo.eixo_codigo, { eixoCodigo: ultimo.eixo_codigo, eixoNome: ultimo.eixo_nome, indicadores: [] });
    }
    porEixo.get(ultimo.eixo_codigo).indicadores.push({
      nome: ultimo.indicador_nome,
      valorAtual: Number(ultimo.valor_numerico),
      periodoAtual: ultimo.periodo_referencia,
      meta: ultimo.meta !== null ? Number(ultimo.meta) : null,
      unidade: ultimo.unidade,
      tendencia,
    });
  }

  return EIXOS_ORDEM.filter((codigo) => porEixo.has(codigo)).map((codigo) => porEixo.get(codigo));
}

/**
 * Aplica a customizacao do usuario (quais eixos ele escolheu manter
 * visiveis). NULL/undefined = todos (padrao antes de qualquer
 * customizacao) — secao 3 do mapeamento.
 */
function filtrarPorPreferencia(relatorios, eixosAtivos) {
  if (!eixosAtivos || eixosAtivos.length === 0) return relatorios;
  const permitidos = new Set(eixosAtivos);
  return relatorios.filter((r) => permitidos.has(r.eixoCodigo));
}

module.exports = { EIXOS_ORDEM, montarRelatoriosPorEixo, filtrarPorPreferencia };
