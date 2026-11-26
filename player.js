// =====================================================================
//  Player "da época": o vídeo abre com a cara do player do ano do meme
//  (inspirado no visual de cada era — sem logos de terceiros)
// =====================================================================
const ERAS=[
 {id:0,to:2004,name:"Player de mídia",note:"Antes do YouTube: o viral chegava por e-mail, Kazaa ou CD gravado."},
 {id:1,to:2007,name:"Player 2005–2007",note:"Barra cinza, estrelinhas de avaliação e 240p raiz."},
 {id:2,to:2009,name:"Player 2008–2009",note:"Barra preta brilhante, botão HQ e vídeos relacionados no fim."},
 {id:3,to:2012,name:"Player 2010–2012",note:"Barra de curtidas verde e vermelha e botão de inscrição amarelo."},
 {id:4,to:2016,name:"Player 2013–2016",note:"Visual flat, controles por cima do vídeo e engrenagem de qualidade."},
 {id:5,to:9999,name:"Player atual",note:"Modo escuro, cantos arredondados e barra de progresso vermelha."}
];
// ícones desenhados (SVG): o caractere ▶ vira emoji colorido no celular, então nada de texto nos botões
const VPI={
 play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
 pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
 replay:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7.5 6 12 10V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" fill="currentColor"/></svg>',
 vol:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
 volLow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
 mute:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
 gear:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 4.6l1.6 1.2-1.6 2.8-1.9-.6a7.6 7.6 0 0 1-1.7 1l-.4 2h-3.2l-.4-2a7.6 7.6 0 0 1-1.7-1l-1.9.6-1.6-2.8 1.6-1.2a7 7 0 0 1 0-2.2L3.6 9.7l1.6-2.8 1.9.6a7.6 7.6 0 0 1 1.7-1l.4-2h3.2l.4 2a7.6 7.6 0 0 1 1.7 1l1.9-.6 1.6 2.8-1.6 1.2a7 7 0 0 1 0 2.2z" fill="currentColor" fill-rule="evenodd"/></svg>',
 fs:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
};
const eraOf=y=>ERAS.find(e=>(parseInt(y)||2020)<=e.to);
const mmss=s=>Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0");
const VP_GRADS=["#1d3a8a,#0b0f2a","#5b1d8a,#14061f","#8a3a1d,#2a0f06","#1d8a6e,#06241d","#8a1d4a,#240614","#1d6e8a,#06202a","#7a8a1d,#1f2406"];
const vpGrad=s=>"linear-gradient(135deg,"+VP_GRADS[[...s].reduce((a,c)=>a+c.charCodeAt(0),0)%VP_GRADS.length]+")";

function playerHTML(m,bare){
  const e=eraOf(m.y),slug=m.id||"video",views=fmt(m.views||1000),likes=Math.round((m.saves||100)*4.2),dis=Math.round(likes*.06);
  const q=["","240p","HQ","360p","720p","1080p"][e.id]||"";
  const yearsAgo=Math.max(1,new Date().getFullYear()-(parseInt(m.y)||2020));
  let under="";
  if(e.id===0) under=`<div class="u0">Arquivo: ${slug}.wmv · 3,2 MB · recebido por e-mail (FW: FW: FW: olha isso kkkk)</div>`;
  if(e.id===1) under=`<div class="u1"><h4>${escapeHtml(m.t)}</h4><div><span class="st">★★★★★</span> <small>(${fmt(Math.round(likes/9))} avaliações)</small></div><div class="ul">Exibições: <b>${views}</b> · <a>Adicionar aos favoritos</a> · <a>Compartilhar</a> · <a>Sinalizar</a></div></div>`;
  if(e.id===2) under=`<div class="u2"><h4>${escapeHtml(m.t)}</h4><div class="u2r"><span class="st">★★★★½</span><span>${views} exibições</span><span class="hq">Assistir em alta qualidade</span></div></div>`;
  if(e.id===3) under=`<div class="u3"><h4>${escapeHtml(m.t)}</h4><div class="u3r"><span class="ch">acervo_naosalvo</span><button class="sub3">Inscrever-se</button><b class="vw">${views}</b></div><div class="u3l"><span>👍 Gostei</span><span>👎</span><i><s style="width:94%"></s></i><small>${fmt(likes)} curtidas, ${fmt(dis)} não curtiram</small></div></div>`;
  if(e.id===4) under=`<div class="u4"><h4>${escapeHtml(m.t)}</h4><div class="u4r"><span class="av4">🐱</span><span class="ch">acervo_naosalvo</span><button class="sub4">Inscrever-se <em>${fmt(Math.round(likes*3))}</em></button><b class="vw">${views} visualizações</b></div><div class="u4l"><span>👍 ${fmt(likes)}</span><span>👎 ${fmt(dis)}</span><i><s style="width:94%"></s></i></div></div>`;
  if(e.id===5) under=`<div class="u5"><h4>${escapeHtml(m.t)}</h4><div class="u5r"><span class="av4">🐱</span><span class="ch">acervo_naosalvo<small>${fmt(Math.round(likes*3))} inscritos</small></span><button class="sub5">Inscrever-se</button><span class="pill">👍 ${fmt(likes)} │ 👎</span><span class="pill">↗ Compartilhar</span></div><div class="u5d"><b>${views} visualizações · há ${yearsAgo} anos</b></div></div>`;
  if(bare)under="";
  const tem=!!(m.yt||m.fb);
  return `<div class="vp vp-e${e.id}${bare?" bare":""}${tem?"":" vp-noyt"}${m.vert?" vp-vert":""}">
   ${e.id===0&&!bare?`<div class="vp-title"><span><i class="vp-ti">${VPI.play}</i>Reproduzindo: ${slug}.wmv</span><span>_ □ ×</span></div>`:""}
   <div class="vp-stage">
    <div class="vp-screen" style="background:${vpGrad(m.t)}">${m.img?`<img class="vp-thumb" src="${escapeHtml(m.img)}" alt="" onerror="this.remove()">`:m.yt?`<img class="vp-thumb" src="https://i.ytimg.com/vi/${m.yt}/hqdefault.jpg" alt="" onerror="this.remove()">`:""}${m.yt||m.img||m.fb?"":`<span class="vp-emo">${m.e}</span>`}<div class="vp-noise"></div>
      ${tem?`<button class="vp-big" data-a="play" aria-label="Assistir">${VPI.play}</button>`:`<div class="vp-off"><b>Vídeo original fora do ar</b><small>Conhece o link no YouTube? Mande pelo campo abaixo do vídeo.</small></div>`}<div class="vp-buf"><span></span>${e.id<=1?"Carregando… (conexão discada?)":"Carregando…"}</div><div class="vp-end"></div></div>
    <div class="vp-bar">${tem?`<button class="vp-pp" data-a="play" aria-label="Assistir">${VPI.play}</button>`:""}<div class="vp-track"><i class="vp-load"></i><i class="vp-prog"></i><b class="vp-knob"></b></div>
      <span class="vp-time">${tem?"0:00 / --:--":"--:--"}</span>${q?`<span class="vp-q">${q}</span>`:""}${tem?`<span class="vp-vol"><button class="vp-ic vp-mute" title="Som" aria-label="Tirar o som">${VPI.vol}</button><input class="vp-vs" type="range" min="0" max="100" step="5" value="100" aria-label="Volume" title="Volume"></span>`:""}${e.id>=4?`<span class="vp-ic" aria-hidden="true">${VPI.gear}</span>`:''}${m.yt?`<button class="vp-ic vp-fs" title="Tela cheia" aria-label="Tela cheia">${VPI.fs}</button>`:""}</div>
   </div>${under}
   ${bare?"":`<div class="vp-era">📼 ${e.name} · ${e.note}${m.yt?` · <a class="vp-ytl" href="https://www.youtube.com/watch?v=${m.yt}" target="_blank" rel="noopener">Assistir no YouTube ↗</a>`:m.fb?` · <a class="vp-ytl vp-fbl" href="${escapeHtml(m.fb)}" target="_blank" rel="noopener">Assistir no Facebook ↗</a>`:" · vídeo original ainda não encontrado"}</div>`}</div>`;
}

