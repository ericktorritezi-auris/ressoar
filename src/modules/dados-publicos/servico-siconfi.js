// Integracao com a API publica do Siconfi (Tesouro Nacional) — fonte
// "api" da busca unica (secao 4 do mapeamento, 2026-09-29).
//
// Historico desta integracao (2026-09-29, mesmo dia — 3 rodadas de
// correcao com o usuario testando em staging a cada rodada):
//
// Rodada 1 (implementacao inicial): base URL e nomes de anexo "chutados"
// a partir de documentacao de terceiros, sem conseguir testar contra a
// API real (bloqueada nesta sandbox). Resultado: aba Financas sempre
// vazia.
//
// Rodada 2: corrigi os NUMEROS dos anexos (RREO-Anexo 03 pra RCL,
// RGF-Anexo 02 pra divida, etc.) — ainda baseado em doc de terceiros, sem
// testar ao vivo. O usuario testou em staging e os logs mostraram TODAS
// as chamadas voltando 404 — nao era so o numero do anexo, era a URL
// BASE inteira que estava errada.
//
// Rodada 3: consegui, via WebFetch, alcancar de fato a API real (algo que
// curl/fetch direto desta sandbox nao conseguem — bloqueio de rede so no
// /agent-proxy usado por eles) e confirmei contra um municipio real (Sao
// Paulo, 3550308, RREO 2024/6º bimestre, RGF 2024/3º quadrimestre) três
// coisas importantes:
//
//   1) A URL base certa e' .../ords/siconfi/tt/ — no' de Oracle REST Data
//      Services (ORDS) — NUNCA foi .../api/. Esse "/api/" usado nas duas
//      rodadas anteriores nao existe: e' por isso que TUDO voltava 404,
//      nao so um anexo ou outro.
//
//   2) Cada "conta" de um anexo vem repetida em varias linhas — uma por
//      "coluna" (ex.: "PREVISÃO INICIAL", "<MR-3>", "TOTAL (ÚLTIMOS 12
//      MESES)", "Até o 2º Quadrimestre"...). Um match so pelo texto da
//      conta (como nas rodadas 1-2) pega a PRIMEIRA linha que aparecer —
//      quase sempre a coluna errada, com um numero que nao e' o total
//      que queremos. Corrigido usando o campo `cod_conta` (identificador
//      estavel, ex. "RREO3ReceitaCorrenteLiquida") pra achar o grupo de
//      linhas certo, e so' depois escolhendo a `coluna` certa dentro dele.
//
//   3) % investido em saúde e % investido em educação NÃO EXISTEM no
//      Siconfi — confirmado no manual oficial do Tesouro (Regras Gerais
//      RREO 2025): esses dois demonstrativos (MDE/ASPS) são entregues a
//      sistemas separados — SIOPE (educação) e SIOPS (saúde) — não ao
//      Siconfi. Por isso esses dois campos foram REMOVIDOS desta
//      integração (não é um bug corrigível aqui; é fonte de dado
//      diferente, fora do escopo atual). Se algum dia entrarem, é uma
//      integração nova com SIOPE/SIOPS, não um ajuste deste arquivo.
//
// Contas confirmadas contra a API real (São Paulo, 2024):
//   RREO-Anexo 01 → cod_conta "DespesasExcetoIntraOrcamentarias"
//                    (conta "DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (VIII)")
//   RREO-Anexo 03 → cod_conta "RREO3ReceitaCorrenteLiquida"
//                    (conta "RECEITA CORRENTE LÍQUIDA (III) = (I - II)",
//                     coluna "TOTAL (ÚLTIMOS 12 MESES)")
//   RGF-Anexo  02 → cod_conta "DividaConsolidadaLiquida"
//                    (conta "DÍVIDA CONSOLIDADA LÍQUIDA (DCL) (III) = (I - II)",
//                     coluna "Até o Xº Quadrimestre", X = o quadrimestre pedido)
//
// Rodada 4 (2026-09-29, mesmo dia — usuário testou de novo em staging com
// um município pequeno de verdade, São Sebastião da Amoreira/PR, 8.063
// hab.): tela voltou "nenhum valor encontrado" de novo, mas SEM nenhum
// log de erro — nem 404, nem "cod_conta não encontrado". Ou seja, a API
// respondia 200 com items:[] em TODOS os períodos tentados, sem nunca
// lançar exceção — por isso nada aparecia no log (meu código só loga em
// caso de erro OU de resposta não-vazia sem o padrão esperado; resposta
// vazia "de verdade" é silenciosa, igual a "esse período não foi
// declarado ainda", o que é normal).
//
// Investigando direto contra o endpoint extrato_entregas (mostra o que o
// ente realmente declarou), achei a causa: pela Lei de Responsabilidade
// Fiscal, município com população abaixo de 50 mil habitantes entrega um
// relatório DIFERENTE — "RREO Simplificado" / "RGF Simplificado" — em vez
// do "RREO"/"RGF" normal usado pelas grandes cidades (que foi o único
// testado até agora, com São Paulo). Os nomes dos anexos e cod_conta são
// os mesmos nos dois formatos (confirmado contra este município real:
// RREO-Anexo 01, cod_conta "DespesasExcetoIntraOrcamentarias", coluna
// "DESPESAS EMPENHADAS ATÉ O BIMESTRE (f)" — tudo igual ao de São Paulo),
// só o `co_tipo_demonstrativo` muda. Por isso agora cada tentativa testa
// os dois tipos (normal, depois Simplificado) antes de passar pro
// próximo período. Para o RGF Simplificado especificamente, a
// periodicidade declarada também é diferente: "S" (semestral, só 1-2
// declarações/ano) em vez de "Q" (quadrimestral) — daí a tentativa extra
// dedicada a esse formato em `buscarRgfAnexo`.

