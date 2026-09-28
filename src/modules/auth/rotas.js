// Rotas de autenticacao: login, 2FA por e-mail (so em dispositivo novo),
// esqueci minha senha e logout. Segue a secao 13 do mapeamento: o codigo de
// 2FA so e reenviado se o dispositivo atual nao estiver marcado como
// confiavel (evita estourar a cota gratuita do Resend).

const express = require('express');
const crypto = require('crypto');
const env = require('../../config/env');
const {
  gerarHashSenha,
  verificarSenha,
  gerarCodigo2FA,
  gerarHashToken,
  gerarTokenAleatorio,
} = require('./senhas');
const repo = require('./repositorio');
const { enviarEmail } = require('../../emails/resend');

const router = express.Router();

const NOME_COOKIE_DISPOSITIVO = 'rsr_device';
const MINUTOS_VALIDADE_2FA = 10;
const HORAS_VALIDADE_RESET = 1;

router.get('/login', (req, res) => {
  res.render('auth/login', { erro: null });
});

router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  const usuario = await repo.buscarUsuarioPorEmail((email || '').trim().toLowerCase());

  if (!usuario || !usuario.ativo || !(await verificarSenha(senha || '', usuario.senha_hash))) {
    return res.status(401).render('auth/login', { erro: 'E-mail ou senha invalidos.' });
  }

  if (!usuario.requer_2fa) {
    return concluirLogin(req, res, usuario);
  }

  // Perfil exige 2FA (prefeito/secretario) — checa dispositivo confiavel
  // antes de gastar um e-mail.
  const tokenDispositivo = req.cookies && req.cookies[NOME_COOKIE_DISPOSITIVO];
  if (tokenDispositivo) {
    const hashDispositivo = gerarHashToken(tokenDispositivo);
    const confiavel = await repo.dispositivoEhConfiavel(usuario.id, hashDispositivo);
    if (confiavel) {
      return concluirLogin(req, res, usuario);
    }
  }

  const codigo = gerarCodigo2FA();
  const expiraEm = new Date(Date.now() + MINUTOS_VALIDADE_2FA * 60 * 1000);
  await repo.salvarCodigo2FA(usuario.id, gerarHashToken(codigo), expiraEm);

  await enviarEmail({
    para: usuario.email,
    tipo: 'codigo_2fa',
    dados: { nome: usuario.nome, codigo, minutosValidade: MINUTOS_VALIDADE_2FA },
  });

  req.session.pendente2FA = { usuarioId: usuario.id };
  res.render('auth/verificar-2fa', { erro: null });
});

router.post('/login/2fa', async (req, res) => {
  const pendente = req.session.pendente2FA;
  if (!pendente) return res.redirect('/login');

  const { codigo, lembrarDispositivo } = req.body;
  const registro = await repo.buscarCodigo2FAValido(pendente.usuarioId, gerarHashToken(codigo || ''));

  if (!registro) {
    return res.status(401).render('auth/verificar-2fa', { erro: 'Codigo invalido ou expirado.' });
  }

  await repo.marcarCodigo2FAUsado(registro.id);
  const usuario = await repo.buscarUsuarioPorId(pendente.usuarioId);
  delete req.session.pendente2FA;

  if (lembrarDispositivo) {
    const tokenDispositivo = gerarTokenAleatorio();
    const diasValidade = env.TRUSTED_DEVICE_DIAS;
    const expiraEm = new Date(Date.now() + diasValidade * 24 * 60 * 60 * 1000);
    await repo.salvarDispositivoConfiavel(pendente.usuarioId, gerarHashToken(tokenDispositivo), expiraEm);
    res.cookie(NOME_COOKIE_DISPOSITIVO, tokenDispositivo, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: diasValidade * 24 * 60 * 60 * 1000,
    });
  }

  return concluirLogin(req, res, usuario);
});

router.get('/esqueci-senha', (req, res) => {
  res.render('auth/esqueci-senha', { enviado: false });
});

router.post('/esqueci-senha', async (req, res) => {
  const usuario = await repo.buscarUsuarioPorEmail((req.body.email || '').trim().toLowerCase());

  // Sempre responde a mesma coisa, exista ou nao o e-mail — evita revelar
  // quais e-mails estao cadastrados no sistema.
  if (usuario) {
    const token = gerarTokenAleatorio();
    const expiraEm = new Date(Date.now() + HORAS_VALIDADE_RESET * 60 * 60 * 1000);
    await repo.salvarTokenResetSenha(usuario.id, gerarHashToken(token), expiraEm);
    await enviarEmail({
      para: usuario.email,
      tipo: 'esqueci_senha',
      dados: { nome: usuario.nome, token, horasValidade: HORAS_VALIDADE_RESET },
    });
  }

  res.render('auth/esqueci-senha', { enviado: true });
});

router.get('/redefinir-senha/:token', (req, res) => {
  res.render('auth/redefinir-senha', { token: req.params.token, erro: null });
});

router.post('/redefinir-senha/:token', async (req, res) => {
  const registro = await repo.buscarTokenResetValido(gerarHashToken(req.params.token));
  if (!registro) {
    return res.status(400).render('auth/redefinir-senha', {
      token: req.params.token,
      erro: 'Link invalido ou expirado. Solicite um novo.',
    });
  }

  const novaSenha = req.body.senha || '';
  if (novaSenha.length < 8) {
    return res.status(400).render('auth/redefinir-senha', {
      token: req.params.token,
      erro: 'A senha precisa ter pelo menos 8 caracteres.',
    });
  }

  await repo.atualizarSenha(registro.usuario_id, await gerarHashSenha(novaSenha));
  await repo.marcarTokenResetUsado(registro.id);
  res.redirect('/login');
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

function concluirLogin(req, res, usuario) {
  req.session.usuario = {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    municipioId: usuario.municipio_id,
  };
  res.redirect('/painel');
}

module.exports = router;
