// Execucao do cubo de self-service BI, SEMPRE depois do guardrail de
// catalogo.js ja ter validado o cruzamento (Fase 4, secao 4 do
// mapeamento). Cada fonte sabe agregar por cada uma das suas proprias
// dimensoes validas — nunca tenta agregar por uma dimensao que a fonte
// nao suporta (isso e barrado antes de chegar aqui).

const indicadoresRepo = require('../indicadores/repositorio');
const dadosPublicosRepo = require('../dados-publicos/repositorio');
const submissoesRepo = require('../submissoes/repositorio');

async function consultarIndicador(tenant, municipioId, dimensao) {
  const historico = await indicadoresRepo.listarHistoricoComEixoPorMunicipio(tenant, municipioId);
  const buckets = new Map();

  for (const linha of historico) {
    const chave =
      dimensao === 'eixo' ? `${linha.eixo_codigo}. ${linha.eixo_nome}`
      : dimensao === 'periodo' ? linha.periodo_referencia
      : 'Total do município'; // dimensao === 'municipio'
    buckets.set(chave, (buckets.get(chave) || 0) + Number(linha.valor_numerico));
  }
  return [...buckets.entries()].map(([rotulo, valor]) => ({ rotulo, valor }));
}

async function consultarDadoPublico(tenant, municipio, dimensao) {
  if (!municipio.codigo_ibge) return [];
  const valores = await dadosPublicosRepo.buscarValoresPorCodigoIbge(municipio.codigo_ibge);
  const buckets = new Map();

  for (const v of valores) {
    if (v.valor_numerico === null) continue;
    const chave = dimensao === 'periodo' ? v.periodo_referencia || 'sem período' : 'Total do município';
    buckets.set(chave, (buckets.get(chave) || 0) + Number(v.valor_numerico));
  }
  return [...buckets.entries()].map(([rotulo, valor]) => ({ rotulo, valor }));
}

async function consultarFormularioPlanilha(tenant, municipioId, dimensao) {
  const [planilhas, formularios] = await Promise.all([
    submissoesRepo.listarPorMunicipio(tenant, municipioId, 'planilha'),
    submissoesRepo.listarPorMunicipio(tenant, municipioId, 'formulario'),
  ]);
  const todas = [...planilhas, ...formularios];
  const buckets = new Map();

  for (const s of todas) {
    const chave =
      dimensao === 'periodo' ? new Date(s.enviado_em).toISOString().slice(0, 7) // AAAA-MM
      : 'Total do município';
    buckets.set(chave, (buckets.get(chave) || 0) + 1);
  }
  return [...buckets.entries()].map(([rotulo, valor]) => ({ rotulo, valor }));
}

/**
 * Executa a consulta do cubo. Pressupoe que catalogo.validarCruzamento ja
 * aprovou { fonte, metrica, dimensao } — chamar sem validar antes e um
 * bug de uso deste modulo, nao um caso a tratar aqui.
 */
async function executarConsulta(tenant, { fonte, dimensao, municipio }) {
  if (fonte === 'indicador') return consultarIndicador(tenant, municipio.id, dimensao);
  if (fonte === 'dado_publico') return consultarDadoPublico(tenant, municipio, dimensao);
  if (fonte === 'formulario_planilha') return consultarFormularioPlanilha(tenant, municipio.id, dimensao);
  throw new Error(`Fonte desconhecida: ${fonte}`);
}

module.exports = { executarConsulta };
