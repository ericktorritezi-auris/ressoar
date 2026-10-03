// Dashboards fixos por eixo + customizacao (Fase 4 — secao 3 do
// mapeamento). Serve tanto o /painel do prefeito/secretario/servidor
// (seu proprio municipio) quanto a visao de portfolio do master/gestor de
// carteira (lista de municipios, cada um com link pro proprio dashboard).

const express = require('express');
const municipiosRepo = require('../municipios/repositorio');
const indicadoresRepo = require('../indicadores/repositorio');
const usuariosRepo = require('../usuarios/repositorio');
const servico = require('./servico');

const router = express.Router();

const PERFIS_MASTER = new Set(['master', 'gestor_carteira']);

async function montarDashboard(tenant, municipioId, eixosAtivos) {
  const historico = await indicadoresRepo.listarHistoricoComEixoPorMunicipio(tenant, municipioId);
  const relatorios = servico.montarRelatoriosPorEixo(historico);
  return servico.filtrarPorPreferencia(relatorios, eixosAtivos);
}

router.get('/painel', async (req, res) => {
  const { usuario } = req.tenant;

  if (PERFIS_MASTER.has(usuario.perfil)) {
    const municipios = await municipiosRepo.listar(req.tenant);
    return res.render('dashboards/portfolio', {
      usuario,
      versao: req.app.locals.versao,
      municipios,
    });
  }

  const [municipio, eixosAtivos] = await Promise.all([
    municipiosRepo.buscarPorId(req.tenant, req.tenant.municipioId),
    usuariosRepo.buscarEixosAtivosDashboard(req.tenant, usuario.id),
  ]);
  const relatorios = await montarDashboard(req.tenant, req.tenant.municipioId, eixosAtivos);
  res.render('dashboards/painel-municipio', {
    usuario,
    versao: req.app.locals.versao,
    municipio,
    relatorios,
    eixosAtivos: eixosAtivos || servico.EIXOS_ORDEM,
    todosOsEixos: servico.EIXOS_ORDEM,
    somenteLeitura: false,
  });
});

// Customizacao (secao 3 do mapeamento): prefeito/secretario escolhem
// quais dos 5 relatorios ficam visiveis — nao e um construtor livre, so
// liga/desliga itens da lista fixa.
router.post('/painel/preferencias', async (req, res) => {
  const eixosSelecionados = [].concat(req.body.eixos || []);
  await usuariosRepo.atualizarEixosAtivosDashboard(req.tenant, req.tenant.usuario.id, eixosSelecionados);
  res.redirect('/painel');
});

// Master/gestor de carteira: dashboard de um municipio especifico da
// carteira (RLS escopa automaticamente).
router.get('/municipios/:municipioId/dashboard', async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  if (!municipio) return res.status(404).send('Município não encontrado.');
  const relatorios = await montarDashboard(req.tenant, req.params.municipioId, null);
  res.render('dashboards/painel-municipio', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipio,
    relatorios,
    eixosAtivos: servico.EIXOS_ORDEM,
    todosOsEixos: servico.EIXOS_ORDEM,
    somenteLeitura: true,
  });
});

module.exports = router;
