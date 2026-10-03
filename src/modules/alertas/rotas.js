// Sino de alertas (secao 5 do mapeamento de Fase 4): pendencias de
// formulario (ao vivo) + alertas materializados (mandato perto do fim,
// indicador fora do padrao historico do proprio municipio).

const express = require('express');
const repo = require('./repositorio');
const orquestrador = require('./orquestrador');

const router = express.Router();

router.get('/alertas', async (req, res) => {
  await orquestrador.recalcularTodos(req.tenant);
  const [alertas, formulariosPendentes] = await Promise.all([
    repo.listarAtivos(req.tenant),
    repo.listarFormulariosPendentes(req.tenant),
  ]);
  res.render('alertas/lista', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    alertas,
    formulariosPendentes,
  });
});

router.post('/alertas/:id/marcar-lido', async (req, res) => {
  await repo.marcarLido(req.tenant, req.params.id);
  res.redirect('/alertas');
});

module.exports = router;
