// =====================================================================
//  NÃO SALVO — tela do vídeo/foto no visual da época
//  Vídeos: página no estilo do YouTube do ano do meme (canal Não Salvo; logo próprio que lembra o YouTube, não o oficial).
//  Fotos: página no estilo da rede social de fotos da época.
//  Votos (curtidas/estrelas) e visualizações vêm das funções do Netlify
//  (/api/votos e /api/yt-stats). Sem elas, funciona só no navegador.
// =====================================================================
const API={votos:"/api/votos",stats:"/api/yt-stats"};
const CANAL="Não Salvo",AV="avatar-ns.png";
// canal real do vídeo no YouTube (data.js: canal); avatar com a inicial do canal
// todos os canais e perfis do player são do Não Salvo (o canal original do YouTube fica guardado em m.canal)
const canal=m=>escapeHtml(CANAL);
const AVC=["#e53935","#8e24aa","#3949ab","#00897b","#f4511e","#6d4c41","#1e88e5","#43a047","#c0ca33","#fb8c00"];
function avSrc(m){return AV;if(!m||!m.canal)return AV;const n=m.canal.trim(),L=(n.match(/[A-Za-zÀ-ÿ0-9]/)||["?"])[0].toUpperCase();let h=0;for(const c of n)h=(h*31+c.charCodeAt(0))>>>0;
  return"data:image/svg+xml,"+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${AVC[h%AVC.length]}"/><text x="20" y="27" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="#fff" text-anchor="middle">${L}</text></svg>`)}
const MESES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
async function apiGet(u){try{const r=await fetch(u,{headers:{accept:"application/json"}});if(!r.ok)return null;const t=r.headers.get("content-type")||"";return t.includes("json")?await r.json():null}catch(e){return null}}
async function apiPost(u,b){try{const r=await fetch(u,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)});if(!r.ok)return null;return await r.json()}catch(e){return null}}
const STATS={};
async function ytStats(ids){ids=ids.filter(i=>i&&!(i in STATS));if(ids.length){const d=await apiGet(API.stats+"?ids="+ids.join(","));ids.forEach(i=>STATS[i]=d&&d[i]?d[i]:null)}return STATS}

// ---- votos: curtir/não curtir e estrelas ----
// o voto da pessoa vem do servidor (um voto por pessoa e por meme: curtir de novo não soma, e não some ao limpar o navegador)
const VOTOS_MEUS={};
function myVote(id){return VOTOS_MEUS[id]||(VOTOS_MEUS[id]={v:0,s:0})}
const logado=()=>typeof SESSAO!=="undefined"&&!!(SESSAO&&SESSAO.usuario);
async function loadMeuVoto(id){if(!logado()||typeof Api==="undefined"||!Api.meusVotos)return null;try{const d=await Api.meusVotos([id],{silencioso:true});if(d&&d[id]){VOTOS_MEUS[id]={v:d[id].v|0,s:d[id].s|0};return VOTOS_MEUS[id]}}catch(e){}return null}
async function loadVotes(id){const d=await apiGet(API.votos+"?ids="+encodeURIComponent(id));return d&&d[id]?d[id]:null}
function localTotals(id){return{up:0,down:0,sum:0,n:0,local:true}} // enquanto os totais do servidor não chegam
async function sendVote(id,patch){return Api.votar({id,...patch},{silencioso:true})} // exige login (CSRF pelo cliente da API)

// ---- formatos de data e números por época ----
const ago=y=>{const n=Math.max(1,new Date().getFullYear()-(parseInt(y)||2020));return`há ${n} ano${n>1?"s":""}`};
const dExt=d=>{const x=new Date((d||"2010-01-01")+"T12:00:00");return`${x.getDate()} de ${MESES[x.getMonth()]} de ${x.getFullYear()}`};
const dNum=d=>{const x=new Date((d||"2010-01-01")+"T12:00:00");return x.toLocaleDateString("pt-BR")};
const short=n=>n>=1e6?(n/1e6).toFixed(n>=1e7?0:1).replace(".",",")+" mi":n>=1e3?(n/1e3).toFixed(n>=1e4?0:1).replace(".",",")+" mil":String(n);

// ---- sons da época (gerados na hora, sem arquivos) ----
const SND={on:true,ctx:null};
try{const s=localStorage.getItem("ns_snd");if(s)SND.on=s==="1"}catch(e){}
function actx(){if(!SND.ctx){try{SND.ctx=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}if(SND.ctx&&SND.ctx.state==="suspended")SND.ctx.resume();return SND.ctx}
function tone(c,fs,t,d,v,type){fs.forEach(f=>{const o=c.createOscillator(),g=c.createGain();o.type=type||"sine";o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);g.gain.setValueAtTime(v,t+d-.02);g.gain.linearRampToValueAtTime(0,t+d);o.connect(g).connect(c.destination);o.start(t);o.stop(t+d+.02)})}
function sweep(c,f1,f2,t,d,v,type){const o=c.createOscillator(),g=c.createGain();o.type=type||"square";o.frequency.setValueAtTime(f1,t);o.frequency.linearRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(v,t);g.gain.setValueAtTime(0,t+d);o.connect(g).connect(c.destination);o.start(t);o.stop(t+d+.02)}
function hiss(c,t,d,v,f){const n=Math.floor(c.sampleRate*d),b=c.createBuffer(1,n,c.sampleRate),x=b.getChannelData(0);for(let i=0;i<n;i++)x[i]=Math.random()*2-1;const s=c.createBufferSource(),bp=c.createBiquadFilter(),g=c.createGain();s.buffer=b;bp.type="bandpass";bp.frequency.value=f||1800;bp.Q.value=.7;g.gain.setValueAtTime(v,t);g.gain.linearRampToValueAtTime(0,t+d);s.connect(bp).connect(g).connect(c.destination);s.start(t)}
const DTMF={0:[941,1336],1:[697,1209],2:[697,1336],3:[697,1477],4:[770,1209],5:[770,1336],6:[770,1477],7:[852,1209],8:[852,1336],9:[852,1477]};
function sndModem(){if(!SND.on)return;const c=actx();if(!c)return;let t=c.currentTime+.05;
  tone(c,[350,440],t,.9,.05);t+=1;
  for(const d of "08004441956"){tone(c,DTMF[d],t,.08,.06);t+=.12}
  t+=.3;tone(c,[440,480],t,.9,.04);t+=1.3;
  tone(c,[2100],t,1.1,.05);t+=1.15;
  for(let i=0;i<14;i++){sweep(c,980+Math.random()*400,1180+Math.random()*1200,t,.09,.025);t+=.1}
  hiss(c,t-.6,2.2,.09,2000);for(let i=0;i<10;i++){tone(c,[1200+(i%2)*1200],t,.07,.02,"square");t+=.08}
  hiss(c,t,1.4,.07,1600)}
