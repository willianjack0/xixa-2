// ---- Alertas de época (easter-eggs de nostalgia) ----
// Cada meme sorteia 1 alerta da sua época (vídeo: pelo ano; foto: pela rede social).
// Só avisos de internet. Não repete enquanto o site estiver aberto (nem ao recarregar a aba):
// só volta a sortear um repetido quando todos da época já apareceram. Alguns são raros (w baixo).

// sons extras (gerados na hora, sem arquivos)
function sndNudge(){if(!SND.on)return;const c=actx();if(!c)return;const t=c.currentTime+.02;for(let i=0;i<6;i++)sweep(c,180,120,t+i*.06,.05,.05,"square")}
function sndDing(){if(!SND.on)return;const c=actx();if(!c)return;tone(c,[1568],c.currentTime+.02,.35,.05,"sine")}
function sndXp(){if(!SND.on)return;const c=actx();if(!c)return;const t=c.currentTime+.02;tone(c,[523],t,.12,.05,"triangle");tone(c,[784],t+.12,.25,.05,"triangle")}
function sndNokia(){if(!SND.on)return;const c=actx();if(!c)return;const t=c.currentTime+.02;tone(c,[1760],t,.09,.04,"square");tone(c,[1760],t+.16,.09,.04,"square")}
function sndVuvu(){if(!SND.on)return;const c=actx();if(!c)return;const t=c.currentTime+.02;tone(c,[233,236],t,1.4,.025,"sawtooth")}
function sndCoin(){if(!SND.on)return;const c=actx();if(!c)return;const t=c.currentTime+.02;tone(c,[988],t,.08,.04,"square");tone(c,[1319],t+.08,.3,.04,"square")}

const diasAte=(de,ate)=>Math.max(0,Math.round((new Date(ate+"T12:00:00")-new Date((de||"2011-06-01")+"T12:00:00"))/864e5));

