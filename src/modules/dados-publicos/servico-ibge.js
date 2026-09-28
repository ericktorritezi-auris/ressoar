// Integracao ao vivo com as APIs publicas do IBGE (unica fonte "api" da
// secao 4 do mapeamento — as demais, SIOPS/Siconfi/CNES/DATASUS, sao
// "arquivo" e entram pela Central de Atualizacoes). Falha de rede aqui
// NUNCA pode travar o cadastro do municipio: o dado publico e sempre
// complementar, nunca bloqueante (por isso cada chamada tem seu try/catch
// e retorna null/vazio em vez de lancar).
//
// Todos os codigos de agregado/variavel abaixo foram conferidos contra
// codigo-fonte real de um projeto open-source que consome a mesma API
// (SidneyBissoli/ibge-br-mcp, MIT) — nao foram "lembrados" de memoria.
// Cada um usa nivel_territorial=6 (municipio), que e o nivel que o
// Ressoar precisa.

const BASE_LOCALIDADES = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const BASE_AGREGADOS = 'https://servicodados.ibge.gov.br/api/v3/agregados';

// Agregado 6579 = Projecao da populacao residente (estimativa anual), variavel 9324.
const AGREGADO_POPULACAO = 6579;
const VARIAVEL_POPULACAO = 9324;
// Agregado 1301 = Area territorial, variavel 615.
const AGREGADO_AREA = 1301;
const VARIAVEL_AREA = 615;
// Agregado 9514 = Populacao residente, Censo Demografico 2022, variavel 93.
const AGREGADO_POPULACAO_CENSO = 9514;
const VARIAVEL_POPULACAO_CENSO = 93;
// Agregado 5938 = Produto Interno Bruto a precos correntes (Mil Reais),
// variavel 37 (PIB total). Esta tabela NAO publica uma variavel de PIB
// per capita pronta — por isso calculamos o per capita nos mesmos
// abaixo, dividindo pelo populacao mais recente.
const AGREGADO_PIB = 5938;
const VARIAVEL_PIB = 37;
// Agregado 9543 = Taxa de alfabetizacao, variavel 2513.
const AGREGADO_ALFABETIZACAO = 9543;
const VARIAVEL_ALFABETIZACAO = 2513;

async function buscarJson(url) {
  const resposta = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resposta.ok) {
    throw new Error(`IBGE respondeu ${resposta.status} para ${url}`);
  }
  return resposta.json();
}

// Normaliza texto vindo do IBGE (forma NFC) antes de gravar/exibir. Isso
// resolve o caso comum de um mesmo caractere acentuado chegar representado
// de forma "decomposta" (letra + acento como codepoints separados) em vez
// de "precomposta" — que alguns navegadores/fontes exibem errado (ex.: o
// "¿" no lugar do travessao em nomes de regiao imediata). Nao mascara um
// caractere que a IBGE realmente enviou diferente; so garante que o MESMO
// caractere seja sempre representado da mesma forma.
function normalizarTexto(valor) {
  if (!valor) return valor;
  return valor.normalize('NFC').trim();
}

/**
 * Busca a localidade completa (nome, UF, mesorregiao, microrregiao, regiao
 * geografica e regiao geografica imediata) numa unica chamada — a API de
 * localidades ja traz tudo isso aninhado na mesma resposta.
 */
async function buscarLocalidadeCompleta(codigoIbge) {
  try {
    const dado = await buscarJson(`${BASE_LOCALIDADES}/${codigoIbge}`);
    const uf = dado?.microrregiao?.mesorregiao?.UF?.sigla || dado?.UF?.sigla || null;
    return {
      nome: normalizarTexto(dado?.nome) || null,
      uf,
      mesorregiao: normalizarTexto(dado?.microrregiao?.mesorregiao?.nome) || null,
      microrregiao: normalizarTexto(dado?.microrregiao?.nome) || null,
      regiao: normalizarTexto(
        dado?.microrregiao?.mesorregiao?.UF?.regiao?.nome
          || dado?.['regiao-imediata']?.['regiao-intermediaria']?.UF?.regiao?.nome
      ) || null,
      regiaoImediata: normalizarTexto(dado?.['regiao-imediata']?.nome) || null,
    };
  } catch (erro) {
    console.warn('[ibge] falha ao buscar localidade', codigoIbge, erro.message);
    return null;
  }
}

