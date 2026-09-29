// Orquestra a busca ao vivo na fonte "api" (IBGE) e a gravacao do
// resultado, incluindo o reflexo do valor de populacao na tabela
// municipios. Compartilhado pelo cadastro de municipios e pela Central de
// Atualizacoes (secao 3.1 e 4 do mapeamento).

const repo = require('./repositorio');
const servicoIbge = require('./servico-ibge');
const municipiosRepo = require('../municipios/repositorio');

// Painel de Localização (novo UX, 2026-09-29): busca o mapa (SVG) do
// IBGE só UMA vez por município — o contorno geográfico não muda com a
// atualização periódica de dados públicos, então não faz sentido
// refazer essa chamada toda vez que "Buscar agora" roda. `forcar: true`
// (botão manual "Regenerar mapa") ignora essa checagem, para o caso raro
// de uma redefinição de limites municipais.
async function garantirMapaMunicipio(tenant, municipioId, codigoIbge, { forcar = false } = {}) {
  if (!forcar) {
    const municipio = await municipiosRepo.buscarPorId(tenant, municipioId);
    if (municipio && municipio.mapa_svg) return false;
  }
  const svg = await servicoIbge.buscarMalhaSvg(codigoIbge);
  if (!svg) return false;
  await municipiosRepo.atualizarMapa(tenant, municipioId, svg);
  return true;
}

async function buscarEArmazenarDadosIbge(tenant, municipioId, codigoIbge) {
  const fonteIbge = await repo.buscarFontePorCodigo('ibge_sidra');
  if (!fonteIbge) return [];

  const valores = await servicoIbge.buscarDadosPublicos(codigoIbge);
  if (valores.length === 0) return [];

  await repo.salvarValores(codigoIbge, fonteIbge.id, valores);

  const populacao = valores.find((v) => v.chave === 'populacao');
  if (populacao) {
    await municipiosRepo.atualizarPopulacao(tenant, municipioId, populacao.valorNumerico);
  }

  return valores;
}

/**
 * Importacao assistida para as fontes "arquivo" (SIOPS, Siconfi, CNES,
 * DATASUS — secao 4): um CSV simples com colunas chave,valor,periodo, que
 * o master exporta da fonte oficial e sobe aqui. Nao ha parser proprio por
 * fonte nesta fase — o formato e generico de proposito, para nao amarrar o
 * sistema ao layout de arquivo de cada orgao.
 */
// Bug encontrado em 2026-09-28: um CSV com "3 colunas, 3 valores" foi
// importado e virou UMA chave gigante (a linha inteira) com valor e
// periodo vazios. Causa raiz: Excel/Google Sheets em configuracao
// regional pt-BR exportam CSV separado por PONTO-E-VIRGULA, nao virgula
// — porque a virgula ja e o separador decimal em pt-BR (ex.: "7,8"). O
// parser so sabia ler separado por virgula, entao a linha inteira virava
// um unico campo. Agora detecta o delimitador looking pela primeira
// linha do arquivo (qual dos dois aparece mais vezes vence), aceitando
// os dois formatos.
function detectarDelimitador(primeiraLinha) {
  const ocorrenciasVirgula = (primeiraLinha.match(/,/g) || []).length;
  const ocorrenciasPontoVirgula = (primeiraLinha.match(/;/g) || []).length;
  return ocorrenciasPontoVirgula > ocorrenciasVirgula ? ';' : ',';
}

function interpretarCsv(conteudo) {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (linhas.length === 0) return [];

  const delimitador = detectarDelimitador(linhas[0]);
  const primeiraLinha = linhas[0].toLowerCase();
  const temCabecalho = primeiraLinha.startsWith('chave');
  const linhasDeDados = temCabecalho ? linhas.slice(1) : linhas;

  return linhasDeDados
    .map((linha) => {
      const [chave, valor, periodo] = linha.split(delimitador).map((c) => (c || '').trim());
      if (!chave) return null;
      // Com delimitador ";", a virgula em "7,8" e decimal (nao separador) —
      // trocamos por ponto antes de tentar converter pra numero nos dois casos.
      const valorNumerico = Number(String(valor).replace(',', '.'));
      const ehNumero = valor !== '' && !Number.isNaN(valorNumerico);
      return {
        chave,
        valorNumerico: ehNumero ? valorNumerico : null,
        valorTexto: ehNumero ? null : valor || null,
        periodoReferencia: periodo || null,
      };
    })
    .filter(Boolean);
}

async function importarArquivo(codigoIbge, codigoFonte, conteudoCsv) {
  const fonte = await repo.buscarFontePorCodigo(codigoFonte);
  if (!fonte) throw new Error(`Fonte desconhecida: ${codigoFonte}`);
  if (fonte.integracao !== 'arquivo') {
    throw new Error(`Fonte ${codigoFonte} não é do tipo arquivo.`);
  }

  const valores = interpretarCsv(conteudoCsv);
  if (valores.length === 0) throw new Error('Nenhuma linha válida encontrada no arquivo.');

  await repo.salvarValores(codigoIbge, fonte.id, valores);
  return valores.length;
}

module.exports = { buscarEArmazenarDadosIbge, garantirMapaMunicipio, importarArquivo, interpretarCsv };
