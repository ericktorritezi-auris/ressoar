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

const HORAS_VALIDADE_CONVITE = 72;

router.use(exigirMaster);

router.get('/usuarios', async (req, res) => {
  const usuarios = await repo.listar(req.tenant, req.query.municipio_id || null);
  res.render('usuarios/lista', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    usuarios,
  });
});

router.get('/usuarios/novo', async (req, res) => {
  const municipios = await municipiosRepo.listar(req.tenant);
  res.render('usuarios/form', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    perfis: PERFIS,
    municipios,
    registro: null,
    erro: null,
  });
});

router.post('/usuarios', async (req, res) => {
  const { nome, email, perfil, cpf, matricula, cargo, municipio_id: municipioId } = req.body;

  try {
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
      perfis: PERFIS,
      municipios,
      registro: req.body,
      erro: erro.message || 'Não foi possível salvar o usuário.',
    });
  }
});

router.get('/usuarios/:id/editar', async (req, res) => {
  const registro = await repo.buscarPorId(req.tenant, req.params.id);
  if (!registro) return res.status(404).send('Usuário não encontrado.');
  const municipios = await municipiosRepo.listar(req.tenant);
  res.render('usuarios/form', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    perfis: PERFIS,
    municipios,
    registro,
    erro: null,
  });
});

router.post('/usuarios/:id', async (req, res) => {
  const { nome, perfil, cpf, matricula, cargo, municipio_id: municipioId, ativo } = req.body;
  await repo.atualizar(req.tenant, req.params.id, {
    nome,
    perfil,
    cpf,
    matricula,
    cargo,
    municipioId: municipioId || null,
    ativo: ativo === 'on',
  });
  res.redirect('/usuarios');
});

module.exports = router;
