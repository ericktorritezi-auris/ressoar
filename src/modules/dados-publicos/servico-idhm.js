// Fonte "arquivo_auto" (IDHM / Atlas Brasil-PNUD) — diferente de "api"
// (resposta imediata) e de "arquivo" manual (upload pelo master): aqui o
// sistema baixa e interpreta sozinho o arquivo oficial, a partir do
// endereco guardado em fontes_dados_publicos.arquivo_url (ver migration
// 0008). Confirmado em 2026-09-29 com uma amostra real do arquivo
// enviada pelo usuario: planilha .xlsx, aba "MUN 91-00-10", colunas
// Codmun7 (codigo IBGE de 7 digitos), ANO (1991/2000/2010 — anos de
// Censo, unicos em que o IDHM existe), IDHM, IDHM_E, IDHM_L, IDHM_R,
// T_FREQ6A14, T_FORA6A14.
//
// O arquivo e' nacional (~27MB, todos os municipios x 3 anos) — baixado
// inteiro a cada clique em "Baixar e importar", mesmo pra pegar um so
// municipio. Aceitavel para o volume de uso esperado (clique manual,
// raro); se isso virar rotina de alto volume, vale cachear a leitura em
// vez de rebaixar/reparsear tudo a cada clique.

const ExcelJS = require('exceljs');
const { Readable } = require('node:stream');

const ABA = 'MUN 91-00-10';
const COLUNAS = {
  ano: 'ANO',
  codigoIbge: 'Codmun7',
  idhm: 'IDHM',
  idhmEducacao: 'IDHM_E',
  idhmLongevidade: 'IDHM_L',
  idhmRenda: 'IDHM_R',
  freq6a14: 'T_FREQ6A14',
  fora6a14: 'T_FORA6A14',
};

async function baixarEExtrairMunicipio(urlArquivo, codigoIbge) {
  const resposta = await fetch(urlArquivo, { signal: AbortSignal.timeout(60000) });
  if (!resposta.ok) throw new Error(`Download do IDHM respondeu ${resposta.status}`);
  // fetch() devolve um ReadableStream da Web API; o leitor em streaming
  // do exceljs espera um Readable do Node — sem essa conversao, falha
  // silenciosamente com "Could not recognise input".
  const streamNode = Readable.fromWeb(resposta.body);

  const leitor = new ExcelJS.stream.xlsx.WorkbookReader(streamNode, {});
  let indicePorNome = null;
  let melhorLinha = null;

  for await (const worksheet of leitor) {
    if (worksheet.name !== ABA) continue;
    for await (const row of worksheet) {
      const valores = row.values; // 1-indexed, valores[0] e' undefined
      if (row.number === 1) {
        indicePorNome = {};
        valores.forEach((v, i) => { if (v) indicePorNome[String(v).trim()] = i; });
        continue;
      }
      if (!indicePorNome) continue;
      const codigoLinha = valores[indicePorNome[COLUNAS.codigoIbge]];
      if (String(codigoLinha) !== String(codigoIbge)) continue;
      const ano = Number(valores[indicePorNome[COLUNAS.ano]]);
      if (!melhorLinha || ano > melhorLinha.ano) {
        melhorLinha = { ano, valores, indicePorNome };
      }
    }
    break; // so precisamos da aba MUN 91-00-10
  }

  return melhorLinha;
}

function numero(valores, indicePorNome, chaveColuna) {
  const bruto = valores[indicePorNome[chaveColuna]];
  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

/**
 * Baixa o arquivo do IDHM/Atlas Brasil e devolve os valores do municipio
 * pedido, no ano de Censo mais recente disponivel — no formato que
 * dados_publicos.salvarValores espera. Nunca lanca: falha de rede ou
 * arquivo sem o municipio devolve lista vazia, igual as outras
 * integracoes deste modulo.
 */
async function buscarIdhm(urlArquivo, codigoIbge) {
  try {
    const linha = await baixarEExtrairMunicipio(urlArquivo, codigoIbge);
    if (!linha) return [];
    const { valores, indicePorNome, ano } = linha;
    const periodo = `Censo ${ano}`;
    const campos = [
      ['idhm', COLUNAS.idhm],
      ['idhm_educacao', COLUNAS.idhmEducacao],
      ['idhm_longevidade', COLUNAS.idhmLongevidade],
      ['idhm_renda', COLUNAS.idhmRenda],
      ['escolarizacao_6a14', COLUNAS.freq6a14],
      ['fora_da_escola_6a14', COLUNAS.fora6a14],
    ];
    return campos
      .map(([chave, colunaOriginal]) => {
        const valor = numero(valores, indicePorNome, colunaOriginal);
        return valor === null ? null : { chave, valorNumerico: valor, periodoReferencia: periodo };
      })
      .filter(Boolean);
  } catch (erro) {
    console.warn('[idhm] falha ao baixar/interpretar o arquivo', codigoIbge, erro.message);
    return [];
  }
}

module.exports = { buscarIdhm };
