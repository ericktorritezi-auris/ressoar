const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const { tenantMiddleware, exigirAutenticacao } = require('./middlewares/tenant');
const rotasAuth = require('./modules/auth/rotas');
const rotasMunicipios = require('./modules/municipios/rotas');
const rotasUsuarios = require('./modules/usuarios/rotas');
const rotasIndicadores = require('./modules/indicadores/rotas');
const rotasCentralAtualizacoes = require('./modules/central-atualizacoes/rotas');
const rotasPlanilhas = require('./modules/planilhas/rotas');
const rotasFormularios = require('./modules/formularios/rotas');
const rotasDashboards = require('./modules/dashboards/rotas');
const rotasSelfServiceBi = require('./modules/self-service-bi/rotas');
const rotasAlertas = require('./modules/alertas/rotas');
const alertasRepo = require('./modules/alertas/repositorio');

const app = express();

// O Railway termina o HTTPS na borda e encaminha a conexao para o
// container como HTTP simples por dentro. Sem isto, o Express nao sabe
// que a conexao original do navegador foi HTTPS — e o modulo de sessao
// (abaixo, cookie "secure") recusa silenciosamente gravar o cookie,
// achando que a conexao nao e segura. "1" = confia no 1o proxy na frente
// (o proprio Railway), que e exatamente a topologia daqui.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'web', 'views'));
app.locals.versao = env.RESSOAR_VERSION;
// Bug encontrado em 2026-09-28 (menu mobile "corrigido" mas continuando
// invisivel apos o deploy): tema.css/tema.js sao servidos sem
// cache-busting, e RESSOAR_VERSION so muda quando alguem lembra de
// atualizar a env var — na pratica o navegador ficava com a versao
// antiga do CSS em cache entre deploys. versaoAssets muda sozinho a cada
// boot do processo (todo deploy no Railway reinicia o processo), entao
// o link do CSS/JS muda de URL a cada deploy sem depender de ninguem
// lembrar de bumpar RESSOAR_VERSION.
app.locals.versaoAssets = Date.now();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(
  cookieSession({
    name: 'rsr_sessao',
    keys: [env.SESSION_SECRET],
    maxAge: 12 * 60 * 60 * 1000, // 12h
    secure: env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  })
);
app.use(tenantMiddleware);
app.use(express.static(path.join(__dirname, '..', 'web', 'public')));

// Contagem de alertas nao lidos para o badge do sino no menu lateral
// (shell-inicio.ejs, incluido por toda tela autenticada). Registrado aqui
// — depois do static, antes de qualquer router — pra valer pra TODAS as
// rotas de pagina, sem rodar pra cada asset estatico (css/js). So CONTA o
// que ja esta materializado, nao recalcula a cada requisicao (isso e caro
// e so acontece ao abrir /alertas); o numero pode por isso ficar
// levemente desatualizado ate a proxima visita aa tela de alertas, o que
// e aceitavel para um badge informativo.
app.use(async (req, res, next) => {
  if (!req.tenant.autenticado) return next();
  try {
    res.locals.alertasNaoLidos = await alertasRepo.contarNaoLidos(req.tenant);
  } catch (erro) {
    console.error('[alertas] erro ao contar nao lidos', erro);
    res.locals.alertasNaoLidos = 0;
  }
  next();
});

// Health-check: usado pelo Railway para saber se o servico esta de pe.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', versao: env.RESSOAR_VERSION });
});

app.use('/', rotasAuth);
app.use('/', exigirAutenticacao, rotasMunicipios);
app.use('/', exigirAutenticacao, rotasUsuarios);
app.use('/', exigirAutenticacao, rotasIndicadores);
app.use('/', exigirAutenticacao, rotasCentralAtualizacoes);
app.use('/', exigirAutenticacao, rotasPlanilhas);
app.use('/', exigirAutenticacao, rotasFormularios);

// Fase 4 (docs/mapeamento-fase4-bi-dashboards.md): dashboards fixos por
// eixo substituem o antigo stub de /painel; self-service BI (cubo com
// guardrail) e o sino de alertas sao modulos novos.
app.use('/', exigirAutenticacao, rotasDashboards);
app.use('/', exigirAutenticacao, rotasSelfServiceBi);
app.use('/', exigirAutenticacao, rotasAlertas);

app.get('/ajuda', exigirAutenticacao, (req, res) => {
  res.render('ajuda', { usuario: req.tenant.usuario, versao: env.RESSOAR_VERSION });
});

app.get('/', (req, res) => {
  res.redirect(req.tenant.autenticado ? '/painel' : '/login');
});

app.use((req, res) => {
  res.status(404).send('Página não encontrada.');
});

// eslint-disable-next-line no-unused-vars
app.use((erro, req, res, next) => {
  console.error('[erro nao tratado]', erro);
  res.status(500).send('Ocorreu um erro inesperado.');
});

if (require.main === module) {
  app.listen(env.PORT, () => {
    console.log(`[ressoar] rodando na porta ${env.PORT} (versao ${env.RESSOAR_VERSION})`);
  });
}

module.exports = app;