function sndChime(){if(!SND.on)return;const c=actx();if(!c)return;const t=c.currentTime+.02;[[740,0],[988,.11],[1319,.22]].forEach(([f,o])=>tone(c,[f],t+o,.32,.05,"triangle"))}
function sndPop(){if(!SND.on)return;const c=actx();if(!c)return;const t=c.currentTime+.02;sweep(c,520,1040,t,.09,.05,"sine");tone(c,[1040],t+.09,.08,.03)}
function sndClick(){if(!SND.on)return;const c=actx();if(!c)return;hiss(c,c.currentTime+.01,.04,.08,3000)}

// ---- configuração de cada época ----
function vEra(y){y=parseInt(y)||2020;return y<=2004?0:y<=2007?1:y<=2009?2:y<=2012?3:y<=2016?4:5}
function pEra(y){y=parseInt(y)||2020;return y<=2006?"fotolog":y<=2011?"orkut":y<=2014?"tumblr":y<=2015?"ig15":"ig"}
const discada=y=>(parseInt(y)||2020)<=2006, lanhouse=y=>{y=parseInt(y)||0;return y>=2004&&y<=2009};
const TOAST=y=>{y=parseInt(y)||0;return y>=2007&&y<=2009?{t:"msn",h:"Fernandinha acabou de entrar.",s:sndChime}:y>=2010&&y<=2012?{t:"scrap",h:"Você tem 1 scrap novo: “kkkkk viu esse vídeo???”",s:sndPop}:y>=2013&&y<=2016?{t:"zap",h:"Família ❤ · 47 mensagens novas",s:sndPop}:null};

// ---- partes comuns ----
const relList=(rel,n)=>rel.slice(0,n||8);
const thumb=(r,c)=>(r.img||r.yt)?`<span class="${c||"th"}" style="background-image:url(${r.img||"https://i.ytimg.com/vi/"+r.yt+"/mqdefault.jpg"}),${vpGrad(r.t)}"></span>`:`<span class="${c||"th"}" style="background:${vpGrad(r.t)}">${r.art||""}</span>`;
function relHTML(e,rel){
  const L=relList(rel,e===5?10:8);
  if(e===1)return`<div class="rel1"><h5>Vídeos relacionados</h5>${L.map(r=>`<a class="ri" data-id="${r.id}">${thumb(r)}<span><b>${escapeHtml(r.t)}</b><small>De: <u>${canal(r)}</u></small><small>Exibições: ${fmt(r.views)}</small></span></a>`).join("")}</div>`;
  if(e===2)return`<div class="rel2"><h5>Vídeos relacionados</h5>${L.map(r=>`<a class="ri" data-id="${r.id}">${thumb(r)}<span><b>${escapeHtml(r.t)}</b><small>${fmt(r.views)} exibições</small><small>${canal(r)}</small></span></a>`).join("")}</div>`;
  if(e===3)return`<div class="rel3"><h5>Vídeos sugeridos</h5>${L.map(r=>`<a class="ri" data-id="${r.id}">${thumb(r)}<span><b>${escapeHtml(r.t)}</b><small>de ${canal(r)}</small><small>${fmt(r.views)} exibições</small></span></a>`).join("")}</div>`;
  if(e===4)return`<div class="rel4"><h5>A seguir <em>REPRODUÇÃO AUTOMÁTICA <i></i></em></h5>${L.map(r=>`<a class="ri" data-id="${r.id}">${thumb(r)}<span><b>${escapeHtml(r.t)}</b><small>${canal(r)}</small><small>${fmt(r.views)} visualizações</small></span></a>`).join("")}</div>`;
  return`<div class="rel5"><div class="chipsr"><b>Tudo</b><span>Do ${CANAL}</span><span>Relacionados</span></div>${L.map(r=>`<a class="ri" data-id="${r.id}">${thumb(r)}<span><b>${escapeHtml(r.t)}</b><small>${canal(r)} ${icon("check","vf")}</small><small>${short(r.views)} visualizações · ${ago(r.y)}</small></span></a>`).join("")}</div>`;
}
const headBar=e=>{
  const logo=`<span class="yl ylt" role="img" aria-label="YouTube"><svg viewBox="0 0 34 30" aria-hidden="true"><path d="M11 2l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="1.5" y="8" width="31" height="20.5" rx="5" fill="currentColor"/><rect x="5" y="11.5" width="24" height="13.5" rx="3" class="tela"/><path d="M14.5 14.5v7.5l6.5-3.75z" fill="currentColor"/></svg><b>YouTube</b></span>`,snd=`<button class="snd" data-act="snd" title="Sons da época">${icon(SND.on?"volume":"mute")}<span>Sons da época</span></button>`,x=`<button class="vx" data-act="close" title="Fechar (Esc)">${icon("xmark")}</button>`;
  if(e===1)return`<header class="yh1"><div class="t1">${logo}<div class="lk"><a>Cadastre-se</a> | <a>Login</a> | <a>Ajuda</a>${snd}${x}</div></div><nav><a class="on">Vídeos</a><a>Categorias</a><a>Canais</a><a>Comunidade</a></nav><div class="sr"><input placeholder=""><button>Pesquisar</button><a>Enviar vídeos</a></div></header>`;
  if(e===2)return`<header class="yh2">${logo}<div class="sr"><input><button>Pesquisar</button></div><a class="up">Enviar</a><div class="lk">${snd}${x}</div></header>`;
  if(e===3)return`<header class="yh3">${logo}<div class="sr"><input><button>${icon("search")}</button></div><a class="up">Enviar</a><div class="lk">${snd}${x}</div></header>`;
  if(e===4)return`<header class="yh4"><i class="mn">${icon("menu")}</i>${logo}<div class="sr"><input placeholder="Pesquisar"><button>${icon("search")}</button></div><div class="lk"><i>${icon("upload")}</i>${snd}${x}</div></header>`;
  return`<header class="yh5"><i class="mn">${icon("menu")}</i>${logo}<div class="sr"><input placeholder="Pesquisar"><button>${icon("search")}</button><i class="mc">${icon("mic")}</i></div><div class="lk"><i>${icon("upload")}</i><i>${icon("bell")}</i>${snd}${x}</div></header>`;
};
const btns=y=>`<div class="vbs"><button class="vb" data-act="year">Ver o ano ${y}</button><button class="vb mp" data-act="wiki">${icon("book","in")}Memepédia</button><button class="vb sec" data-act="close">Fechar</button></div>`;
// equipe/moderação (editaDireto): adiciona ou troca o link de qualquer meme, publicado na hora
const linkEquipe=()=>typeof editaDireto==="function"&&editaDireto();
const linkBox=m=>linkEquipe()?`<div class="lbx"><b>${m.yt?"Trocar o link do vídeo":"Vídeo original não encontrado."}</b> Você é da equipe: o link entra direto, sem moderação.<div class="in"><input class="ol" placeholder="https://youtube.com/watch?v=…"><button data-act="savelink">${m.yt?"Trocar link":"Publicar link"}</button></div><div class="olm"></div></div>`
  :m.yt?"":`<div class="lbx"><b>Vídeo original não encontrado.</b> Conhece o link no YouTube? Envie para a moderação conferir.<div class="in"><input class="ol" placeholder="https://youtube.com/watch?v=…"><button data-act="savelink">Enviar para a moderação</button></div><div class="olm"></div></div>`;
