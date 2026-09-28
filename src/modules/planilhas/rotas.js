// Rotas de importacao de planilhas (secao 5.1 do mapeamento), aninhadas
// em /municipios/:municipioId. Fluxo: baixar modelo -> preencher -> subir
// -> pre-visualizar -> confirmar (vira "rascunho_pendente") -> master ou
// gestor de carteira aprova ou rejeita.

const express = require('express');
const multer = require('multer');
const { exigirMaster, exigirPerfilDeEnvioDeDados } = require('../../middlewares/tenant');
const municipiosRepo = require('../municipios/repositorio');
const submissoesRepo = require('../submissoes/repositorio');
const servico = require('./servico');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const permitido = /\.(csv|txt)$/i.test(file.originalname || '');
    cb(permitido ? null : new Error('Formato de arquivo não suportado. Envie um CSV.'), permitido);
  },
});

function receberArquivo(req, res, next) {
  upload.single('arquivo')(req, res, (erro) => {
    if (erro) {
      return res.redirect(`/municipios/${req.params.municipioId}/planilhas/nova?erro=${encodeURIComponent(erro.message)}`);
    }
    next();
  });
}

router.get('/municipios/:municipioId/planilhas', exigirPerfilDeEnvioDeDados, async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  if (!municipio) return res.status(404).send('Município não encontrado.');
  const submissoes = await submissoesRepo.listarPorMunicipio(req.tenant, municipio.id, 'planilha');
  res.render('planilhas/lista', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipio,
    submissoes,
    podeRevisar: ['master', 'gestor_carteira'].includes(req.tenant.usuario.perfil),
  });
});

router.get('/municipios/:municipioId/planilhas/modelo', exigirPerfilDeEnvioDeDados, async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  if (!municipio) return res.status(404).send('Município não encontrado.');
  const csv = await servico.gerarModeloCsv(req.tenant, municipio.id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="modelo-indicadores-${municipio.nome.replace(/\s+/g, '-')}.csv"`);
  res.send(csv);
});

router.get('/municipios/:municipioId/planilhas/nova', exigirPerfilDeEnvioDeDados, async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  if (!municipio) return res.status(404).send('Município não encontrado.');
  res.render('planilhas/nova', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipio,
    erro: req.query.erro || null,
  });
});

router.post('/municipios/:municipioId/planilhas/preview', exigirPerfilDeEnvioDeDados, receberArquivo, async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  if (!municipio) return res.status(404).send('Município não encontrado.');
  if (!req.file) {
    return res.redirect(`/municipios/${municipio.id}/planilhas/nova?erro=${encodeURIComponent('Selecione um arquivo CSV.')}`);
  }

  try {
    const linhas = await servico.interpretarESeCasar(req.tenant, municipio.id, req.file.buffer.toString('utf8'));
    res.render('planilhas/preview', {
      usuario: req.tenant.usuario,
      versao: req.app.locals.versao,
      municipio,
      origem: req.file.originalname,
      linhas,
      linhasJson: JSON.stringify(linhas),
    });
  } catch (erro) {
    res.redirect(`/municipios/${municipio.id}/planilhas/nova?erro=${encodeURIComponent(erro.message)}`);
  }
});

router.post('/municipios/:municipioId/planilhas', exigirPerfilDeEnvioDeDados, async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  if (!municipio) return res.status(404).send('Município não encontrado.');

  let linhas;
  try {
    linhas = JSON.parse(req.body.linhas_json || '[]');
  } catch (erro) {
    linhas = [];
  }
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return res.redirect(`/municipios/${municipio.id}/planilhas/nova?erro=${encodeURIComponent('Não foi possível confirmar a importação. Tente novamente.')}`);
  }

  // Reenvio nunca sobrescreve o anterior — nova versao, o rascunho
  // pendente/aprovado/rejeitado anterior fica retido para auditoria
  // (secao 5.1 do mapeamento).
  const versao = await submissoesRepo.proximaVersao(req.tenant, municipio.id, 'planilha');
  const id = await submissoesRepo.criar(req.tenant, {
    municipioId: municipio.id,
    tipo: 'planilha',
    origem: req.body.origem || 'planilha.csv',
    versao,
    dados: linhas,
  });

  res.redirect(`/municipios/${municipio.id}/planilhas/${id}`);
});

router.get('/municipios/:municipioId/planilhas/:id', exigirPerfilDeEnvioDeDados, async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  const submissao = await submissoesRepo.buscarPorId(req.tenant, req.params.id);
  if (!municipio || !submissao || submissao.municipio_id !== municipio.id) {
    return res.status(404).send('Não encontrado.');
  }
  res.render('planilhas/detalhe', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipio,
    submissao,
    podeRevisar: ['master', 'gestor_carteira'].includes(req.tenant.usuario.perfil),
  });
});

router.post('/municipios/:municipioId/planilhas/:id/aprovar', exigirMaster, async (req, res) => {
  await submissoesRepo.aprovar(req.tenant, req.params.id);
  res.redirect(`/municipios/${req.params.municipioId}/planilhas/${req.params.id}`);
});

router.post('/municipios/:municipioId/planilhas/:id/rejeitar', exigirMaster, async (req, res) => {
  await submissoesRepo.rejeitar(req.tenant, req.params.id, req.body.motivo);
  res.redirect(`/municipios/${req.params.municipioId}/planilhas/${req.params.id}`);
});

module.exports = router;