// SDK do Facebook: carregado só quando alguém dá play num vídeo que só existe lá (uma vez por página)
let FBSDK=null;
function carregarFB(){
  if(FBSDK)return FBSDK;
  FBSDK=new Promise((ok,erro)=>{
    if(window.FB&&window.FB.XFBML)return ok(window.FB);
    const prev=window.fbAsyncInit;
    window.fbAsyncInit=()=>{try{window.FB.init({xfbml:false,version:"v21.0"})}catch(x){}ok(window.FB);prev&&prev()};
    const sc=document.createElement("script");sc.src="https://connect.facebook.net/pt_BR/sdk.js";sc.async=true;sc.defer=true;sc.crossOrigin="anonymous";
    sc.onerror=()=>{FBSDK=null;erro(new Error("sdk"))};document.head.appendChild(sc);
  });
  return FBSDK;
}

// reprodução: vídeo real do YouTube dentro do visual da época (quando o meme tem link).
// Sem link não há o que tocar: o player fica parado com o aviso "fora do ar".
function initPlayer(root,m,related,onPick,hooks){
  if(!m.yt&&!m.fb)return {stop:()=>{}};
  hooks=hooks||{};
  const e=eraOf(m.y),$q=s=>root.querySelector(s);
  const prog=$q(".vp-prog"),knob=$q(".vp-knob"),time=$q(".vp-time"),scr=$q(".vp-screen"),pp=$q(".vp-pp"),load=$q(".vp-load");
  let t=0,dur=0,playing=false,started=false,muted=false;
  // volume (0–100) lembrado entre vídeos; 0 = mudo
  let vol=100;try{const v=parseInt(localStorage.getItem("ns_vol"),10);if(v>=0&&v<=100)vol=v}catch(x){}
  muted=vol===0;
  const draw=()=>{const p=dur?t/dur*100:0;prog.style.width=p+"%";knob.style.left=p+"%";time.textContent=mmss(t)+" / "+(dur?mmss(dur):"--:--")};
  const setPlaying=v=>{playing=v;scr.classList.toggle("playing",v);const k=v?"pause":(scr.classList.contains("ended")?"replay":"play");pp.innerHTML=VPI[k];pp.setAttribute("aria-label",v?"Pausar":k==="replay"?"Assistir de novo":"Assistir")};
  function endScreen(){setPlaying(false);scr.classList.add("ended");pp.innerHTML=VPI.replay;pp.setAttribute("aria-label","Assistir de novo");
    const rel=(related||[]).slice(0,4);
    $q(".vp-end").innerHTML=(rel.length&&e.id>=2?`<div class="vp-rel-t">${e.id>=5?"A seguir":"Vídeos relacionados"}</div><div class="vp-rel">${rel.map(r=>`<button data-id="${r.id}"><span style="background:${vpGrad(r.t)}">${r.e}</span>${escapeHtml(r.t)}</button>`).join("")}</div>`:"")+`<button class="vp-again" data-a="play">${VPI.replay}Assistir novamente</button>`;
    $q(".vp-end").querySelectorAll("[data-id]").forEach(b=>b.onclick=ev=>{ev.stopPropagation();onPick&&onPick(b.dataset.id)});
    $q(".vp-end [data-a]").onclick=ev=>{ev.stopPropagation();scr.classList.remove("ended");api.seek(0);api.play()};
  }
  let api;
  if(m.yt){
    // ---- YouTube real, controlado pela barra da época (postMessage, sem script externo) ----
    let ifr=null,ready=false,timer=0,poke=0,capOff=0;
    const send=(func,args=[])=>{try{ifr&&ifr.contentWindow.postMessage(JSON.stringify({event:"command",func,args}),"*")}catch(x){}};
    const fail=msg=>{clearInterval(poke);scr.classList.remove("buffering");scr.classList.add("ytfail");
      $q(".vp-end").innerHTML=`<div class="vp-fail">${msg}</div><a class="vp-again" href="https://www.youtube.com/watch?v=${m.yt}" target="_blank" rel="noopener">${VPI.play}Assistir no YouTube ↗</a>`;scr.classList.add("ended")};
    const onMsg=ev=>{if(!ifr||ev.source!==ifr.contentWindow)return;let d;try{d=typeof ev.data==="string"?JSON.parse(ev.data):ev.data}catch(x){return}
      if(!d||!d.event)return;
      if(!ready){ready=true;clearTimeout(timer);clearInterval(poke);scr.classList.remove("buffering");send("addEventListener",["onStateChange"]);send("unloadModule",["captions"]);send("unloadModule",["cc"]);send("setVolume",[vol||50]);if(muted)send("mute")}
      if(d.event==="onError")return fail("Este vídeo não pode ser reproduzido fora do YouTube.");
      const info=d.info||{};
      if(typeof info.duration==="number"&&info.duration>0)dur=info.duration;
      if(typeof info.currentTime==="number")t=info.currentTime;
      if(typeof info.videoLoadedFraction==="number")load.style.width=(info.videoLoadedFraction*100)+"%";
      const st=typeof info.playerState==="number"?info.playerState:(d.event==="onStateChange"?d.info:undefined);
      if(st===1){scr.classList.remove("ended","buffering");setPlaying(true);if(!capOff){capOff=1;send("unloadModule",["captions"]);send("setOption",["captions","track",{}])}hooks.onPlay&&hooks.onPlay()}
      else if(st===2)setPlaying(false);
      else if(st===3)scr.classList.add("buffering");
      else if(st===0)endScreen();
      draw();
    };
    addEventListener("message",onMsg);
    const start=()=>{started=true;scr.classList.add("buffering","yt");
      ifr=document.createElement("iframe");
      const origin=/^https?:/.test(location.origin)?"&origin="+encodeURIComponent(location.origin):"";
      ifr.src=`https://www.youtube-nocookie.com/embed/${m.yt}?enablejsapi=1&autoplay=1&controls=0&disablekb=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&fs=0&cc_load_policy=0&hl=pt-BR${origin}`;
      ifr.allow="autoplay; encrypted-media; picture-in-picture; fullscreen";ifr.title=m.t;ifr.className="vp-yt";
      scr.prepend(ifr);
      ifr.addEventListener("load",()=>{let n=0;poke=setInterval(()=>{if(ready||++n>20)return clearInterval(poke);try{ifr.contentWindow.postMessage(JSON.stringify({event:"listening",id:m.yt,channel:"widget"}),"*")}catch(x){}},250)});
      timer=setTimeout(()=>{if(!ready)fail("Não deu para carregar o vídeo aqui.")},(e.id<=1?9000:7000));
    };
    api={play:()=>{if(!started){if(hooks.beforeStart&&!hooks._ok){started=true;hooks.beforeStart().then(()=>{hooks._ok=1;started=false;api.play()});return}return start()}send("playVideo")},pause:()=>send("pauseVideo"),seek:s=>{t=s;draw();send("seekTo",[s,true])},
      mute:v=>send(v?"mute":"unMute"),
      volume:v=>send("setVolume",[v]),
      stop:()=>{removeEventListener("message",onMsg);clearTimeout(timer);clearInterval(poke);send("pauseVideo");if(ifr){ifr.remove();ifr=null}}};
  }
  else if(m.fb){
    // ---- vídeo que só existe no Facebook: toca dentro do mesmo player da época, controlado pelo SDK do Facebook ----
    // O vídeo já é montado parado ao abrir, para a tela mostrar a capa do próprio Facebook (um quadro do vídeo) no lugar do emoji.
    let fp=null,ready=false,timer=0,tick=0,wrap=null,subs=[],pegou=0,fbOuvinte=null,quer=false,pausouEm=0;
    const fail=msg=>{clearTimeout(timer);clearInterval(tick);scr.classList.remove("buffering");scr.classList.add("ytfail");
      $q(".vp-end").innerHTML=`<div class="vp-fail">${msg}</div><a class="vp-again" href="${escapeHtml(m.fb)}" target="_blank" rel="noopener">${VPI.play}Assistir no Facebook ↗</a>`;scr.classList.add("ended")};
    const tocar=()=>{try{fp.play()}catch(x){}
      // navegador barrou o play com som: libera o toque direto no vídeo (e deixa liberado: no celular o play pela barra pode ser barrado de novo)
      setTimeout(()=>{if(!pegou&&wrap)scr.classList.add("fbtoque")},2500)};
    // montar(false): capa parada ao abrir; montar(true): no play troca por um com autoplay (no celular o parado pedia dois toques
    // e dois players do Facebook juntos se atrapalhavam)
    const montar=auto=>{
      if(wrap)wrap.remove();ready=false;
      wrap=document.createElement("div");wrap.className="vp-yt vp-fbw";const meu=wrap;
      const id="fbv-"+Math.random().toString(36).slice(2),
        larg=Math.max(360,Math.round(Math.min(scr.clientWidth,scr.clientHeight*4/3))||480); // abaixo de ~350 px o Facebook troca o layout (vira cartão com texto); depois é escalado
      wrap.innerHTML=`<div class="fb-video" id="${id}" data-href="${escapeHtml(m.fb)}" data-width="${larg}" data-autoplay="${auto}" data-allowfullscreen="false" data-show-text="false" data-show-captions="false"></div>`;
      scr.prepend(wrap);
      carregarFB().then(FB=>{
        // o Facebook às vezes avisa "pronto" duas vezes (no celular a primeira instância nem responde): fica sempre a última
        const h=msg=>{if(!msg||msg.type!=="video"||msg.id!==id||wrap!==meu)return;
          meu.classList.add("ok");
          subs.forEach(x=>{try{x.release()}catch(y){}});subs=[];clearInterval(tick);
          const novo=!ready;fp=msg.instance;ready=true;scr.classList.add("fbok");encaixar();
          const ev=(k,f)=>{try{subs.push(fp.subscribe(k,f))}catch(x){}};
          ev("startedPlaying",()=>{pegou=1;clearTimeout(timer);scr.classList.add("yt","fbv");scr.classList.remove("ended","buffering");setPlaying(true);hooks.onPlay&&hooks.onPlay()});
          ev("paused",()=>setPlaying(false));
          ev("finishedPlaying",()=>endScreen());
          ev("startedBuffering",()=>scr.classList.add("buffering"));
          ev("finishedBuffering",()=>scr.classList.remove("buffering"));
          ev("error",()=>fail("Este vídeo não pode ser reproduzido fora do Facebook."));
          try{if(muted)fp.mute();else{fp.unmute();fp.setVolume(vol/100)}}catch(x){}
          tick=setInterval(()=>{try{const d=fp.getDuration();if(d>0)dur=d;const n=fp.getCurrentPosition()||0;
            // o celular nem sempre avisa "começou": se o tempo andou, está tocando
            if(n>t+.2&&!playing&&quer&&Date.now()-pausouEm>2000){pegou=1;clearTimeout(timer);scr.classList.remove("buffering");setPlaying(true)}t=n;if(dur)load.style.width="100%";draw();encaixar()}catch(x){}},250);
          if(novo&&quer){clearTimeout(timer);scr.classList.remove("buffering");tocar()}
        };
        const antes=fbOuvinte;antes&&antes();fbOuvinte=()=>{try{FB.Event.unsubscribe("xfbml.ready",h)}catch(x){}};
        FB.Event.subscribe("xfbml.ready",h);FB.XFBML.parse(wrap);
      }).catch(()=>{if(quer)fail("Não deu para carregar o vídeo do Facebook aqui.")});
    };
    // o Facebook não respeita a largura pedida (a janela ainda está se ajustando): o vídeo é escalado para caber na tela,
    // centralizado, e o botão de play dele fica embaixo do nosso
    const encaixar=()=>{const f=wrap&&wrap.querySelector(".fb-video"),fr=f&&f.querySelector("iframe");if(!fr)return;
      const W=fr.offsetWidth,H=fr.offsetHeight,w=scr.clientWidth,h=scr.clientHeight;if(!W||!H||!w||!h)return;
      // só a parte do vídeo (topo, 4:3) entra na tela: no celular o Facebook põe um cartão de texto embaixo, que fica cortado
      const V=Math.min(H,W*3/4),k=Math.min(w/W,h/V);f.style.transformOrigin="0 0";f.style.transform=`translate(${(w-W*k)/2}px,${(h-V*k)/2}px) scale(${k})`};
    let ro=null;try{ro=new ResizeObserver(()=>encaixar());ro.observe(scr)}catch(x){}
    montar(false);
    const start=()=>{started=true;quer=true;scr.classList.add("yt","fbv","buffering");
      subs.forEach(x=>{try{x.release()}catch(y){}});subs=[];clearInterval(tick);fp=null;
      montar(true);
      timer=setTimeout(()=>{if(!ready)fail("Não deu para carregar o vídeo do Facebook aqui.")},(e.id<=1?14000:12000));
    };
    api={play:()=>{if(!started){if(hooks.beforeStart&&!hooks._ok){started=true;hooks.beforeStart().then(()=>{hooks._ok=1;started=false;api.play()});return}return start()}try{fp&&fp.play()}catch(x){}},
      // o evento "pausou" nem sempre chega: a barra já mostra pausado (se o vídeo continuar, o tempo andando volta o estado)
      pause:()=>{try{fp&&fp.pause()}catch(x){}pausouEm=Date.now();setPlaying(false)},seek:s=>{t=s;draw();try{fp&&fp.seek(s)}catch(x){}},
      mute:v=>{try{fp&&(v?fp.mute():fp.unmute())}catch(x){}},
      volume:v=>{try{fp&&fp.setVolume(v/100)}catch(x){}},
      stop:()=>{clearTimeout(timer);clearInterval(tick);ro&&ro.disconnect();fbOuvinte&&fbOuvinte();subs.forEach(x=>{try{x.release()}catch(y){}});subs=[];try{fp&&fp.pause()}catch(x){}scr.querySelectorAll(".vp-fbw").forEach(w=>w.remove());wrap=null;fp=null}};
  }
  const toggle=()=>{if(scr.classList.contains("ended")&&!scr.classList.contains("ytfail")){scr.classList.remove("ended");api.seek(0);api.play();return}playing?api.pause():api.play()};
  root.querySelectorAll(".vp-big,.vp-pp").forEach(b=>b.onclick=ev=>{ev.stopPropagation();toggle()});
  scr.onclick=()=>{if(scr.classList.contains("ended"))return;toggle()};
  $q(".vp-track").onclick=ev=>{if(!dur)return;const r=ev.currentTarget.getBoundingClientRect();const s=Math.max(0,Math.min(dur,(ev.clientX-r.left)/r.width*dur));scr.classList.remove("ended");api.seek(s);if(!playing)api.play()};
  // som: o botão liga/desliga; a barrinha ajusta o volume (do jeito do player de cada época)
  const mb=$q(".vp-mute"),vs=$q(".vp-vs");
  const pintarVol=()=>{const v=muted?0:vol;if(mb){mb.innerHTML=v===0?VPI.mute:v<50?VPI.volLow:VPI.vol;mb.setAttribute("aria-label",muted?"Ligar o som":"Tirar o som")}
    if(vs){vs.value=String(v);vs.style.setProperty("--p",v+"%");vs.setAttribute("aria-valuetext",v===0?"sem som":v+"%")}};
  const guardar=()=>{try{localStorage.setItem("ns_vol",String(muted?0:vol))}catch(x){}};
  if(mb)mb.onclick=ev=>{ev.stopPropagation();muted=!muted;if(!muted&&vol===0)vol=50;if(!muted)api.volume(vol);api.mute(muted);pintarVol();guardar()};
  if(vs){["click","pointerdown","mousedown","touchstart"].forEach(k=>vs.addEventListener(k,ev=>ev.stopPropagation(),{passive:true}));
    vs.addEventListener("keydown",ev=>ev.stopPropagation());
    vs.oninput=()=>{const v=Math.max(0,Math.min(100,parseInt(vs.value,10)||0));if(v===0){muted=true;api.mute(true)}else{vol=v;api.volume(v);if(muted){muted=false;api.mute(false)}}pintarVol();guardar()}}
  pintarVol();
  const fb=$q(".vp-fs");if(fb)fb.onclick=ev=>{ev.stopPropagation();const st=$q(".vp-stage");try{document.fullscreenElement?document.exitFullscreen():st.requestFullscreen()}catch(x){}};
  draw();
  return {stop:()=>api.stop()};
}

