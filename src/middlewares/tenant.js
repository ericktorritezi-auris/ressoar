// Le o usuario da sessao e expõe req.tenant com o contexto que
// src/config/db.js#withTenantContext usa para setar as variaveis de RLS.
// Isso centraliza a regra de isolamento num unico lugar: nenhuma rota
// decide "na mao" quais municipios pode ver.
//
// Bug #7 (isolamento de gestor_carteira): master e gestor_carteira passam
// pelo MESMO portao de autorizacao (exigirMaster — o nome ficou do jeito
// que ja era usado em todo o app, mas a checagem e "master ou gestor de
// carteira"), porem sao coisas MUITO diferentes para o RLS do Postgres:
// master ve todos os municipios; gestor_carteira so pode ver os
// municipios em que ele mesmo e o gestor_carteira_id (secao 2 do
// mapeamento). Antes, isMaster era true para os dois perfis e a policy de
// RLS liberava visibilidade total pra ambos — corrigido aqui separando
// isMaster (verdadeiro master, visibilidade total) de isGestorCarteira +
// usuarioId (usados por config/db.js para escopar via nova policy de RLS,
// ver migration 0004).

const PERFIS_MASTER = new Set(['master', 'gestor_carteira']);

function tenantMiddleware(req, res, next) {
  const usuario = req.session && req.session.usuario;

  if (!usuario) {
    req.tenant = {
      municipioId: null,
      isMaster: false,
      isGestorCarteira: false,
      usuarioId: null,
      autenticado: false,
    };
    return next();
  }

  req.tenant = {
    municipioId: usuario.municipioId || null,
    isMaster: usuario.perfil === 'master',
    isGestorCarteira: usuario.perfil === 'gestor_carteira',
    usuarioId: usuario.id || null,
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

// Master e gestor_carteira sao os unicos perfis que cadastram/editam
// municipios, usuarios e importam dados publicos (secao 2 do mapeamento).
// A visibilidade de CADA UM sobre os dados, uma vez autorizados a entrar
// na rota, e decidida pelo RLS via withTenantContext — nao aqui.
function exigirMaster(req, res, next) {
  if (!req.tenant || !req.tenant.autenticado) {
    return res.redirect('/login');
  }
  if (!PERFIS_MASTER.has(req.tenant.usuario.perfil)) {
    return res.status(403).send('Acesso restrito ao master e ao gestor de carteira.');
  }
  next();
}

// Fase 3 (secao 5 do mapeamento): quem envia planilha/responde formulario
// nao precisa ser master/gestor_carteira — e o proprio "Responsavel pelos
// dados" (ou outro perfil municipal habilitado) do municipio. A aprovacao
// continua exclusiva de master/gestor_carteira (exigirMaster, nas rotas de
// aprovar/rejeitar). Aqui so garante autenticacao; o isolamento de QUAL
// municipio cada perfil enxerga e decidido pelo RLS via req.tenant.
const PERFIS_ENVIO_DADOS = new Set([
  'master', 'gestor_carteira', 'responsavel_dados', 'prefeito_secretario',
]);

function exigirPerfilDeEnvioDeDados(req, res, next) {
  if (!req.tenant || !req.tenant.autenticado) {
    return res.redirect('/login');
  }
  if (!PERFIS_ENVIO_DADOS.has(req.tenant.usuario.perfil)) {
    return res.status(403).send('Seu perfil não tem permissão para enviar dados.');
  }
  next();
}

module.exports = {
  tenantMiddleware,
  exigirAutenticacao,
  exigirMaster,
  exigirPerfilDeEnvioDeDados,
  PERFIS_MASTER,
};
