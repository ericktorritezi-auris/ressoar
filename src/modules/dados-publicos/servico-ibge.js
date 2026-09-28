// Integracao ao vivo com as APIs publicas do IBGE (unica fonte "api" da
// secao 4 do mapeamento — as demais, SIOPS/Siconfi/CNES/DATASUS, sao
// "arquivo" e entram pela Central de Atualizacoes). Falha de rede aqui
// NUNCA pode travar o cadastro do municipio: o dado publico e sempre
// complementar, nunca bloqueante (por isso cada chamada tem seu try/catch
// e retorna null/vazio em vez de lancar).

const BASE_LOCALIDADES = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const BASE_AGREGADOS = 'https://servicodados.ibge.gov.br/api/v3/agregados';

// Agregado 6579 = Projecao da populacao residente, variavel 9324.
const AGREGADO_POPULACAO = 6579;
const VARIAVEL_POPULACAO = 9324;
// Agregado 1301 = Area territorial, variavel 615.
const AGREGADO_AREA = 1301;
const VARIAVEL_AREA = 615;

async function buscarJson(url) {
  const resposta = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resposta.ok) {
    throw new Error(`IBGE respondeu ${resposta.status} para ${url}`);
  }
  return resposta.json();
}

/** Nome e UF oficiais do municipio a partir do codigo IBGE de 7 digitos. */
async function buscarLocalidade(codigoIbge) {
  try {
    const dado = await buscarJson(`${BASE_LOCALIDADES}/${codigoIbge}`);
    const uf = dado?.microrregiao?.mesorregiao?.UF?.sigla || dado?.UF?.sigla || null;
    return { nome: dado?.nome || null, uf };
  } catch (erro) {
    console.warn('[ibge] falha ao buscar localidade', codigoIbge, erro.message);
    return null;
  }
}

async function buscarValorAgregado(agregado, variavel, codigoIbge) {
  try {
    const url = `${BASE_AGREGADOS}/${agregado}/periodos/-1/variaveis/${variavel}?localidades=N6[${codigoIbge}]`;
    const dado = await buscarJson(url);
    const serie = dado?.[0]?.resultados?.[0]?.series?.[0]?.serie;
    if (!serie) return null;
    const periodos = Object.keys(serie);
    const ultimoPeriodo = periodos[periodos.length - 1];
    const valorBruto = serie[ultimoPeriodo];
    const valor = Number(String(valorBruto).replace(',', '.'));
    if (Number.isNaN(valor)) return null;
    return { valor, periodo: ultimoPeriodo };
  } catch (erro) {
    console.warn(`[ibge] falha ao buscar agregado ${agregado}/${variavel}`, codigoIbge, erro.message);
    return null;
  }
}

/**
 * Busca populacao e area territorial mais recentes e devolve no formato
 * que repositorio.salvarValores espera, ja com a densidade calculada.
 */
async function buscarDadosPublicos(codigoIbge) {
  const [populacao, area] = await Promise.all([
    buscarValorAgregado(AGREGADO_POPULACAO, VARIAVEL_POPULACAO, codigoIbge),
    buscarValorAgregado(AGREGADO_AREA, VARIAVEL_AREA, codigoIbge),
  ]);

  const valores = [];
  if (populacao) {
    valores.push({
      chave: 'populacao',
      valorNumerico: populacao.valor,
      periodoReferencia: populacao.periodo,
    });
  }
  if (area) {
    valores.push({
      chave: 'area_km2',
      valorNumerico: area.valor,
      periodoReferencia: area.periodo,
    });
  }
  if (populacao && area && area.valor > 0) {
    valores.push({
      chave: 'densidade_hab_km2',
      valorNumerico: Number((populacao.valor / area.valor).toFixed(2)),
      periodoReferencia: populacao.periodo,
    });
  }

  return valores;
}

module.exports = { buscarLocalidade, buscarDadosPublicos };
