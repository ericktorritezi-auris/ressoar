// Integracao com a API publica do InfoDengue (Fiocruz/UFMG) — fonte
// "api" nova da busca unica (secao 4 do mapeamento, 2026-09-29).
// Documentacao confirmada em info.dengue.mat.br/services/api/doc:
// endpoint /api/alertcity, parametros geocode/disease/format/ew_start/
// ew_end/ey_start/ey_end, todos obrigatorios. Mesma regra das outras
// integracoes deste modulo: falha de rede NUNCA pode travar a tela —
// sempre try/catch, sempre com timeout, sempre retorna null/vazio em vez
// de lancar.

const BASE = 'https://info.dengue.mat.br/api/alertcity';
const DOENCAS = ['dengue', 'chikungunya', 'zika'];

function semanaEpidemiologicaAtual(data = new Date()) {
  // Aproximacao de semana epidemiologica (padrao ISO, domingo-sabado nao
  // se aplica aqui — InfoDengue usa semana epidemiologica MS, que comeca
  // no domingo). Suficiente para pedir "as ultimas ~14 semanas": nao
  // precisa ser exata, so cobrir uma janela que garanta as 12 mais
  // recentes ja publicadas.
  const inicioAno = new Date(Date.UTC(data.getUTCFullYear(), 0, 1));
  const dias = Math.floor((data - inicioAno) / 86400000);
  return Math.min(53, Math.max(1, Math.ceil((dias + inicioAno.getUTCDay() + 1) / 7)));
}

async function buscarDoenca(codigoIbge, doenca) {
  const hoje = new Date();
  const anoAtual = hoje.getUTCFullYear();
  const seAtual = semanaEpidemiologicaAtual(hoje);
  // Janela de 14 semanas pra garantir 12 semanas cheias mesmo com atraso
  // de publicacao da ultima; se a janela cruzar o ano (SE atual < 14),
  // volta pro ano anterior no inicio.
  let anoInicio = anoAtual;
  let seInicio = seAtual - 13;
  if (seInicio < 1) {
    anoInicio -= 1;
    seInicio += 52;
  }
  const params = new URLSearchParams({
    geocode: codigoIbge,
    disease: doenca,
    format: 'json',
    ew_start: String(seInicio),
    ew_end: String(seAtual),
    ey_start: String(anoInicio),
    ey_end: String(anoAtual),
  });
  try {
    const resposta = await fetch(`${BASE}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resposta.ok) throw new Error(`InfoDengue respondeu ${resposta.status}`);
    const linhas = await resposta.json();
    if (!Array.isArray(linhas) || linhas.length === 0) return null;
    // A API retorna mais recente primeiro OU mais antigo primeiro
    // dependendo da versao — ordena explicitamente por data pra nao
    // depender disso.
    linhas.sort((a, b) => new Date(a.data_iniSE) - new Date(b.data_iniSE));
    return linhas;
  } catch (erro) {
    console.warn(`[infodengue] falha ao buscar ${doenca}`, codigoIbge, erro.message);
    return null;
  }
}

/**
 * Busca as ultimas ~12 semanas de dengue para o municipio e devolve no
 * formato que dados_publicos.salvarValores espera: o valor mais recente
 * de cada indicador, mais a serie completa guardada como JSON num unico
 * valor_texto (pra desenhar o grafico na tela, sem precisar de uma
 * tabela dedicada — ver dados-publicos/servico.js).
 *
 * Nivel de alerta (campo "nivel" da API): 1 verde, 2 amarelo, 3 laranja,
 * 4 vermelho — mapeado aqui pra texto, a cor fica por conta do CSS
 * (.rsr-alerta-1..4) na tela.
 */
const ROTULO_NIVEL = { 1: 'Verde — normal', 2: 'Amarelo — alerta', 3: 'Laranja — atenção', 4: 'Vermelho — epidemia' };

async function buscarDadosSaude(codigoIbge) {
  const linhas = await buscarDoenca(codigoIbge, 'dengue');
  if (!linhas) return [];

  const ultima = linhas[linhas.length - 1];
  const valores = [];

  if (ultima.casos !== undefined && ultima.casos !== null) {
    valores.push({ chave: 'dengue_casos_semana', valorNumerico: Number(ultima.casos), periodoReferencia: `SE ${ultima.SE || ''}`.trim() });
  }
  const incidencia = ultima.p_inc100k ?? ultima.inc;
  if (incidencia !== undefined && incidencia !== null) {
    valores.push({ chave: 'dengue_incidencia_100mil', valorNumerico: Number(incidencia), periodoReferencia: `SE ${ultima.SE || ''}`.trim() });
  }
  if (ultima.nivel !== undefined && ultima.nivel !== null) {
    valores.push({
      chave: 'dengue_nivel_alerta',
      valorNumerico: Number(ultima.nivel),
      valorTexto: ROTULO_NIVEL[Number(ultima.nivel)] || `Nível ${ultima.nivel}`,
      periodoReferencia: `SE ${ultima.SE || ''}`.trim(),
    });
  }

  const serie = linhas.map((l) => ({ semana: l.SE, casos: Number(l.casos) || 0 })).filter((p) => p.semana);
  if (serie.length > 0) {
    valores.push({
      chave: 'dengue_serie_semanal',
      valorTexto: JSON.stringify(serie),
      periodoReferencia: serie.length ? String(serie[serie.length - 1].semana) : null,
    });
  }

  return valores;
}

module.exports = { buscarDadosSaude };
