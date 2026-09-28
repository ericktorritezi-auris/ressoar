// Alterna e persiste o tema claro/escuro no navegador do usuario.
// (Este e o app real do Ressoar, nao um artifact — localStorage aqui e
// apropriado e nao tem a restricao que se aplica a paginas publicadas.)
(function () {
  var CHAVE = 'rsr-theme';
  var raiz = document.documentElement;

  function aplicar(tema) {
    raiz.setAttribute('data-rsr-theme', tema);
  }

  function temaInicial() {
    var salvo = null;
    try { salvo = window.localStorage.getItem(CHAVE); } catch (e) { /* modo privado etc. */ }
    if (salvo === 'light' || salvo === 'dark') return salvo;
    var prefereEscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefereEscuro ? 'dark' : 'light';
  }

  aplicar(temaInicial());

  document.addEventListener('click', function (evento) {
    var botao = evento.target.closest('[data-rsr-toggle-tema]');
    if (!botao) return;
    var atual = raiz.getAttribute('data-rsr-theme');
    var novo = atual === 'dark' ? 'light' : 'dark';
    aplicar(novo);
    try { window.localStorage.setItem(CHAVE, novo); } catch (e) { /* ignora */ }
  });

  document.addEventListener('click', function (evento) {
    var botao = evento.target.closest('[data-rsr-toggle-menu]');
    if (!botao) return;
    var sidebar = document.querySelector('.rsr-sidebar');
    var scrim = document.querySelector('.rsr-scrim');
    if (!sidebar) return;
    sidebar.classList.toggle('aberta');
    if (scrim) scrim.classList.toggle('visivel');
  });

  document.addEventListener('click', function (evento) {
    if (evento.target.classList.contains('rsr-scrim')) {
      var sidebar = document.querySelector('.rsr-sidebar');
      if (sidebar) sidebar.classList.remove('aberta');
      evento.target.classList.remove('visivel');
    }
  });
})();
