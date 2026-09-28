// Central de Atualizacoes (secao 4 do mapeamento): tela do master que
// lista o que ha de novo em cada fonte de dado publico, com importacao de
// um clique para a fonte "api" (IBGE) e upload assistido de arquivo para
// as fontes "arquivo" (SIOPS, Siconfi, CNES, DATASUS).

const express = require('express');
const multer = require('multer');
const { exigirMaster } = require('../../middlewares/tenant');
const municipiosRepo = require('../municipios/repositorio');
const dadosPublicosRepo = require('../dados-publicos/repositorio');
const dadosPublicosServico = require('../dados-publicos/servico');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(exigirMaster);

router.get('/central-atualizacoes', async (req, res) => {
  const [municipios, fontes] = await Promise.all([
    municipiosRepo.listar(req.tenant),
    dadosPublicosRepo.listarFontes(),
  ]);

  const comCodigo = municipios.filter((m) => m.codigo_ibge);
  const statusPorMunicipio = {};
  for (const m of comCodigo) {
    // eslint-disable-next-line no-await-in-loop
    statusPorMunicipio[m.id] = await dadosPublicosRepo.buscarUltimaColetaPorFonte(m.codigo_ibge);
  }

  res.render('central-atualizacoes/index', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipios: comCodigo,
    semCodigo: municipios.length - comCodigo.length,
    fontes,
    statusPorMunicipio,
    mensagem: req.query.msg || null,
    erro: req.query.erro || null,
  });
});

router.post('/central-atualizacoes/:municipioId/ibge', async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  if (!municipio || !municipio.codigo_ibge) {
    return res.redirect('/central-atualizacoes?erro=Município sem código IBGE.');
  }
  try {
    await dadosPublicosServico.buscarEArmazenarDadosIbge(req.tenant, municipio.id, municipio.codigo_ibge);
    res.redirect(`/central-atualizacoes?msg=Dados do IBGE atualizados para ${encodeURIComponent(municipio.nome)}.`);
  } catch (erro) {
    console.error('[central-atualizacoes] erro ao buscar IBGE', erro);
    res.redirect('/central-atualizacoes?erro=Não foi possível buscar os dados do IBGE agora. Tente novamente mais tarde.');
  }
});

router.post('/central-atualizacoes/:municipioId/:codigoFonte', upload.single('arquivo'), async (req, res) => {
  const municipio = await municipiosRepo.buscarPorId(req.tenant, req.params.municipioId);
  if (!municipio || !municipio.codigo_ibge) {
    return res.redirect('/central-atualizacoes?erro=Município sem código IBGE.');
  }
  if (!req.file) {
    return res.redirect('/central-atualizacoes?erro=Selecione um arquivo CSV para importar.');
  }

  try {
    const quantidade = await dadosPublicosServico.importarArquivo(
      municipio.codigo_ibge,
      req.params.codigoFonte,
      req.file.buffer.toString('utf8')
    );
    res.redirect(
      `/central-atualizacoes?msg=${quantidade} valor(es) importado(s) para ${encodeURIComponent(municipio.nome)}.`
    );
  } catch (erro) {
    console.error('[central-atualizacoes] erro ao importar arquivo', erro);
    res.redirect(`/central-atualizacoes?erro=${encodeURIComponent(erro.message)}`);
  }
});

module.exports = router;