const descTxt=m=>escapeHtml(m.d||"");

// ---- notas: estrelas (2004–2009) ou curtidas (2010+) ----
function ratingHTML(e,tot,mine){
  if(e<=2){const avg=tot.n?tot.sum/tot.n:0,shown=mine.s||Math.round(avg);
    return`<div class="stars s${e}" data-stars>${[1,2,3,4,5].map(i=>`<button data-star="${i}" class="${i<=shown?"on":""}" title="${["Ruim","Mais ou menos","Bom","Muito bom","Excelente!"][i-1]}">${icon("star")}</button>`).join("")}<small>${tot.n?`${fmt(tot.n)} avaliaç${tot.n>1?"ões":"ão"}${tot.local?"":` · média ${avg.toFixed(1).replace(".",",")}`}`:"Seja o primeiro a avaliar"}${mine.s?" · sua nota: "+mine.s:""}</small></div>`}
  const pct=tot.up+tot.down?tot.up/(tot.up+tot.down)*100:0;
  if(e===3)return`<div class="lk3"><button data-like="1" class="${mine.v===1?"on":""}">${icon("thumbUp")}Gostei</button><button data-like="-1" class="${mine.v===-1?"on":""}">${icon("thumbDown")}</button><span class="bar"><i style="width:${pct}%"></i></span><small>${fmt(tot.up)} curtida${tot.up===1?"":"s"}, ${fmt(tot.down)} não curti${tot.down===1?"u":"ram"}</small></div>`;
  if(e===4)return`<div class="lk4"><button data-like="1" class="${mine.v===1?"on":""}">${icon("thumbUp")}<span>${fmt(tot.up)}</span></button><button data-like="-1" class="${mine.v===-1?"on":""}">${icon("thumbDown")}<span>${fmt(tot.down)}</span></button><span class="bar"><i style="width:${pct}%"></i></span></div>`;
  return`<div class="lk5"><button data-like="1" class="${mine.v===1?"on":""}">${icon("thumbUp")}<span>${short(tot.up)}</span></button><i></i><button data-like="-1" class="${mine.v===-1?"on":""}">${icon("thumbDown")}</button></div>`;
}

// ---- página do vídeo por época ----
function videoPage(m,rel){
  const e=vEra(m.y),T=escapeHtml(m.t),pl=playerHTML(m,true);
  const vw=`<span class="vwc" data-views></span>`;
  if(e===0)return`<div class="xp">
    <div class="xpw wmp"><div class="xtb"><span>${icon("video","xi")}${escapeHtml(m.id)}.wmv - Reprodutor de Mídia</span><span class="xc"><i>_</i><i>□</i><b data-act="close">✕</b></span></div>
      <div class="xmn"><span>Arquivo</span><span>Exibir</span><span>Reproduzir</span><span>Ferramentas</span><span>Ajuda</span></div>
      <div class="xbody">${pl}</div>
      <div class="xinfo"><h2>${T}</h2><p>${descTxt(m)}</p><div class="xmeta">Recebido por e-mail em ${dNum(m.date)} · ${escapeHtml(m.c)} · ${vw}</div>
        <div class="xrt"><b>Gostou? Dê sua nota antes de encaminhar para 10 amigos:</b><div data-rt></div><button class="xsh" data-act="share">${icon("mail","in")}Encaminhar link</button></div>${linkBox(m)}${btns(m.y)}</div></div>
    <div class="xtask"><span class="xstart">iniciar</span><span class="xt on">${icon("video","xi")}Reprodutor de Mídia</span><span class="xtray">${icon("culture","xi")}Conectado a 52,0 Kbps <b data-clock></b></span></div></div>`;
  const chan=(k)=>{
    if(k===1)return`<div class="cb1"><img src="${avSrc(m)}" alt=""><div><small>De:</small> <a>${canal(m)}</a><br><small>Adicionado: ${dExt(m.date)}</small><br><span class="vs1">${icon("check","in")}Inscrito</span></div><p>${descTxt(m)}</p><dl><dt>Categoria:</dt><dd><a>${escapeHtml(m.c)}</a></dd><dt>Tags:</dt><dd><a>meme</a> <a>${m.y}</a> <a>viral</a> <a>naosalvo</a></dd></dl></div>`;
    if(k===2)return`<div class="cb2"><div class="r"><img src="${avSrc(m)}" alt=""><div><a>${canal(m)}</a><small>${dNum(m.date)}</small></div><span class="vs2">${icon("check","in")}Inscrito</span></div><p>${descTxt(m)}</p></div>`;
  };
  if(e===1)return`<div class="ytp e1">${headBar(1)}<div class="yc"><main><h1>${T}</h1>${pl}
    <div class="ub1"><div data-rt></div><div class="vw1">Exibições: <b>${vw}</b></div></div>
    <div class="tabs1"><a data-act="share">Compartilhar</a><a>Favoritos</a><a>Adicionar a listas</a><a>Sinalizar</a></div>${chan(1)}${linkBox(m)}${btns(m.y)}</main></div></div>`;
  if(e===2)return`<div class="ytp e2">${headBar(2)}<div class="yc"><main><h1>${T}</h1>${pl}
    <div class="ub2"><div data-rt></div><div class="vw2">${vw}</div></div>
    <div class="tabs2"><a>${icon("heart","in")}Favorito</a><a data-act="share">${icon("share","in")}Compartilhar</a><a>Listas de reprodução</a><a>Sinalizar</a></div>${chan(2)}${linkBox(m)}${btns(m.y)}</main></div></div>`;
  if(e===3)return`<div class="ytp e3">${headBar(3)}<div class="yc"><main><h1>${T}</h1>${pl}
    <div class="ub3"><div class="cr"><img src="${avSrc(m)}" alt=""><a>${canal(m)}</a><span class="vs3">${icon("check","in")}Inscrito</span></div><div class="vw3">${vw}</div></div>
    <div class="ac3"><div data-rt></div><span class="a">Adicionar a</span><span class="a" data-act="share">Compartilhar</span></div>
    <div class="ds3"><b>Enviado em ${dExt(m.date)}</b><p>${descTxt(m)}</p><small>Categoria: <a>${escapeHtml(m.c)}</a></small></div>${linkBox(m)}${btns(m.y)}</main></div></div>`;
  if(e===4)return`<div class="ytp e4">${headBar(4)}<div class="yc"><main>${pl}<h1>${T}</h1>
    <div class="ub4"><div class="cr"><img src="${avSrc(m)}" alt=""><div><a>${canal(m)}</a></div><span class="vs4">${icon("check","in")}Inscrito</span></div><div class="vw4">${vw}</div></div>
    <div class="ac4"><span data-act="share">${icon("share","in")}Compartilhar</span><span>${icon("more","in")}Mais</span><div data-rt></div></div>
    <div class="ds4"><b>Publicado em ${dExt(m.date)}</b><p>${descTxt(m)}</p><small>Categoria <a>${escapeHtml(m.c)}</a></small></div>${linkBox(m)}${btns(m.y)}</main></div></div>`;
  return`<div class="ytp e5">${headBar(5)}<div class="yc"><main>${pl}<h1>${T}</h1>
    <div class="ub5"><div class="cr"><img src="${avSrc(m)}" alt=""><div><a>${canal(m)} ${icon("check","vf")}</a></div><span class="vs5">${icon("bell","in")}Inscrito</span></div><div class="ac5"><div data-rt></div><span class="p" data-act="share">${icon("share","in")}Compartilhar</span><span class="p">${icon("more","in")}</span></div></div>
    <div class="ds5"><b>${vw} ${ago(m.y)}</b> <span class="tg">#${escapeHtml(m.c.toLowerCase())} #meme #${m.y}</span><p>${descTxt(m)}</p></div>${linkBox(m)}${btns(m.y)}</main></div></div>`;
}

