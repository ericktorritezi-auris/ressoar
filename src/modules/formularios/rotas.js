// Rotas de formularios (secao 5.2 do mapeamento): disparo por
// master/gestor de carteira (aninhado em /municipios/:municipioId) e
// resposta pelo destinatario (rotas soltas /formularios, qualquer perfil
// autenticado — o RLS de "formularios" e "submissoes" garante que cada um
// só vê o que é do seu próprio município). A resposta entra na mesma fila
// de aprovacao das planilhas (submissoes/repositorio.js).

const express = require('express');
const { exigirMaster, exigirAutenticacao } = require('../../middlewares/tenant');
const municipiosRepo = require('../municipios/repositorio');
const usuariosRepo = require('../usuarios/repositorio');
const submissoesRepo = require('../submissoes/repositorio');
const repo = require('./repositorio');
const modelos = require('./modelos');

const router = express.Router();

router.get('/municipios/:municipioId/formularios', exigirMaster, async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  if (!municipio) return res.status(404).send('Município não encontrado.');
  const formularios = await repo.listarPorMunicipio(req.tenant, municipio.id);
  res.render('formularios/lista', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipio,
    formularios,
  });
});

router.get('/municipios/:municipioId/formularios/novo', exigirMaster, async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  if (!municipio) return res.status(404).send('Município não encontrado.');
  const destinatarios = await usuariosRepo.listar(req.tenant, municipio.id);
  res.render('formularios/novo', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipio,
    destinatarios: destinatarios.filter((u) => u.ativo),
    modelosDisponiveis: modelos.listar(),
    tiposCampoPersonalizado: modelos.TIPOS_CAMPO_PERSONALIZADO,
    erro: req.query.erro || null,
  });
});

function slugificar(texto) {
  return (texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

router.post('/municipios/:municipioId/formularios', exigirMaster, async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  if (!municipio) return res.status(404).send('Município não encontrado.');

  const { modelo, destinatario_id: destinatarioId, nome_personalizado: nomePersonalizado } = req.body;

  try {
    let nome;
    let descricao = null;
    let campos;

    if (modelo === 'personalizado') {
      const rotulos = [].concat(req.body.campo_rotulo || []);
      const tipos = [].concat(req.body.campo_tipo || []);
      const obrigatorios = [].concat(req.body.campo_obrigatorio || []);
      campos = rotulos
        .map((rotulo, i) => ({ rotulo: (rotulo || '').trim(), tipo: tipos[i] || 'texto', linha: i }))
        .filter((c) => c.rotulo)
        .map((c) => ({
          chave: slugificar(c.rotulo) || `campo_${c.linha + 1}`,
          rotulo: c.rotulo,
          tipo: c.tipo,
          obrigatorio: obrigatorios.includes(String(c.linha)),
        }));
      if (campos.length === 0) throw new Error('Adicione ao menos um campo ao formulário personalizado.');
      nome = (nomePersonalizado || '').trim() || 'Formulário personalizado';
    } else {
      const template = modelos.buscar(modelo);
      if (!template) throw new Error('Modelo de formulário inválido.');
      nome = template.nome;
      descricao = template.descricao;
      campos = template.campos;
    }

    if (!destinatarioId) throw new Error('Selecione um destinatário.');

    const id = await repo.criar(req.tenant, {
      municipioId: municipio.id,
      modelo,
      nome,
      descricao,
      campos,
      destinatarioId,
    });

    res.redirect(`/municipios/${municipio.id}/formularios/${id}`);
  } catch (erro) {
    console.error('[formularios] erro ao criar', erro);
    res.redirect(`/municipios/${municipio.id}/formularios/novo?erro=${encodeURIComponent(erro.message)}`);
  }
});

router.get('/municipios/:municipioId/formularios/:id', exigirMaster, async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  const formulario = await repo.buscarPorId(req.tenant, req.params.id);
  if (!municipio || !formulario || formulario.municipio_id !== municipio.id) {
    return res.status(404).send('Não encontrado.');
  }
  const respostas = await submissoesRepo.listarPorFormulario(req.tenant, formulario.id);
  res.render('formularios/detalhe', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipio,
    formulario,
    respostas,
    respostaPendente: respostas.find((r) => r.status === 'rascunho_pendente') || null,
  });
});

