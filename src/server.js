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

// Health-check: usado pelo Railway para saber se o servico esta de pe.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', versao: env.RESSOAR_VERSION });
});

app.use('/', rotasAuth);
app.use('/', exigirAutenticacao, rotasMunicipios);
app.use('/', exigirAutenticacao, rotasUsuarios);
app.use('/', exigirAutenticacao, rotasIndicadores);
app.use('/', exigirAutenticacao, rotasCentralAtualizacoes);

app.get('/painel', exigirAutenticacao, (req, res) => {
  res.render('painel', { usuario: req.tenant.usuario, versao: env.RESSOAR_VERSION });
});

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
