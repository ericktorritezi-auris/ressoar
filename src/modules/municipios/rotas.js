// Rotas do modulo de Municipios (secao 3.1 do mapeamento): cadastro pelo
// master/gestor de carteira, com autofill via codigo IBGE e o card de
// Contexto do Municipio alimentado pelos dados publicos da secao 4.

const path = require('path');
const express = require('express');
const multer = require('multer');
const { exigirMaster } = require('../../middlewares/tenant');
const repo = require('./repositorio');
const dadosPublicosRepo = require('../dados-publicos/repositorio');
const servicoIbge = require('../dados-publicos/servico-ibge');
const dadosPublicosServico = require('../dados-publicos/servico');
const indicadoresRepo = require('../indicadores/repositorio');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', '..', '..', 'web', 'public', 'uploads', 'brasoes'),
    filename: (req, file, cb) => {
      const extensao = path.extname(file.originalname) || '.png';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extensao}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const permitido = /^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.mimetype);
    cb(permitido ? null : new Error('Formato de imagem não suportado.'), permitido);
  },
});

router.use(exigirMaster);

// Link é sempre a opção preferida (mais simples, não some em redeploy); o
// upload de arquivo fica como alternativa só quando não há link informado.
function resolverBrasaoUrl(brasaoUrlInformada, arquivoEnviado) {
  const link = (brasaoUrlInformada || '').trim();
  if (link) return link;
  if (arquivoEnviado) return `/uploads/brasoes/${arquivoEnviado.filename}`;
  return null;
}

router.get('/municipios', async (req, res) => {
  const municipios = await repo.listar(req.tenant);
  res.render('municipios/lista', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipios,
    erro: null,
  });
});

router.get('/municipios/novo', async (req, res) => {
  const gestores = await repo.listarGestoresCarteira(req.tenant);
  res.render('municipios/form', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipio: null,
    gestores,
    erro: null,
  });
});

// Chamado pelo navegador (fetch) assim que o usuario sai do campo de
// codigo IBGE, para preencher nome/UF na hora — sem isso, o preenchimento
// so acontecia no servidor DEPOIS do clique em Salvar, tarde demais para
// ajudar quem esta preenchendo o formulario (secao 3.1 do mapeamento).
router.get('/municipios/buscar-ibge/:codigo', async (req, res) => {
  const codigo = (req.params.codigo || '').trim();
  if (!/^\d{7}$/.test(codigo)) {
    return res.status(400).json({ erro: 'Código IBGE deve ter 7 dígitos.' });
  }
  const localidade = await servicoIbge.buscarLocalidade(codigo);
  if (!localidade) {
    return res.status(404).json({ erro: 'Código IBGE não encontrado ou serviço indisponível agora.' });
  }
  res.json(localidade);
});

router.post('/municipios', upload.single('brasao_arquivo'), async (req, res) => {
  try {
    const { codigo_ibge: codigoIbge, nome, uf, populacao, contrato_inicio: contratoInicio,
      contrato_vigencia: contratoVigencia, gestor_carteira_id: gestorCarteiraId,
      brasao_url: brasaoUrlInformada } = req.body;

    let nomeFinal = (nome || '').trim();
    let ufFinal = (uf || '').trim();

    // Codigo IBGE informado: busca nome/UF ao vivo antes de gravar (mesma
    // busca do endpoint acima — cobre quem enviou o formulario sem passar
    // pelo JS, ou preencheu o codigo mas apagou nome/UF depois).
    if (codigoIbge) {
      const localidade = await servicoIbge.buscarLocalidade(codigoIbge.trim());
      if (localidade) {
        nomeFinal = localidade.nome || nomeFinal;
        ufFinal = localidade.uf || ufFinal;
      }
    }

    if (!nomeFinal || !ufFinal) {
      throw new Error('Informe um código IBGE válido ou preencha nome e UF manualmente.');
    }

    const brasaoUrl = resolverBrasaoUrl(brasaoUrlInformada, req.file);

    const municipioId = await repo.criar(req.tenant, {
      codigoIbge: codigoIbge ? codigoIbge.trim() : null,
      nome: nomeFinal,
      uf: ufFinal,
      populacao: populacao || null,
      brasaoUrl,
      contratoInicio: contratoInicio || null,
      contratoVigencia: contratoVigencia || null,
      gestorCarteiraId: gestorCarteiraId || null,
    });

    if (codigoIbge) {
      dadosPublicosServico
        .buscarEArmazenarDadosIbge(req.tenant, municipioId, codigoIbge.trim())
        .catch((erro) => {
          console.error('[municipios] falha ao buscar dados publicos em segundo plano', erro);
        });
    }

    res.redirect(`/municipios/${municipioId}`);
  } catch (erro) {
    console.error('[municipios] erro ao criar', erro);
    const gestores = await repo.listarGestoresCarteira(req.tenant);
    res.status(400).render('municipios/form', {
      usuario: req.tenant.usuario,
      versao: req.app.locals.versao,
      municipio: req.body,
      gestores,
      erro: erro.message && erro.message.startsWith('Informe')
        ? erro.message
        : 'Não foi possível salvar o município. Confira os dados e tente novamente.',
    });
  }
});