// ---- vídeos verticais (2020+): visual de app de vídeo curto ----
function shortPage(m){
  const T=escapeHtml(m.t),pl=playerHTML(m,true),c=canal(m),h="@"+(("naosalvo").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9_.]+/g,""));
  const x=`<button class="vx" data-act="close" title="Fechar (Esc)">${icon("xmark")}</button>`,snd=`<button class="snd" data-act="snd" title="Sons da época">${icon(SND.on?"volume":"mute")}<span>Sons da época</span></button>`;
  return`<div class="tkp"><header class="tkh"><span class="tkt"><b>Para você</b><span>Seguindo</span></span><div class="lk">${snd}${x}</div></header>
    <div class="tkw"><div class="tkv">${pl}
      <div class="tko"><b>${escapeHtml(h)}</b><p>${T}</p><small>♫ som original · ${c}</small></div>
      <div class="tkr"><span class="tka"><img src="${avSrc(m)}" alt=""><i>+</i></span><div data-rt></div><span class="tki">${icon("comment")}<small>${short(Math.round((m.saves||100)*1.3))}</small></span><span class="tki" data-act="share">${icon("share")}<small>Compartilhar</small></span></div></div>
      <div class="tkd"><div class="tkc"><img src="${avSrc(m)}" alt=""><div><b>${c}</b><small>${escapeHtml(h)} · ${dNum(m.date)}</small></div><span class="tkf">Seguir</span></div>
        <h1>${T}</h1><p>${descTxt(m)}</p><div class="tg">#${escapeHtml(m.c.toLowerCase())} #meme #${m.y} #fyp</div><div class="vwc5"><span data-views></span></div>${btns(m.y)}</div></div></div>`;
}

// ---- página da foto por rede social ----
function photoPage(m,rel){
  const k=pEra(m.y),T=escapeHtml(m.t);
  const photoCredit=m=>m.credit?`<small class="pcred">Imagem: <a href="${escapeHtml(m.credit.url)}" target="_blank" rel="noopener">${escapeHtml(m.credit.by)}</a> · direitos dos autores originais</small>`:"";
  const img=m.img?`<img class="pimg" src="${escapeHtml(m.img)}" alt="${T}" referrerpolicy="no-referrer">${photoCredit(m)}`:`<div class="pimg ph" style="background:${vpGrad(m.t)}">${m.art||""}<small>foto do acervo</small></div>`;
  const x=`<button class="vx" data-act="close" title="Fechar (Esc)">${icon("xmark")}</button>`;
  if(k==="fotolog")return`<div class="pg fotolog"><header><b class="fl">fotolog</b><span>${CANAL.toLowerCase().replace(" ","")}</span>${x}</header>
    <div class="flw"><main><div class="fr">${img}</div><h2>${T}</h2><p class="fx">${descTxt(m)}<br><i>~*~ postado em ${dNum(m.date)} ~*~ flash no espelho não ~*~</i></p>
      <div class="gb"><h4>livro de visitas</h4><div data-like-photo></div><div class="cmt" data-cmts></div></div>${btns(m.y)}</main></div></div>`;
  if(k==="orkut")return`<div class="pg orkut"><header><b class="ok">orkut</b><nav><a>Início</a><a>Perfil</a><a>Recados</a><a>Amigos</a><a>Comunidades</a></nav>${x}</header>
    <div class="okw"><aside class="okp"><img src="${AV}" alt=""><b>${CANAL}</b><small>masculino, enrolado, Brasil</small><a>recados</a><a>fotos</a><a>vídeos</a><a>depoimentos</a></aside>
    <main><div class="okb">Início › ${CANAL} › Álbuns › Memes ${m.y}</div><h2>${T}</h2><div class="okn"><a>« anterior</a><span>foto 1 de ${relList(rel,12).length+1}</span><a>próxima »</a></div><div class="okf">${img}</div><p>${descTxt(m)}</p><div data-like-photo></div>
      <div class="okc"><h4>comentários <span data-ncm></span></h4><div class="cmt" data-cmts></div></div>${btns(m.y)}</main></div></div>`;
  if(k==="tumblr")return`<div class="pg tumblr"><header><b class="tl">t</b><div class="sr"><input placeholder="Pesquisar no Tumblr"></div>${x}</header>
    <div class="tw"><main><div class="tpost"><img class="tav" src="${AV}" alt=""><div class="tc"><div class="tth"><b>naosalvo</b><span>Seguindo</span></div>${img}<div class="tcap"><b>${T}</b><p>${descTxt(m)}</p><small>#meme #${m.y} #brasil #naosalvo</small></div>
      <div class="tf"><span data-notes></span><div class="ti"><i>${icon("share","in")}</i><i>${icon("comment","in")}</i><i>${icon("reblog","in")}</i><div data-like-photo></div></div></div><div class="cmt" data-cmts></div></div></div>${btns(m.y)}</main></div></div>`;
  const old=k==="ig15";
  return`<div class="pg ig ${old?"ig15":"ig16"}"><header><b class="igl">${old?"Instagram":"Instagram"}</b><div class="sr"><input placeholder="Pesquisar"></div><div class="lk">${icon("heart","in")}${icon("user","in")}${x}</div></header>
    <div class="igw"><article><div class="igh"><img src="${AV}" alt=""><b>naosalvo</b>${old?`<span class="igt">${ago(m.y).replace("há ","")}</span>`:`<i>${icon("more","in")}</i>`}</div>${img}
      <div class="igb"><div data-like-photo></div><i>${icon("comment","in")}</i>${old?"":`<i>${icon("share","in")}</i><i class="bm">${icon("bookmark","in")}</i>`}</div>
      <div class="igc"><b data-likes></b><p><b>naosalvo</b> ${T} — ${descTxt(m)}</p><div class="cmt" data-cmts></div><small>${old?"":ago(m.y).toUpperCase()}</small></div>${btns(m.y)}</article></div></div>`;
}


