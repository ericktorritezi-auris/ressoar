// Templates HTML minimos para os 3 gatilhos de e-mail da Fase 1
// (secao 13 do mapeamento). Sem framework de template: sao poucos e
// simples, string literal basta. Layout visual mais elaborado fica para
// quando o restante da identidade (Fase 4) entrar aqui tambem.

function moldura(tituloInterno, corpoHtml) {
  return `
  <div style="font-family:'Public Sans',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1B1F3B">
    <div style="font-family:'Bricolage Grotesque',Georgia,serif;font-weight:800;font-size:20px;margin-bottom:24px">Ressoar</div>
    <h1 style="font-size:18px;margin:0 0 16px">${tituloInterno}</h1>
    ${corpoHtml}
    <p style="margin-top:32px;font-size:12px;color:#5A5F7D">
      Este e um e-mail automatico, sem monitoramento de resposta. Precisa falar com a gente? Use o telefone/WhatsApp informado pelo seu administrador.
    </p>
  </div>`;
}

module.exports = {
  boas_vindas: ({ nome, emailLogin, linkDefinirSenha }) => ({
    assunto: 'Seu acesso ao Ressoar foi criado',
    html: moldura(
      `Ola, ${nome}`,
      `<p>Seu acesso ao Ressoar foi criado com o e-mail <strong>${emailLogin}</strong>.</p>
       <p><a href="${linkDefinirSenha}" style="color:#5B4BDB">Defina sua senha para o primeiro acesso</a></p>`
    ),
  }),

  esqueci_senha: ({ nome, token, horasValidade }) => ({
    assunto: 'Redefinicao de senha — Ressoar',
    html: moldura(
      `Ola, ${nome}`,
      `<p>Recebemos um pedido de redefinicao de senha.</p>
       <p><a href="https://ressoar.belleplanner.com.br/redefinir-senha/${token}" style="color:#5B4BDB">Clique aqui para criar uma nova senha</a></p>
       <p>Este link expira em ${horasValidade} hora(s). Se voce nao pediu isso, pode ignorar este e-mail.</p>`
    ),
  }),

  codigo_2fa: ({ nome, codigo, minutosValidade }) => ({
    assunto: `${codigo} — seu codigo de verificacao Ressoar`,
    html: moldura(
      `Ola, ${nome}`,
      `<p>Use o codigo abaixo para concluir seu login:</p>
       <p style="font-size:28px;font-weight:700;letter-spacing:4px">${codigo}</p>
       <p>Valido por ${minutosValidade} minutos. Se voce nao tentou entrar no Ressoar, ignore este e-mail.</p>`
    ),
  }),
};
