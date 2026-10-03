// Catalogo do cubo de self-service BI (Fase 4 — docs/mapeamento-fase4-bi-dashboards.md,
// secao 4) e o GUARDRAIL exigido pelo usuario: antes de qualquer consulta,
// validar se a dimensao e a metrica escolhidas realmente se cruzam (mesma
// granularidade/fonte/juncao valida) — nunca mostrar grafico vazio, zerado
// ou enganoso por causa de um cruzamento que nao faz sentido.
//
// Logica propositalmente SEM dependencia de banco, pra poder ser testada
// isoladamente (tests/self-service-bi.test.js) sem precisar de Postgres —
// e a peca mais critica desta fase, por pedido explicito do usuario.

// Cada fonte declara sua granularidade real: so pode cruzar com as
// dimensoes que ela de fato suporta. "eixo", por exemplo, so existe pro
// lado de indicadores — dados publicos (por codigo IBGE) e
// formulario/planilha (por submissao) nao tem esse conceito.
const FONTES = {
  indicador: {
    rotulo: 'Indicadores (metas e metadado do programa)',
    metricas: [{ codigo: 'valor_indicador', rotulo: 'Valor do indicador' }],
    dimensoesValidas: ['municipio', 'eixo', 'periodo'],
  },
  dado_publico: {
    rotulo: 'Dados públicos (IBGE/Siconfi/InfoDengue/IDHM)',
    metricas: [{ codigo: 'valor_dado_publico', rotulo: 'Valor do dado público' }],
    dimensoesValidas: ['municipio', 'periodo'],
  },
  formulario_planilha: {
    rotulo: 'Formulários e planilhas respondidos',
    metricas: [{ codigo: 'quantidade_submissoes', rotulo: 'Quantidade de submissões' }],
    dimensoesValidas: ['municipio', 'periodo'],
  },
};

const DIMENSOES = {
  municipio: 'Município',
  eixo: 'Eixo do programa',
  periodo: 'Período',
};

function listarFontes() {
  return Object.entries(FONTES).map(([codigo, f]) => ({ codigo, rotulo: f.rotulo, metricas: f.metricas }));
}

function listarDimensoes() {
  return Object.entries(DIMENSOES).map(([codigo, rotulo]) => ({ codigo, rotulo }));
}

/**
 * O guardrail em si: valida se { fonte, metrica, dimensao } formam um
 * cruzamento que realmente existe nos dados (mesma granularidade/fonte),
 * ANTES de qualquer consulta ser montada.
 *
 * @returns {{ valido: boolean, motivo: string|null }}
 */
function validarCruzamento({ fonte, metrica, dimensao }) {
  const definicaoFonte = FONTES[fonte];
  if (!definicaoFonte) {
    return { valido: false, motivo: `Fonte de dado desconhecida: "${fonte}".` };
  }

  const metricaValida = definicaoFonte.metricas.some((m) => m.codigo === metrica);
  if (!metricaValida) {
    return {
      valido: false,
      motivo: `A métrica "${metrica}" não pertence à fonte "${definicaoFonte.rotulo}".`,
    };
  }

  if (!definicaoFonte.dimensoesValidas.includes(dimensao)) {
    const rotuloDimensao = DIMENSOES[dimensao] || dimensao;
    return {
      valido: false,
      motivo: `A dimensão "${rotuloDimensao}" não existe para "${definicaoFonte.rotulo}" — ` +
        `granularidades incompatíveis, esse cruzamento não gera dado correto.`,
    };
  }

  return { valido: true, motivo: null };
}

module.exports = { FONTES, DIMENSOES, listarFontes, listarDimensoes, validarCruzamento };