router.post('/municipios/:municipioId/formularios/:id/aprovar', exigirMaster, async (req, res) => {
  const respostas = await submissoesRepo.listarPorFormulario(req.tenant, req.params.id);
  const pendente = respostas.find((r) => r.status === 'rascunho_pendente');
  if (pendente) await submissoesRepo.aprovar(req.tenant, pendente.id);
  res.redirect(`/municipios/${req.params.municipioId}/formularios/${req.params.id}`);
});

router.post('/municipios/:municipioId/formularios/:id/rejeitar', exigirMaster, async (req, res) => {
  const respostas = await submissoesRepo.listarPorFormulario(req.tenant, req.params.id);
  const pendente = respostas.find((r) => r.status === 'rascunho_pendente');
  if (pendente) {
    await submissoesRepo.rejeitar(req.tenant, pendente.id, req.body.motivo);
    await repo.reabrirParaNovaResposta(req.tenant, req.params.id);
  }
  res.redirect(`/municipios/${req.params.municipioId}/formularios/${req.params.id}`);
});

// ---------------------------------------------------------------------
// Rotas do destinatario (qualquer perfil autenticado do proprio
// municipio) — nao aninhadas em /municipios, pois quem responde nao tem
// acesso ao modulo de municipios.
// ---------------------------------------------------------------------

router.get('/formularios', exigirAutenticacao, async (req, res) => {
  const formularios = await repo.listarParaDestinatario(req.tenant);
  res.render('formularios/meus', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    formularios,
  });
});

router.get('/formularios/:id/responder', exigirAutenticacao, async (req, res) => {
  const formulario = await repo.buscarPorId(req.tenant, req.params.id);
  if (!formulario || formulario.destinatario_id !== req.tenant.usuarioId) {
    return res.status(404).send('Formulário não encontrado.');
  }
  if (formulario.status !== 'pendente') {
    return res.status(400).send('Este formulário já foi respondido e está em análise ou já foi aprovado.');
  }
  res.render('formularios/responder', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    formulario,
    erro: null,
  });
});

router.post('/formularios/:id/responder', exigirAutenticacao, async (req, res) => {
  const formulario = await repo.buscarPorId(req.tenant, req.params.id);
  if (!formulario || formulario.destinatario_id !== req.tenant.usuarioId) {
    return res.status(404).send('Formulário não encontrado.');
  }
  if (formulario.status !== 'pendente') {
    return res.status(400).send('Este formulário já foi respondido.');
  }

  const camposFormulario = formulario.campos;
  const faltando = camposFormulario.find((c) => c.obrigatorio && !(req.body[c.chave] || '').trim());
  if (faltando) {
    return res.status(400).render('formularios/responder', {
      usuario: req.tenant.usuario,
      versao: req.app.locals.versao,
      formulario,
      erro: `O campo "${faltando.rotulo}" é obrigatório.`,
    });
  }

  const respostas = camposFormulario.map((c) => ({
    chave: c.chave,
    rotulo: c.rotulo,
    valor: (req.body[c.chave] || '').trim(),
  }));

  const versao = await submissoesRepo.proximaVersao(req.tenant, formulario.municipio_id, 'formulario', formulario.id);
  await submissoesRepo.criar(req.tenant, {
    municipioId: formulario.municipio_id,
    tipo: 'formulario',
    formularioId: formulario.id,
    origem: formulario.nome,
    versao,
    dados: respostas,
  });
  await repo.marcarRespondido(req.tenant, formulario.id);

  res.redirect('/formularios');
});

module.exports = router;
