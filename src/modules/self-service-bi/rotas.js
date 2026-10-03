// Self-service BI: usuario monta a propria visao escolhendo fonte,
// dimensao e metrica (Fase 4, secao 4 do mapeamento). O guardrail
// (catalogo.validarCruzamento) roda SEMPRE antes de qualquer consulta —
// se o cruzamento nao existe, a resposta e um aviso claro, nunca um
// grafico vazio/zerado/enganoso.

const express = require('express');
const municipiosRepo = require('../municipios/repositorio');
const catalogo = require('./catalogo');
const servico = require('./servico');

const router = express.Router();

const PERFIS_MASTER = new Set(['master', 'gestor_carteira']);

router.get('/bi', async (req, res) => {
  const municipios = PERFIS_MASTER.has(req.tenant.usuario.perfil)
    ? await municipiosRepo.listar(req.tenant)
    : [await municipiosRepo.buscarPorId(req.tenant, req.tenant.municipioId)];

  res.render('self-service-bi/index', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipios,
    fontes: catalogo.listarFontes(),
    dimensoes: catalogo.listarDimensoes(),
    selecao: null,
    aviso: null,
    resultado: null,
  });
});

router.post('/bi/consultar', async (req, res) => {
  const { municipio_id: municipioId, fonte, metrica, dimensao } = req.body;

  const municipios = PERFIS_MASTER.has(req.tenant.usuario.perfil)
    ? await municipiosRepo.listar(req.tenant)
    : [await municipiosRepo.buscarPorId(req.tenant, req.tenant.municipioId)];

  const paginaBase = {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipios,
    fontes: catalogo.listarFontes(),
    dimensoes: catalogo.listarDimensoes(),
    selecao: { municipioId, fonte, metrica, dimensao },
  };

  // GUARDRAIL — ver catalogo.js. Roda antes de qualquer consulta ao banco.
  const { valido, motivo } = catalogo.validarCruzamento({ fonte, metrica, dimensao });
  if (!valido) {
    return res.render('self-service-bi/index', { ...paginaBase, aviso: motivo, resultado: null });
  }

  const municipio = await municipiosRepo.buscarPorId(req.tenant, municipioId);
  if (!municipio) {
    return res.render('self-service-bi/index', {
      ...paginaBase,
      aviso: 'Município não encontrado ou fora do seu acesso.',
      resultado: null,
    });
  }

  const resultado = await servico.executarConsulta(req.tenant, { fonte, dimensao, municipio });
  res.render('self-service-bi/index', {
    ...paginaBase,
    aviso: resultado.length === 0 ? 'Esse cruzamento é válido, mas não há dados lançados ainda para mostrar.' : null,
    resultado,
  });
});

module.exports = router;
