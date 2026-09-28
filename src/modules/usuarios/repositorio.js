// Acesso a dados de usuarios/servidores (secao 3.2 do mapeamento).

const { withTenantContext } = require('../../config/db');

function contextoDe(tenant) {
  return { municipioId: tenant.municipioId, isMaster: tenant.isMaster, usuarioId: tenant.usuarioId };
}

const PERFIS_QUE_EXIGEM_MUNICIPIO = new Set([
  'prefeito_secretario',
  'servidor',
  'responsavel_dados',
]);

const PERFIS_QUE_EXIGEM_2FA = new Set(['prefeito_secretario']);

async function listar(tenant, municipioId) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const condicao = municipioId ? 'WHERE municipio_id = $1' : '';
    const parametros = municipioId ? [municipioId] : [];
    const { rows } = await client.query(
      `SELECT u.id, u.nome, u.email, u.perfil, u.cpf, u.matricula, u.cargo, u.ativo,
              u.municipio_id, m.nome AS municipio_nome
         FROM usuarios u
         LEFT JOIN municipios m ON m.id = u.municipio_id
         ${condicao}
        ORDER BY u.nome`,
      parametros
    );
    return rows;
  });
}

async function buscarPorId(tenant, id) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `SELECT id, nome, email, perfil, cpf, matricula, cargo, ativo, municipio_id
         FROM usuarios WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  });
}

async function criar(tenant, dados) {
  const municipioId = PERFIS_QUE_EXIGEM_MUNICIPIO.has(dados.perfil) ? dados.municipioId : null;
  const requer2fa = PERFIS_QUE_EXIGEM_2FA.has(dados.perfil);

  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query(
      `INSERT INTO usuarios (municipio_id, perfil, nome, email, senha_hash, cpf, matricula, cargo, requer_2fa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        municipioId,
        dados.perfil,
        dados.nome,
        dados.email.trim().toLowerCase(),
        dados.senhaHash,
        dados.cpf || null,
        dados.matricula || null,
        dados.cargo || null,
        requer2fa,
      ]
    );
    return rows[0].id;
  });
}

async function atualizar(tenant, id, dados) {
  const municipioId = PERFIS_QUE_EXIGEM_MUNICIPIO.has(dados.perfil) ? dados.municipioId : null;
  const requer2fa = PERFIS_QUE_EXIGEM_2FA.has(dados.perfil);

  return withTenantContext(contextoDe(tenant), (client) =>
    client.query(
      `UPDATE usuarios
          SET nome = $1, perfil = $2, municipio_id = $3, cpf = $4, matricula = $5,
              cargo = $6, requer_2fa = $7, ativo = $8
        WHERE id = $9`,
      [
        dados.nome,
        dados.perfil,
        municipioId,
        dados.cpf || null,
        dados.matricula || null,
        dados.cargo || null,
        requer2fa,
        dados.ativo !== false,
        id,
      ]
    )
  );
}

async function buscarPorEmail(tenant, email) {
  return withTenantContext(contextoDe(tenant), async (client) => {
    const { rows } = await client.query('SELECT id FROM usuarios WHERE email = $1', [
      email.trim().toLowerCase(),
    ]);
    return rows[0] || null;
  });
}

module.exports = { listar, buscarPorId, criar, atualizar, buscarPorEmail };