// v: estilo visual · y: anos [de,até] (vídeos) · net: redes (fotos) · w: peso (raro < 1)
const ALERTAS=[
  // ===== discada / Windows XP (até 2006) =====
  {som:"windows-erro",id:"caiu",v:"xpb",y:[1990,2006],ic:"alert",ti:"Conexão perdida",tx:"Alguém tirou o telefone do gancho.",bt:"Reconectar",ok:"Conectado a 52,0 Kbps.",s:sndXp,on:sndModem},
  {som:"windows-balao",id:"pulso",v:"xpb",y:[1990,2006],ic:"clock",ti:"Dica da operadora",tx:"Depois da meia-noite a internet é mais barata: só 1 pulso!",s:sndXp},
  {som:"clique",id:"kazaa",v:"dl",y:[1999,2006],ic:"music",ti:"Baixando…",tx:"musica_nova_REAL.mp3.exe · 2 dias restantes",bar:.07,s:sndClick},
  {som:"msn-entrou",id:"visit",v:"pop",y:[1998,2006],w:.15,ic:"star",ti:"PARABÉNS!!!",tx:"Você é o visitante 1.000.000! Clique aqui e ganhe um prêmio!",bt:"CLIQUE AQUI",ok:"Brincadeira. Mas o meme é de graça.",s:sndChime},
  {som:"email",id:"corrente",v:"mail",y:[1998,2007],ic:"mail",ti:"FW: FW: FW: RE: leia isso!!!",tx:"Encaminhe este vídeo para 10 amigos ou terá 7 anos de azar.",s:sndDing},
  {som:"windows-balao",id:"antivirus",v:"xpb",y:[1998,2006],ic:"lock",ti:"Proteção desatualizada",tx:"Seu antivírus está desatualizado há 487 dias.",s:sndXp},
  {som:"windows-balao",id:"popups",v:"xpb",y:[2003,2006],ic:"xmark",ti:"Bloqueador de pop-ups",tx:"14 janelas pop-up foram bloqueadas nesta página.",s:sndXp},
  {som:"notificacao",id:"clipe",v:"clip",y:[1997,2006],w:.6,ic:"comment",ti:"Ajudante",tx:"Parece que você está vendo um meme. Precisa de ajuda?",s:sndDing},
  // ===== MSN / Orkut / LAN house (2005–2009) =====
  {som:"msn-entrou",id:"msn-entrou",v:"msn",y:[2005,2009],ic:"user",ti:"",tx:"Fernandinha acabou de entrar.",s:sndChime},
  {som:"msn-chamar-atencao",id:"msn-nudge",v:"msn",y:[2005,2009],ic:"user",ti:"",tx:"Fernandinha chamou sua atenção!",s:sndNudge,shake:1},
  {som:"msn-entrou",id:"msn-nick",v:"msn",y:[2005,2009],ic:"user",ti:"",tx:"Lipe mudou o nick para ~*~ [ToKaNDo]: Restart ~*~",s:sndChime},
  {som:"msn-erro",id:"msn-arquivo",v:"msn",y:[2005,2009],ic:"alert",ti:"",tx:"Não foi possível enviar o arquivo (2,3 MB): muito grande.",s:sndDing},
  {som:"orkut",id:"ork-depo",v:"scrap",y:[2005,2009],ic:"heart",ti:"orkut",tx:"Você tem 3 depoimentos pendentes.",s:sndPop},
  {som:"orkut",id:"ork-visita",v:"scrap",y:[2005,2009],ic:"user",ti:"orkut",tx:"Fulano visitou seu perfil.",s:sndPop},
  {som:"orkut",id:"ork-sorte",v:"scrap",y:[2005,2009],ic:"star",ti:"sorte do dia",tx:"Um meme vai mudar o seu dia.",s:sndPop},
  {som:"moeda",id:"lan-5min",v:"lanw",y:[2004,2009],ic:"clock",ti:"LAN HOUSE",tx:"Faltam 5 minutos! Coloca mais R$ 1,00 aí, campeão.",s:sndCoin},
  {som:"moeda",id:"lan-fecha",v:"lanw",y:[2004,2009],ic:"volume",ti:"LAN HOUSE",tx:"Desliga o fone que a lan vai fechar.",s:sndCoin},
  // ===== Facebook / Twitter / fim do Orkut (2010–2012) =====
  {som:"orkut",id:"ork-fb",v:"scrap",y:[2010,2012],ic:"user",ti:"orkut",tx:"Fulano saiu do Orkut e agora está no Facebook.",s:sndPop},
  {som:"orkut",id:"scrap",v:"scrap",y:[2010,2012],ic:"comment",ti:"orkut",tx:"Você tem 1 scrap novo: “kkkkk viu esse vídeo???”",s:sndPop},
  {som:"facebook",id:"fb-colheita",v:"fb",y:[2010,2012],ic:"user",ti:"facebook",tx:"Tia Cida te convidou para jogar Colheita Feliz.",s:sndPop},
  {som:"facebook",id:"fb-cutucou",v:"fb",y:[2010,2013],ic:"user",ti:"facebook",tx:"Fulano te cutucou.",bt:"Cutucar de volta",ok:"Você cutucou Fulano de volta.",s:sndPop},
  {som:"twitter",id:"twt-baleia",v:"twt",y:[2010,2012],ic:"alert",ti:"Twitter está sobrecarregado",tx:"Muitos tweets! Tente novamente em instantes.",s:sndDing},
  {som:"notificacao-pop",id:"formspring",v:"fs",y:[2010,2012],ic:"comment",ti:"Pergunta anônima",tx:"“qual é o seu meme favorito?”",s:sndPop},
  {som:"notificacao",id:"fim-mundo",v:"xpb2",y:[2009,2012],w:1.4,ic:"clock",ti:"Contagem regressiva",tx:m=>`Faltam ${diasAte(m.date,"2012-12-21")} dias para o fim do mundo (21/12/2012).`,s:sndDing},
  // ===== WhatsApp / Facebook (2013–2016) =====
  {som:"whatsapp",id:"zap-familia",v:"zap",y:[2013,2016],ic:"comment",ti:"Família ❤",tx:"47 mensagens novas",s:sndPop},
  {som:"whatsapp",id:"zap-bomdia",v:"zap",y:[2013,2016],ic:"comment",ti:"Família ❤",tx:"Tia Neide: 🌻 Bom dia! Que Deus abençoe o seu dia.",s:sndPop},
  {som:"whatsapp",id:"zap-corrente",v:"zap",y:[2013,2016],ic:"alert",ti:"Grupo da Firma",tx:"URGENTE: o WhatsApp vai ser pago, mande para 10 contatos!!",s:sndPop},
  {som:"facebook",id:"fb-marcou",v:"fb2",y:[2013,2016],ic:"photo",ti:"facebook",tx:"Fulano te marcou em uma foto.",s:sndPop},
  {som:"facebook",id:"fb-lembra",v:"fb2",y:[2015,2016],ic:"clock",ti:"Lembranças",tx:"Veja o que você postou há 3 anos.",s:sndPop},
  {som:"snapchat",id:"snap-print",v:"snap",y:[2013,2016],ic:"alert",ti:"Snapchat",tx:"Fulano tirou print da conversa!",s:sndDing},
  {som:"facebook",id:"balde",v:"fb2",y:[2014,2014],ic:"star",ti:"facebook",tx:"Você foi desafiado no Desafio do Balde de Gelo!",s:sndPop},
  {som:"pokemon",id:"pikachu",v:"poke",y:[2016,2016],w:.2,ic:"star",ti:"",tx:"Um Pikachu selvagem apareceu!",s:sndCoin},
  // ===== TikTok / Pix / lives (2017+) =====
  {som:"tiktok",id:"tt-pausa",v:"tt",y:[2018,2030],ic:"clock",ti:"",tx:"Você está assistindo há 2 horas. Que tal uma pausa?",bt:"Continuar assistindo",ok:"Tá bom, só mais um.",s:sndPop},
  {som:"pix",id:"pix",v:"pix",y:[2020,2030],ic:"coin",ti:"Pix recebido",tx:"R$ 0,01 · “vê esse vídeo kkkk”",s:sndCoin},
  {som:"whatsapp",id:"golpe",v:"zap",y:[2019,2030],ic:"comment",ti:"+55 11 9xxxx-xxxx",tx:"Oi mãe, troquei de número, salva esse.",s:sndPop},
  {som:"instagram",id:"live",v:"igs",y:[2017,2030],ic:"video",ti:"instagram",tx:"Fulano começou uma transmissão ao vivo.",s:sndPop},
  {som:"whatsapp",id:"zap-audio",v:"zap",y:[2016,2030],ic:"volume",ti:"Família ❤",tx:"Tia Neide enviou um áudio de 4:37.",s:sndPop},
  {som:"iphone",id:"wifi-vizinho",v:"ios",y:[2014,2030],ic:"culture",ti:"Wi-Fi",tx:"Conectado a “NET_VIZINHO_2G” (sem senha).",s:sndDing},
  {som:"instagram",id:"story-crush",v:"igs",y:[2017,2030],ic:"eye",ti:"instagram",tx:"Seu crush viu seu story.",s:sndPop},
  {som:"twitter",id:"x-fora",v:"ios",y:[2024,2024],ic:"alert",ti:"X",tx:"Não foi possível carregar. O X está suspenso no Brasil.",s:sndDing},
  {som:"reuniao",id:"mudo",v:"meet",y:[2020,2022],ic:"mute",ti:"",tx:"Você está no mudo.",s:sndDing},
  // ===== só fotos (por rede) =====
  {som:"notificacao",id:"ftl-dia",v:"ftl",net:["fotolog"],ic:"photo",ti:"fotolog",tx:"Você já postou sua foto do dia. Volte amanhã!",s:sndDing},
  {som:"notificacao",id:"ftl-cheio",v:"ftl",net:["fotolog"],ic:"comment",ti:"fotolog",tx:"Seu livro de visitas está cheio (20 assinaturas).",s:sndDing},
  {som:"orkut",id:"ork-add",v:"scrap",net:["orkut"],ic:"comment",ti:"orkut",tx:"Fulano deixou um scrap: “me add aí!”",s:sndPop},
  {som:"orkut",id:"ork-fake",v:"scrap",net:["orkut"],ic:"alert",ti:"orkut",tx:"Cuidado: este perfil pode ser fake.",s:sndPop},
  {som:"orkut",id:"ork-comu",v:"scrap",net:["orkut"],ic:"user",ti:"orkut",tx:"Fulano te convidou para a comunidade “Eu odeio acordar cedo”.",s:sndPop},
  {som:"tumblr",id:"tum-reblog",v:"tum",net:["tumblr"],ic:"reblog",ti:"tumblr",tx:"naosalvo reblogou seu post.",s:sndPop},
  {som:"tumblr",id:"tum-manut",v:"tum",net:["tumblr"],ic:"alert",ti:"tumblr",tx:"O Tumblr está em manutenção. Volte daqui a pouco.",s:sndDing},
  {som:"instagram",id:"ig-filtro",v:"igs",net:["ig15"],ic:"photo",ti:"instagram",tx:"Aplicando filtro Valencia…",s:sndPop},
  {som:"instagram",id:"ig-stories",v:"igs",net:["ig"],ic:"user",ti:"instagram",tx:"Fulano mencionou você nos stories.",s:sndPop},
  {som:"instagram",id:"ig-close",v:"igs",net:["ig"],ic:"star",ti:"instagram",tx:"Você foi adicionado aos Melhores Amigos de alguém.",s:sndPop}
];