// ---- comentários da comunidade nas fotos ----
const CMT_TXT={
  fotolog:{ph:"Assine o livro de visitas…",bt:"assinar",vazio:"Ninguém assinou ainda. Seja o primeiro!",li:c=>`<b>${escapeHtml(c.autor)}</b> disse: ${escapeHtml(c.texto)} <small>${cmtData(c.em,"fotolog")}</small>`},
  orkut:{ph:"escreva um comentário…",bt:"postar comentário",vazio:"nenhum comentário ainda",li:c=>`<b>${escapeHtml(c.autor)}:</b> ${escapeHtml(c.texto)} <small>${cmtData(c.em,"orkut")}</small>`},
  tumblr:{ph:"Responder…",bt:"Responder",vazio:"Nenhuma resposta ainda.",li:c=>`<b>${escapeHtml(c.autor)}</b> ${escapeHtml(c.texto)}`},
  ig:{ph:"Adicione um comentário…",bt:"Publicar",vazio:"",li:c=>`<b>${escapeHtml(c.autor)}</b> ${escapeHtml(c.texto)}`}
};
function cmtData(em,k){if(!em)return"";const d=new Date(em);if(isNaN(d))return"";return k==="orkut"?`(${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})})`:d.toLocaleDateString("pt-BR")}
function localCmts(id){NS.cmts=NS.cmts||{};return NS.cmts[id]||(NS.cmts[id]=[])}
async function loadCmts(id){const d=await apiGet("/api/comentarios?id="+encodeURIComponent(id));return d&&Array.isArray(d.itens)?d.itens:null}
function initComments(el,m){
  const box=el.querySelector("[data-cmts]");if(!box)return;
  if(m.cuidado){box.innerHTML=`<div class="ce cdo-off-txt">${icon("care","in")}Comentários desativados neste meme (selo de cuidado).</div>`;return}
  const k0=pEra(m.y),k=k0==="ig15"?"ig":k0,T=CMT_TXT[k];let list=localCmts(m.id).slice(),online=false;
  const render=()=>{const ncm=el.querySelector("[data-ncm]");if(ncm)ncm.textContent=list.length?`(${list.length})`:"";
    const me=meuApelido();
    box.innerHTML=`<div class="cl">${list.length?list.map(c=>`<div class="ci">${T.li(c)}</div>`).join(""):T.vazio?`<div class="ce">${T.vazio}</div>`:""}</div>
      <form class="cf" autocomplete="off"><input class="ch" name="bot-field" tabindex="-1" aria-hidden="true">
       ${k==="fotolog"||k==="orkut"?`<textarea name="t" rows="2" maxlength="300" placeholder="${T.ph}"></textarea>`:`<input name="t" maxlength="300" placeholder="${T.ph}">`}
       <button type="submit">${T.bt}</button></form>
      <div class="cn">${me?`comentando como <b>${escapeHtml(me)}</b>`:`<a data-act="login">entre na sua conta</a> para comentar`}</div>`;
    const f=box.querySelector(".cf");
    f.onsubmit=async ev=>{ev.preventDefault();const t=f.t.value.trim();if(!t)return;
      if(!temConta()){needAccount("comentar");return}
      const btn=f.querySelector("button");btn.disabled=true;
      const r=await apiPost("/api/comentarios",{id:m.id,autor:meuApelido(),texto:t,"bot-field":f["bot-field"].value});
      btn.disabled=false;
      const c=r&&r.texto?r:{autor:meuApelido(),texto:t,em:new Date().toISOString(),local:true};
      if(!r){localCmts(m.id).push(c);nsSave()}
      list.push(c);sndPop();render();const nf=box.querySelector(".cf [name=t]");nf&&nf.focus();
      const cl=box.querySelector(".cl");cl.scrollTop=cl.scrollHeight;
      if(!r)toast("Comentário salvo neste navegador. Ele vai para todos quando o site estiver no ar.",3200);};
    const lg=box.querySelector('[data-act="login"]');if(lg)lg.onclick=e=>{e.stopPropagation();openSignup()};
  };
  render();
  loadCmts(m.id).then(d=>{if(d&&VW&&VW.m===m){online=true;list=d.concat(localCmts(m.id).filter(c=>c.local));render()}});
}

