// Orquestra a busca ao vivo na fonte "api" (IBGE) e a gravacao do
// resultado, incluindo o reflexo do valor de populacao na tabela
// municipios. Compartilhado pelo cadastro de municipios e pela Central de
// Atualizacoes (secao 3.1 e 4 do mapeamento).

const repo = require('./repositorio');
const servicoIbge = require('./servico-ibge');
const municipiosRepo = require('../municipios/repositorio');

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
function interpretarCsv(conteudo) {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (linhas.length === 0) return [];

  const primeiraLinha = linhas[0].toLowerCase();
  const temCabecalho = primeiraLinha.startsWith('chave');
  const linhasDeDados = temCabecalho ? linhas.slice(1) : linhas;

  return linhasDeDados
    .map((linha) => {
      const [chave, valor, periodo] = linha.split(',').map((c) => (c || '').trim());
      if (!chave) return null;
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

module.exports = { buscarEArmazenarDadosIbge, importarArquivo, interpretarCsv };
