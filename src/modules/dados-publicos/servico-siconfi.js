// Integracao com a API publica do Siconfi (Tesouro Nacional) — fonte
// "api" da busca unica (secao 4 do mapeamento, 2026-09-29).
//
// Corrigido em 2026-09-29 apos teste em staging: a primeira versao usava
// RGF-Anexo 01 (Despesa com Pessoal) para saude/educacao/divida e
// RREO-Anexo 01 (Balanco Orcamentario) para Receita Corrente Liquida —
// nenhum desses anexos contem essas linhas, entao a aba Financas ficava
// sempre vazia. Anexos corretos, confirmados na documentacao oficial do
// Tesouro (Regras Gerais e Instrucoes de Preenchimento do RREO/RGF):
//   RREO-Anexo 01 — Balanco Orcamentario                          (despesa total)
//   RREO-Anexo 03 — Demonstrativo da Receita Corrente Liquida     (receita corrente líquida)
//   RREO-Anexo 08 — Demonstrativo das Receitas e Despesas com MDE (% educação)
//   RREO-Anexo 09 — Demonstrativo das Receitas e Despesas com ASPS(% saúde)
//   RGF-Anexo  02 — Demonstrativo da Dívida Consolidada Líquida   (dívida consolidada)
//
// ATENCAO — ainda assim, o formato exato da resposta (nomes de linha
// dentro de cada anexo) nao pode ser verificado a partir deste ambiente:
// tanto a chamada direta quanto a leitura da documentacao viva
// (apidatalake.tesouro.gov.br/docs/siconfi) batem no bloqueio de rede
// desta sandbox. Os nomes de campo (conta/coluna/valor) e a numeracao
// dos anexos foram confirmados via documentacao publica do Tesouro e
// exemplos de terceiros ja em producao — mas os TEXTOS exatos das linhas
// dentro de cada anexo (ex.: "% APLICADO..." vs "TOTAL DAS DESPESAS
// COM...") ainda precisam ser confirmados com um municipio real em
// staging. Por isso: (a) a extracao continua tolerante, procurando por
// varios padroes de texto; (b) quando um anexo devolve linhas mas
// nenhuma bate com os padroes esperados, o codigo registra no log do
// servidor as primeiras contas encontradas — se a aba Financas continuar
// incompleta, esses logs (buscados por "[siconfi] anexo sem padrao
// esperado") mostram o texto real das linhas, o que resolve em um ciclo.

const BASE = 'https://apidatalake.tesouro.gov.br/api';

async function buscarJson(url) {
  const resposta = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!resposta.ok) throw new Error(`Siconfi respondeu ${resposta.status} para ${url}`);
  const corpo = await resposta.json();
  return Array.isArray(corpo?.items) ? corpo.items : Array.isArray(corpo) ? corpo : [];
}

function acharValorPorConta(linhas, padroesTexto, rotuloDebug) {
  const linha = linhas.find((l) => {
    const texto = String(l.conta ?? l.coluna ?? l.rotulo ?? '').toUpperCase();
    return padroesTexto.some((p) => texto.includes(p));
  });
  if (!linha) {
    if (linhas.length > 0 && rotuloDebug) {
      const amostra = linhas.slice(0, 8).map((l) => l.conta ?? l.coluna ?? l.rotulo ?? '(sem campo conta/coluna/rotulo)');
      console.warn(`[siconfi] anexo sem padrão esperado (${rotuloDebug}) — contas recebidas:`, amostra);
    }
    return null;
  }
  const bruto = linha.valor ?? linha.vl_conta ?? linha.value;
  const valor = Number(String(bruto).replace(',', '.'));
  return Number.isNaN(valor) ? null : valor;
}

// Gera ate `tentativas` periodos (ano, bimestre) decrescentes a partir do
// atual, incluindo a virada de ano — o ente pode ainda nao ter enviado a
// declaracao do periodo mais recente, entao tentamos alguns anteriores
// antes de desistir.
function periodosRreo(tentativas = 3) {
  const hoje = new Date();
  const anoAtual = hoje.getUTCFullYear();
  const bimestreAtual = Math.ceil((hoje.getUTCMonth() + 1) / 2);
  // comeca no bimestre anterior ao vigente (o vigente ainda nao fechou)
  let ano = anoAtual;
  let bimestre = bimestreAtual > 1 ? bimestreAtual - 1 : 6;
  if (bimestreAtual === 1) ano -= 1;

  const lista = [];
  for (let i = 0; i < tentativas; i += 1) {
    lista.push({ ano, bimestre });
    bimestre -= 1;
    if (bimestre < 1) { bimestre = 6; ano -= 1; }
  }
  return lista;
}

function periodosRgf(tentativas = 2) {
  const hoje = new Date();
  const anoAtual = hoje.getUTCFullYear();
  const quadrimestreAtual = Math.ceil((hoje.getUTCMonth() + 1) / 4);
  let ano = anoAtual;
  let quadrimestre = quadrimestreAtual > 1 ? quadrimestreAtual - 1 : 3;
  if (quadrimestreAtual === 1) ano -= 1;

  const lista = [];
  for (let i = 0; i < tentativas; i += 1) {
    lista.push({ ano, quadrimestre });
    quadrimestre -= 1;
    if (quadrimestre < 1) { quadrimestre = 3; ano -= 1; }
  }
  return lista;
}

