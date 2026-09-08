/* Episteme 知屿 — always open directly on the home route. */
(function(){
  if(!location.hash || location.hash === '#'){
    history.replaceState(null,'',location.pathname + location.search + '#/');
  }
})();