// ---- links sugeridos pela comunidade (moderador aprova) ----
function ytDoLink(u){u=(u||"").trim();if(!u)return"";try{const x=new URL(/^https?:\/\//i.test(u)?u:"https://"+u);const h=x.hostname.replace(/^(www|m|mobile|music)\./,"");const p=x.pathname.replace(/\/+$/,"");
  let id="";if(h==="youtu.be")id=p.slice(1);else if(h.endsWith("youtube.com")){id=x.searchParams.get("v")||"";const mm=p.match(/\/(shorts|embed|live|v)\/([\w-]{11})/);if(!id&&mm)id=mm[2]}
  id=(id||"").slice(0,11);return /^[\w-]{11}$/.test(id)?id:""}catch(e){return""}}
function enviarLinkSugerido(m,u){
  if(!temConta()){needAccount("enviar o link");return'<div class="chk bad">Entre na sua conta para enviar o link.</div>'}
  const yt=ytDoLink(u);if(!yt)return'<div class="chk bad">Cole um link do YouTube (youtube.com/watch?v=… ou youtu.be/…).</div>';
  if(linkEquipe())return postComSessao("/api/links/direto",{id:m.id,yt}).then(()=>{LINKS_OK[m.id]=yt;trocarYt(m,yt);avisarAcervo();
      return'<div class="chk ok">Link publicado! Ele já vale para todo mundo (feche e abra o vídeo para ver).</div>'},
    e=>`<div class="chk bad">${escapeHtml((e&&e.erro)||"Não deu para publicar agora.")}</div>`);
  NS.linkSugs=NS.linkSugs||[];
  if(NS.linkSugs.some(x=>x.meme===m.id&&x.yt===yt))return'<div class="chk warn">Você já enviou esse link. Ele está na fila da moderação.</div>';
  const sug={id:"l"+Date.now(),meme:m.id,t:m.t,yt,by:meuApelido(),status:"pending",ts:Date.now()};
  return apiPost("/api/links",{id:m.id,yt,autor:meuApelido(),"bot-field":""}).then(r=>{sug.online=!!r;NS.linkSugs.push(sug);nsSave();
    return`<div class="chk ok">Link enviado! Um moderador vai conferir${r?"":" (salvo neste navegador até o site estar no ar)"}. Se for aprovado, o vídeo aparece aqui.</div>`});
}
// links aprovados pelos moderadores entram no acervo para todo mundo
const LINKS_OK={};
// troca o vídeo de um meme: a miniatura passa a ser a do vídeo novo (a imagem antiga era captura do vídeo anterior)
function trocarYt(m,yt){if(!m||m.yt===yt)return false;m.yt=yt;if(m.tipo!=="foto"){delete m.img;delete m.credit;delete m.srcImg}return true}
function aplicarLinks(){let n=0;const L=typeof MEMES!=="undefined"?MEMES:[];for(const [id,yt] of Object.entries(LINKS_OK))if(trocarYt(L.find(x=>x.id===id),yt))n++;return n}
// avisa a página que o acervo mudou: cada página refaz o que mostra (home, linha do tempo, Memepédia…)
function avisarAcervo(){if(typeof buildAll==="function"){buildAll();if(typeof renderAll==="function")renderAll()}
  try{document.dispatchEvent(new CustomEvent("ns:acervo"))}catch(e){}}

// ---- acervo do servidor: o banco é a fonte da verdade (edições do painel, memes novos pelo MCP, ocultos) ----
// O data.js é só o ponto de partida (abre rápido e funciona sem API); quando /api/memes responde, ele é atualizado.
const ytDaUrl=u=>{const x=String(u||"").match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([\w-]{11})/);return x?x[1]:null};
// imagem que é captura de outro vídeo (o link do meme foi trocado depois): não serve mais de miniatura
const capturaVelha=(d,yt)=>{const y=ytDaUrl(d.origem_url)||ytDaUrl(d.credito_url);return !!(y&&yt&&y!==yt)};
function memeDoServidor(m,s){
  const yt=s.youtube_id&&/^[\w-]{11}$/.test(s.youtube_id)?s.youtube_id:undefined;
  m.t=s.titulo;m.y=s.ano;m.c=s.categoria;m.r=s.raridade;
  if(s.tipo==="foto")m.tipo="foto";else delete m.tipo;
  const data=s.data?String(s.data).slice(0,10):"";if(/^\d{4}-\d{2}-\d{2}$/.test(data))m.date=data;
  if(s.emoji)m.e=s.emoji;if(s.descricao)m.d=s.descricao;
  if(s.autor)m.by=s.autor;else delete m.by;
  if(Number.isFinite(s.duracao))m.dur=s.duracao;
  if(s.adicionado_em)m.added=String(s.adicionado_em).slice(0,10);
  if(yt)m.yt=yt;else delete m.yt;
  const md=Array.isArray(s.midias)?s.midias:[];
  const im=md.find(d=>d.tipo==="imagem"&&d.caminho&&!capturaVelha(d,yt));
  if(im){m.img=im.caminho;if(im.origem_url)m.srcImg=im.origem_url;else delete m.srcImg;
    if(im.credito_por||im.credito_url)m.credit={by:im.credito_por||"",url:im.credito_url||""};else delete m.credit}
  else{delete m.img;delete m.srcImg;delete m.credit}
  const vd=md.find(d=>d.tipo==="video_arquivo"&&d.caminho);if(vd)m.vid=vd.caminho;else delete m.vid;
  if(m.views==null)m.views=0;if(m.saves==null)m.saves=0;
}
async function sincronizarAcervo(){
  if(typeof MEMES==="undefined")return false;
  const itens=[];let total=Infinity;
  for(let off=0;off<total&&off<20000;off+=500){
    const d=await apiGet(`/api/memes?limite=500&offset=${off}`);
    if(!d||!Array.isArray(d.itens)||!Number.isFinite(d.total))return false;
    total=d.total;itens.push(...d.itens);if(!d.itens.length)break}
  if(!itens.length||itens.length<total)return false;           // banco vazio ou resposta pela metade: fica o data.js
  const porId=new Map(MEMES.map(m=>[m.id,m])),vistos=new Set();
  for(const s of itens){if(!s||!s.id)continue;let m=porId.get(s.id);if(!m){m={id:s.id};MEMES.push(m);porId.set(s.id,m)}vistos.add(s.id);memeDoServidor(m,s)}
  for(let i=MEMES.length-1;i>=0;i--)if(!vistos.has(MEMES[i].id))MEMES.splice(i,1);   // oculto ou removido no painel sai do site
  return true;
}
const ACERVO_PRONTO=sincronizarAcervo().catch(()=>false).then(ok=>{
  return apiGet("/api/links/aprovados").then(d=>{
    if(d&&typeof d==="object")for(const [id,yt] of Object.entries(d))if(/^[\w-]{11}$/.test(yt))LINKS_OK[id]=yt;
    const n=aplicarLinks();if(ok||n)avisarAcervo();return ok});
});

// compartilhar: sempre o link do vídeo original no YouTube (desligado em memes com selo de cuidado)
async function compartilharYT(m){if(m.cuidado){avisoCuidadoOff();return}
  if(!m.yt){toast("Este meme ainda não tem o vídeo original do YouTube.",2800);return}
  const url="https://www.youtube.com/watch?v="+m.yt;
  if(navigator.share&&matchMedia("(pointer:coarse)").matches){try{await navigator.share({title:m.t,url});return}catch(e){if(e&&e.name==="AbortError")return}}
  try{await navigator.clipboard.writeText(url);toast("Link do YouTube copiado: "+url,3200)}catch(e){prompt("Copie o link do YouTube:",url)}
}