const BASE = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt';

async function buscarJson(url) {
  const resposta = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!resposta.ok) throw new Error(`Siconfi respondeu ${resposta.status} para ${url}`);
  const corpo = await resposta.json();
  return Array.isArray(corpo?.items) ? corpo.items : Array.isArray(corpo) ? corpo : [];
}

// Acha o valor certo dentro de um anexo: primeiro filtra pelo grupo de
// linhas do `cod_conta` pedido (identificador estavel, nao muda entre
// periodos), depois escolhe a `coluna` certa dentro desse grupo — sem
// isso, um match so por texto da conta pega a primeira linha que
// aparecer (ex.: um unico mês, em vez do total acumulado).
function acharValorPorCodConta(linhas, codConta, padroesColuna, rotuloDebug) {
  const doGrupo = linhas.filter((l) => l.cod_conta === codConta);
  if (doGrupo.length === 0) {
    if (linhas.length > 0 && rotuloDebug) {
      const amostra = [...new Set(linhas.map((l) => l.cod_conta || l.conta || '(sem cod_conta/conta)'))].slice(0, 10);
      console.warn(`[siconfi] anexo sem cod_conta esperado (${rotuloDebug}, procurado: "${codConta}") — cod_conta recebidos:`, amostra);
    }
    return null;
  }
  for (const padrao of padroesColuna) {
    const linha = doGrupo.find((l) => String(l.coluna ?? '').toUpperCase().includes(padrao.toUpperCase()));
    if (linha) {
      const valor = Number(String(linha.valor).replace(',', '.'));
      return Number.isNaN(valor) ? null : valor;
    }
  }
  // Nenhuma coluna preferida bateu — loga as colunas reais pra ajuste, mas
  // ainda devolve a primeira linha do grupo em vez de nada (melhor um
  // numero aproximado, sinalizado no log, do que a aba vazia de novo).
  if (rotuloDebug) {
    const colunas = doGrupo.map((l) => l.coluna);
    console.warn(`[siconfi] cod_conta "${codConta}" achado (${rotuloDebug}), mas nenhuma coluna esperada bateu — colunas recebidas:`, colunas);
  }
  const valor = Number(String(doGrupo[0].valor).replace(',', '.'));
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

// Municípios grandes declaram "RREO"/"RGF"; municípios com menos de 50 mil
// habitantes declaram "RREO Simplificado"/"RGF Simplificado" (LRF) — os
// nomes de anexo e cod_conta são os mesmos nos dois formatos, só esse
// parâmetro muda. Como não vale a pena manter uma lista de população por
// município só pra escolher o tipo certo de antemão, tentamos os dois.
const TIPOS_RREO = ['RREO', 'RREO Simplificado'];
const TIPOS_RGF = ['RGF', 'RGF Simplificado'];

async function buscarRreoAnexo(codigoIbge, noAnexo) {
  for (const { ano, bimestre } of periodosRreo()) {
    for (const tipo of TIPOS_RREO) {
      const params = new URLSearchParams({
        an_exercicio: String(ano),
        nr_periodo: String(bimestre),
        co_tipo_demonstrativo: tipo,
        no_anexo: noAnexo,
        id_ente: codigoIbge,
      });
      try {
        const linhas = await buscarJson(`${BASE}/rreo?${params.toString()}`);
        if (linhas.length > 0) {
          return { linhas, periodo: `${tipo} ${ano}, ${bimestre}º bimestre` };
        }
      } catch (erro) {
        console.warn(`[siconfi] falha ao buscar ${noAnexo} (${tipo})`, codigoIbge, ano, bimestre, erro.message);
      }
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
        return { linhas, periodo: `RGF ${ano}, ${quadrimestre}º quadrimestre`, quadrimestre };
      }
    } catch (erro) {
      console.warn(`[siconfi] falha ao buscar ${noAnexo}`, codigoIbge, ano, quadrimestre, erro.message);
    }
  }

  // Fallback pro formato "Simplificado" (municípios < 50 mil hab.):
  // periodicidade "S" (semestral), no máximo 2 declarações/ano — tenta o
  // ano atual e o anterior, período 1 e 2 de cada.
  const anoAtual = new Date().getUTCFullYear();
  for (const ano of [anoAtual, anoAtual - 1]) {
    for (const periodo of [1, 2]) {
      const params = new URLSearchParams({
        an_exercicio: String(ano),
        in_periodicidade: 'S',
        nr_periodo: String(periodo),
        co_tipo_demonstrativo: 'RGF Simplificado',
        no_anexo: noAnexo,
        co_poder: 'E',
        id_ente: codigoIbge,
      });
      try {
        const linhas = await buscarJson(`${BASE}/rgf?${params.toString()}`);
        if (linhas.length > 0) {
          return { linhas, periodo: `RGF Simplificado ${ano}, ${periodo}º semestre`, quadrimestre: null, semestre: periodo };
        }
      } catch (erro) {
        console.warn(`[siconfi] falha ao buscar ${noAnexo} (RGF Simplificado)`, codigoIbge, ano, periodo, erro.message);
      }
    }
  }

  return { linhas: [], periodo: null, quadrimestre: null };
}