// ---- imitações sintetizadas mais fiéis (inspiradas nos sons da época, sem arquivo) ----
// sino: parciais inarmônicos com decaimento exponencial (marimba / sino de notificação)
function sino(c,f,t,dur,v,parts){const out=c.createGain();out.gain.value=1;out.connect(c.destination);
  (parts||[[1,1],[2.01,.35],[3.98,.12]]).forEach(([m,a])=>{const o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.setValueAtTime(f*m,t);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v*a,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+dur*(m>1?.55:1));o.connect(g).connect(out);o.start(t);o.stop(t+dur+.05)})}
// gota: tom com queda rápida de afinação (pop de mensagem)
function gota(c,f1,f2,t,dur,v){const o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.setValueAtTime(f1,t);o.frequency.exponentialRampToValueAtTime(f2,t+dur*.7);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(c.destination);o.start(t);o.stop(t+dur+.02)}
// bipe quadrado curto (celular antigo)
function bipe(c,f,t,dur,v){const o=c.createOscillator(),g=c.createGain(),lp=c.createBiquadFilter();o.type="square";o.frequency.value=f;lp.type="lowpass";lp.frequency.value=3200;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.003);g.gain.setValueAtTime(v,t+dur-.01);g.gain.linearRampToValueAtTime(0,t+dur);o.connect(lp).connect(g).connect(c.destination);o.start(t);o.stop(t+dur+.02)}
function tique(c,t,v){hiss(c,t,.012,v||.05,4500)}
const SYNTH={
  "msn-entrou":(c,t)=>{sino(c,659,t,.9,.09,[[1,1],[3,.18],[5.4,.06]]);sino(c,988,t+.13,1.1,.08,[[1,1],[3,.15],[5.4,.05]]);sino(c,1319,t+.13,1,.03)},
  "msn-chamar-atencao":(c,t)=>{for(let i=0;i<9;i++){const o=c.createOscillator(),g=c.createGain();o.type="sawtooth";o.frequency.setValueAtTime(95+(i%2)*25,t+i*.055);g.gain.setValueAtTime(.06,t+i*.055);g.gain.exponentialRampToValueAtTime(.001,t+i*.055+.05);o.connect(g).connect(c.destination);o.start(t+i*.055);o.stop(t+i*.055+.06)}sino(c,784,t+.52,.5,.06)},
  "msn-erro":(c,t)=>{sino(c,392,t,.5,.08);sino(c,370,t+.16,.6,.08)},
  "windows-balao":(c,t)=>{sino(c,1175,t,.55,.06,[[1,1],[2,.3]]);sino(c,1568,t+.075,.7,.06,[[1,1],[2,.3]])},
  "windows-erro":(c,t)=>{sino(c,523,t,.9,.09,[[1,1],[2.5,.3],[4.1,.1]]);sino(c,659,t,.9,.05)},
  "windows-uac":(c,t)=>{sino(c,880,t,.4,.05);sino(c,659,t+.12,.7,.07)},
  "email":(c,t)=>{sino(c,1047,t,.5,.06);sino(c,1319,t+.1,.5,.05);sino(c,1568,t+.2,.8,.05)},
  "notificacao":(c,t)=>{sino(c,1568,t,.6,.06,[[1,1],[2.4,.2]])},
  "notificacao-pop":(c,t)=>{gota(c,900,520,t,.12,.12)},
  "clique":(c,t)=>{tique(c,t,.09)},
  "orkut":(c,t)=>{sino(c,880,t,.35,.07,[[1,1],[4,.25]]);sino(c,1175,t+.09,.45,.06,[[1,1],[4,.2]])},
  "facebook":(c,t)=>{gota(c,1300,1100,t,.09,.08);gota(c,1700,1500,t+.085,.12,.07)},
  "whatsapp":(c,t)=>{tique(c,t,.04);gota(c,1250,620,t+.005,.11,.14);gota(c,1500,900,t+.12,.09,.07)},
  "iphone":(c,t)=>{sino(c,1661,t,.35,.06,[[1,1],[2,.25]]);sino(c,1245,t+.13,.35,.06,[[1,1],[2,.25]]);sino(c,1661,t+.26,.6,.06,[[1,1],[2,.25]])},
  "celular-sms":(c,t)=>{[[0,.06],[.1,.06],[.2,.06],[.36,.16],[.56,.16],[.8,.06],[.9,.06],[1,.06]].forEach(([o,d])=>bipe(c,1760,t+o,d,.075))},
  "moeda":(c,t)=>{bipe(c,988,t,.08,.08);bipe(c,1319,t+.08,.32,.08)},
  "vuvuzela":(c,t)=>{const o=c.createOscillator(),g=c.createGain(),l=c.createOscillator(),lg=c.createGain(),bp=c.createBiquadFilter();o.type="sawtooth";o.frequency.value=233;l.frequency.value=5.5;lg.gain.value=4;l.connect(lg).connect(o.frequency);bp.type="bandpass";bp.frequency.value=700;bp.Q.value=.8;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.09,t+.15);g.gain.setValueAtTime(.09,t+1.5);g.gain.linearRampToValueAtTime(0,t+1.8);o.connect(bp).connect(g).connect(c.destination);o.start(t);l.start(t);o.stop(t+1.85);l.stop(t+1.85)},
  "twitter":(c,t)=>{[0,.07,.14].forEach((o,i)=>gota(c,2600+i*300,3400+i*300,t+o,.06,.09))},
  "snapchat":(c,t)=>{gota(c,600,1200,t,.1,.08);gota(c,800,1600,t+.1,.12,.07)},
  "tiktok":(c,t)=>{gota(c,1400,700,t,.08,.09);gota(c,1800,900,t+.08,.1,.07)},
  "instagram":(c,t)=>{sino(c,1319,t,.4,.05);sino(c,1760,t+.09,.5,.05)},
  "pokemon":(c,t)=>{[523,659,784,1047].forEach((f,i)=>bipe(c,f,t+i*.09,.09,.07));bipe(c,1047,t+.4,.3,.07)},
  "pix":(c,t)=>{sino(c,1047,t,.4,.06);sino(c,1397,t+.1,.4,.06);sino(c,2093,t+.2,.8,.05)},
  "delivery":(c,t)=>{sino(c,988,t,.6,.07);sino(c,784,t+.22,.9,.07)},
  "reuniao":(c,t)=>{gota(c,500,380,t,.18,.09)},
  "tumblr":(c,t)=>{gota(c,700,1100,t,.1,.07);sino(c,1320,t+.08,.4,.04)},
  "modem":null
};
function imitar(nome,fallback){if(!SND.on)return;const f=SYNTH[nome];if(!f){fallback&&fallback();return}const c=actx();if(!c)return;f(c,c.currentTime+.03)}