router.get('/municipios/:id', async (req, res) => {
  const municipio = await repo.buscarPorId(req.tenant, req.params.id);
  if (!municipio) return res.status(404).send('Município não encontrado.');

  const [dadosPublicos, indicadores, eixos, snapshot] = await Promise.all([
    municipio.codigo_ibge ? dadosPublicosRepo.buscarValoresPorCodigoIbge(municipio.codigo_ibge) : [],
    indicadoresRepo.listarPorMunicipio(req.tenant, municipio.id),
    indicadoresRepo.listarEixos(),
    repo.buscarSnapshotLinhaBase(req.tenant, municipio.id),
  ]);

  res.render('municipios/detalhe', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipio,
    dadosPublicos,
    indicadores,
    eixos,
    snapshot,
  });
});

router.get('/municipios/:id/editar', async (req, res) => {
  const municipio = await repo.buscarPorId(req.tenant, req.params.id);
  if (!municipio) return res.status(404).send('Município não encontrado.');
  const gestores = await repo.listarGestoresCarteira(req.tenant);
  res.render('municipios/form', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipio,
    gestores,
    erro: null,
  });
});

router.post('/municipios/:id', upload.single('brasao_arquivo'), async (req, res) => {
  const { nome, uf, populacao, contrato_inicio: contratoInicio,
    contrato_vigencia: contratoVigencia, gestor_carteira_id: gestorCarteiraId,
    brasao_url: brasaoUrlInformada } = req.body;

  const brasaoUrl = resolverBrasaoUrl(brasaoUrlInformada, req.file);

  await repo.atualizar(req.tenant, req.params.id, {
    nome,
    uf,
    populacao: populacao || null,
    brasaoUrl,
    contratoInicio: contratoInicio || null,
    contratoVigencia: contratoVigencia || null,
    gestorCarteiraId: gestorCarteiraId || null,
  });

  res.redirect(`/municipios/${req.params.id}`);
});

// Botão "Buscar agora" da IBGE, chamado tanto no cadastro quanto na
// Central de Atualizações (secao 4 — "importação de um clique").
router.post('/municipios/:id/atualizar-dados-ibge', async (req, res) => {
  const municipio = await repo.buscarPorId(req.tenant, req.params.id);
  if (!municipio || !municipio.codigo_ibge) {
    return res.status(400).send('Município sem código IBGE cadastrado.');
  }
  await dadosPublicosServico.buscarEArmazenarDadosIbge(req.tenant, municipio.id, municipio.codigo_ibge);
  res.redirect(`/municipios/${req.params.id}`);
});

// Congela a linha de base do município a partir dos dados públicos e dos
// indicadores atuais — feito uma vez, na assinatura do contrato (secao 4).
router.post('/municipios/:id/congelar-linha-base', async (req, res) => {
  const municipio = await repo.buscarPorId(req.tenant, req.params.id);
  if (!municipio) return res.status(404).send('Município não encontrado.');

  const valores = municipio.codigo_ibge
    ? await dadosPublicosRepo.buscarValoresPorCodigoIbge(municipio.codigo_ibge)
    : [];

  const paraCongelar = valores.map((v) => ({
    chave: v.chave,
    valorNumerico: v.valor_numerico,
    valorTexto: v.valor_texto,
  }));

  if (paraCongelar.length > 0) {
    await repo.salvarSnapshotLinhaBase(req.tenant, municipio.id, municipio.codigo_ibge, paraCongelar);
  }

  res.redirect(`/municipios/${req.params.id}`);
});

module.exports = router;
