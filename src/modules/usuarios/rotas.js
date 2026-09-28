// Rotas do modulo de Usuarios/Servidores (secao 3.2). Cadastro dispara o
// e-mail de "Primeiro acesso" (secao 13 — convite com definição de senha
// inicial), reaproveitando o fluxo de token de redefinição de senha do
// modulo de auth.

const crypto = require('crypto');
const express = require('express');
const { exigirMaster } = require('../../middlewares/tenant');
const env = require('../../config/env');
const repo = require('./repositorio');
const municipiosRepo = require('../municipios/repositorio');
const { gerarHashToken, gerarTokenAleatorio, gerarHashSenha } = require('../auth/senhas');
const authRepo = require('../auth/repositorio');
const { enviarEmail } = require('../../emails/resend');

const router = express.Router();

const PERFIS = [
  { valor: 'master', rotulo: 'Master' },
  { valor: 'gestor_carteira', rotulo: 'Administrador de carteira' },
  { valor: 'prefeito_secretario', rotulo: 'Prefeito / Secretário' },
  { valor: 'servidor', rotulo: 'Servidor municipal (leitura)' },
  { valor: 'responsavel_dados', rotulo: 'Responsável pelos dados' },
];

// Gestor de carteira so cadastra os perfis operacionais do proprio
// municipio (secao 2 do mapeamento) — master e outros gestores de carteira
// sao cadastro exclusivo do master. Aplicado tanto na tela (perfis
// oferecidos) quanto no servidor (defesa contra POST forjado).
const PERFIS_RESTRITOS_A_MASTER = new Set(['master', 'gestor_carteira']);

function perfisPermitidosPara(usuarioLogado) {
  if (usuarioLogado.perfil === 'master') return PERFIS;
  return PERFIS.filter((p) => !PERFIS_RESTRITOS_A_MASTER.has(p.valor));
}

const HORAS_VALIDADE_CONVITE = 72;

// exigirMaster aplicado rota a rota (nunca com router.use no topo): um
// router.use() sem caminho roda para QUALQUER requisicao que entre por
// este router, mesmo uma que nao bate com nenhuma rota aqui dentro — como
// este modulo e montado em app.use('/', ...), isso bloqueava /painel e
// /ajuda para perfis nao-master antes de a requisicao sequer chegar la.
router.get('/usuarios', exigirMaster, async (req, res) => {
  const usuarios = await repo.listar(req.tenant, req.query.municipio_id || null);
  res.render('usuarios/lista', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    usuarios,
  });
});

router.get('/usuarios/novo', exigirMaster, async (req, res) => {
  const municipios = await municipiosRepo.listar(req.tenant);
  res.render('usuarios/form', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    perfis: perfisPermitidosPara(req.tenant.usuario),
    municipios,
    registro: null,
    erro: null,
  });
});

router.post('/usuarios', exigirMaster, async (req, res) => {
  const { nome, email, perfil, cpf, matricula, cargo, municipio_id: municipioId } = req.body;

  try {
    const permitidos = perfisPermitidosPara(req.tenant.usuario);
    if (!permitidos.some((p) => p.valor === perfil)) {
      throw new Error('Você não tem permissão para cadastrar esse perfil de usuário.');
    }

    const existente = await repo.buscarPorEmail(req.tenant, email);
    if (existente) {
      throw new Error('Já existe um usuário com este e-mail.');
    }

    // Senha inicial aleatoria: o usuario nunca chega a ve-la, sempre define
    // a propria pelo link do convite (mesmo padrao do "esqueci minha senha").
    const senhaTemporaria = crypto.randomBytes(24).toString('hex');
    const senhaHash = await gerarHashSenha(senhaTemporaria);

    const novoId = await repo.criar(req.tenant, {
      nome,
      email,
      perfil,
      cpf,
      matricula,
      cargo,
      municipioId: municipioId || null,
      senhaHash,
    });

    const token = gerarTokenAleatorio();
    const expiraEm = new Date(Date.now() + HORAS_VALIDADE_CONVITE * 60 * 60 * 1000);
    await authRepo.salvarTokenResetSenha(novoId, gerarHashToken(token), expiraEm);

    await enviarEmail({
      para: email.trim().toLowerCase(),
      tipo: 'boas_vindas',
      dados: {
        nome,
        emailLogin: email.trim().toLowerCase(),
        linkDefinirSenha: `${env.APP_URL}/redefinir-senha/${token}`,
      },
    });

    res.redirect('/usuarios');
  } catch (erro) {
    console.error('[usuarios] erro ao criar', erro);
    const municipios = await municipiosRepo.listar(req.tenant);
    res.status(400).render('usuarios/form', {
      usuario: req.tenant.usuario,
      versao: req.app.locals.versao,
      perfis: perfisPermitidosPara(req.tenant.usuario),
      municipios,
      registro: req.body,
      erro: erro.message || 'Não foi possível salvar o usuário.',
    });
  }
});

router.get('/usuarios/:id/editar', exigirMaster, async (req, res) => {
  const registro = await repo.buscarPorId(req.tenant, req.params.id);
  if (!registro) return res.status(404).send('Usuário não encontrado.');
  const municipios = await municipiosRepo.listar(req.tenant);
  res.render('usuarios/form', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    perfis: perfisPermitidosPara(req.tenant.usuario),
    municipios,
    registro,
    erro: null,
  });
});

router.post('/usuarios/:id', exigirMaster, async (req, res) => {
  const { nome, perfil, cpf, matricula, cargo, municipio_id: municipioId, ativo } = req.body;

  const permitidos = perfisPermitidosPara(req.tenant.usuario);
  if (!permitidos.some((p) => p.valor === perfil)) {
    return res.status(400).send('Você não tem permissão para atribuir esse perfil de usuário.');
  }

  await repo.atualizar(req.tenant, req.params.id, {
    nome,
    perfil,
    cpf,
    matricula,
    cargo,
    municipioId: municipioId || null,
    ativo: ativo === 'on',
  });

  // "Municípios sob esta carteira" (edita a mesma coluna que o campo
  // "Gestor de carteira responsável" no cadastro do município — só que a
  // partir do lado do usuário). Restrito ao master de verdade: um
  // gestor_carteira editando outro gestor_carteira só enxergaria, pelo
  // RLS, os municípios da própria carteira — a lista ficaria incompleta e
  // incorreta pra essa operação.
  if (perfil === 'gestor_carteira' && req.tenant.isMaster) {
    const municipiosMarcados = req.body.municipios_carteira;
    const idsMarcados = Array.isArray(municipiosMarcados)
      ? municipiosMarcados
      : (municipiosMarcados ? [municipiosMarcados] : []);
    await municipiosRepo.definirCarteiraDoGestor(req.tenant, req.params.id, idsMarcados);
  }

  res.redirect('/usuarios');
});

module.exports = router;
