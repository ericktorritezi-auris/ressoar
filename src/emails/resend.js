// Envio de e-mail transacional via Resend. So os gatilhos mapeados na
// secao 13 chamam isto — nada recorrente/rotina (isso fica no sino, nao
// aqui). Conta compartilhada entre varios sistemas Belle Planner: por isso
// cada envio e logado, para dar pra somar consumo depois.

const env = require('../config/env');
const templates = require('./templates');

let clienteResend = null;
function obterCliente() {
  if (!env.RESEND_API_KEY) return null;
  if (!clienteResend) {
    const { Resend } = require('resend');
    clienteResend = new Resend(env.RESEND_API_KEY);
  }
  return clienteResend;
}

/**
 * @param {object} opcoes
 * @param {string} opcoes.para
 * @param {'boas_vindas'|'esqueci_senha'|'codigo_2fa'} opcoes.tipo
 * @param {object} opcoes.dados
 */
async function enviarEmail({ para, tipo, dados }) {
  const template = templates[tipo];
  if (!template) {
    throw new Error(`Template de e-mail desconhecido: ${tipo}`);
  }

  const { assunto, html } = template(dados);
  const cliente = obterCliente();

  if (!cliente) {
    // Sem RESEND_API_KEY configurada (dev local/staging sem chave): loga em
    // vez de falhar, para nao travar o fluxo de quem esta testando.
    console.log(`[email:${tipo}] (RESEND_API_KEY ausente — nao enviado) para=${para} assunto="${assunto}"`);
    return { simulado: true };
  }

  const resultado = await cliente.emails.send({
    from: env.EMAIL_REMETENTE,
    to: para,
    subject: assunto,
    html,
  });

  console.log(`[email:${tipo}] enviado para=${para}`);
  return resultado;
}

module.exports = { enviarEmail };
