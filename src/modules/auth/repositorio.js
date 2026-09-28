// Acesso a dados de autenticacao. Roda sempre dentro de withTenantContext
// para respeitar a Row-Level Security mesmo aqui (secao 7 do mapeamento).

const { withTenantContext } = require('../../config/db');

async function buscarUsuarioPorId(id) {
  return withTenantContext({ isMaster: true }, async (client) => {
    const { rows } = await client.query(
      `SELECT id, municipio_id, perfil, nome, email, senha_hash, ativo, requer_2fa
       FROM usuarios WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  });
}

async function buscarUsuarioPorEmail(email) {
  // Busca de login roda como master: precisa poder achar o usuario de
  // QUALQUER municipio antes de saber quem ele e (ainda nao ha sessao).
  return withTenantContext({ isMaster: true }, async (client) => {
    const { rows } = await client.query(
      `SELECT id, municipio_id, perfil, nome, email, senha_hash, ativo, requer_2fa
       FROM usuarios WHERE email = $1`,
      [email]
    );
    return rows[0] || null;
  });
}

async function salvarCodigo2FA(usuarioId, codigoHash, expiraEm) {
  return withTenantContext({ isMaster: true }, (client) =>
    client.query(
      `INSERT INTO two_factor_codes (usuario_id, codigo_hash, expira_em)
       VALUES ($1, $2, $3)`,
      [usuarioId, codigoHash, expiraEm]
    )
  );
}

async function buscarCodigo2FAValido(usuarioId, codigoHash) {
  return withTenantContext({ isMaster: true }, async (client) => {
    const { rows } = await client.query(
      `SELECT id FROM two_factor_codes
       WHERE usuario_id = $1 AND codigo_hash = $2
         AND usado_em IS NULL AND expira_em > now()
       ORDER BY criado_em DESC LIMIT 1`,
      [usuarioId, codigoHash]
    );
    return rows[0] || null;
  });
}

async function marcarCodigo2FAUsado(id) {
  return withTenantContext({ isMaster: true }, (client) =>
    client.query('UPDATE two_factor_codes SET usado_em = now() WHERE id = $1', [id])
  );
}

async function salvarDispositivoConfiavel(usuarioId, tokenHash, expiraEm) {
  return withTenantContext({ isMaster: true }, (client) =>
    client.query(
      `INSERT INTO trusted_devices (usuario_id, device_token_hash, expira_em)
       VALUES ($1, $2, $3)`,
      [usuarioId, tokenHash, expiraEm]
    )
  );
}

async function dispositivoEhConfiavel(usuarioId, tokenHash) {
  return withTenantContext({ isMaster: true }, async (client) => {
    const { rows } = await client.query(
      `SELECT id FROM trusted_devices
       WHERE usuario_id = $1 AND device_token_hash = $2 AND expira_em > now()`,
      [usuarioId, tokenHash]
    );
    return rows.length > 0;
  });
}

async function salvarTokenResetSenha(usuarioId, tokenHash, expiraEm) {
  return withTenantContext({ isMaster: true }, (client) =>
    client.query(
      `INSERT INTO password_reset_tokens (usuario_id, token_hash, expira_em)
       VALUES ($1, $2, $3)`,
      [usuarioId, tokenHash, expiraEm]
    )
  );
}

async function buscarTokenResetValido(tokenHash) {
  return withTenantContext({ isMaster: true }, async (client) => {
    const { rows } = await client.query(
      `SELECT id, usuario_id FROM password_reset_tokens
       WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now()`,
      [tokenHash]
    );
    return rows[0] || null;
  });
}

async function marcarTokenResetUsado(id) {
  return withTenantContext({ isMaster: true }, (client) =>
    client.query('UPDATE password_reset_tokens SET usado_em = now() WHERE id = $1', [id])
  );
}

async function atualizarSenha(usuarioId, senhaHash) {
  return withTenantContext({ isMaster: true }, (client) =>
    client.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [senhaHash, usuarioId])
  );
}

module.exports = {
  buscarUsuarioPorId,
  buscarUsuarioPorEmail,
  salvarCodigo2FA,
  buscarCodigo2FAValido,
  marcarCodigo2FAUsado,
  salvarDispositivoConfiavel,
  dispositivoEhConfiavel,
  salvarTokenResetSenha,
  buscarTokenResetValido,
  marcarTokenResetUsado,
  atualizarSenha,
};
