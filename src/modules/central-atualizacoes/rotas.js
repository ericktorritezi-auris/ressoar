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

// Bug #3: faltava validacao real de tipo no servidor — o atributo
// "accept" do <input type=file> e so uma dica de UI, trivial de
// contornar (renomear extensao/trocar o mimetype no client). Fontes deste
// modulo (SIOPS/Siconfi/CNES/DATASUS) so aceitam CSV/TXT (secao 4).
const TIPOS_PERMITIDOS = new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const nomePermitido = /\.(csv|txt)$/i.test(file.originalname || '');
    const tipoPermitido = TIPOS_PERMITIDOS.has(file.mimetype) || file.mimetype === 'application/octet-stream';
    const permitido = nomePermitido && tipoPermitido;
    cb(permitido ? null : new Error('Formato de arquivo não suportado. Envie um CSV ou TXT.'), permitido);
  },
});

// exigirMaster aplicado rota a rota — ver comentario em usuarios/rotas.js
// (Bug #2): router.use() sem caminho intercepta toda requisicao que entra
// por este router, mesmo as que nao batem nenhuma rota aqui dentro.
router.get('/central-atualizacoes', exigirMaster, async (req, res) => {
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

router.post('/central-atualizacoes/:municipioId/ibge', exigirMaster, async (req, res) => {
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

// Envolve o upload.single manualmente para capturar o erro do fileFilter
// (o multer chama next(erro), que iria direto pro handler generico de
// erro em server.js — 500 "erro inesperado" — em vez de uma mensagem
// amigavel no padrao dos outros redirects desta tela).
function receberArquivo(req, res, next) {
  upload.single('arquivo')(req, res, (erro) => {
    if (erro) {
      return res.redirect(`/central-atualizacoes?erro=${encodeURIComponent(erro.message)}`);
    }
    next();
  });
}

router.post('/central-atualizacoes/:municipioId/:codigoFonte', exigirMaster, receberArquivo, async (req, res) => {
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
