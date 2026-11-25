// Barreira de login (provisória): o site inteiro exige sessão. Carregado no <head>, antes de tudo.
// Esconde a página, consulta /api/eu e, se der 401, manda para /entrar.html. Em erro de rede/5xx NÃO trava o site.
// Modo convidado: com localStorage.ns_convidado="1" (botão "Continuar sem login" da entrar.html) o 401 NÃO redireciona.
// Obs.: é só UX. A proteção de verdade dos dados fica nas rotas da API; arquivos estáticos continuam públicos.
(function(){
  var h=document.documentElement;
  h.style.visibility="hidden";
  var mostrar=function(){h.style.visibility=""};
  var convidado=false;try{convidado=localStorage.getItem("ns_convidado")==="1"}catch(e){}
  var timer=setTimeout(mostrar,6000); // rede morta: não deixa a tela em branco para sempre
  fetch("/api/eu",{credentials:"same-origin",cache:"no-store"}).then(function(r){
    clearTimeout(timer);
    if(r.status===401){
      if(convidado){mostrar();return}
      var vai=location.pathname+location.search+location.hash;
      location.replace("/entrar.html?voltar="+encodeURIComponent(vai));
      return;
    }
    mostrar();
  }).catch(function(){clearTimeout(timer);mostrar()});
})();
