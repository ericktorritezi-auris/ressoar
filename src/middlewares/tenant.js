// Le o usuario da sessao e expõe req.tenant com o contexto que
// src/config/db.js#withTenantContext usa para setar as variaveis de RLS.
// Isso centraliza a regra de isolamento num unico lugar: nenhuma rota
// decide "na mao" quais municipios pode ver.

const PERFIS_MASTER = new Set(['master', 'gestor_carteira']);

function tenantMiddleware(req, res, next) {
  const usuario = req.session && req.session.usuario;

  if (!usuario) {
    req.tenant = { municipioId: null, isMaster: false, autenticado: false };
    return next();
  }

  req.tenant = {
    municipioId: usuario.municipioId || null,
    isMaster: PERFIS_MASTER.has(usuario.perfil),
    autenticado: true,
    usuario,
  };
  next();
}

function exigirAutenticacao(req, res, next) {
  if (!req.tenant || !req.tenant.autenticado) {
    return res.redirect('/login');
  }
  next();
}

module.exports = { tenantMiddleware, exigirAutenticacao };
