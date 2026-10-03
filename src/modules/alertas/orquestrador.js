// Liga a logica pura de servico.js aos dados reais (municipios/indicadores)
// e persiste via repositorio.js. Rodado sob demanda (quando o sino e
// aberto — nao ha infraestrutura de cron neste projeto ainda; ver
// src/jobs/PLACEHOLDER.md), o que e seguro porque upsertAlerta e
// idempotente por chave_dedup.

const municipiosRepo = require('../municipios/repositorio');
const indicadoresRepo = require('../indicadores/repositorio');
const alertasRepo = require('./repositorio');
const servico = require('./servico');

async function recalcularAlertasMunicipio(tenant, municipio) {
  const hoje = new Date();

  const alertasMandato = servico.calcularAlertasMandato(
    { mandatoFim: municipio.mandato_fim ? new Date(municipio.mandato_fim) : null, prefeitoNome: municipio.prefeito_nome },
    hoje
  );
  await Promise.all(
    alertasMandato.map((a) => alertasRepo.upsertAlerta(tenant, municipio.id, { ...a, tipo: 'mandato_fim' }))
  );

  const indicadores = await indicadoresRepo.listarPorMunicipio(tenant, municipio.id);
  await Promise.all(
    indicadores
      .filter((i) => i.ativo)
      .map(async (indicador) => {
        const valores = await indicadoresRepo.listarValoresPorIndicador(tenant, indicador.id);
        const valoresOrdenados = valores.map((v) => ({
          periodoReferencia: v.periodo_referencia,
          valorNumerico: v.valor_numerico,
        }));
        const anomalia = servico.calcularAnomaliaIndicador(indicador, valoresOrdenados);
        if (anomalia) {
          await alertasRepo.upsertAlerta(tenant, municipio.id, { ...anomalia, tipo: 'indicador_fora_padrao' });
        }
      })
  );
}

// Recalcula para todos os municipios visiveis ao tenant (RLS ja limita:
// master = todos, gestor_carteira = so a propria carteira). Chamado antes
// de listar o sino, pra garantir que o que aparece esta atualizado.
async function recalcularTodos(tenant) {
  const municipios = await municipiosRepo.listar(tenant);
  await Promise.all(municipios.map((m) => recalcularAlertasMunicipio(tenant, m)));
}

module.exports = { recalcularAlertasMunicipio, recalcularTodos };
