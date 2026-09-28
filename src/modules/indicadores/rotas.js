// Rotas do catalogo de indicadores, aninhadas em /municipios/:municipioId
// (secao 3.3 do mapeamento).

const express = require('express');
const { exigirMaster } = require('../../middlewares/tenant');
const repo = require('./repositorio');
const municipiosRepo = require('../municipios/repositorio');

const router = express.Router();

router.use(exigirMaster);

router.get('/municipios/:municipioId/indicadores/novo', async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  if (!municipio) return res.status(404).send('Município não encontrado.');
  const eixos = await repo.listarEixos();
  res.render('indicadores/form', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipio,
    eixos,
    indicador: null,
    erro: null,
  });
});

router.post('/municipios/:municipioId/indicadores', async (req, res) => {
  const { eixo_id: eixoId, nome, linha_base: linhaBase, meta, unidade, periodicidade, fonte_dado: fonteDado } = req.body;
  try {
    await repo.criar(req.tenant, req.params.municipioId, {
      eixoId,
      nome,
      linhaBase,
      meta,
      unidade,
      periodicidade,
      fonteDado,
    });
    res.redirect(`/municipios/${req.params.municipioId}`);
  } catch (erro) {
    console.error('[indicadores] erro ao criar', erro);
    const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
    const eixos = await repo.listarEixos();
    res.status(400).render('indicadores/form', {
      usuario: req.tenant.usuario,
      versao: req.app.locals.versao,
      municipio,
      eixos,
      indicador: req.body,
      erro: 'Não foi possível salvar o indicador. Confira os dados e tente novamente.',
    });
  }
});

router.get('/municipios/:municipioId/indicadores/:id/editar', async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  const indicador = await repo.buscarPorId(req.tenant, req.params.id);
  if (!municipio || !indicador) return res.status(404).send('Não encontrado.');
  const eixos = await repo.listarEixos();
  res.render('indicadores/form', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipio,
    eixos,
    indicador,
    erro: null,
  });
});

router.post('/municipios/:municipioId/indicadores/:id', async (req, res) => {
  const { eixo_id: eixoId, nome, linha_base: linhaBase, meta, unidade, periodicidade, fonte_dado: fonteDado, ativo } = req.body;
  await repo.atualizar(req.tenant, req.params.id, {
    eixoId,
    nome,
    linhaBase,
    meta,
    unidade,
    periodicidade,
    fonteDado,
    ativo: ativo === 'on',
  });
  res.redirect(`/municipios/${req.params.municipioId}`);
});

module.exports = router;
