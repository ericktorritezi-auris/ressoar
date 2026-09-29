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

// exigirMaster aplicado rota a rota — ver comentario em usuarios/rotas.js
// (Bug #2): router.use() sem caminho intercepta toda requisicao que entra
// por este router, mesmo as que nao batem nenhuma rota aqui dentro (nesse
// caso bloqueava /painel e /ajuda, montados depois deste router em
// server.js, para qualquer perfil nao-master).
// Link é sempre a opção preferida (mais simples, não some em redeploy); o
// upload de arquivo fica como alternativa só quando não há link informado.
function resolverBrasaoUrl(brasaoUrlInformada, arquivoEnviado) {
  const link = (brasaoUrlInformada || '').trim();
  if (link) return link;
  if (arquivoEnviado) return `/uploads/brasoes/${arquivoEnviado.filename}`;
  return null;
}

router.get('/municipios', exigirMaster, async (req, res) => {
  const municipios = await repo.listar(req.tenant);
  res.render('municipios/lista', {
    usuario: req.tenant.usuario,
    versao: req.app.locals.versao,
    municipios,
    erro: null,
  });
});

router.get('/municipios/novo', exigirMaster, async (req, res) => {
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
router.get('/municipios/buscar-ibge/:codigo', exigirMaster, async (req, res) => {
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

router.post('/municipios', exigirMaster, upload.single('brasao_arquivo'), async (req, res) => {
  try {
    const { codigo_ibge: codigoIbge, nome, uf, populacao, contrato_inicio: contratoInicio,
      contrato_vigencia: contratoVigencia, gestor_carteira_id: gestorCarteiraId,
      brasao_url: brasaoUrlInformada, prefeito_nome: prefeitoNome,
      prefeito_partido: prefeitoPartido, mandato_inicio: mandatoInicio,
      mandato_fim: mandatoFim } = req.body;

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
      prefeitoNome: (prefeitoNome || '').trim() || null,
      prefeitoPartido: (prefeitoPartido || '').trim() || null,
      mandatoInicio: mandatoInicio || null,
      mandatoFim: mandatoFim || null,
    });

    if (codigoIbge) {
      // Busca única (2026-09-29, secao 4 do mapeamento): um só disparo em
      // segundo plano cobre IBGE (dados+mapa), Siconfi e InfoDengue — o
      // master não precisa saber quais fontes existem, só que o cadastro
      // vem com dados públicos já preenchidos quando ele abrir a tela.
      dadosPublicosServico
        .buscarTudo(req.tenant, municipioId, codigoIbge.trim())
        .catch((erro) => {
          console.error('[municipios] falha ao buscar dados públicos em segundo plano', erro);
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

router.get('/municipios/:id', exigirMaster, async (req, res) => {
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
    mensagem: req.query.msg || null,
    erro: req.query.erro || null,
  });
});

router.get('/municipios/:id/editar', exigirMaster, async (req, res) => {
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

router.post('/municipios/:id', exigirMaster, upload.single('brasao_arquivo'), async (req, res) => {
  const { nome, uf, populacao, contrato_inicio: contratoInicio,
    contrato_vigencia: contratoVigencia, gestor_carteira_id: gestorCarteiraId,
    brasao_url: brasaoUrlInformada, prefeito_nome: prefeitoNome,
    prefeito_partido: prefeitoPartido, mandato_inicio: mandatoInicio,
    mandato_fim: mandatoFim } = req.body;

  const brasaoUrl = resolverBrasaoUrl(brasaoUrlInformada, req.file);

  await repo.atualizar(req.tenant, req.params.id, {
    nome,
    uf,
    populacao: populacao || null,
    brasaoUrl,
    contratoInicio: contratoInicio || null,
    contratoVigencia: contratoVigencia || null,
    gestorCarteiraId: gestorCarteiraId || null,
    prefeitoNome: (prefeitoNome || '').trim() || null,
    prefeitoPartido: (prefeitoPartido || '').trim() || null,
    mandatoInicio: mandatoInicio || null,
    mandatoFim: mandatoFim || null,
  });

  res.redirect(`/municipios/${req.params.id}`);
});

// Botão único "Buscar dados do município" (busca única, 2026-09-29,
// secao 4 do mapeamento — pedido do usuário: "um botão só, busca tudo
// que vem de API"). Substitui o antigo botão "Buscar agora (IBGE)":
// agora dispara IBGE (dados+mapa), Siconfi e InfoDengue de uma vez.
// Rota antiga (/atualizar-dados-ibge) mantida como alias — outros pontos
// do sistema (ex.: e-mails/links antigos) podem apontar pra ela.
router.post('/municipios/:id/buscar-dados', exigirMaster, async (req, res) => {
  const municipio = await repo.buscarPorId(req.tenant, req.params.id);
  if (!municipio || !municipio.codigo_ibge) {
    return res.status(400).send('Município sem código IBGE cadastrado.');
  }
  const resultado = await dadosPublicosServico.buscarTudo(req.tenant, municipio.id, municipio.codigo_ibge);
  const fontesComDado = Object.entries(resultado).filter(([, qtd]) => qtd > 0).map(([f]) => f);
  const msg = fontesComDado.length > 0
    ? `Dados atualizados: ${fontesComDado.join(', ')}.`
    : 'Busca concluída, mas nenhuma fonte retornou dados novos agora.';
  res.redirect(`/municipios/${req.params.id}?msg=${encodeURIComponent(msg)}`);
});
router.post('/municipios/:id/atualizar-dados-ibge', exigirMaster, async (req, res) => {
  const municipio = await repo.buscarPorId(req.tenant, req.params.id);
  if (!municipio || !municipio.codigo_ibge) {
    return res.status(400).send('Município sem código IBGE cadastrado.');
  }
  await dadosPublicosServico.buscarTudo(req.tenant, municipio.id, municipio.codigo_ibge);
  res.redirect(`/municipios/${req.params.id}`);
});

// IDHM/Atlas Brasil — fonte "arquivo_auto": download pesado (arquivo
// nacional), por isso fica num botão manual separado da busca única
// automática, e não faz parte de buscarTudo.
router.post('/municipios/:id/buscar-idhm', exigirMaster, async (req, res) => {
  const municipio = await repo.buscarPorId(req.tenant, req.params.id);
  if (!municipio || !municipio.codigo_ibge) {
    return res.status(400).send('Município sem código IBGE cadastrado.');
  }
  try {
    const valores = await dadosPublicosServico.buscarEArmazenarIdhm(req.tenant, municipio.id, municipio.codigo_ibge);
    const msg = valores.length > 0
      ? 'IDHM importado com sucesso.'
      : 'Não foi possível encontrar este município no arquivo do IDHM agora.';
    res.redirect(`/municipios/${req.params.id}?msg=${encodeURIComponent(msg)}`);
  } catch (erro) {
    console.error('[municipios] falha ao importar IDHM', erro);
    res.redirect(`/municipios/${req.params.id}?erro=${encodeURIComponent('Não foi possível baixar/importar o IDHM agora.')}`);
  }
});

// Botão manual "Regenerar mapa" — caso raro de redefinição de limites
// municipais (secao 4 do mapeamento, novo UX). Sempre busca de novo,
// ignorando o cache em municipios.mapa_svg.
router.post('/municipios/:id/mapa/regenerar', exigirMaster, async (req, res) => {
  const municipio = await repo.buscarPorId(req.tenant, req.params.id);
  if (!municipio || !municipio.codigo_ibge) {
    return res.status(400).send('Município sem código IBGE cadastrado.');
  }
  await dadosPublicosServico.garantirMapaMunicipio(req.tenant, municipio.id, municipio.codigo_ibge, { forcar: true });
  res.redirect(`/municipios/${req.params.id}`);
});

// Exclui um dado público importado errado (pedido em 2026-09-28: subir
// arquivo errado na Central de Atualizações precisa de um jeito de
// remover, não só sobrescrever com um novo upload). Some com o card
// inteiro daquela chave/fonte na tela de detalhe.
router.post('/municipios/:id/dados-publicos/excluir', exigirMaster, async (req, res) => {
  const municipio = await repo.buscarPorId(req.tenant, req.params.id);
  if (!municipio || !municipio.codigo_ibge) return res.status(404).send('Município não encontrado.');

  const { chave, fonte_codigo: fonteCodigo } = req.body;
  if (!chave || !fonteCodigo) return res.status(400).send('Dados incompletos para excluir.');

  const fonte = await dadosPublicosRepo.buscarFontePorCodigo(fonteCodigo);
  if (!fonte) return res.status(404).send('Fonte não encontrada.');

  await dadosPublicosRepo.excluirValor(municipio.codigo_ibge, fonte.id, chave);
  res.redirect(`/municipios/${req.params.id}`);
});

// Congela a linha de base do município a partir dos dados públicos e dos
// indicadores atuais — feito uma vez, na assinatura do contrato (secao 4).
router.post('/municipios/:id/congelar-linha-base', exigirMaster, async (req, res) => {
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