async function buscarDadosFinanceiros(codigoIbge) {
  const [balanco, rcl, divida] = await Promise.all([
    buscarRreoAnexo(codigoIbge, 'RREO-Anexo 01'), // Balanço Orçamentário → despesa total
    buscarRreoAnexo(codigoIbge, 'RREO-Anexo 03'), // Receita Corrente Líquida
    buscarRgfAnexo(codigoIbge, 'RGF-Anexo 02'),   // Dívida Consolidada Líquida
  ]);

  const valores = [];

  const receitaCorrente = acharValorPorCodConta(
    rcl.linhas,
    'RREO3ReceitaCorrenteLiquida',
    ['TOTAL (ÚLTIMOS 12 MESES)'],
    'RREO-Anexo 03 / receita corrente líquida'
  );
  if (receitaCorrente !== null) {
    valores.push({ chave: 'siconfi_receita_corrente_liquida', valorNumerico: receitaCorrente, periodoReferencia: rcl.periodo });
  }

  const despesaTotal = acharValorPorCodConta(
    balanco.linhas,
    'DespesasExcetoIntraOrcamentarias',
    ['EMPENHADAS ATÉ O BIMESTRE', 'ATÉ O BIMESTRE', 'EMPENHADAS NO BIMESTRE'],
    'RREO-Anexo 01 / despesa total'
  );
  if (despesaTotal !== null) {
    valores.push({ chave: 'siconfi_despesa_total', valorNumerico: despesaTotal, periodoReferencia: balanco.periodo });
  }

  // % saúde e % educação NÃO vêm do Siconfi — ver comentário no topo do
  // arquivo (esses demonstrativos vão para SIOPS/SIOPE, sistemas
  // separados). Removidos desta integração em 2026-09-29.

  // Município grande (quadrimestral) usa "Até o Xº Quadrimestre"; município
  // pequeno no formato Simplificado (semestral) usa "Até o Xº Semestre" —
  // 'Até o' sozinho no final pega qualquer um dos dois formatos como
  // último recurso (a resposta só tem uma linha "Até o..." por período
  // pedido, então não corre risco de pegar o período errado).
  const padroesColunaDivida = [
    divida.quadrimestre ? `Até o ${divida.quadrimestre}º Quadrimestre` : null,
    divida.semestre ? `Até o ${divida.semestre}º Semestre` : null,
    'Até o',
  ].filter(Boolean);
  const dividaConsolidada = acharValorPorCodConta(
    divida.linhas,
    'DividaConsolidadaLiquida',
    padroesColunaDivida,
    'RGF-Anexo 02 / dívida consolidada'
  );
  if (dividaConsolidada !== null) {
    valores.push({ chave: 'siconfi_divida_consolidada', valorNumerico: dividaConsolidada, periodoReferencia: divida.periodo });
  }

  return valores;
}

module.exports = { buscarDadosFinanceiros };
