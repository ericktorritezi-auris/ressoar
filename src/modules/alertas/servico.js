// Logica pura de geracao de alertas (Fase 4 — docs/mapeamento-fase4-bi-dashboards.md,
// secao 5). Mantida sem nenhuma dependencia de banco para poder ser testada
// isoladamente (tests/alertas.test.js) — quem persiste e o repositorio.js.

const LIMIARES_MANDATO_DIAS = [360, 180, 90, 60, 30, 15];

// Historico minimo de periodos anteriores pra ter uma media que signifique
// alguma coisa; com menos que isso, nao gera alerta de anomalia (evita
// "fora do padrao" no segundo valor lancado, quando so ha um ponto antes).
const MINIMO_HISTORICO_PARA_ANOMALIA = 3;

// Decisao fechada com o usuario (2026-10-01): comparar com o HISTORICO DO
// PROPRIO MUNICIPIO (nao com meta/limite cadastrado, nem com outros
// municipios). Limiar de desvio relativo em relacao a media dos valores
// anteriores daquele mesmo indicador naquele mesmo municipio.
const DESVIO_RELATIVO_MINIMO = 0.3; // 30%

function diasEntre(hoje, dataFim) {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  const inicio = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const fim = Date.UTC(dataFim.getUTCFullYear(), dataFim.getUTCMonth(), dataFim.getUTCDate());
  return Math.round((fim - inicio) / MS_POR_DIA);
}

/**
 * Calcula quais alertas de "mandato perto do fim" deveriam existir hoje
 * para um municipio, dado o seu mandato_fim.
 *
 * chaveDedup inclui a propria data de mandato_fim (nao so o limiar) —
 * assim, quando o cadastro do municipio e atualizado com um novo
 * prefeito/mandato (secao 5 do mapeamento: "para de disparar quando o
 * mandato for trocado"), os alertas do ciclo antigo simplesmente param de
 * ser regerados (a chave muda), sem precisar apagar nada do historico.
 *
 * @param {{ mandatoFim: Date|null }} municipio
 * @param {Date} hoje
 * @returns {Array<{ chaveDedup: string, titulo: string, mensagem: string, nivel: 'info'|'atencao'|'critico' }>}
 */
function calcularAlertasMandato(municipio, hoje) {
  if (!municipio || !municipio.mandatoFim) return [];
  const diasRestantes = diasEntre(hoje, municipio.mandatoFim);
  if (diasRestantes < 0) return []; // mandato ja encerrado no cadastro — fora do escopo deste alerta

  const dataFimIso = municipio.mandatoFim.toISOString().slice(0, 10);
  return LIMIARES_MANDATO_DIAS.filter((limiar) => diasRestantes <= limiar).map((limiar) => ({
    chaveDedup: `mandato:${dataFimIso}:${limiar}`,
    titulo: `Mandato encerra em até ${limiar} dias`,
    mensagem: `O mandato do(a) prefeito(a) ${municipio.prefeitoNome || 'cadastrado(a)'} termina em ${diasRestantes} dia(s) (${dataFimIso}).`,
    nivel: limiar <= 30 ? 'critico' : limiar <= 90 ? 'atencao' : 'info',
  }));
}

/**
 * Detecta se o ultimo valor lancado de um indicador foge do padrao
 * historico DO PROPRIO municipio para aquele indicador.
 *
 * @param {Array<{ periodoReferencia: string, valorNumerico: number }>} valoresOrdenados - mais antigo primeiro
 * @returns {{ chaveDedup: string, titulo: string, mensagem: string, nivel: 'atencao'|'critico' } | null}
 */
function calcularAnomaliaIndicador(indicador, valoresOrdenados) {
  if (!valoresOrdenados || valoresOrdenados.length <= MINIMO_HISTORICO_PARA_ANOMALIA) return null;

  const ultimo = valoresOrdenados[valoresOrdenados.length - 1];
  const anteriores = valoresOrdenados.slice(0, -1).map((v) => Number(v.valorNumerico));
  const media = anteriores.reduce((soma, v) => soma + v, 0) / anteriores.length;

  if (media === 0) return null; // desvio relativo nao faz sentido com media zero

  const valorAtual = Number(ultimo.valorNumerico);
  const desvioRelativo = Math.abs(valorAtual - media) / Math.abs(media);
  if (desvioRelativo < DESVIO_RELATIVO_MINIMO) return null;

  return {
    chaveDedup: `indicador:${indicador.id}:${ultimo.periodoReferencia}`,
    titulo: `${indicador.nome} fora do padrão histórico`,
    mensagem: `No período ${ultimo.periodoReferencia}, o valor (${valorAtual}) ficou ${(desvioRelativo * 100).toFixed(0)}% ` +
      `${valorAtual > media ? 'acima' : 'abaixo'} da média histórica do próprio município (${media.toFixed(2)}).`,
    nivel: desvioRelativo >= 0.6 ? 'critico' : 'atencao',
  };
}

module.exports = {
  LIMIARES_MANDATO_DIAS,
  MINIMO_HISTORICO_PARA_ANOMALIA,
  DESVIO_RELATIVO_MINIMO,
  diasEntre,
  calcularAlertasMandato,
  calcularAnomaliaIndicador,
};