// ---- abrir / fechar ----
let VW=null;
function closeViewer(){if(!VW)return;removeEventListener("resize",VW.rs);VW.player&&VW.player.stop();clearInterval(VW.clock);clearTimeout(VW.toastT);VW.el.remove();document.body.classList.remove("vw-open");document.removeEventListener("keydown",VW.key);const cb=VW.onClose;VW=null;cb&&cb()}
function openViewer(m,opt={}){
  closeViewer();
  const isPhoto=m.tipo==="foto",rel=(opt.related||[]).filter(r=>r.id!==m.id);
  const cls=isPhoto?"vw-photo":m.vert?"vw-short vw-e5":`vw-e${vEra(m.y)}`;
  const el=document.createElement("div");el.className="vw "+cls;el.setAttribute("role","dialog");el.setAttribute("aria-label",m.t);
  el.innerHTML=`<div class="vw-win ${cls}">${isPhoto?photoPage(m,rel):m.vert?shortPage(m):videoPage(m,rel)}</div>`;
  document.body.appendChild(el);document.body.classList.add("vw-open");el.firstElementChild.scrollTop=0;
  if(m.cuidado)montarCuidado(el,m);
  if(typeof registrarEvento==="function")registrarEvento(m.id,"visita");
  el.querySelectorAll("img").forEach(i=>i.complete||i.addEventListener("load",()=>VW&&VW.fit&&VW.fit(),{once:true}));
  VW={el,m,onClose:opt.onClose};VW.fit=()=>encaixarJanela(el);VW.rs=()=>VW&&VW.fit();addEventListener("resize",VW.rs);requestAnimationFrame(VW.fit);[250,800,1600].forEach(t=>setTimeout(()=>VW&&VW.el===el&&VW.fit(),t));
  VW.key=ev=>{if(ev.key==="Escape"&&!el.querySelector(".dial"))closeViewer()};document.addEventListener("keydown",VW.key);
  el.addEventListener("click",ev=>{if(ev.target===el){closeViewer();return}const a=ev.target.closest("[data-act],[data-id],[data-like],[data-star]");if(!a)return;
    if(m.cuidado&&(a.dataset.like||a.dataset.star||a.dataset.act==="share")){ev.preventDefault();avisoCuidadoOff();return}
    if(a.dataset.id){ev.preventDefault();sndClick();opt.onPick&&opt.onPick(a.dataset.id);return}
    const act=a.dataset.act;
    if(act==="close")closeViewer();
    else if(act==="year"){const y=m.y;closeViewer();opt.onYear&&opt.onYear(y)}
    else if(act==="share")compartilharYT(m);
    else if(act==="wiki"){closeViewer();location.href="memepedia.html#"+encodeURIComponent(m.id)}
    else if(act==="reveal"){const c=el.querySelector(".cdo");if(c)c.classList.add("ok");sndClick()}
    else if(act==="snd"){SND.on=!SND.on;try{localStorage.setItem("ns_snd",SND.on?"1":"0")}catch(e){}a.innerHTML=icon(SND.on?"volume":"mute")+"<span>Sons da época</span>"}
    else if(act==="savelink"){const u=el.querySelector(".ol").value.trim(),out=el.querySelector(".olm");const r=enviarLinkSugerido(m,u);
      if(r&&r.then){out.innerHTML='<div class="chk">Enviando…</div>';r.then(h=>{out.innerHTML=h||"";if(h&&h.includes("chk ok"))el.querySelector(".ol").value=""})}else out.innerHTML=r||""}
    else if(a.dataset.like){vote(+a.dataset.like)}
    else if(a.dataset.star){rate(+a.dataset.star)}
  });
  // notas e visualizações
  const e=isPhoto?null:vEra(m.y);let tot=localTotals(m.id);
  let paint=()=>{const mine=myVote(m.id);
    if(isPhoto){const n=tot.up;el.querySelectorAll("[data-like-photo]").forEach(b=>b.innerHTML=`<button class="plk ${mine.v===1?"on":""}" data-like="1">${icon("heart")}${pEra(m.y)==="fotolog"?`<span>${mine.v===1?"Flog favoritado":"Favoritar este flog"} (${fmt(n)})</span>`:pEra(m.y)==="orkut"?`<span>${mine.v===1?"Você curtiu":"Curtir"} · ${fmt(n)}</span>`:""}</button>`);
      const l=el.querySelector("[data-likes]");if(l)l.textContent=`${fmt(n)} curtida${n===1?"":"s"}`;const no=el.querySelector("[data-notes]");if(no)no.textContent=`${fmt(n)} nota${n===1?"":"s"}`;return}
    const rt=el.querySelector("[data-rt]");if(rt)rt.innerHTML=m.vert?`<button class="tkl ${mine.v===1?"on":""}" data-like="1">${icon("heart")}<small>${short(tot.up)}</small></button>`:ratingHTML(e,tot,mine)};
  if(m.cuidado){el.classList.add("vw-cdo");const p0=paint;paint=()=>{p0();travarCuidado(el)};const xb=el.querySelector(".xrt>b");if(xb)xb.textContent="Avaliação e compartilhamento desativados neste meme (selo de cuidado)."}
  paint();
  loadVotes(m.id).then(d=>{if(d&&VW&&VW.m===m){tot=d;paint()}});
  loadMeuVoto(m.id).then(d=>{if(d&&VW&&VW.m===m)paint()});
  if(isPhoto)initComments(el,m);
  if(isPhoto)VW.toastT=setTimeout(()=>{if(VW&&VW.m===m&&typeof alertaDaEpoca==="function")alertaDaEpoca(el,m,true)},2500);
  // votar: exige conta. Otimista (pinta na hora) e volta atrás se o servidor recusar.
  async function votar(patch,aplicar){
    if(typeof needAccount==="function"&&needAccount("votar"))return;
    const mine=myVote(m.id),antesM={...mine},antesT={...tot};
    aplicar(mine);sndClick();paint();
    try{const r=await sendVote(m.id,patch);if(r&&VW&&VW.m===m){tot={up:r.up,down:r.down,sum:r.sum,n:r.n};if(r.meu)VOTOS_MEUS[m.id]={v:r.meu.v|0,s:r.meu.s|0};paint()}}
    catch(e){Object.assign(mine,antesM);tot=antesT;if(VW&&VW.m===m)paint();if(e&&e.status!==401)toast(e&&e.status===429?"Calma! Muitas ações seguidas. Tente daqui a pouco.":"Não consegui salvar o seu voto agora.",3000)}
  }
  function vote(v){const from=myVote(m.id).v,to=from===v?0:v;
    votar({v:to},mine=>{mine.v=to;if(!tot.local){if(from===1)tot.up--;if(from===-1)tot.down--;if(to===1)tot.up++;if(to===-1)tot.down++}})}
  function rate(st){const from=myVote(m.id).s||0;
    votar({s:st},mine=>{mine.s=st;if(!tot.local){if(from){tot.sum-=from;tot.n--}tot.sum+=st;tot.n++}})}
  if(!isPhoto){
    const setViews=n=>{const t=n==null?"":e===1?fmt(n):e===2?`${fmt(n)} exibições`:e===3?fmt(n):e===4?`${fmt(n)} visualizações`:e===5?`${short(n)} de visualizações`:`${fmt(n)} exibições no YouTube`;
      el.querySelectorAll("[data-views]").forEach(x=>x.textContent=t)};
    if(m.yt){setViews(null);ytStats([m.yt,...rel.slice(0,10).map(r=>r.yt)].filter(Boolean)).then(s=>{if(VW&&VW.m===m&&s[m.yt])setViews(s[m.yt].views)})}
    // imersão: discada, lan house, avisos da época
    const hooks={};
    if(discada(m.y))hooks.beforeStart=()=>dialUp(el);
    hooks.onPlay=()=>{if(!VW||VW.toasted)return;VW.toasted=1;if(typeof registrarEvento==="function")registrarEvento(m.id,"clique");VW.toastT=setTimeout(()=>{if(VW&&VW.m===m&&typeof alertaDaEpoca==="function")alertaDaEpoca(el,m,false)},4000)};
    VW.player=initPlayer(el.querySelector(".vp"),m,rel,id=>opt.onPick&&opt.onPick(id),hooks);
    if(lanhouse(m.y)){const b=document.createElement("div");b.className="lan";let s=29*60+59;b.innerHTML=`<b>LAN HOUSE</b><span>Máquina 07</span><span class="lt"></span><small>R$ 1,50/hora</small>`;el.querySelector(".vw-win").appendChild(b);el.querySelector(".vw-win").classList.add("tem-lan");const lt=b.querySelector(".lt");
      const tick=()=>{lt.textContent="Tempo restante "+String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");if(s>0)s--};tick();VW.clock=setInterval(tick,1000)}
    const ck=el.querySelector("[data-clock]");if(ck){const f=()=>ck.textContent=new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});f();VW.clock=setInterval(f,30000)}
  }
}

