// Integracao com a API publica do Siconfi (Tesouro Nacional) — fonte
// "api" nova da busca unica (secao 4 do mapeamento, 2026-09-29).
//
// ATENCAO — diferente das demais integracoes deste modulo (IBGE,
// InfoDengue), o formato exato da resposta desta API NAO pode ser
// verificado a partir deste ambiente: tanto a chamada direta quanto a
// leitura da documentacao viva (apidatalake.tesouro.gov.br/docs/siconfi)
// bateram no bloqueio de rede desta sandbox. O que segue e' construido a
// partir da documentacao publica (parametros an_exercicio, nr_periodo,
// co_tipo_demonstrativo, no_anexo, id_ente = codigo IBGE de 7 digitos) e
// do formato de resposta usado por integracoes de terceiros ja em
// producao — mas precisa ser CONFIRMADO com um municipio real em
// staging antes de considerar fechado (mesmo caminho que o mapa do IBGE
// percorreu: implementado com base em doc publica, confirmado depois).
//
// Por isso a extracao dos valores abaixo e' propositalmente tolerante:
// procura pelo nome da conta dentro do texto da linha (varias fontes
// chamam esse campo de "conta"), em vez de depender de um indice fixo —
// se o Tesouro mudar a redacao exata, o pior caso e' o valor nao ser
// encontrado (fica de fora, sem quebrar a tela), nunca um valor errado.

const BASE = 'https://apidatalake.tesouro.gov.br/api';

async function buscarJson(url) {
  const resposta = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!resposta.ok) throw new Error(`Siconfi respondeu ${resposta.status} para ${url}`);
  const corpo = await resposta.json();
  return Array.isArray(corpo?.items) ? corpo.items : Array.isArray(corpo) ? corpo : [];
}

function acharValorPorConta(linhas, padroesTexto) {
  const linha = linhas.find((l) => {
    const texto = String(l.conta ?? l.coluna ?? l.rotulo ?? '').toUpperCase();
    return padroesTexto.some((p) => texto.includes(p));
  });
  if (!linha) return null;
  const bruto = linha.valor ?? linha.vl_conta ?? linha.value;
  const valor = Number(String(bruto).replace(',', '.'));
  return Number.isNaN(valor) ? null : valor;
}

function anoEBimestreAtual() {
  const hoje = new Date();
  const ano = hoje.getUTCFullYear();
  // RREO e' bimestral (6 periodos/ano); usa o bimestre anterior ao atual
  // pra dar tempo do ente ja ter enviado a declaracao daquele periodo.
  const bimestreAtual = Math.ceil((hoje.getUTCMonth() + 1) / 2);
  const bimestre = bimestreAtual > 1 ? bimestreAtual - 1 : 6;
  const anoRreo = bimestreAtual > 1 ? ano : ano - 1;
  return { ano, anoRreo, bimestre };
}

async function buscarRreo(codigoIbge) {
  const { anoRreo, bimestre } = anoEBimestreAtual();
  const params = new URLSearchParams({
    an_exercicio: String(anoRreo),
    nr_periodo: String(bimestre),
    co_tipo_demonstrativo: 'RREO',
    no_anexo: 'RREO-Anexo 01',
    id_ente: codigoIbge,
  });
  try {
    const linhas = await buscarJson(`${BASE}/rreo?${params.toString()}`);
    if (linhas.length === 0) return { linhas: [], periodo: null };
    return { linhas, periodo: `RREO ${anoRreo}, ${bimestre}º bimestre` };
  } catch (erro) {
    console.warn('[siconfi] falha ao buscar RREO', codigoIbge, erro.message);
    return { linhas: [], periodo: null };
  }
}

async function buscarRgf(codigoIbge) {
  const { ano } = anoEBimestreAtual();
  // RGF e' quadrimestral (3 periodos/ano); tenta o quadrimestre anterior,
  // com fallback pro ano anterior perto da virada do ano.
  const hoje = new Date();
  const quadrimestreAtual = Math.ceil((hoje.getUTCMonth() + 1) / 4);
  const quadrimestre = quadrimestreAtual > 1 ? quadrimestreAtual - 1 : 3;
  const anoRgf = quadrimestreAtual > 1 ? ano : ano - 1;
  const params = new URLSearchParams({
    an_exercicio: String(anoRgf),
    in_periodicidade: 'Q',
    nr_periodo: String(quadrimestre),
    co_tipo_demonstrativo: 'RGF',
    no_anexo: 'RGF-Anexo 01',
    co_poder: 'E',
    id_ente: codigoIbge,
  });
  try {
    const linhas = await buscarJson(`${BASE}/rgf?${params.toString()}`);
    if (linhas.length === 0) return { linhas: [], periodo: null };
    return { linhas, periodo: `RGF ${anoRgf}, ${quadrimestre}º quadrimestre` };
  } catch (erro) {
    console.warn('[siconfi] falha ao buscar RGF', codigoIbge, erro.message);
    return { linhas: [], periodo: null };
  }
}

async function buscarDadosFinanceiros(codigoIbge) {
  const [rreo, rgf] = await Promise.all([buscarRreo(codigoIbge), buscarRgf(codigoIbge)]);
  const valores = [];

  const receitaCorrente = acharValorPorConta(rreo.linhas, ['RECEITA CORRENTE LÍQUIDA', 'RECEITA CORRENTE LIQUIDA']);
  if (receitaCorrente !== null) {
    valores.push({ chave: 'siconfi_receita_corrente_liquida', valorNumerico: receitaCorrente, periodoReferencia: rreo.periodo });
  }
  const despesaTotal = acharValorPorConta(rreo.linhas, ['DESPESAS EMPENHADAS', 'DESPESA TOTAL']);
  if (despesaTotal !== null) {
    valores.push({ chave: 'siconfi_despesa_total', valorNumerico: despesaTotal, periodoReferencia: rreo.periodo });
  }

  const pctSaude = acharValorPorConta(rgf.linhas, ['SAÚDE', 'SAUDE']);
  if (pctSaude !== null) {
    valores.push({ chave: 'siconfi_pct_saude', valorNumerico: pctSaude, periodoReferencia: rgf.periodo });
  }
  const pctEducacao = acharValorPorConta(rgf.linhas, ['EDUCAÇÃO', 'EDUCACAO']);
  if (pctEducacao !== null) {
    valores.push({ chave: 'siconfi_pct_educacao', valorNumerico: pctEducacao, periodoReferencia: rgf.periodo });
  }
  const dividaConsolidada = acharValorPorConta(rgf.linhas, ['DÍVIDA CONSOLIDADA LÍQUIDA', 'DIVIDA CONSOLIDADA LIQUIDA']);
  if (dividaConsolidada !== null) {
    valores.push({ chave: 'siconfi_divida_consolidada', valorNumerico: dividaConsolidada, periodoReferencia: rgf.periodo });
  }

  return valores;
}

module.exports = { buscarDadosFinanceiros };