// Busca um anexo do RREO, tentando periodos anteriores se o mais recente
// vier vazio (ente ainda nao declarou). Retorna a primeira resposta
// nao-vazia, ou linhas: [] se nenhum periodo tentado tiver dado.
async function buscarRreoAnexo(codigoIbge, noAnexo) {
  for (const { ano, bimestre } of periodosRreo()) {
    const params = new URLSearchParams({
      an_exercicio: String(ano),
      nr_periodo: String(bimestre),
      co_tipo_demonstrativo: 'RREO',
      no_anexo: noAnexo,
      id_ente: codigoIbge,
    });
    try {
      const linhas = await buscarJson(`${BASE}/rreo?${params.toString()}`);
      if (linhas.length > 0) {
        return { linhas, periodo: `RREO ${ano}, ${bimestre}º bimestre` };
      }
    } catch (erro) {
      console.warn(`[siconfi] falha ao buscar ${noAnexo}`, codigoIbge, ano, bimestre, erro.message);
    }
  }
  return { linhas: [], periodo: null };
}

async function buscarRgfAnexo(codigoIbge, noAnexo) {
  for (const { ano, quadrimestre } of periodosRgf()) {
    const params = new URLSearchParams({
      an_exercicio: String(ano),
      in_periodicidade: 'Q',
      nr_periodo: String(quadrimestre),
      co_tipo_demonstrativo: 'RGF',
      no_anexo: noAnexo,
      co_poder: 'E',
      id_ente: codigoIbge,
    });
    try {
      const linhas = await buscarJson(`${BASE}/rgf?${params.toString()}`);
      if (linhas.length > 0) {
        return { linhas, periodo: `RGF ${ano}, ${quadrimestre}º quadrimestre` };
      }
    } catch (erro) {
      console.warn(`[siconfi] falha ao buscar ${noAnexo}`, codigoIbge, ano, quadrimestre, erro.message);
    }
  }
  return { linhas: [], periodo: null };
}

async function buscarDadosFinanceiros(codigoIbge) {
  const [balanco, rcl, mde, asps, divida] = await Promise.all([
    buscarRreoAnexo(codigoIbge, 'RREO-Anexo 01'), // Balanço Orçamentário → despesa total
    buscarRreoAnexo(codigoIbge, 'RREO-Anexo 03'), // Receita Corrente Líquida
    buscarRreoAnexo(codigoIbge, 'RREO-Anexo 08'), // MDE (educação)
    buscarRreoAnexo(codigoIbge, 'RREO-Anexo 09'), // ASPS (saúde)
    buscarRgfAnexo(codigoIbge, 'RGF-Anexo 02'),   // Dívida Consolidada Líquida
  ]);

  const valores = [];

  const receitaCorrente = acharValorPorConta(
    rcl.linhas,
    ['RECEITA CORRENTE LÍQUIDA', 'RECEITA CORRENTE LIQUIDA'],
    'RREO-Anexo 03 / receita corrente líquida'
  );
  if (receitaCorrente !== null) {
    valores.push({ chave: 'siconfi_receita_corrente_liquida', valorNumerico: receitaCorrente, periodoReferencia: rcl.periodo });
  }

  const despesaTotal = acharValorPorConta(
    balanco.linhas,
    ['DESPESAS EMPENHADAS', 'DESPESA TOTAL', 'TOTAL DAS DESPESAS'],
    'RREO-Anexo 01 / despesa total'
  );
  if (despesaTotal !== null) {
    valores.push({ chave: 'siconfi_despesa_total', valorNumerico: despesaTotal, periodoReferencia: balanco.periodo });
  }

  const pctSaude = acharValorPorConta(
    asps.linhas,
    ['% APLICADO', 'PERCENTUAL APLICADO', 'MÍNIMO CONSTITUCIONAL', 'MINIMO CONSTITUCIONAL'],
    'RREO-Anexo 09 / % saúde'
  );
  if (pctSaude !== null) {
    valores.push({ chave: 'siconfi_pct_saude', valorNumerico: pctSaude, periodoReferencia: asps.periodo });
  }

  const pctEducacao = acharValorPorConta(
    mde.linhas,
    ['% APLICADO', 'PERCENTUAL APLICADO', 'MÍNIMO CONSTITUCIONAL', 'MINIMO CONSTITUCIONAL'],
    'RREO-Anexo 08 / % educação'
  );
  if (pctEducacao !== null) {
    valores.push({ chave: 'siconfi_pct_educacao', valorNumerico: pctEducacao, periodoReferencia: mde.periodo });
  }

  const dividaConsolidada = acharValorPorConta(
    divida.linhas,
    ['DÍVIDA CONSOLIDADA LÍQUIDA', 'DIVIDA CONSOLIDADA LIQUIDA'],
    'RGF-Anexo 02 / dívida consolidada'
  );
  if (dividaConsolidada !== null) {
    valores.push({ chave: 'siconfi_divida_consolidada', valorNumerico: dividaConsolidada, periodoReferencia: divida.periodo });
  }

  return valores;
}

module.exports = { buscarDadosFinanceiros };