/** Nome e UF oficiais do municipio a partir do codigo IBGE de 7 digitos. */
async function buscarLocalidade(codigoIbge) {
  const completa = await buscarLocalidadeCompleta(codigoIbge);
  if (!completa) return null;
  return { nome: completa.nome, uf: completa.uf };
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
 * Busca, em paralelo, tudo que o IBGE realmente publica pronto por
 * municipio (territorio/geografia, populacao, area, densidade, PIB e
 * alfabetizacao) e devolve no formato que repositorio.salvarValores
 * espera. Itens do pedido original que NAO sao dados simples do IBGE
 * (piramide etaria, sexo, cor/raca, religiao, salario medio, taxa de
 * ocupacao, estatisticas de empresas, IDEB, saneamento, malhas
 * geograficas) ficam de fora aqui de proposito — ver a resposta ao
 * usuario para o porque de cada um.
 */
async function buscarDadosPublicos(codigoIbge) {
  const [localidade, populacao, area, populacaoCenso, pib, alfabetizacao] = await Promise.all([
    buscarLocalidadeCompleta(codigoIbge),
    buscarValorAgregado(AGREGADO_POPULACAO, VARIAVEL_POPULACAO, codigoIbge),
    buscarValorAgregado(AGREGADO_AREA, VARIAVEL_AREA, codigoIbge),
    buscarValorAgregado(AGREGADO_POPULACAO_CENSO, VARIAVEL_POPULACAO_CENSO, codigoIbge),
    buscarValorAgregado(AGREGADO_PIB, VARIAVEL_PIB, codigoIbge),
    buscarValorAgregado(AGREGADO_ALFABETIZACAO, VARIAVEL_ALFABETIZACAO, codigoIbge),
  ]);

  const valores = [];

  // Bloco 1 — Territorio e geografia (texto, sem periodo — e a divisao
  // administrativa atual, nao uma serie historica).
  if (localidade) {
    const camposTexto = {
      mesorregiao: localidade.mesorregiao,
      microrregiao: localidade.microrregiao,
      regiao: localidade.regiao,
      regiao_imediata: localidade.regiaoImediata,
    };
    Object.entries(camposTexto).forEach(([chave, valorTexto]) => {
      if (valorTexto) valores.push({ chave, valorTexto });
    });
  }
  if (area) {
    valores.push({ chave: 'area_km2', valorNumerico: area.valor, periodoReferencia: area.periodo });
  }

  // Bloco 2 — Demografia.
  if (populacao) {
    valores.push({ chave: 'populacao', valorNumerico: populacao.valor, periodoReferencia: populacao.periodo });
  }
  if (populacaoCenso) {
    valores.push({
      chave: 'populacao_censo_2022',
      valorNumerico: populacaoCenso.valor,
      periodoReferencia: populacaoCenso.periodo,
    });
  }
  if (populacao && area && area.valor > 0) {
    valores.push({
      chave: 'densidade_hab_km2',
      valorNumerico: Number((populacao.valor / area.valor).toFixed(2)),
      periodoReferencia: populacao.periodo,
    });
  }

  // Bloco 3 — Economia e trabalho.
  if (pib) {
    valores.push({ chave: 'pib_mil_reais', valorNumerico: pib.valor, periodoReferencia: pib.periodo });
    if (populacao && populacao.valor > 0) {
      valores.push({
        chave: 'pib_per_capita',
        // pib.valor esta em Mil Reais; per capita em Reais.
        valorNumerico: Number(((pib.valor * 1000) / populacao.valor).toFixed(2)),
        periodoReferencia: pib.periodo,
      });
    }
  }

  // Bloco 4 — Educacao (item verificado no SIDRA; os demais do bloco —
  // IDEB, mortalidade infantil, infraestrutura hospitalar — nao sao IBGE,
  // ver a resposta ao usuario).
  if (alfabetizacao) {
    valores.push({
      chave: 'taxa_alfabetizacao',
      valorNumerico: alfabetizacao.valor,
      periodoReferencia: alfabetizacao.periodo,
    });
  }

  return valores;
}

module.exports = { buscarLocalidade, buscarDadosPublicos };