const PLAYER_CSS=`
.vp{font-family:Arial,Helvetica,sans-serif;--h:auto}
.vp-stage{position:relative}
.vp-screen{position:relative;aspect-ratio:16/9;display:grid;place-items:center;overflow:hidden;cursor:pointer;background:#000}
.vp-emo{font-size:clamp(60px,12vw,110px);filter:drop-shadow(0 6px 16px #000a);transition:filter .3s}
.vp-noyt .vp-screen{cursor:default}.vp-noyt .vp-track{opacity:.4;cursor:default}
.vp-noise{position:absolute;inset:0;pointer-events:none;opacity:0}
.vp-off{position:absolute;z-index:4;left:50%;top:50%;transform:translate(-50%,-50%);max-width:82%;text-align:center;background:#000c;color:#fff;padding:12px 16px;border-radius:10px;font:13px Arial,sans-serif;display:flex;flex-direction:column;gap:4px}.vp-off small{opacity:.8;font-size:11.5px}
.vp-big{position:absolute;display:grid;place-items:center;width:68px;height:48px;border-radius:12px;background:#212121cc;color:#fff;border:0;cursor:pointer;padding:0;transition:background .15s}
.vp-big svg{width:30px;height:30px;display:block}
.vp-pp svg,.vp-ic svg{width:18px;height:18px;display:block}
.vp-again svg{width:15px;height:15px;vertical-align:-3px;margin-right:4px}
.vp-ti svg{width:12px;height:12px;display:inline-block;vertical-align:-1px;margin-right:5px}.vp-ti{font-style:normal}
.vp-screen.playing .vp-big,.vp-screen.buffering .vp-big,.vp-screen.ended .vp-big{display:none}
.vp-buf{position:absolute;display:none;flex-direction:column;align-items:center;gap:10px;color:#fff;font-size:12px;text-shadow:0 1px 3px #000}
.vp-buf span{width:34px;height:34px;border:4px solid #fff4;border-top-color:#fff;border-radius:50%;animation:vps .8s linear infinite}
@keyframes vps{to{transform:rotate(360deg)}}
.vp-screen.buffering .vp-buf{display:flex}
.vp-end{position:absolute;inset:0;background:#000d;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:14px}
.vp-screen.ended .vp-end{display:flex}
.vp-rel-t{color:#ddd;font-size:12px;align-self:flex-start}
.vp-rel{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%}
.vp-rel button{background:none;border:0;color:#ddd;font-size:11px;text-align:left;cursor:pointer;line-height:1.2}
.vp-rel button span{display:grid;place-items:center;aspect-ratio:16/9;font-size:28px;margin-bottom:4px;border:1px solid #fff2}
.vp-rel button:hover{color:#fff}
.vp-again{background:#fff2;border:1px solid #fff5;color:#fff;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px}
.vp-bar{display:flex;align-items:center;gap:10px;padding:0 10px;height:32px;font-size:11px;color:#fff;user-select:none}
.vp-pp{background:none;border:0;color:inherit;cursor:pointer;width:22px;height:22px;padding:0;display:grid;place-items:center}
.vp-track{flex:1;height:6px;position:relative;background:#555;cursor:pointer}
.vp-track i{position:absolute;left:0;top:0;bottom:0;width:0}
.vp-load{background:#999;transition:width 1.5s}
.vp-prog{background:#c00}
.vp-knob{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#eee;left:0}
.vp-ic{opacity:.85}.vp-q{font-weight:700}
.vp-era{font-family:Inter,sans-serif;font-size:11px;color:#8590ad;padding:8px 2px 0}
.vp-ytl{color:#e62117!important;font-weight:700;text-decoration:none!important}
.vp-thumb{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.9}
.vp-screen.playing .vp-thumb,.vp-screen.yt .vp-thumb,.vp-screen.yt .vp-emo{display:none}
.vp-yt{position:absolute;inset:0;width:100%;height:100%;border:0;z-index:1;pointer-events:none}
.vp-screen .vp-noise{z-index:2}.vp-screen .vp-big,.vp-screen .vp-buf,.vp-screen .vp-end{z-index:3}
.vp-fbw{display:block;background:#000;overflow:hidden}
.vp-fbw .fb-video>span,.vp-fbw iframe{display:block}
.vp-fbw{opacity:0;transition:opacity .3s}.vp-fbw .fb-video{position:absolute;left:0;top:0}.vp-fbw.ok{opacity:1}
.vp-screen.fbv .vp-big{display:none}.vp-screen.fbtoque .vp-fbw{pointer-events:auto}
.vp-e0 .vp-yt{filter:saturate(.7) contrast(1.15) blur(.6px)}.vp-e1 .vp-yt{filter:saturate(.85) blur(.35px)}
.vp-fail{color:#fff;font:600 13px Inter,sans-serif;text-align:center;max-width:80%}
a.vp-again{text-decoration:none}
.vp-ic{background:none;border:0;color:inherit;cursor:pointer;font-size:inherit;padding:0}
.vp-stage:fullscreen{background:#000;display:flex;flex-direction:column;justify-content:center}.vp-stage:fullscreen .vp-screen{aspect-ratio:auto;flex:1}
.vp h4{font-weight:700}
.vp a{color:#03c;cursor:pointer;text-decoration:underline}
/* era 0: player de mídia pré-YouTube */
.vp-e0{background:linear-gradient(#e9eef7,#c4cfe2);border:2px solid #7a8bb0;border-radius:8px;padding:0 6px 8px}
.vp-e0 .vp-title{display:flex;justify-content:space-between;background:linear-gradient(#2a5bd7,#0d2f8f);color:#fff;font:bold 12px Tahoma,Arial;padding:5px 8px;margin:0 -6px 6px;border-radius:6px 6px 0 0}
.vp-e0 .vp-stage{max-width:520px;margin:0 auto}
.vp-e0 .vp-screen{aspect-ratio:4/3;border:2px inset #889}
.vp-e0 .vp-emo{filter:blur(2.2px) saturate(.6) contrast(1.3)}
.vp-e0 .vp-noise{opacity:.35;background:repeating-linear-gradient(0deg,#000 0 1px,transparent 1px 3px)}
.vp-e0 .vp-bar{background:linear-gradient(#f4f6fb,#b9c4da);color:#123;border-radius:0 0 6px 6px;margin-top:6px}
.vp-e0 .vp-track{background:#7a8bb0;height:5px;border-radius:3px}.vp-e0 .vp-prog{background:#1fa83a}.vp-e0 .vp-knob{background:#2a5bd7;border-radius:3px;width:10px;height:14px;margin:-7px 0 0 -5px}
.vp-e0 .vp-big{background:radial-gradient(circle at 50% 30%,#6f9bff,#2a5bd7 55%,#123b9e);border-radius:50%;width:62px;height:62px;box-shadow:0 2px 6px #0008,inset 0 1px #fff8}
.u0{font:11px Tahoma,Arial;color:#334;padding:6px 2px 0}
/* era 1: 2005–2007 */
.vp-e1{background:#fff;color:#000;padding:10px;border:1px solid #ccc}
.vp-e1 .vp-screen{aspect-ratio:4/3;max-width:440px;margin:0 auto}
.vp-e1 .vp-stage{max-width:440px;margin:0 auto}
.vp-e1 .vp-emo{filter:blur(1.6px) saturate(.75)}
.vp-e1 .vp-noise{opacity:.18;background:repeating-linear-gradient(90deg,#000 0 2px,transparent 2px 4px)}
.vp-e1 .vp-bar{background:linear-gradient(#f2f2f2,#c8c8c8);color:#333;border:1px solid #999;border-top:0;height:26px}
.vp-e1 .vp-track{height:8px;background:#e6e6e6;border:1px solid #999}.vp-e1 .vp-prog{background:#8a8a8a}.vp-e1 .vp-load{background:#d0d0d0}.vp-e1 .vp-knob{background:#fff;border:1px solid #777;border-radius:2px;width:9px;height:14px;margin:-7px 0 0 -4px}
.vp-e1 .vp-big{background:linear-gradient(#fdfdfd,#cfcfcf);color:#555;border:1px solid #888;border-radius:50%;width:58px;height:58px;box-shadow:0 2px 6px #0007}.vp-e1 .vp-big svg{width:30px;height:30px;margin-left:3px}
.u1{max-width:440px;margin:8px auto 0;font-size:12px}.u1 h4{font-size:15px;margin-bottom:3px}.u1 .st{color:#f90;font-size:15px}.u1 small{color:#666}.ul{color:#333;margin-top:4px}
/* era 2: 2008–2009 */
.vp-e2{background:#f1f1f1;color:#222;padding:10px;border:1px solid #ccc}
.vp-e2 .vp-emo{filter:blur(.9px)}
.vp-e2 .vp-bar{background:linear-gradient(#4a4a4a,#111);border-top:1px solid #666}
.vp-e2 .vp-track{height:7px;background:#333;border-radius:2px}.vp-e2 .vp-load{background:#666}.vp-e2 .vp-prog{background:linear-gradient(#f33,#a00)}.vp-e2 .vp-knob{background:linear-gradient(#fff,#bbb);width:13px;height:13px}
.vp-e2 .vp-big{background:linear-gradient(#5a5a5acc,#0d0d0dcc);border:1px solid #ffffff40;border-radius:10px;width:64px;height:46px;box-shadow:inset 0 1px #ffffff55}
.vp-e2 .vp-q{background:#c00;padding:1px 4px;border-radius:2px;font-size:10px}
.u2{margin-top:8px}.u2 h4{font-size:16px}.u2r{display:flex;gap:14px;font-size:12px;color:#555;margin-top:4px;flex-wrap:wrap}.u2 .st{color:#f90}.u2 .hq{color:#03c;text-decoration:underline}
/* era 3: 2010–2012 */
.vp-e3{background:#fff;color:#222;padding:10px;border:1px solid #ddd}
.vp-e3 .vp-big{background:linear-gradient(#3a3a3ae6,#111e6);border-radius:8px;width:66px;height:46px}.vp-e3 .vp-screen:hover .vp-big{background:linear-gradient(#4a4a4af0,#000f)}
.vp-e3 .vp-bar{background:linear-gradient(#2b2b2b,#141414)}
.vp-e3 .vp-track{height:5px;background:#3a3a3a}.vp-e3 .vp-load{background:#777}.vp-e3 .vp-prog{background:#cc181e}.vp-e3 .vp-knob{background:#eee;width:12px;height:12px;box-shadow:0 0 3px #000}
.u3{margin-top:8px}.u3 h4{font-size:18px;font-weight:400}.u3r{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:12px}.u3 .ch{font-weight:700}
.sub3{background:linear-gradient(#ffe066,#f6c000);border:1px solid #d8a800;border-radius:3px;font:bold 11px Arial;padding:4px 10px;color:#333}
.u3 .vw{margin-left:auto;font-size:18px;color:#222}
.u3l{display:flex;align-items:center;gap:10px;font-size:11px;color:#555;flex-wrap:wrap}.u3l span{border:1px solid #ccc;border-radius:3px;padding:3px 8px;background:#f8f8f8}
.u3l i{width:140px;height:4px;background:#c00;display:block}.u3l s{display:block;height:100%;background:#390}
/* era 4: 2013–2016 */
.vp-e4{background:#fff;color:#222;padding:0 0 10px;font-family:Roboto,Arial,sans-serif}
.vp-e4 .vp-bar{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(transparent,#000c);height:38px;opacity:0;transition:.2s}
.vp-e4 .vp-stage:hover .vp-bar,.vp-e4 .vp-screen:not(.playing)+.vp-bar{opacity:1}
.vp-e4 .vp-track{position:absolute;left:10px;right:10px;top:2px;height:3px;background:#fff4}.vp-e4 .vp-load{background:#fff6}.vp-e4 .vp-prog{background:#e52d27}.vp-e4 .vp-knob{background:#e52d27;width:12px;height:12px}
.vp-e4 .vp-bar{padding-top:10px}.vp-e4 .vp-time{margin-right:auto}
.vp-e4 .vp-big{background:#1f1f1fe6;border-radius:12px}.vp-e4 .vp-screen:hover .vp-big,.vp-e4 .vp-big:focus-visible{background:#111}
.u4{padding:10px 12px 0}.u4 h4{font-size:18px;font-weight:400}.u4r{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13px}.av4{width:30px;height:30px;border-radius:50%;background:#eee;display:grid;place-items:center}
.sub4{background:#e62117;color:#fff;border:0;border-radius:2px;padding:6px 10px;font:500 12px Roboto,Arial}.sub4 em{font-style:normal;background:#fff;color:#666;padding:2px 6px;margin-left:6px;border-radius:2px}
.u4 .vw{margin-left:auto;font-size:16px;font-weight:400;color:#666}
.u4l{display:flex;gap:14px;align-items:center;font-size:12px;color:#666;justify-content:flex-end}.u4l i{width:150px;height:2px;background:#ccc;display:block}.u4l s{display:block;height:100%;background:#167ac6}
/* era 5: atual */
.vp-e5{background:#0f0f0f;color:#f1f1f1;font-family:Roboto,Arial,sans-serif;padding-bottom:10px}
.vp-e5 .vp-screen{border-radius:12px}
.vp-e5 .vp-bar{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(transparent,#000d);height:42px;border-radius:0 0 12px 12px;padding-top:12px;opacity:0;transition:.2s}
.vp-e5 .vp-stage:hover .vp-bar,.vp-e5 .vp-screen:not(.playing)+.vp-bar{opacity:1}
.vp-e5 .vp-track{position:absolute;left:12px;right:12px;top:4px;height:3px;background:#fff3;border-radius:2px}.vp-e5 .vp-load{background:#fff5}.vp-e5 .vp-prog{background:#f00}.vp-e5 .vp-knob{background:#f00;width:13px;height:13px}
.vp-e5 .vp-time{margin-right:auto}
.vp-e5 .vp-big{background:#212121cc;border-radius:14px}.vp-e5 .vp-screen:hover .vp-big,.vp-e5 .vp-big:focus-visible{background:#0f0f0f}
.u5{padding:12px 4px 0}.u5 h4{font-size:19px}.u5r{display:flex;align-items:center;gap:10px;margin:10px 0;font-size:13px;flex-wrap:wrap}.u5 .ch{font-weight:600;display:flex;flex-direction:column}.u5 .ch small{color:#aaa;font-weight:400;font-size:11px}.u5 .av4{background:#333}
.sub5{background:#f1f1f1;color:#0f0f0f;border:0;border-radius:99px;padding:8px 14px;font:600 13px Roboto,Arial}
.u5 .pill{background:#272727;border-radius:99px;padding:7px 12px;font-size:12px}.u5r .pill:first-of-type{margin-left:auto}
.u5d{background:#272727;border-radius:10px;padding:10px 12px;font-size:12px}
.vp-vert .vp-big{background:none;width:76px;height:76px}.vp-vert .vp-big svg{width:66px;height:66px;opacity:.9;filter:drop-shadow(0 2px 8px #000a)}.vp-vert .vp-screen:hover .vp-big{background:none}
/* volume: botão + barrinha (aparece ao passar o mouse, como no YouTube de 2008 em diante; sempre visível nos players antigos) */
.vp-vol{display:inline-flex;align-items:center;gap:6px}
.vp-vs{-webkit-appearance:none;appearance:none;width:0;opacity:0;height:16px;margin:0;padding:0;background:transparent;cursor:pointer;transition:width .18s,opacity .18s;--vt:#ffffff40;--vf:#fff;--vk:#fff}
.vp-vol:hover .vp-vs,.vp-vol:focus-within .vp-vs{width:64px;opacity:1}
.vp-vs::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:linear-gradient(90deg,var(--vf) var(--p,100%),var(--vt) var(--p,100%))}
.vp-vs::-moz-range-track{height:3px;border-radius:2px;background:var(--vt)}
.vp-vs::-moz-range-progress{height:3px;border-radius:2px;background:var(--vf)}
.vp-vs::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;margin-top:-4.5px;border-radius:50%;background:var(--vk);border:0;box-shadow:0 0 2px #0008}
.vp-vs::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--vk);border:0;box-shadow:0 0 2px #0008}
.vp-vs:focus-visible{outline:2px solid #ffbf00;outline-offset:2px}
/* até 2004 (player de mídia): barra azul sempre visível */
.vp-e0 .vp-vs{width:58px;opacity:1;--vt:#7a8bb0;--vf:#1fa83a;--vk:#2a5bd7}
.vp-e0 .vp-vs::-webkit-slider-thumb{border-radius:3px;width:8px;height:13px;margin-top:-5px}.vp-e0 .vp-vs::-moz-range-thumb{border-radius:3px;width:8px;height:13px}
/* 2005–2007: barrinha cinza sempre visível */
.vp-e1 .vp-vs{--vt:#e6e6e6;--vf:#8a8a8a;--vk:#fff}
.vp-e1 .vp-vs::-webkit-slider-runnable-track{height:6px;border:1px solid #999;border-radius:0}.vp-e1 .vp-vs::-moz-range-track{height:6px;border:1px solid #999;border-radius:0}
.vp-e1 .vp-vs::-webkit-slider-thumb{border-radius:2px;width:8px;height:13px;margin-top:-4.5px;border:1px solid #777}.vp-e1 .vp-vs::-moz-range-thumb{border-radius:2px;width:8px;height:13px;border:1px solid #777}
/* 2008–2009: preto brilhante com miolo vermelho */
.vp-e2 .vp-vs{--vt:#333;--vf:#d22;--vk:#ddd}
/* 2010 em diante: branco, como o YouTube */
.vp-e3 .vp-vs,.vp-e4 .vp-vs,.vp-e5 .vp-vs{--vt:#ffffff40;--vf:#fff;--vk:#fff}
.vp-e0 .vp-vol .vp-vs{width:44px;opacity:1}
/* 2005–2007: o player era estreito, então a barrinha abre numa caixinha cinza em cima do alto-falante (sem espremer a barra) */
.vp-e1 .vp-vol{position:relative}
.vp-e1 .vp-vol::before{content:"";position:absolute;left:-30px;right:-30px;bottom:100%;height:12px}
.vp-e1 .vp-vol .vp-vs{position:absolute;left:50%;bottom:calc(100% + 8px);width:84px;height:26px;margin-left:-42px;padding:0 8px;box-sizing:border-box;background:linear-gradient(#f7f7f7,#cfcfcf);border:1px solid #999;border-radius:3px;box-shadow:0 2px 6px #0004;opacity:0;pointer-events:none;z-index:6}
.vp-e1 .vp-vol:hover .vp-vs,.vp-e1 .vp-vol:focus-within .vp-vs{width:84px;opacity:1;pointer-events:auto}
.vp-time{white-space:nowrap}
@media(max-width:600px){.vp-vol{display:inline-flex}.vp-vol .vp-mute{display:grid}.vp-vs{display:none}.vp-e0 .vp-vs,.vp-e1 .vp-vs{display:none}}
/* 2013 em diante a barra fica por cima do vídeo: precisa ficar acima do iframe do YouTube (z-index 1), senão some ao tocar.
   Em tela de toque (sem "passar o mouse") ela fica sempre visível */
.vp-e4 .vp-bar,.vp-e5 .vp-bar{z-index:4}
@media(hover:none){.vp-e4 .vp-bar,.vp-e5 .vp-bar{opacity:1}}
@media(max-width:600px){.vp-rel{grid-template-columns:repeat(2,1fr)}.vp-ic{display:none}}`;
(function(){const s=document.createElement("style");s.textContent=PLAYER_CSS;document.head.appendChild(s)})();