// discagem: tela de conexão + som do modem (anos de internet discada)
function dialUp(root){return new Promise(res=>{
  const d=document.createElement("div");d.className="dial";
  d.innerHTML=`<div class="dw"><div class="xtb"><span>${icon("culture","xi")}Conectando a Discador Internet Grátis</span><span class="xc"><i>✕</i></span></div><div class="db"><div class="dicon"><i></i><i></i><i></i></div><div><p class="ds">Discando...</p><div class="dp"><s></s></div><small>Linha telefônica ocupada? Avise a família que você vai usar a internet.</small></div></div><div class="dbt"><button class="sk">Pular</button><button>Cancelar</button></div></div>`;
  root.appendChild(d);sndModem();
  const steps=[["Discando 0800 444 1956...",0],["Verificando nome de usuário e senha...",3200],["Registrando seu computador na rede...",5000],["Conectado a 52,0 Kbps",6600]];
  const T=steps.map(([t,ms],i)=>setTimeout(()=>{d.querySelector(".ds").textContent=t;d.querySelector(".dp s").style.width=((i+1)/steps.length*100)+"%"},ms));
  const done=()=>{T.forEach(clearTimeout);clearTimeout(fin);if(SND.ctx){try{SND.ctx.close()}catch(e){}SND.ctx=null}d.remove();res()};
  const fin=setTimeout(done,7400);d.querySelectorAll("button").forEach(b=>b.onclick=done);
})}

// ---- janela inteira na tela: diminui a mídia até tudo caber, sem rolagem dentro da janela ----
function encaixarJanela(el){
  const w=el.querySelector(".vw-win");if(!w)return;
  const media=w.querySelector(".tkv")||w.querySelector(".vp-stage")||w.querySelector(".pimg");if(!media)return;
  media.style.maxWidth="";media.style.maxHeight="";
  const pad=innerWidth<=700||innerHeight<800?16:48,room=innerHeight-pad,minH=innerWidth<=700?140:120;
  for(let i=0;i<4;i++){
    const over=w.offsetHeight-room;if(over<=1)return;
    if(media.classList.contains("pimg")){const h=media.getBoundingClientRect().height;if(h<=minH)return;media.style.maxHeight=Math.max(minH,h-over)+"px";continue}
    const scr=media.querySelector(".vp-screen")||media,sr=scr.getBoundingClientRect();if(sr.height<=minH)return;
    const ar=sr.width/Math.max(1,sr.height),h=Math.max(minH,sr.height-over);
    media.style.maxWidth=Math.floor(h*ar)+"px";media.style.marginLeft="auto";media.style.marginRight="auto";
  }
}

// ---- selo de cuidado: memes com preconceito ficam borrados até a pessoa escolher ver ----
const CUIDADO={
  racismo:{nome:"racismo",lei:"Racismo é crime inafiançável e imprescritível (Constituição, art. 5º, XLII). Lei 7.716/1989: praticar, induzir ou incitar discriminação de raça ou cor dá reclusão de 2 a 5 anos e multa (redação da Lei 14.532/2023). Injúria racial (art. 2º-A): reclusão de 2 a 5 anos e multa.",
    orgs:[["Geledés – Instituto da Mulher Negra","https://www.geledes.org.br"],["Educafro","https://www.educafro.org.br"],["Denuncie: Disque 100 (Direitos Humanos)","https://www.gov.br/mdh/pt-br/ondh"]]},
  lgbtfobia:{nome:"LGBTfobia",lei:"Desde 2019 o STF enquadra homofobia e transfobia na Lei do Racismo (ADO 26 e MI 4.733): reclusão de 2 a 5 anos e multa. Ofensa direta a uma pessoa LGBTQIA+ pode ser injúria racial (art. 2º-A da Lei 7.716/1989).",
    orgs:[["ANTRA – Associação Nacional de Travestis e Transexuais","https://antrabrasil.org"],["Grupo Gay da Bahia","https://grupogaydabahia.com.br"],["Denuncie: Disque 100","https://www.gov.br/mdh/pt-br/ondh"]]},
  machismo:{nome:"machismo",lei:"Violência psicológica contra a mulher é crime (Código Penal, art. 147-B, Lei 14.188/2021): reclusão de 6 meses a 2 anos e multa. Em março de 2026 o Senado aprovou projeto que inclui a misoginia na Lei do Racismo (pena de 2 a 5 anos); confira se já virou lei.",
    orgs:[["Instituto Maria da Penha","https://www.institutomariadapenha.org.br"],["Think Olga","https://thinkolga.com"],["Denuncie: Ligue 180","https://www.gov.br/mulheres/pt-br/ligue180"]]},
  capacitismo:{nome:"capacitismo",lei:"Discriminar pessoa com deficiência é crime (Lei 13.146/2015, art. 88): reclusão de 1 a 3 anos e multa, aumentada se for pela internet.",
    orgs:[["Instituto Jô Clemente","https://www.ijc.org.br"],["Denuncie: Disque 100","https://www.gov.br/mdh/pt-br/ondh"]]}
};
function cuidadoHTML(m,curto){const c=CUIDADO[m.cuidado.tipo]||CUIDADO.racismo;
  return`<div class="cdo-selo">${icon("care","in")}<b>Selo de cuidado</b><span>contém ${c.nome}</span></div>${curto?"":`<p>${escapeHtml(m.cuidado.nota||"")}</p>
   <p>O Não Salvo é um museu da internet brasileira. Este registro fica aqui como memória: na época, muita gente achava esse tipo de piada “normal”. Hoje sabemos que não é. Isso não é humor, é preconceito.</p>
   <p class="cdo-lei"><b>É crime.</b> ${c.lei}</p>
   <div class="cdo-orgs"><small>Quem luta contra isso:</small>${c.orgs.map(([n,u])=>`<a href="${u}" target="_blank" rel="noopener">${icon("extlink","in")}${n}</a>`).join("")}</div>`}`}
// memes com selo de cuidado: sem nota, sem curtida, sem comentário e sem compartilhar
const CDO_OFF="Desativado: meme com selo de cuidado";
function avisoCuidadoOff(){toast("Neste meme não dá para avaliar, curtir, comentar nem compartilhar (selo de cuidado).",3200)}
function travarCuidado(el){
  el.querySelectorAll("[data-rt] button,[data-like-photo] button,[data-act=share],.tkr .tki").forEach(b=>{b.setAttribute("aria-disabled","true");b.title=CDO_OFF;b.classList.add("cdo-off")});
  el.querySelectorAll("[data-stars] small").forEach(x=>x.textContent="Avaliação desativada")}
function montarCuidado(el,m){
  const w=el.querySelector(".vw-win");if(!w)return;
  const box=document.createElement("div");box.className="cdo";
  box.innerHTML=`<div class="cdo-in">${cuidadoHTML(m)}<button class="cdo-ver" data-act="reveal">${icon("eye","in")}Entendi, quero ver</button><button class="cdo-sair" data-act="close">Voltar</button></div>`;
  w.appendChild(box);
  const info=document.createElement("div");info.className="cdo-faixa";info.innerHTML=cuidadoHTML(m,true)+`<button data-act="cdoinfo">por quê?</button>`;
  const alvo=w.querySelector(".vbs");if(alvo)alvo.before(info);
  info.querySelector("button").onclick=ev=>{ev.stopPropagation();box.classList.remove("ok")};
}