// som real: se existir sons/<nome>.mp3 no site, toca o arquivo; se não, usa a imitação sintetizada
// sons/lista.json diz quais MP3 existem (evita pedir arquivos que não estão lá)
const SOM_OK={};let SONS_LISTA=null;
fetch("sons/lista.json",{cache:"no-cache"}).then(r=>r.ok?r.json():[]).then(l=>{SONS_LISTA=new Set(Array.isArray(l)?l.map(x=>String(x).replace(/\.mp3$/,"")):[])}).catch(()=>{SONS_LISTA=new Set()});
function tocarSom(nome,fallback){
  if(!SND.on)return;
  const sint=()=>imitar(nome,fallback);
  if(!nome||SOM_OK[nome]===false||!SONS_LISTA||!SONS_LISTA.has(nome)){sint();return}
  const au=new Audio("sons/"+nome+".mp3");au.volume=.6;
  au.play().then(()=>{SOM_OK[nome]=true}).catch(()=>{SOM_OK[nome]=false;sint()});
}
let ALERTA_VISTO;try{ALERTA_VISTO=new Set(JSON.parse(sessionStorage.getItem("ns_alertas_vistos")||"[]"))}catch(e){ALERTA_VISTO=new Set()}
const guardarVistos=()=>{try{sessionStorage.setItem("ns_alertas_vistos",JSON.stringify([...ALERTA_VISTO]))}catch(e){}};
// estilos de celular/app (2013+): aparecem de cima, como notificação no celular
const DE_CIMA=new Set(["zap","fb2","snap","poke","tt","pix","igs","meet","ios","tum"]);
function alertasDaEpoca(m,isPhoto){
  const y=parseInt(m.y)||2020,net=isPhoto?pEra(m.y):null;
  return ALERTAS.filter(a=>(isPhoto?(a.net?a.net.includes(net):(a.y&&y>=a.y[0]&&y<=a.y[1]&&a.v!=="dl")):(a.y&&y>=a.y[0]&&y<=a.y[1]))&&(!a.cond||a.cond(m)));
}
function sortearAlerta(m,isPhoto){
  let L=alertasDaEpoca(m,isPhoto);if(!L.length)return null;
  let novos=L.filter(a=>!ALERTA_VISTO.has(a.id));if(!novos.length){L.forEach(a=>ALERTA_VISTO.delete(a.id));guardarVistos();novos=L}
  const tot=novos.reduce((s,a)=>s+(a.w||1),0);let r=Math.random()*tot;
  for(const a of novos){r-=a.w||1;if(r<=0)return a}return novos[0];
}
function alertasLigados(){try{return localStorage.getItem("ns_alertas")!=="0"}catch(e){return true}}
function mostrarAlerta(el,m,a){
  if(!a||!el)return;
  const win=el.querySelector(".vw-win")||el;
  win.querySelectorAll(".etoast").forEach(x=>x.remove());
  ALERTA_VISTO.add(a.id);guardarVistos();
  const tx=typeof a.tx==="function"?a.tx(m):a.tx;
  const t=document.createElement("div");t.className="etoast "+a.v+(DE_CIMA.has(a.v)?" top":"");t.setAttribute("role","status");
  const bts=a.bts?a.bts.map(b=>`<button class="eb" data-ok="1">${b}</button>`).join(""):a.bt?`<button class="eb" data-ok="1">${a.bt}</button>`:"";
  t.innerHTML=`<b class="ei">${icon(a.ic||"comment","in")}</b><span class="et">${a.ti?`<em>${a.ti}</em>`:""}<span class="etx">${escapeHtml(tx)}</span>${a.bar!=null?`<i class="ebar"><s style="width:${a.bar*100}%"></s></i>`:""}${bts?`<span class="ebs">${bts}</span>`:""}</span><button class="ex" aria-label="Fechar aviso">${icon("xmark","in")}</button>`;
  t.addEventListener("click",ev=>{ev.stopPropagation();
    if(ev.target.closest(".ex")){t.remove();return}
    const b=ev.target.closest("[data-ok]");if(!b)return;
    if(a.on)tocarSom(a.id==="caiu"?"modem":"clique",a.on);else tocarSom("clique",sndClick);
    if(a.ok){t.querySelector(".etx").textContent=a.ok;const s=t.querySelector(".ebs");s&&s.remove();clearTimeout(t._t);t._t=setTimeout(()=>t.remove(),3500)}else t.remove();
  });
  win.appendChild(t);
  encaixarAlerta(t,win);
  tocarSom(a.som,a.s);
  if(a.shake){const w=win;if(w){w.classList.remove("shake");void w.offsetWidth;w.classList.add("shake")}}
  t._t=setTimeout(()=>t.remove(),a.bt||a.bts?11000:7000);
  return t;
}
// o aviso fica sempre dentro da parte visível do player (no celular a janela pode estar rolada por dentro:
// aí o "bottom/top" do CSS cairia fora da tela). Mede e corrige com margem.
function encaixarAlerta(t,win){
  if(!t||!win||win===document.body)return;
  const pad=window.innerWidth<=700?8:12;
  t.style.marginTop="";t.style.marginBottom="";
  const r=t.getBoundingClientRect(),w=win.getBoundingClientRect();
  if(!r.height)return;
  const topoVis=Math.max(w.top,0)+pad,baseVis=Math.min(w.bottom,window.innerHeight)-pad;
  if(t.classList.contains("top")){const d=topoVis-r.top;if(Math.abs(d)>1)t.style.marginTop=d+"px"}
  else{const d=r.bottom-baseVis;if(Math.abs(d)>1)t.style.marginBottom=d+"px"}
}
function alertaDaEpoca(el,m,isPhoto){if(!alertasLigados())return null;return mostrarAlerta(el,m,sortearAlerta(m,isPhoto))}
