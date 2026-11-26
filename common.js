// Avatar de gatinho (do protótipo original)

const SG={
 fur:[["Cinza","#9b9ba1"],["Laranja","#e8932f"],["Preto","#24242a"],["Branco","#f2eee6"],["Marrom","#8a6a45"],["Grafite","#5b5c66"],["Creme","#e6c99a"],["Azulado","#7d8ca6"],["Chocolate","#4a3226"],["Rosa (Sphynx)","#efb6c4"],["Prata","#c9ccd4"],["Caramelo","#c98a45"],["Canela","#a0623e"],["Lilás","#b9a7b8"],["Dourado","#dcae5a"]],
 pat:["Liso","Tigrado","Pintado","Smoking","Máscara","Tartaruga","Tricolor","Siamês","Peludo"],
 eye:[["Âmbar","#e6a21a"],["Verde","#5bbf3a"],["Azul","#2f8cff"],["Esmeralda","#19c29a"],["Roxo","#9a5cff"],["Mel","#c98a2a"],["Cinza","#9aa7b3"],["Heterocromia (azul e âmbar)","#2f8cff","#e6a21a"]],
 acc:[["Nenhum"],["Óculos redondo"],["Óculos escuro"],["Boné"],["Gorro"],["Fone"],["Bandana"],["Corrente"],["Monóculo"],["Viseira"],["Piercing na sobrancelha"],["Laço"],["Coroa"],["Gravata-borboleta"],["Cartola"],["Brinco de argola"],["Óculos 3D"],["Coleira com sininho"]],
 clo:[["Hoodie","#1c1c24"],["Camiseta","#ececec"],["Jaqueta jeans","#3d6aa8"],["Moletom","#cfc7b4"],["Jaqueta bomber","#4b5a3a"],["Camisa xadrez","#b3262d"],["Regata","#22222a"],["Pelado","#0000"],["Camisa canarinho","#f4d01e"],["Camisa florida","#1fa3a0"],["Terno","#2b2f3a"],["Listrada","#f4f4f4"],["Puffer","#e2542f"],["Suéter de tricô","#7a4ea8"]],
 bg:[["Azul",["#2a6bff","#0a2a8a"]],["Roxo",["#7a4dff","#2a1070"]],["Rosa",["#ff6bd0","#7a2aa8"]],["Verde",["#19c29a","#06503f"]],["Sol",["#ffb12a","#d9561a"]],["Noite",["#1a1f4a","#05060f"]],["Menta",["#7ef0c8","#1a8a7a"]],["Vermelho",["#ff5a6a","#7a1030"]]]
};
// ícones coloridos dos acessórios no editor (desenhos próprios, no lugar de emoji: mesma ordem de SG.acc)
const SG_ACC_ICO=[
 '<circle cx="16" cy="16" r="11" fill="none" stroke="#e5383b" stroke-width="3.4"/><path d="M8.5 23.5L23.5 8.5" stroke="#e5383b" stroke-width="3.4" stroke-linecap="round"/>',
 '<circle cx="9.5" cy="17" r="6" fill="#bfe3ff" fill-opacity=".55" stroke="#2a2a30" stroke-width="2.4"/><circle cx="22.5" cy="17" r="6" fill="#bfe3ff" fill-opacity=".55" stroke="#2a2a30" stroke-width="2.4"/><path d="M15.5 16q.5-2 1 0M3.5 15L1.5 13M28.5 15l2-2" stroke="#2a2a30" stroke-width="2" fill="none" stroke-linecap="round"/>',
 '<rect x="2.5" y="11" width="12" height="9" rx="3.5" fill="#15151b"/><rect x="17.5" y="11" width="12" height="9" rx="3.5" fill="#15151b"/><path d="M14.5 13.5h3" stroke="#15151b" stroke-width="2"/><path d="M5 13.5h4M20 13.5h4" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>',
 '<path d="M5 20Q5 7 16 7Q27 7 27 20Z" fill="#2d5bd1"/><path d="M4 20h18q8 0 9 4H4z" fill="#1c3f9c"/><circle cx="16" cy="7" r="1.8" fill="#1c3f9c"/><path d="M16 8v11" stroke="#4f7ae6" stroke-width="1.2"/>',
 '<path d="M6 22Q6 8 16 8Q26 8 26 22Z" fill="#d6453a"/><rect x="4.5" y="19" width="23" height="6" rx="3" fill="#9e2e20"/><circle cx="16" cy="6.5" r="3.6" fill="#f2f2f2"/><path d="M11 11v8M16 10v9M21 11v8" stroke="#b8352b" stroke-width="1.2"/>',
 '<path d="M6 19Q5 5 16 5Q27 5 26 19" stroke="#2a2a33" stroke-width="2.8" fill="none"/><rect x="3" y="16" width="7" height="11" rx="3.5" fill="#2a2a36"/><rect x="22" y="16" width="7" height="11" rx="3.5" fill="#2a2a36"/><rect x="4.8" y="18" width="3.4" height="7" rx="1.7" fill="#3d8bff"/><rect x="23.8" y="18" width="3.4" height="7" rx="1.7" fill="#3d8bff"/>',
 '<path d="M3 8Q16 13 29 8L16 28Z" fill="#d6282f"/><circle cx="12" cy="13" r="1.4" fill="#fff"/><circle cx="20" cy="13" r="1.4" fill="#fff"/><circle cx="16" cy="19" r="1.4" fill="#fff"/><circle cx="16" cy="11" r="1.1" fill="#fff"/>',
 '<g fill="none" stroke="#e8b923" stroke-width="2.4"><ellipse cx="7" cy="9" rx="4" ry="2.6" transform="rotate(35 7 9)"/><ellipse cx="12.5" cy="15" rx="4" ry="2.6" transform="rotate(55 12.5 15)"/><ellipse cx="19.5" cy="18.5" rx="4" ry="2.6" transform="rotate(10 19.5 18.5)"/><ellipse cx="25.5" cy="23.5" rx="4" ry="2.6" transform="rotate(50 25.5 23.5)"/></g><path d="M8 10l3 3M21 19l3 3" stroke="#a8800f" stroke-width="1"/>',
 '<circle cx="13" cy="13" r="8.5" fill="#dff1ff" fill-opacity=".7" stroke="#d4a82a" stroke-width="2.6"/><path d="M10 9.5q2-2 5-1" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M20 19Q25 24 22 30" stroke="#d4a82a" stroke-width="1.6" fill="none" stroke-dasharray="2 1.6"/>',
 '<path d="M3 14Q16 8 29 14" stroke="#eeeeee" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M3 14Q16 8 29 14" stroke="#b8bec6" stroke-width="1" fill="none"/><path d="M5 15.5Q16 10 27 15.5Q26 24 16 23Q6 24 5 15.5Z" fill="#19c29a"/><path d="M8 17Q16 13 24 17" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
 '<path d="M3 16Q12 8 24 10" stroke="#6b4a2e" stroke-width="4.2" fill="none" stroke-linecap="round"/><path d="M20 7Q26 10 26 18" stroke="#aab2bd" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="20" cy="7" r="3.6" fill="#eef1f5" stroke="#6f7884" stroke-width="1.2"/><circle cx="26" cy="19" r="3.6" fill="#eef1f5" stroke="#6f7884" stroke-width="1.2"/><circle cx="19" cy="6" r="1.1" fill="#fff"/><circle cx="25" cy="18" r="1.1" fill="#fff"/>',
 '<path d="M16 16L4 8Q1 16 4 24Z" fill="#ff4fa3"/><path d="M16 16L28 8Q31 16 28 24Z" fill="#ff4fa3"/><path d="M7 11l5 5M25 11l-5 5" stroke="#c22f7a" stroke-width="1.4"/><path d="M14 18l-4 9M18 18l4 9" stroke="#e0338c" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="16" r="3.6" fill="#e0338c"/>',
 '<path d="M4 25L2.5 9L10 15L16 5L22 15L29.5 9L28 25Z" fill="#f4c430" stroke="#c9971a" stroke-width="1.4" stroke-linejoin="round"/><rect x="4" y="23" width="24" height="4" rx="1" fill="#e0ad1f"/><circle cx="16" cy="18" r="2.4" fill="#e0245e"/><circle cx="9.5" cy="20" r="1.8" fill="#2f8cff"/><circle cx="22.5" cy="20" r="1.8" fill="#19c29a"/>',
 '<path d="M16 16L4 9Q2 16 4 23Z" fill="#c21f3a"/><path d="M16 16L28 9Q30 16 28 23Z" fill="#c21f3a"/><path d="M7 12l4 4-4 4M25 12l-4 4 4 4" stroke="#8f1429" stroke-width="1.2" fill="none"/><rect x="12.5" y="12.5" width="7" height="7" rx="2.4" fill="#8f1429"/>',
 '<rect x="8" y="3" width="16" height="19" rx="2" fill="#17171d"/><rect x="8" y="17" width="16" height="4" fill="#c0303a"/><ellipse cx="16" cy="23.5" rx="14" ry="3.6" fill="#24242c"/><path d="M11 5v11" stroke="#ffffff30" stroke-width="2"/>',
 '<path d="M16 3.5Q20 3.5 19.5 8" stroke="#c9971a" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="16" cy="18" r="9.5" fill="none" stroke="#f0c040" stroke-width="3.6"/><path d="M8.5 14q2.5-5 7-5.5" stroke="#fff6c8" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M22 25q-2 2-5 2.4" stroke="#b8901a" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
 '<rect x="2.5" y="10" width="12" height="11" rx="1.6" fill="#ff2d3d" fill-opacity=".8" stroke="#f6f6f6" stroke-width="2.2"/><rect x="17.5" y="10" width="12" height="11" rx="1.6" fill="#22d3ee" fill-opacity=".8" stroke="#f6f6f6" stroke-width="2.2"/><rect x="2.5" y="10" width="27" height="11" rx="1.6" fill="none" stroke="#9aa3ad" stroke-width=".8"/><path d="M14.5 13h3" stroke="#f6f6f6" stroke-width="2.2"/>',
 '<path d="M3 9Q16 18 29 9" stroke="#d6282f" stroke-width="4.4" fill="none" stroke-linecap="round"/><circle cx="8" cy="11.2" r="1" fill="#f2c230"/><circle cx="24" cy="11.2" r="1" fill="#f2c230"/><path d="M16 15v3" stroke="#a8800f" stroke-width="1.6"/><path d="M10.5 26Q10.5 18 16 18Q21.5 18 21.5 26Z" fill="#f2c230"/><rect x="9.5" y="25" width="13" height="2.4" rx="1.2" fill="#d9a91d"/><circle cx="16" cy="28.4" r="1.6" fill="#6b5410"/><path d="M13 21q1-1.6 2.6-1.8" stroke="#fff6c8" stroke-width="1.2" fill="none" stroke-linecap="round"/>'
];
const sgIco=i=>`<svg class="sg-ic" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${SG_ACC_ICO[i]||""}</svg>`;
let sgN=0;
const SPHYNX=9; // "Rosa" vira gato Sphynx (sem pelo)
// cores derivadas do pelo (sombra e brilho) para o gatinho "Fofinho"
function mixHex(a,b,t){const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const A=p(a),B=p(b);return"#"+A.map((x,i)=>Math.round(x+(B[i]-x)*t).toString(16).padStart(2,"0")).join("")}
const lumHex=h=>{const p=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);return .2126*p[0]+.7152*p[1]+.0722*p[2]};
// Gatinho "fofinho" (nov/2026): só o desenho mudou. As opções salvas (fur, pat, eye, acc, clo, bg) continuam as mesmas,
// então quem já montou o gato vê o mesmo gato, com o traço novo.
function catSVG(o){
  const sph=o.fur===SPHYNX,id="g"+(sgN++);
  const fur=sph?"#efb6c4":SG.fur[o.fur][1],eyes=[SG.eye[o.eye][1],SG.eye[o.eye][2]||SG.eye[o.eye][1]],bg=SG.bg[o.bg][1],clo=o.clo,acc=o.acc,pat=sph?0:o.pat;
  const claro=lumHex(fur)>.55;
  const ln="",lnS=""; // sem contorno (estilo Fofinho)
  const dk=claro?"rgba(80,60,40,.30)":"rgba(0,0,0,.30)";
  const furL=mixHex(fur,"#ffffff",claro?.35:.22),furD=mixHex(fur,"#000000",.18);
  const inner=sph?"#e58aa1":"#f3a7b5";
  let s=`<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><defs>
   <radialGradient id="${id}" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient>
   <radialGradient id="${id}h" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="${furL}"/><stop offset="1" stop-color="${fur}"/></radialGradient>
   <pattern id="${id}p" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 6H12M6 0V12" stroke="#00000055" stroke-width="2"/></pattern>
   <pattern id="${id}l" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="5" fill="#1f3a7a"/></pattern>
   <pattern id="${id}t" width="10" height="9" patternUnits="userSpaceOnUse"><path d="M0 2L2.5 6L5 2L7.5 6L10 2" stroke="#ffffff40" stroke-width="1.6" fill="none"/></pattern>
   <radialGradient id="${id}s" cx="50%" cy="62%" r="42%"><stop offset="0" stop-color="${mixHex(fur,"#2a1a12",.62)}"/><stop offset=".65" stop-color="${mixHex(fur,"#2a1a12",.45)}" stop-opacity=".7"/><stop offset="1" stop-color="${fur}" stop-opacity="0"/></radialGradient></defs>
   <rect width="200" height="200" fill="url(#${id})"/>`;
  const skin=`url(#${id}h)`;
  // corpo (ombros) + roupa
  const corpo="M34 205Q36 156 76 146L124 146Q164 156 166 205Z";
  s+=`<path d="${corpo}" fill="${fur}" ${ln}/>`;
  const cc=SG.clo[clo][1],gola="M34 205Q36 156 76 146Q100 168 124 146Q164 156 166 205Z";
  if(clo===0) s+=`<path d="${gola}" fill="${cc}" ${ln}/><path d="M64 152Q100 178 136 152" stroke="#2b2b38" stroke-width="7" fill="none"/><path d="M93 168v24M107 168v24" stroke="#ddd" stroke-width="2" stroke-linecap="round"/>`;
  else if(clo===1) s+=`<path d="${gola}" fill="${cc}" ${ln}/><path d="M80 148Q100 164 120 148" stroke="#bbb" stroke-width="3" fill="none"/>`;
  else if(clo===2) s+=`<path d="M34 205Q36 156 76 146L100 172L124 146Q164 156 166 205Z" fill="${cc}" ${ln}/><path d="M100 172V205M76 146L90 178M124 146L110 178" stroke="#25497c" stroke-width="2.5"/>`;
  else if(clo===3) s+=`<path d="${gola}" fill="${cc}" ${ln}/><path d="M76 152Q100 168 124 152" stroke="#a99f88" stroke-width="6" fill="none"/>`;
  else if(clo===4) s+=`<path d="${gola}" fill="${cc}" ${ln}/><path d="M100 162V205" stroke="#2c3a20" stroke-width="3"/><path d="M66 150Q100 168 134 150" stroke="#d98a2a" stroke-width="6" fill="none"/>`;
  else if(clo===5) s+=`<path d="${gola}" fill="${cc}" ${ln}/><path d="${gola}" fill="url(#${id}p)"/><path d="M84 150L100 168L116 150" stroke="#7a1218" stroke-width="3" fill="none"/>`;
  else if(clo===6) s+=`<path d="M72 148L78 205M128 148L122 205" stroke="${cc}" stroke-width="10"/>`;
  else if(clo===8) s+=`<path d="${gola}" fill="${cc}" ${ln}/><path d="M84 150L100 168L116 150" stroke="#1e9a4a" stroke-width="5" fill="none" stroke-linejoin="round"/><path d="M40 196Q44 170 60 160M160 196Q156 170 140 160" stroke="#1e9a4a" stroke-width="4" fill="none"/>`;
  else if(clo===9) s+=`<path d="${gola}" fill="${cc}" ${ln}/><clipPath id="${id}g"><path d="${gola}"/></clipPath><g clip-path="url(#${id}g)">${[[58,172,"#ffd23f"],[86,190,"#ff6b8a"],[120,176,"#ffd23f"],[148,192,"#ff6b8a"],[70,200,"#fff3b0"],[136,160,"#fff3b0"]].map(([x,y,c])=>`<g fill="${c}"><circle cx="${x-5}" cy="${y}" r="5"/><circle cx="${x+5}" cy="${y}" r="5"/><circle cx="${x}" cy="${y-5}" r="5"/><circle cx="${x}" cy="${y+5}" r="5"/></g><circle cx="${x}" cy="${y}" r="3" fill="#c2410c"/>`).join("")}<path d="M50 160l10 8M150 168l-8 10M104 200l10-4" stroke="#0d6b4a" stroke-width="4" stroke-linecap="round"/></g><path d="M84 148L100 166L116 148" stroke="#137a78" stroke-width="3" fill="none"/>`;
  else if(clo===10) s+=`<path d="${gola}" fill="${cc}" ${ln}/><path d="M82 148L100 192L118 148Z" fill="#fff"/><path d="M96 156h8l2 26-6 8-6-8z" fill="#b3262d"/><path d="M76 146L100 192M124 146L100 192" stroke="#1a1d26" stroke-width="4"/><circle cx="100" cy="199" r="2.2" fill="#c8ccd6"/>`;
  else if(clo===11) s+=`<path d="${gola}" fill="${cc}" ${ln}/><path d="${gola}" fill="url(#${id}l)"/><path d="M80 148Q100 162 120 148" stroke="#1f3a7a" stroke-width="4" fill="none"/>`;
  else if(clo===12) s+=`<path d="M30 205Q32 152 74 143Q100 160 126 143Q168 152 170 205Z" fill="${cc}" ${ln}/><g stroke="#a8361b" stroke-width="2.4" fill="none"><path d="M36 176Q100 168 164 176M33 192Q100 184 167 192M48 160Q100 154 152 160"/></g><path d="M100 160V205" stroke="#5a1a0c" stroke-width="3"/><path d="M70 146Q100 162 130 146" stroke="#c4441f" stroke-width="7" fill="none"/>`;
  else if(clo===13) s+=`<path d="${gola}" fill="${cc}" ${ln}/><path d="${gola}" fill="url(#${id}t)"/><path d="M72 150Q100 170 128 150" stroke="#5c3a82" stroke-width="8" fill="none"/><path d="M76 151Q100 168 124 151" stroke="#9a72c8" stroke-width="2" fill="none" stroke-dasharray="2 3"/>`;
  if(acc===6) s+=`<path d="M64 140Q100 152 136 140L100 184Z" fill="#d6282f" ${lnS}/><circle cx="90" cy="152" r="2" fill="#fff"/><circle cx="108" cy="152" r="2" fill="#fff"/><circle cx="99" cy="166" r="2" fill="#fff"/>`;
  if(acc===13) s+=`<path d="M100 152L80 141Q76 152 80 163Z" fill="#c21f3a"/><path d="M100 152L120 141Q124 152 120 163Z" fill="#c21f3a"/><rect x="94" y="146" width="12" height="12" rx="4" fill="#9a1830"/>`;
  if(acc===17) s+=`<path d="M64 146Q100 160 136 146" stroke="#d6282f" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="100" cy="162" r="7.5" fill="#f2c230"/><path d="M93 161h14" stroke="#b8901a" stroke-width="1.6"/><circle cx="100" cy="165" r="1.8" fill="#6b5410"/><circle cx="97" cy="158" r="2" fill="#fff" opacity=".7"/>`;
  // orelhas
  if(sph){
    s+=`<path d="M56 86Q40 40 36 12Q70 26 104 52Z" fill="${fur}" ${ln}/><path d="M144 86Q160 40 164 12Q130 26 96 52Z" fill="${fur}" ${ln}/>
     <path d="M62 74Q50 44 48 26Q72 38 92 54Z" fill="${inner}"/><path d="M138 74Q150 44 152 26Q128 38 108 54Z" fill="${inner}"/>`;
  }else{
    const e=pat===4?"#4b3a30":pat===7?mixHex(fur,"#2a1a12",.55):pat===5?"#2a1d17":fur;
    s+=`<path d="M50 84Q44 40 56 24Q66 18 100 54Z" fill="${e}" ${ln}/><path d="M150 84Q156 40 144 24Q134 18 100 54Z" fill="${e}" ${ln}/>
     <path d="M60 70Q56 44 62 34Q70 32 88 54Z" fill="${inner}"/><path d="M140 70Q144 44 138 34Q130 32 112 54Z" fill="${inner}"/>`;
    s+=`<path d="M62 40l4 9M68 36l3 9M138 40l-4 9M132 36l-3 9" stroke="${furL}" stroke-width="2" stroke-linecap="round" opacity=".9"/>`;
  }
  // cabeça (bochechas mais largas: "mochi")
  const cab="M100 50C140 50 158 74 158 100C158 112 162 120 156 128C148 142 126 150 100 150C74 150 52 142 44 128C38 120 42 112 42 100C42 74 60 50 100 50Z";
  s+=`<path d="${cab}" fill="${skin}" ${ln}/>`;
  s+=`<clipPath id="${id}c"><path d="${cab}"/></clipPath><g clip-path="url(#${id}c)">`;
  if(pat===1) s+=`<g stroke="${dk}" stroke-width="5" stroke-linecap="round" fill="none"><path d="M100 52v14M88 54q2 8 4 13M112 54q-2 8-4 13M42 98q10-1 16 3M42 110q10 0 15 3M158 98q-10-1-16 3M158 110q-10 0-15 3"/></g>`;
  if(pat===2) s+=`<g fill="${dk}"><ellipse cx="68" cy="70" rx="9" ry="7"/><ellipse cx="134" cy="72" rx="8" ry="6"/><circle cx="52" cy="108" r="7"/><circle cx="150" cy="104" r="6"/></g>`;
  if(pat===3) s+=`<path d="M100 50Q90 76 92 98L108 98Q110 76 100 50Z" fill="#f6f2ea"/><ellipse cx="100" cy="128" rx="34" ry="24" fill="#f6f2ea"/>`;
  if(pat===4) s+=`<ellipse cx="100" cy="104" rx="40" ry="30" fill="#4b3a30" opacity=".55"/>`;
  if(pat===5) s+=`<g><path d="M44 70Q66 52 86 58Q80 80 62 86Q48 88 44 70Z" fill="#2a1d17" opacity=".85"/><path d="M118 56Q146 58 156 86Q140 92 126 80Q114 70 118 56Z" fill="#d9731f" opacity=".9"/><path d="M40 112Q52 104 64 116Q56 132 42 128Z" fill="#d9731f" opacity=".85"/><path d="M138 112Q156 106 160 122Q150 136 140 128Z" fill="#2a1d17" opacity=".85"/><path d="M96 52Q104 62 100 74Q94 64 96 52Z" fill="#d9731f" opacity=".8"/></g>`;
  if(pat===6) s+=`<path d="M100 50Q90 76 92 98L108 98Q110 76 100 50Z" fill="#f6f2ea"/><ellipse cx="100" cy="128" rx="34" ry="24" fill="#f6f2ea"/><path d="M44 66Q64 50 86 56Q82 78 64 84Q48 84 44 66Z" fill="#d9731f"/><path d="M116 56Q144 56 156 82Q138 90 126 78Q114 68 116 56Z" fill="#2a1d17"/>`;
  if(pat===7) s+=`<ellipse cx="100" cy="112" rx="46" ry="38" fill="url(#${id}s)"/>`;
  if(sph) s+=`<g stroke="#d48a9f" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M82 62Q100 55 118 62"/><path d="M86 70Q100 65 114 70"/><path d="M92 77Q100 74 108 77"/></g>`;
  s+=`</g>`;
  if(pat===8){const t=furL;s+=`<path d="M46 112L30 116L42 122L28 130L44 132L34 140L52 138Q46 128 46 112Z" fill="${fur}"/><path d="M154 112L170 116L158 122L172 130L156 132L166 140L148 138Q154 128 154 112Z" fill="${fur}"/><path d="M70 146L76 158L84 148L92 162L100 150L108 162L116 148L124 158L130 146Q100 156 70 146Z" fill="${t}"/><path d="M58 30l-4-10M64 28l2-11M142 30l4-10M136 28l-2-11" stroke="${fur}" stroke-width="3" stroke-linecap="round"/>`}
  // focinho claro
  if(!sph&&pat!==3&&pat!==6) s+=`<ellipse cx="100" cy="124" rx="22" ry="14" fill="#fff" opacity="${claro?.35:.22}"/>`;
  // bochechas rosadas
  s+=`<ellipse cx="66" cy="122" rx="10" ry="6" fill="#ff7a9a" opacity=".38"/><ellipse cx="134" cy="122" rx="10" ry="6" fill="#ff7a9a" opacity=".38"/>`;
  // olhos
  const OY=102,OX=[76,124];
  OX.forEach((x,i)=>{const eye=eyes[i];
    s+=`<ellipse cx="${x}" cy="${OY}" rx="13" ry="14" fill="#fff"/><ellipse cx="${x}" cy="${OY+1}" rx="11" ry="12.5" fill="${eye}"/>
       <ellipse cx="${x}" cy="${OY+2}" rx="6.5" ry="9" fill="#14101a"/><circle cx="${x-4}" cy="${OY-5}" r="4" fill="#fff"/><circle cx="${x+4}" cy="${OY+5.5}" r="1.8" fill="#fff" opacity=".9"/>
       <path d="M${x-13} ${OY-8}Q${x} ${OY-18} ${x+13} ${OY-8}" stroke="${furD}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>`;
  });
  // nariz e boquinha em "w"
  s+=`<path d="M94.5 116q5.5-2.5 11 0q-1.5 5-5.5 6.5q-4-1.5-5.5-6.5z" fill="#ef8ea0"/>
   <path d="M100 122.5v3M100 125.5q-4 5-9 1.5M100 125.5q4 5 9 1.5" stroke="#4a2f34" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  // bigodes
  if(!sph){const w=claro?"#7a6a5a":"#ffffff";s+=`<g stroke="${w}" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M70 122Q54 118 38 120M70 127Q55 128 40 134M130 122Q146 118 162 120M130 127Q145 128 160 134"/></g>`}
  // acessórios (posições dos olhos novas)
  if(acc===1) s+=`<g fill="none" stroke="#2a2a30" stroke-width="3.2"><circle cx="76" cy="102" r="16"/><circle cx="124" cy="102" r="16"/><path d="M92 100q8-5 16 0M60 98L46 92M140 98L154 92"/></g>`;
  if(acc===2) s+=`<g fill="#0c0c12"><rect x="57" y="90" width="38" height="24" rx="10"/><rect x="105" y="90" width="38" height="24" rx="10"/></g><path d="M95 96h10M57 96L45 90M143 96L155 90" stroke="#0c0c12" stroke-width="3.2"/><path d="M64 97h12M112 97h12" stroke="#fff" stroke-opacity=".45" stroke-width="2.4" stroke-linecap="round"/>`;
  if(acc===3) s+=`<path d="M50 72Q52 26 100 26Q148 26 150 72Q100 58 50 72Z" fill="#2d5bd1" ${lnS}/><path d="M50 70Q100 56 150 70Q172 74 178 82Q122 68 50 76Z" fill="#1c3f9c" ${lnS}/><circle cx="100" cy="26" r="4.5" fill="#1c3f9c"/>`;
  if(acc===4) s+=`<path d="M48 76Q50 22 100 22Q150 22 152 76Q100 62 48 76Z" fill="#c8402f" ${lnS}/><rect x="46" y="66" width="108" height="15" rx="7.5" fill="#9e2e20" ${lnS}/><circle cx="100" cy="18" r="8" fill="#eee" ${lnS}/>`;
  if(acc===5) s+=`<path d="M46 106Q38 24 100 24Q162 24 154 106" stroke="#222" stroke-width="7" fill="none"/><rect x="32" y="88" width="20" height="36" rx="10" fill="#2a2a36" ${lnS}/><rect x="148" y="88" width="20" height="36" rx="10" fill="#2a2a36" ${lnS}/><rect x="37" y="95" width="9" height="22" rx="4.5" fill="#3d8bff"/><rect x="154" y="95" width="9" height="22" rx="4.5" fill="#3d8bff"/>`;
  if(acc===7) s+=`<path d="M70 150Q100 180 130 150" stroke="#f0c040" stroke-width="5" fill="none" stroke-dasharray="7 3"/>`;
  if(acc===8) s+=`<circle cx="124" cy="102" r="17" fill="#ffffff14" stroke="#d4a82a" stroke-width="3"/><path d="M140 114Q148 146 136 176" stroke="#d4a82a" stroke-width="1.8" fill="none"/>`;
  if(acc===9) s+=`<path d="M48 74Q100 56 152 74" stroke="#f4f4f4" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M54 76Q100 62 146 76Q144 92 100 90Q56 92 54 76Z" fill="#19c29a" opacity=".85"/><path d="M62 80Q100 70 138 80" stroke="#fff" stroke-opacity=".5" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  if(acc===10) s+=`<path d="M130 80Q138 83 139 93" stroke="#c3cad4" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="130" cy="80" r="4" fill="#eef1f5" stroke="#7d8591" stroke-width="1.2"/><circle cx="139" cy="93" r="4" fill="#eef1f5" stroke="#7d8591" stroke-width="1.2"/><circle cx="128.8" cy="78.8" r="1.3" fill="#fff"/><circle cx="137.8" cy="91.8" r="1.3" fill="#fff"/>`;
  if(acc===11) s+=`<g transform="rotate(-18 136 54)"><path d="M136 54L112 40Q106 54 112 68Z" fill="#ff4fa3"/><path d="M136 54L160 40Q166 54 160 68Z" fill="#ff4fa3"/><path d="M118 46L128 54M154 46L144 54" stroke="#c22f7a" stroke-width="2"/><circle cx="136" cy="54" r="6.5" fill="#e0338c"/></g>`;
  if(acc===12) s+=`<path d="M66 60L62 28L82 44L100 20L118 44L138 28L134 60Q100 52 66 60Z" fill="#f4c430" stroke="#c9971a" stroke-width="2" stroke-linejoin="round"/><circle cx="100" cy="46" r="4.5" fill="#e0245e"/><circle cx="80" cy="52" r="3.2" fill="#2f8cff"/><circle cx="120" cy="52" r="3.2" fill="#19c29a"/><circle cx="62" cy="28" r="3" fill="#f4c430"/><circle cx="100" cy="20" r="3.4" fill="#f4c430"/><circle cx="138" cy="28" r="3" fill="#f4c430"/>`;
  if(acc===14) s+=`<rect x="68" y="2" width="64" height="56" rx="5" fill="#17171d"/><rect x="68" y="42" width="64" height="11" fill="#b3262d"/><ellipse cx="100" cy="60" rx="52" ry="9" fill="#24242c"/><path d="M76 8v34" stroke="#ffffff22" stroke-width="5"/>`;
  if(acc===15) s+=`<circle cx="52" cy="80" r="6.5" fill="none" stroke="#f0c040" stroke-width="2.6"/><circle cx="148" cy="80" r="6.5" fill="none" stroke="#f0c040" stroke-width="2.6"/>`;
  if(acc===16) s+=`<rect x="56" y="88" width="40" height="27" rx="3" fill="#ff2d3d" fill-opacity=".55" stroke="#f6f6f6" stroke-width="4"/><rect x="104" y="88" width="40" height="27" rx="3" fill="#22d3ee" fill-opacity=".55" stroke="#f6f6f6" stroke-width="4"/><path d="M96 96h8M56 94L44 88M144 94L156 88" stroke="#f6f6f6" stroke-width="4"/>`;
  return s+"</svg>";
}

const rnd=n=>Math.floor(Math.random()*n);
let sgO={fur:0,pat:1,eye:0,acc:0,clo:0,bg:0},sgTab=0;
const SG_TABS=["Pelo","Acessórios","Roupa","Fundo"];
function sgRender(){
  document.getElementById("sgBig").innerHTML=catSVG(sgO);const br=document.getElementById("sgBreed");if(br)br.innerHTML=sgO.fur===SPHYNX?"Raça: <b>Sphynx</b> · sem pelo, orelhas grandes e muitas ruguinhas":sgO.pat===7?"Raça: <b>Siamês</b> · pontas escuras no rosto e nas orelhas":"Raça: <b>Gato padrão</b> · "+SG.fur[sgO.fur][0].toLowerCase()+(sgO.pat===8?", pelo longo":"");
  // o redesenho troca os botões: guarda onde estava o foco para devolvê-lo ao equivalente (teclado)
  const ae=document.activeElement,tabs0=document.getElementById("sgTabs"),opts0=document.getElementById("sgOpts");
  const focoAba=ae&&tabs0.contains(ae)?[...tabs0.children].indexOf(ae):-1;
  const focoOpt=ae&&opts0.contains(ae)&&ae.classList.contains("sg-o")?[...opts0.querySelectorAll(".sg-o")].indexOf(ae):-1;
  tabs0.innerHTML=SG_TABS.map((t,i)=>`<button type="button" role="tab" id="sgTab${i}" aria-selected="${i===sgTab}" aria-controls="sgOpts" tabindex="${i===sgTab?0:-1}" class="${i===sgTab?'on':''}" onclick="sgTab=${i};sgRender()">${t}</button>`).join("");
  opts0.setAttribute("aria-labelledby","sgTab"+sgTab);
  const sel=(k,i)=>sgO[k]===i?" on":"";
  const pr=(k,i)=>`aria-pressed="${sgO[k]===i}"`;
  let h="";
  if(sgTab===0){
    h+=`<h5>COR DO PELO</h5><div class="sg-row">${SG.fur.map((f,i)=>`<button type="button" class="sg-o${sel('fur',i)}" title="${f[0]}" aria-label="Pelo ${f[0]}" ${pr('fur',i)} onclick="sgSet('fur',${i})"><i style="background:${f[1]}"></i></button>`).join("")}</div>`;
    const sph=sgO.fur===SPHYNX;
    h+=`<h5>PADRÃO${sph?'<em>Sphynx não tem pelo, então não tem padrão</em>':''}</h5><div class="sg-row">${SG.pat.map((p,i)=>`<button type="button" class="sg-o sq${sph?'':sel('pat',i)}" ${sph?'disabled':''} aria-pressed="${!sph&&sgO.pat===i}" onclick="sgSet('pat',${i})">${p}</button>`).join("")}</div>`;
    h+=`<h5>COR DOS OLHOS</h5><div class="sg-row">${SG.eye.map((f,i)=>`<button type="button" class="sg-o${sel('eye',i)}" title="${f[0]}" aria-label="Olhos ${f[0]}" ${pr('eye',i)} onclick="sgSet('eye',${i})"><i style="background:${f[2]?`linear-gradient(90deg,${f[1]} 50%,${f[2]} 50%)`:f[1]}"></i></button>`).join("")}</div>`;
  }
  if(sgTab===1) h+=`<h5>ACESSÓRIOS (OPCIONAL)</h5><div class="sg-row">${SG.acc.map((a,i)=>`<button type="button" class="sg-o sq${sel('acc',i)}" ${pr('acc',i)} onclick="sgSet('acc',${i})">${sgIco(i)}${a[0]}</button>`).join("")}</div>`;
  if(sgTab===2) h+=`<h5>ROUPA (OPCIONAL)</h5><div class="sg-row">${SG.clo.map((c,i)=>[c,i]).sort((a,b)=>(a[1]===7)-(b[1]===7)).map(([c,i])=>`<button type="button" class="sg-o sq${sel('clo',i)}" ${pr('clo',i)} onclick="sgSet('clo',${i})"><i style="background:${c[1]==='#0000'?'#222':c[1]};width:26px;height:26px;margin-bottom:4px"></i>${c[0]}</button>`).join("")}</div>`;
  if(sgTab===3) h+=`<h5>FUNDO</h5><div class="sg-row">${SG.bg.map((b,i)=>`<button type="button" class="sg-o${sel('bg',i)}" title="${b[0]}" aria-label="Fundo ${b[0]}" ${pr('bg',i)} onclick="sgSet('bg',${i})"><i style="background:radial-gradient(circle at 35% 30%,${b[1][0]},${b[1][1]})"></i></button>`).join("")}</div>`;
  opts0.innerHTML=h;
  if(focoAba>=0){const b=tabs0.children[focoAba];b&&b.focus({preventScroll:true})}
  else if(focoOpt>=0){const b=opts0.querySelectorAll(".sg-o")[focoOpt];b&&b.focus({preventScroll:true})}
}
function sgSet(k,i){sgO[k]=i;sgRender()}
function sgShuffle(){sgO={fur:rnd(SG.fur.length),pat:rnd(SG.pat.length),eye:rnd(SG.eye.length),acc:rnd(SG.acc.length),clo:rnd(SG.clo.length),bg:rnd(SG.bg.length)};sgRender()}

// =====================================================================
//  NÃO SALVO — estado compartilhado entre Acervo, Álbum e Economia
//  (protótipo: tudo fica no navegador; num site real isso vira backend)
// =====================================================================
const NS_KEY="naosalvo2_state";

// ---- Economia: o servidor é a autoridade (moedas, XP, patente, cartas, pacotes) ----
// O navegador só mostra o que a API devolve (cliente-economia.js). Nada de economia é calculado nem guardado aqui.
const RARITIES=["Comum","Relevante","Raro","Relíquia","Lendário","Mítico"];

// ---- Patentes: só para mostrar a lista e liberar telas do protótipo (a patente do usuário vem do servidor) ----
const RANKS=[
 {id:"discado",name:"Discado",xp:0,color:"#9aa3b2",can:"Navega no acervo, abre pacotes e coleciona cartas."},
 {id:"banda_larga",name:"Banda larga",xp:150,color:"#2fbf5b",can:"Pode enviar memes (vídeos e fotos) para o acervo."},
 {id:"colaborador",name:"Colaborador",xp:500,color:"#2f86ff",can:"Pode salvar o link de virais antigos que estão sem vídeo."},
 {id:"moderador",name:"Moderador",xp:1500,color:"#a855f7",can:"Modera envios de quem tem patente menor."},
 {id:"dono",name:"Dono de comunidade",xp:4000,color:"#f5b70a",can:"Selo dourado no perfil e voto de minerva na moderação."},
 {id:"lenda",name:"Lenda da internet",xp:10000,color:"#ff3b47",can:"Selo vermelho de lenda. Respeito máximo."}
];
const rankOf=xp=>{let r=RANKS[0];RANKS.forEach(k=>{if(xp>=k.xp)r=k});return r}; // só para usuários de exemplo (fila/ranking de mentira)

// ---- Estado local (NÃO é economia): conta de protótipo, envios, links, votos, comentários, favorita ----
// Chaves antigas de economia que ficaram no localStorage são descartadas (decisão: servidor manda, sem importar).
const ECON_ANTIGA=["xp","coins","owned","completed","daily","welcome","lastVisit","streak","inv","dayOffset"];
function nsFresh(){return{acct:null,subs:[],links:{},approvedCount:0,modDone:{}}}
let NS=nsFresh();
try{const s=JSON.parse(localStorage.getItem(NS_KEY)||"null");if(s){const sujo=ECON_ANTIGA.some(k=>k in s);ECON_ANTIGA.forEach(k=>delete s[k]);NS=Object.assign(nsFresh(),s);if(sujo)localStorage.setItem(NS_KEY,JSON.stringify(NS))}}catch(e){}
function nsSave(){try{localStorage.setItem(NS_KEY,JSON.stringify(NS))}catch(e){}}
function nsToday(){return new Date().toISOString().slice(0,10)}

// ---- Carteira (vem de GET /api/carteira) ----
let ECO={convidado:false,pronto:false,moedas:0,xp:0,patente:null,proxima_patente:null,pacotes:[],cartas:null,valor_das_repetidas:0};
const economiaPronta=(acao)=>{if(ECO.pronto)return true;if(ECO.convidado){avisoLogin(acao||"usar a sua conta");return false}toast(ECO.indisponivel?"Servidor indisponível. Use “Tentar de novo” e espere carregar.":"Carregando a sua conta… tente de novo em instantes.");return false};
const nivelPatente=()=>{const i=ECO.patente?RANKS.findIndex(k=>k.id===ECO.patente.id):0;return i<0?0:i};
async function atualizarCarteira(){
  const antes=ECO.pronto&&ECO.patente?ECO.patente.id:null;
  const c=await Api.carteira();
  ECO=Object.assign(ECO,c,{pronto:true});
  if(antes&&ECO.patente&&ECO.patente.id!==antes)showRankToast(ECO.patente);
  return ECO;
}
// Revelação em curso (ex.: abrir pacote): quem está revelando liga holdWallet(true). Enquanto isso nada é
// buscado nem redesenhado (a carteira entregaria o resultado). holdWallet(false) busca a carteira, desenha
// e só então mostra o aviso de nova patente (se mudou).
let walletHold=false;
function showRankToast(r){setTimeout(()=>toast(`🎖️ Nova patente: ${r.nome}!`,4200),600)}
async function holdWallet(on){
  walletHold=!!on;if(walletHold)return;
  try{await atualizarCarteira()}catch(e){}
  renderWallet();
}
// visita do dia: 1 vez por carregamento, depois que a sessão existe; o servidor é idempotente por dia
// Se o servidor cair (5xx ou rede), avisa e oferece "Tentar de novo" em vez de deixar a tela vazia sem explicação.
// Convidado (marca ns_convidado): navega, mas álbum, moedas, pacotes e perfil exigem conta. Sem laço de redirecionamento.
function entrarComoConvidado(){
  ECO.convidado=true;ECO.pronto=false;SESSAO=null;
  renderWallet();updateAccount();renderSub();
  if(typeof onConvidado==="function")onConvidado();
}
// aviso "Entre para <ação>" com atalho para o login (abre o diálogo de login)
function avisoLogin(acao){
  toast(`Entre para ${acao}.`,3200);
  openLogin(`Entre para ${acao}.`);
}
let economiaEmCurso=false;
function avisoEconomiaOff(on){
  let b=document.getElementById("ecooff");
  if(!on){if(b)b.remove();return}
  if(b)return;
  b=document.createElement("div");b.id="ecooff";b.setAttribute("role","alert");
  b.style.cssText="position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;background:var(--panel,#fff);color:var(--txt,#111);border:1px solid var(--line2,#bbb);border-radius:12px;padding:10px 14px;box-shadow:0 8px 30px #0004;display:flex;gap:12px;align-items:center;font:600 14px Inter,sans-serif;max-width:calc(100vw - 24px)";
  b.innerHTML='<span>Não consegui falar com o servidor: moedas, álbum e pacotes estão indisponíveis.</span><button type="button" style="flex:none;padding:7px 12px;border-radius:8px;border:0;background:var(--brand,#1597d3);color:#fff;font:700 13px Inter,sans-serif;cursor:pointer">Tentar de novo</button>';
  b.querySelector("button").onclick=()=>iniciarEconomia();
  document.body.appendChild(b);
}
async function iniciarEconomia(){
  if(economiaEmCurso)return;economiaEmCurso=true;
  try{
    try{await carregarSessao()}catch(e){
      if(e&&e.status===401){if(Api.convidado())entrarComoConvidado();return} // 401: sem marca o cliente já redirecionou
      throw e;
    }
    if(!SESSAO)throw {status:0};
    renderSub();
    try{await Api.visita()}catch(e){if(e&&e.status===401)return} // a visita do dia não derruba a tela se falhar
    await atualizarCarteira();
    ECO.indisponivel=false;avisoEconomiaOff(false);
    renderWallet();
    // cadastro_completo=false: abre o criador de gato (pode fechar; reabre no próximo carregamento até salvar)
    if(SESSAO.usuario&&SESSAO.usuario.cadastro_completo===false)openSignup();
    if(typeof onEconomiaPronta==="function")await onEconomiaPronta();
  }catch(e){
    if(e&&e.status===401)return;
    ECO.indisponivel=true;renderWallet();avisoEconomiaOff(true);
  }finally{economiaEmCurso=false}
}


// ---- UI compartilhada ----
function toast(m,ms){let t=document.getElementById("toast");if(!t){t=document.createElement("div");t.id="toast";t.className="toast";document.body.appendChild(t)}
  t.textContent=m;t.style.display="block";clearTimeout(t._t);t._t=setTimeout(()=>t.style.display="none",ms||2400)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
const fmt=n=>Number(n).toLocaleString("pt-BR");

const compactCoins=new Intl.NumberFormat("pt-BR",{notation:"compact",maximumSignificantDigits:3});

function renderWallet(){
  if(walletHold)return;
  const el=document.getElementById("wallet");if(!el)return;
  if(ECO.convidado){
    el.innerHTML=`<button class="wl" onclick="avisoLogin('ver as suas moedas e a sua patente')" title="Entre para guardar moedas e XP" aria-label="Convidado: entre para ver moedas e patente">
    <span class="wl-c">${icon("coin")}<b>0</b></span>
    <span class="wl-r"><em style="color:#9aa3b2">Convidado</em><i><s style="width:0%;background:#9aa3b2"></s></i><small>Entre para guardar moedas e XP</small></span></button>`;
    updateAccount();
    if(typeof onWalletRendered==="function")onWalletRendered();
    return;
  }
  const p=ECO.patente,nx=ECO.proxima_patente;
  const nome=p?p.nome:"…",cor=escapeHtml(p?p.cor:"#9aa3b2");
  const pct=!p?0:nx?Math.max(0,Math.min(100,Math.round((ECO.xp-p.xp_minimo)/(nx.xp_minimo-p.xp_minimo)*100))):100;
  const balance=fmt(ECO.moedas);
  const progress=`${fmt(ECO.xp)} XP${nx?` · ${fmt(nx.faltam)} p/ ${escapeHtml(nx.nome)}`:""}`;
  const description=`${balance} moedas · ${nome} · ${progress}`;
  el.innerHTML=`<button class="wl" onclick="openTestPanel()" title="${description}" aria-label="Abrir perfil: ${description}">
    <span class="wl-c">${icon("coin")}<b>${ECO.moedas>=10000?compactCoins.format(ECO.moedas):balance}</b></span>
    <span class="wl-r"><em style="color:${cor}">${escapeHtml(nome)}</em><i><s style="width:${pct}%;background:${cor}"></s></i><small>${progress}</small></span></button>`;
  updateAccount();
  if(typeof onWalletRendered==="function")onWalletRendered();
}

// ---- Perfil e criador de gato: edita o perfil do servidor (PATCH /api/eu) ----
const temConta=()=>!!(SESSAO&&SESSAO.usuario&&SESSAO.usuario.cadastro_completo!==false);
const meuApelido=()=>(SESSAO&&SESSAO.usuario&&SESSAO.usuario.apelido)||"";
// Quem vê o quê: o papel (usuario | moderador | admin) vem do servidor em GET /api/eu. Isto só ESCONDE; cada rota confere de novo.
// Ranking, Álbum, Moderação e Enviar meme só para quem tem sessão; Moderação só para moderador/admin. Sem sessão (ou convidado) nada disso aparece.
const nsLogado=()=>!!(SESSAO&&SESSAO.usuario);
const nsEhModerador=()=>!!SESSAO&&(SESSAO.papel==="moderador"||SESSAO.papel==="admin");
const SO_LOGADO=["rank","album","mod","send"];
const subVisivel=x=>x.sp||(x.k==="mod"?nsEhModerador():SO_LOGADO.includes(x.k)?nsLogado():true);
// marca <html data-papel="logado moderador"> e esconde [data-gate="logado"|"moderador"] fora disso (enquanto a sessão não chega, tudo escondido)
function aplicarGates(){
  const t=[];if(nsLogado())t.push("logado");if(nsEhModerador())t.push("moderador");
  document.documentElement.dataset.papel=t.join(" ");
  if(!document.getElementById("ns-gates")){
    const s=document.createElement("style");s.id="ns-gates";
    s.textContent='html:not([data-papel~="logado"]) [data-gate="logado"],html:not([data-papel~="moderador"]) [data-gate="moderador"]{display:none!important}';
    document.head.appendChild(s);
  }
}
// pede conta (convidado ou sem sessão) ou avisa que a área é de moderadores; devolve true se barrou
function barrarSemPapel(acao,moderacao){
  // só pede login a quem já é convidado/deslogado de fato; com a economia ainda carregando ou fora do ar, deixa o aviso de indisponível das próprias funções falar
  if(!nsLogado()){if(ECO.convidado){avisoLogin(acao);return true}return false}
  if(moderacao&&!nsEhModerador()){toast("A moderação é só para moderadores.",3200);return true}
  return false;
}
// avatar_gato válido: 6 chaves inteiras dentro da faixa (nunca decidir cadastro por avatar_gato.length)
const GATO_FAIXA={fur:15,pat:9,eye:8,acc:18,clo:14,bg:8};
const gatoValido=o=>!!o&&typeof o==="object"&&Object.keys(GATO_FAIXA).every(k=>Number.isInteger(o[k])&&o[k]>=0&&o[k]<GATO_FAIXA[k]);
const FOTO_DISCORD=/^https:\/\/cdn\.discordapp\.com\/avatars\/[0-9]+\/[a-f0-9_]+\.png(\?size=[0-9]{1,4})?$/;
const APELIDO_OK=/^[A-Za-z0-9_.-]{3,20}$/;
let sgSalvando=false;
function sgErros(campo,msg){
  const u=document.getElementById("sgErrU"),g=document.getElementById("sgErr"),i=document.getElementById("sgU");
  u.textContent=campo==="apelido"?msg:"";g.textContent=campo&&campo!=="apelido"?msg:(campo?"":msg||"");
  if(i){i.setAttribute("aria-invalid",campo==="apelido"?"true":"false")}
}
let sgFoco=null;
function openSignup(){
  const u=SESSAO&&SESSAO.usuario;
  if(!u){avisoLogin("editar o perfil");return}
  const jaAberto=document.getElementById("sgm").classList.contains("open");
  if(!jaAberto)sgFoco=document.activeElement;
  sgO=gatoValido(u.avatar_gato)?{fur:u.avatar_gato.fur,pat:u.avatar_gato.pat,eye:u.avatar_gato.eye,acc:u.avatar_gato.acc,clo:u.avatar_gato.clo,bg:u.avatar_gato.bg}:{fur:0,pat:1,eye:0,acc:0,clo:0,bg:0};
  document.getElementById("sgU").value=u.apelido||"";
  const temFoto=typeof u.avatar_url==="string"&&FOTO_DISCORD.test(u.avatar_url);
  document.getElementById("sgFotoRow").style.display=temFoto?"":"none";
  document.getElementById("sgFoto").checked=temFoto&&!!u.usar_foto;
  document.getElementById("sgH").innerHTML=u.cadastro_completo===false?"Crie o seu <em>gatinho.</em>":"Edite o seu <em>gatinho.</em>";
  document.getElementById("sgGoT").textContent=u.cadastro_completo===false?"Salvar meu gato":"Salvar";
  sgErros("","");document.getElementById("sgm").classList.add("open");sgRender();
  // foco no primeiro campo; em tela de toque vai para o próprio diálogo (focar o campo abriria o teclado e cobriria a prévia)
  const alvo=matchMedia("(pointer:coarse)").matches?document.querySelector("#sgm .sg-box"):document.getElementById("sgU");
  if(alvo)alvo.focus({preventScroll:true});
}
function closeSignup(){
  const m=document.getElementById("sgm");if(!m||!m.classList.contains("open"))return;
  m.classList.remove("open");
  // devolve o foco a quem abriu; se o avatar foi redesenhado (salvou), vai para o novo botão da conta
  const f=sgFoco;sgFoco=null;
  const novo=document.querySelector("#acct .sg-acct");
  // quem abriu pode ter sumido (item do menu da conta fechado, avatar redesenhado): então o foco vai para o avatar
  const visivel=e=>!!e&&e!==document.body&&e.isConnected&&e.getClientRects().length>0&&typeof e.focus==="function";
  // no celular o avatar fica dentro do menu fechado: então o foco vai para o botão que abre o menu
  const toggle=document.querySelector(".menu-toggle");
  if(visivel(f))f.focus({preventScroll:true});else if(visivel(novo))novo.focus({preventScroll:true});else if(visivel(toggle))toggle.focus({preventScroll:true});
}
async function submitSignup(){
  if(sgSalvando)return;
  const u=SESSAO&&SESSAO.usuario;if(!u)return;
  const apelido=document.getElementById("sgU").value.trim();
  if(!APELIDO_OK.test(apelido))return sgErros("apelido","Apelido: 3 a 20 caracteres (letras, números, _ . -).");
  sgErros("","");
  const corpo={avatar_gato:{fur:sgO.fur,pat:sgO.pat,eye:sgO.eye,acc:sgO.acc,clo:sgO.clo,bg:sgO.bg}};
  if(apelido!==u.apelido)corpo.apelido=apelido;
  const linhaFoto=document.getElementById("sgFotoRow");
  if(linhaFoto.style.display!=="none")corpo.usar_foto=document.getElementById("sgFoto").checked;
  const botao=document.getElementById("sgGo");sgSalvando=true;botao.disabled=true;
  let r;
  try{r=await Api.perfil(corpo,{silencioso:true})}
  catch(e){
    sgSalvando=false;botao.disabled=false;
    if(e.status===401)return;
    if(e.status===409)return sgErros("apelido","Esse apelido já está em uso. Escolha outro.");
    if(e.status===422)return sgErros(e.campo||"",e.erro||"Valor inválido.");
    if(e.status===0)return sgErros("","Sem conexão. Tente de novo.");
    if(e.status===429&&e.campo==="apelido"){
      // o PATCH é tudo ou nada: nada foi salvo. Dá para salvar só o gato voltando o apelido para o atual.
      const s=Number(e.tente_em_segundos);
      if(!(s>0))return sgErros("apelido",`Você trocou o apelido há pouco e ainda não dá para trocar de novo. Para salvar só o gato, volte o apelido para “${u.apelido}”.`);
      const t=s>=3600?Math.ceil(s/3600)+" h":Math.max(1,Math.ceil(s/60))+" min";
      return sgErros("apelido",`Você trocou o apelido há pouco: dá para trocar de novo em ${t}. Para salvar só o gato, volte o apelido para “${u.apelido}”.`);
    }
    if(e.status===429)return sgErros("","Muitas alterações seguidas. Aguarde um pouco.");
    if(e.status===503)return sgErros("","Serviço indisponível. Tente de novo em instantes.");
    return sgErros("",e.erro||"Não foi possível salvar.");
  }
  sgSalvando=false;botao.disabled=false;
  SESSAO.usuario=r.usuario;
  updateAccount();closeSignup(); // redesenha o avatar antes: closeSignup devolve o foco ao novo botão
  if(r.pacote_boas_vindas){
    toast("Seu pacote de boas-vindas está esperando!",4200);
    try{await atualizarCarteira()}catch(e){}
    renderWallet();
  }else toast("Perfil salvo!");
  if(typeof onAccountChange==="function")onAccountChange();
  if(r.pacote_boas_vindas&&typeof bumpFab==="function")bumpFab();
}

// ---- Ranking (GET /api/ranking, público): abas por métrica, sem dados de exemplo ----
const RK_METRICAS=[["xp","XP","XP"],["cartas","Cartas","cartas"]];
let rkToken=0;
function rkAvatar(it){
  const ini=escapeHtml(String(it.apelido||"?").charAt(0).toUpperCase());
  if(typeof it.avatar_url==="string"&&FOTO_DISCORD.test(it.avatar_url))
    return `<img src="${escapeHtml(it.avatar_url)}" alt="" width="34" height="34" referrerpolicy="no-referrer" loading="lazy" decoding="async" onerror="this.replaceWith(document.createTextNode('${ini}'))">`;
  return gatoValido(it.avatar_gato)?catSVG(it.avatar_gato):ini;
}
function rkLinha(it,unid){
  const eu=meuApelido()&&String(it.apelido).toLowerCase()===meuApelido().toLowerCase();
  const pat=RANKS.find(k=>k.name===it.patente),cor=escapeHtml(pat?pat.color:"#9aa3b2");
  return `<div class="rkx${eu?" me":""}"><b>${escapeHtml(it.posicao)}</b><span class="av">${rkAvatar(it)}</span><span class="nm"><a class="n" href="perfil.html?u=${encodeURIComponent(it.apelido)}">${escapeHtml(it.apelido)}${eu?" (você)":""}</a>${it.moderador?`<span class="mb" title="Moderador da comunidade">${icon("moderation")}Moderador</span> `:""}${it.patente?`<span class="pt" style="color:${cor};background:${cor}22">${escapeHtml(it.patente)}</span>`:""}</span><em>${fmt(it.valor)} ${unid}</em></div>`;
}
async function carregarRanking(el,metrica){
  if(!el)return;
  const m=RK_METRICAS.find(x=>x[0]===metrica)||RK_METRICAS[0],tok=++rkToken;
  const abas=`<div class="rkx-tabs" role="tablist" aria-label="Ranking por">${RK_METRICAS.map(x=>`<button type="button" role="tab" aria-selected="${x[0]===m[0]}" class="${x[0]===m[0]?"on":""}" data-rk="${x[0]}">${x[1]}</button>`).join("")}</div>`;
  const pintar=corpo=>{el.innerHTML=abas+corpo;el.querySelectorAll("[data-rk]").forEach(b=>b.onclick=()=>carregarRanking(el,b.dataset.rk));const t=el.querySelector("[data-tentar]");if(t)t.onclick=()=>carregarRanking(el,m[0])};
  pintar(`<p class="rkx-st" role="status">Carregando o ranking…</p>`);
  let r;
  try{r=await Api.ranking(m[0],50,{silencioso:true})}
  catch(e){if(tok!==rkToken)return;pintar(`<p class="rkx-st" role="alert">Não consegui carregar o ranking agora.<br><button type="button" class="rkx-bt" data-tentar>Tentar de novo</button></p>`);return}
  if(tok!==rkToken)return;
  const itens=(r&&r.itens)||[];
  if(!itens.length)return pintar(`<p class="rkx-st">Ninguém no ranking ainda. Abra um pacote e seja o primeiro!</p>`);
  pintar(`<div class="rkx-lista">${itens.map(it=>rkLinha(it,m[2])).join("")}</div>`);
}

// ---- Sessão do servidor (login com Discord): GET /api/eu ----
let SESSAO=null;
async function carregarSessao(){
  try{SESSAO=await Api.eu()}catch(e){SESSAO=null;updateAccount();throw e}
  updateAccount();
}
const editaDireto=()=>!!(SESSAO&&SESSAO.edita_direto);
// POST com a sessão (cookie + X-CSRF), para as rotas da equipe
async function postComSessao(url,corpo){
  const r=await fetch(url,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","X-CSRF":(SESSAO&&SESSAO.csrf)||""},body:JSON.stringify(corpo)});
  const j=await r.json().catch(()=>null);if(!r.ok)throw Object.assign({},j||{},{status:r.status});return j}
async function sairDaConta(){
  try{await fetch("/api/auth/sair",{method:"POST",credentials:"same-origin",headers:{"X-CSRF":(SESSAO&&SESSAO.csrf)||""}})}catch(e){}
  SESSAO=null;location.reload();
}
const LOGIN_MSG={negado:"Login cancelado no Discord.",erro:"Não foi possível entrar com o Discord. Tente de novo.",banido:"Esta conta não pode entrar.",nao_membro:"Para entrar, você precisa ser membro do servidor do Discord da comunidade."};
function avisoDeLogin(){
  try{
    const u=new URL(location.href),m=u.searchParams.get("login");if(!m)return;
    u.searchParams.delete("login");history.replaceState(null,"",u.pathname+(u.search||"")+u.hash);
    setTimeout(()=>toast(LOGIN_MSG[m]||LOGIN_MSG.erro,5000),400);
  }catch(e){}
}
document.addEventListener("DOMContentLoaded",()=>{iniciarEconomia();avisoDeLogin()});
// avatar da conta: o gato (avatar_gato) é o padrão; a foto do Discord só com usar_foto=true. Fallback: inicial do apelido.
function avatarSessaoHTML(u){
  const ini=escapeHtml(String(u.apelido||"?").charAt(0).toUpperCase());
  const foto=u.usar_foto===true&&typeof u.avatar_url==="string"&&FOTO_DISCORD.test(u.avatar_url)?u.avatar_url:"";
  if(foto)return `<img src="${escapeHtml(foto)}" alt="" width="28" height="28" referrerpolicy="no-referrer" decoding="async" onerror="this.replaceWith(document.createTextNode('${ini}'))">`;
  return gatoValido(u.avatar_gato)?catSVG(u.avatar_gato):ini;
}
function contaSessaoHTML(){
  const u=SESSAO.usuario,p=SESSAO.patente&&SESSAO.patente.nome?SESSAO.patente.nome:"";
  return `<div class="account-actions"><span class="acct-wrap"><button type="button" class="sg-acct" onclick="abrirMenuConta(event)" aria-haspopup="menu" aria-expanded="false" aria-controls="acct-menu" title="Meu perfil: ${escapeHtml(u.apelido)}${p?" · "+escapeHtml(p):""}"><span class="sg-av">${avatarSessaoHTML(u)}</span><span>${escapeHtml(u.apelido)}${p?"<b>"+escapeHtml(p)+"</b>":""}</span></button><div class="acct-menu" id="acct-menu" role="menu" hidden>
    <a role="menuitem" href="perfil.html">${icon("user")}Ver o meu perfil</a>
    <a role="menuitem" href="perfil.html#editar">${icon("edit")}Editar o meu perfil</a>
    <button type="button" role="menuitem" onclick="fecharMenuConta();openSignup()">${icon("cat")}Editar gatinho e apelido</button>
    ${SESSAO.papel==="admin"?`<a role="menuitem" href="/seppzone/">${icon("moderation")}Área adm</a>`:""}
  </div></span><button type="button" onclick="sairDaConta()">Sair</button></div>`;
}
// menu da conta (clicar no próprio avatar): ver/editar o perfil e editar o gato
function abrirMenuConta(ev){
  ev&&ev.stopPropagation();
  const m=document.getElementById("acct-menu"),b=document.querySelector(".sg-acct");if(!m||!b)return;
  const abrir=m.hidden;m.hidden=!abrir;b.setAttribute("aria-expanded",String(abrir));
  if(abrir){const p=m.querySelector("[role=menuitem]");p&&p.focus()}
}
function fecharMenuConta(foco){const m=document.getElementById("acct-menu"),b=document.querySelector(".sg-acct");if(!m||m.hidden)return;m.hidden=true;b&&b.setAttribute("aria-expanded","false");if(foco&&b)b.focus()}
document.addEventListener("click",e=>{if(!e.target.closest||!e.target.closest(".acct-wrap"))fecharMenuConta()});
document.addEventListener("keydown",e=>{const m=document.getElementById("acct-menu");if(!m||m.hidden)return;
  if(e.key==="Escape"){fecharMenuConta(true);return}
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();const it=[...m.querySelectorAll("[role=menuitem]")],i=it.indexOf(document.activeElement);it[(i+(e.key==="ArrowDown"?1:it.length-1))%it.length].focus()}});
function updateAccount(){
  const el=document.getElementById("acct");if(!el)return;
  if(SESSAO&&SESSAO.usuario){el.innerHTML=contaSessaoHTML();return}
  el.innerHTML=`<div class="account-actions">
    <button type="button" class="account-login" onclick="openLogin()">${icon("login")}Login</button>
  </div>`;
}
function openLogin(msg){const dlg=document.getElementById("login-dialog");if(!dlg)return;const m=document.getElementById("lgMsg");if(m){m.textContent=typeof msg==="string"?msg:"";m.hidden=!(typeof msg==="string"&&msg)}const l=document.getElementById("lgDiscord");if(l)l.href="/api/auth/discord?voltar="+encodeURIComponent(location.pathname+location.search);dlg.showModal()}
function closeLogin(){const dlg=document.getElementById("login-dialog");dlg&&dlg.open&&dlg.close()}
const needAccount=(acao)=>{
  if(temConta())return false;
  if(!SESSAO&&ECO.indisponivel){toast("Servidor indisponível. Use “Tentar de novo” e espere carregar.");return true}
  if(SESSAO&&SESSAO.usuario){toast("Crie o seu gatinho primeiro 🐱");openSignup()}
  else avisoLogin(acao||"continuar");
  return true;
};

// ---- Modo teste (para demonstrar a progressão) ----
function openTestPanel(){
  let m=document.getElementById("tp");
  if(!m){m=document.createElement("div");m.id="tp";m.onclick=e=>{if(e.target===m)m.classList.remove("open")};document.body.appendChild(m)}
  const p=ECO.patente||{nome:"…",cor:"#9aa3b2"};
  m.innerHTML=`<div class="tp-box"><button class="sg-x" onclick="document.getElementById('tp').classList.remove('open')">×</button>
   <h3>Seu perfil</h3>
   <div class="tp-kv"><span>Moedas</span><b>🪙 ${fmt(ECO.moedas)}</b></div>
   <div class="tp-kv"><span>XP</span><b>${fmt(ECO.xp)}</b></div>
   <div class="tp-kv"><span>Patente</span><b style="color:${escapeHtml(p.cor)}">${escapeHtml(p.nome)}</b></div>
   <div class="tp-kv"><span>Envios aprovados</span><b>${NS.approvedCount}</b></div>
   <h4>Patentes</h4>${RANKS.map(k=>`<div class="tp-rk ${ECO.patente&&k.id===ECO.patente.id?'on':''}"><i style="background:${k.color}"></i><b>${k.name}</b><small>${fmt(k.xp)} XP · ${k.can}</small></div>`).join("")}
   <div class="tp-btns"><button onclick="if(window.confirmReset!==1){window.confirmReset=1;this.textContent='Clique de novo p/ confirmar';return}localStorage.removeItem(NS_KEY);location.reload()">↺ Limpar dados deste navegador</button></div>
   <p class="tp-note">Moedas, XP e cartas ficam no servidor, ligados à sua conta do Discord.</p></div>`;
  m.classList.add("open");
}


// ---- Ícones dos menus (SVG próprios, traço único) ----
const ICONS={
 book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/><path d="M9 7.5h7M9 11h5"/>',
 care:'<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="M12 8.5v4.5M12 16h.01"/>',
 eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
 extlink:'<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
 edit:'<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
 fire:'<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.6 3-5.8 3.6-9.3 2.4 1.4 3.6 3.6 3.6 5.6 1-.6 1.7-1.7 1.9-3 2 1.6 3.9 4.1 3.9 6.9 0 3.4-2.5 6-6.5 6Z"/>',
 cursor:'<path d="M5 3.5 19 11l-6.2 1.6L10.5 19 5 3.5Z"/>',
 login:'<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M3 12h12m-5-5 5 5-5 5"/>',
 home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h5v-5.5h3v5.5h5V10"/>',
 timeline:'<path d="M3 12h18"/><circle cx="6" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="18" cy="12" r="1.9" fill="currentColor"/><path d="M6 8.5V5M12 15.5V19M18 8.5V5"/>',
 categories:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="3.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="3.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
 random:'<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/>',
 ranking:'<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4"/><path d="M12 13v4M8.5 20h7M10 17h4v3h-4z"/>',
 moderation:'<path d="M12 3 4.5 6v5.5c0 4.4 3.1 8 7.5 9.5 4.4-1.5 7.5-5.1 7.5-9.5V6L12 3Z"/><path d="m8.8 12 2.3 2.3 4.2-4.6"/>',
 album:'<rect x="7" y="3.5" width="12" height="16" rx="2" transform="rotate(8 13 11.5)"/><rect x="4" y="5" width="12" height="16" rx="2"/><path d="M7.5 9.5h5M7.5 13h3"/>',
 send:'<path d="M12 16V5M7.5 9.5 12 5l4.5 4.5"/><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>',
 collections:'<path d="M12 3.5 3.5 8 12 12.5 20.5 8 12 3.5Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>',
 pack:'<rect x="3.5" y="8.5" width="17" height="12" rx="1.5"/><path d="M3.5 12.5h17M12 8.5v12"/><path d="M12 8.5C10 4 6.5 4.5 7 7c.3 1.4 2.7 1.5 5 1.5ZM12 8.5c2-4.5 5.5-4 5-1.5-.3 1.4-2.7 1.5-5 1.5Z"/>',
 shop:'<path d="M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3L5 8Z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
 convert:'<path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9"/><path d="M19.5 4.5V9H15"/><path d="M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15"/><path d="M4.5 19.5V15H9"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"/>',
 moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
 coin:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.5"/><path d="M12 9.5v5"/>',
 cat:'<path d="M5 9.5 4.5 3.5l4.5 3.2a9 9 0 0 1 6 0l4.5-3.2-.5 6"/><path d="M5 9.5C4 15 7.5 20 12 20s8-5 7-10.5"/><path d="M9.5 13h.01M14.5 13h.01" stroke-width="2.6"/><path d="M11 16h2l-1 1Z"/>',
 flame:'<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.4 2.6-5.3 3.6-8.3.4 1.6 1.4 2.8 2.6 3.3.2-2.6 1.4-5 3.6-6.8-.4 2.9.8 4.6 2 6.3 1 1.4 1.7 3 1.7 5.1C19 18.3 16 21 12 21Z"/><path d="M12 21c-1.7 0-2.8-1.2-2.8-2.8 0-1.8 1.4-2.8 2.1-4.2.6 1 2.9 2.3 2.9 4.4 0 1.5-.9 2.6-2.2 2.6Z"/>',
 new:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
 lock:'<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/>',
 cloud:'<path d="M7 18.5h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.3A3.4 3.4 0 0 0 7 18.5Z"/><path d="M12 16v-5M9.8 13 12 10.8l2.2 2.2"/>',
 link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
 check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
 xmark:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
 alert:'<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.5M12 17.2h.01"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
 thumbUp:'<path d="M7 10.5v9.5H4.5a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1H7Z"/><path d="M7 10.5 11 3.5c1.4 0 2.3 1.1 2 2.5l-.7 3.5h5.4a2 2 0 0 1 2 2.4l-1.3 6.4a2 2 0 0 1-2 1.6H7"/>',
 thumbDown:'<path d="M17 13.5V4h2.5a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H17Z"/><path d="M17 13.5 13 20.5c-1.4 0-2.3-1.1-2-2.5l.7-3.5H6.3a2 2 0 0 1-2-2.4l1.3-6.4a2 2 0 0 1 2-1.6H17"/>',
 bell:'<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15L6 16.5Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
 heart:'<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>',
 comment:'<path d="M20.5 11.5a8.5 8 0 0 1-12.4 7.1L3.5 20l1.4-4.1a8 8 0 1 1 15.6-4.4Z"/>',
 share:'<path d="M21 3.5 10 14.5M21 3.5l-6.5 17-4.5-6-6-4.5 17-6.5Z"/>',
 bookmark:'<path d="M6.5 3.5h11v17L12 16l-5.5 4.5v-17Z"/>',
 reblog:'<path d="M4 11V8.5a2 2 0 0 1 2-2h12l-3-3M20 13v2.5a2 2 0 0 1-2 2H6l3 3"/>',
 more:'<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 mic:'<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
 volume:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
 mute:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
 star:'<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9L12 3.5Z"/>',
 upload:'<path d="M12 16V5M7.5 9.5 12 5l4.5 4.5"/><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>',
 mail:'<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 6.5 8 6.5 8-6.5"/>',
 user:'<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/>',
 arrowUp:'<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
 arrowDown:'<path d="M12 5v14M5.5 12.5 12 19l6.5-6.5"/>',
 clipboard:'<rect x="5" y="4.5" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 10.5l1.5 1.5 3-3M8.5 16l1.5 1.5 3-3M15 11h1.5M15 16.5h1.5"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
 all:'<path d="M12 3.5l2 5 5 .4-3.8 3.3 1.2 5-4.4-2.7-4.4 2.7 1.2-5L5 8.9l5-.4 2-5Z"/>',
 video:'<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M3.5 9h17M3.5 15h17M8 5.5v3.5M8 15v3.5M16 5.5v3.5M16 15v3.5"/>',
 tv:'<rect x="3.5" y="6.5" width="17" height="12" rx="2"/><path d="M8.5 3 12 6.5 15.5 3M8 21h8"/>',
 music:'<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
 culture:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z"/>',
 zoeira:'<circle cx="12" cy="12" r="8.5"/><path d="M8 14.5a4.5 4.5 0 0 0 8 0Z"/><path d="M8.5 9.5l1.5 1M15.5 9.5l-1.5 1"/>',
 photo:'<path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
 sports:'<circle cx="12" cy="12" r="8.5"/><path d="m12 7.5 3.5 2.6-1.3 4.1H9.8L8.5 10.1 12 7.5Z"/><path d="M12 3.5v4M15.5 10.1l4.5-1.4M14.2 14.2l2.6 3.8M9.8 14.2l-2.6 3.8M8.5 10.1 4 8.7"/>',
};
const icon=(k,cls)=>`<svg class="ico ${cls||""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]||""}</svg>`;

// ---- Tema claro / escuro ----
function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem("ns_theme",t)}catch(e){}const b=document.getElementById("themeB");if(b){b.setAttribute("aria-checked",t==="dark");b.title=t==="dark"?"Modo escuro ativo · clique para o modo claro":"Modo claro ativo · clique para o modo escuro"}}
function toggleTheme(){setTheme(document.documentElement.dataset.theme==="light"?"dark":"light")}

// ---- Cabeçalho + sub-menu compartilhados ----
// page: "inicio" | "album"; sub: [{k,ic,label,fn,cta,dd,href}]
function renderHeader(page,opt={}){
  const hd=document.createElement("header");hd.className="hd";
  hd.innerHTML=`<a class="brand" href="index.html" aria-label="Não Salvo — início"><img src="logo-word.png" alt="Não Salvo" width="380" height="73"><small>Museu da internet brasileira</small></a>
   <div class="tools">${opt.search?`<label class="srch">${icon("search","s-ic")}<input id="q" type="search" placeholder="Buscar memes, anos, categorias…" aria-label="Buscar"></label>`:""}
   <div id="wallet"></div><div id="acct"></div><button class="tsw" id="themeB" role="switch" aria-label="Modo escuro" onclick="toggleTheme()">${icon("sun","t-l")}${icon("moon","t-d")}</button></div>`;
  document.body.prepend(hd);
  const tools=hd.querySelector(".tools");
  tools.insertAdjacentHTML("beforebegin",`<button type="button" class="hd-icon menu-toggle" aria-label="Menu principal" aria-expanded="false" aria-controls="header-menu">${icon("menu")}</button>
    <div class="header-menu" id="header-menu">
      <nav class="sub" id="sub" aria-label="Menu principal"></nav><div class="account-tools"></div>
    </div>`);
  hd.querySelector(".account-tools").append(hd.querySelector("#wallet"),hd.querySelector("#acct"));
  renderSub(opt.sub);
  const menu=hd.querySelector(".menu-toggle");
  const panel=hd.querySelector(".header-menu");
  const search=hd.querySelector(".srch");
  const field=search?.querySelector("input");
  if(search){
    search.hidden=true;
    search.insertAdjacentHTML("beforebegin",`<button type="button" class="hd-icon search-toggle" aria-label="Buscar no acervo" aria-expanded="false" aria-controls="q">${icon("search")}</button>`);
    field.setAttribute("aria-label","Buscar no acervo");
  }
  const searchButton=hd.querySelector(".search-toggle");
  function closeMenu(){
    menu.setAttribute("aria-expanded","false");
    hd.querySelector("#pop")?.remove();
    hd.querySelector(".dd")?.setAttribute("aria-expanded","false");
  }
  function closeSearch(){
    if(!field)return;
    search.hidden=true;
    searchButton.setAttribute("aria-expanded","false");
  }
  menu.onclick=()=>{
    const opening=menu.getAttribute("aria-expanded")==="false";
    closeMenu();
    closeSearch();
    menu.setAttribute("aria-expanded",String(opening));
  };
  if(searchButton)searchButton.onclick=()=>{
    closeMenu();
    if(!search.hidden)return closeSearch();
    search.hidden=false;
    searchButton.setAttribute("aria-expanded","true");
    field.focus();
  };
  function dismissOutside(event){
    if(!panel.contains(event.target) && !menu.contains(event.target))closeMenu();
    if(!search?.contains(event.target) && !searchButton?.contains(event.target))closeSearch();
  }
  document.addEventListener("pointerdown",dismissOutside);
  document.addEventListener("focusin",dismissOutside);
  panel.addEventListener("click",event=>{
    if(event.target.closest("button,a") && !event.target.closest(".dd,.sg-acct")){ // o avatar abre o menu da conta: o painel fica aberto
      if(menu.getAttribute("aria-expanded")==="true")menu.focus();
      closeMenu();
    }
  },true);
  hd.addEventListener("keydown",event=>{
    if(event.key!=="Escape")return;
    if(field && !search.hidden){closeSearch();searchButton.focus()}
    else if(hd.querySelector("#pop")){
      const categories=hd.querySelector(".dd");
      hd.querySelector("#pop").remove();
      categories.setAttribute("aria-expanded","false");
      categories.focus();
    }
    else if(menu.getAttribute("aria-expanded")==="true"){closeMenu();menu.focus()}
  });
  matchMedia("(max-width: 1199px)").addEventListener("change",()=>{closeMenu();closeSearch()});
  setTheme(document.documentElement.dataset.theme||"light");
  new ResizeObserver(()=>document.documentElement.style.setProperty("--hdh",hd.offsetHeight+"px")).observe(hd);
}
let SUB=[],subOn=null;
function renderSub(items){if(items)SUB=items;aplicarGates();const n=document.getElementById("sub");if(!n)return;
  // índice original (data-i) preservado; separador só entre dois itens visíveis
  const vis=SUB.map(x=>subVisivel(x));
  const mostrar=SUB.map((x,i)=>x.sp?(SUB.slice(0,i).some((y,j)=>!y.sp&&vis[j])&&SUB.slice(i+1).some((y,j)=>!y.sp&&vis[i+1+j])):vis[i]);
  n.innerHTML=SUB.map((x,i)=>!mostrar[i]?"":x.sp?`<span class="sp"></span>`:x.href?`<a href="${x.href}" class="${x.k===subOn?"on":""} ${x.cta?"cta":""}"${x.k===subOn?' aria-current="page"':""}>${icon(x.ic)}${x.label}</a>`:`<button data-i="${i}" class="${x.k===subOn?"on":""} ${x.cta?"cta":""} ${x.dd?"dd":""}">${icon(x.ic)}${x.label}</button>`).join("");
  n.querySelector(".dd")?.setAttribute("aria-expanded","false");
  n.querySelectorAll("button[data-i]").forEach(b=>b.onclick=e=>{const x=SUB[+b.dataset.i];x.fn&&x.fn(e,b)});
}
function setSubOn(k){subOn=k;renderSub()}
function openPop(anchor,items){
  const previous=document.getElementById("pop");
  anchor.setAttribute("aria-expanded",String(!previous));
  if(previous){previous.remove();return}
  const p=document.createElement("div");p.id="pop";p.className="pop open";
  anchor.after(p);
  p.innerHTML=items.map((x,i)=>`<button data-i="${i}">${x.ic?icon(x.ic):""}${x.label}${x.note?`<small>${x.note}</small>`:""}</button>`).join("");
  p.querySelectorAll("button").forEach(b=>b.onclick=()=>{p.classList.remove("open");items[+b.dataset.i].fn()});
  p.style.left=anchor.offsetLeft+"px";
}

// injeta o modal de cadastro
(function inject(){
  const G='<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.7H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.2H2.1a11 11 0 0 0 0 9.6L5.7 14z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.2L5.7 10c.9-2.7 3.4-4.6 6.3-4.6z"/></svg>';
  const D='<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#5865F2" d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.8 19.8 0 0 0 6 3l1.3-2.1a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12.1 0l.5.4-2 1 1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.2-.9-9.7-3.5-13.7zM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>';
  const d=document.createElement("div");d.innerHTML=`<div id="sgm" onclick="if(event.target===this)closeSignup()" role="dialog" aria-modal="true" aria-labelledby="sgH">
  <div class="sg-box" tabindex="-1">
    <button class="sg-x" onclick="closeSignup()" aria-label="Fechar">${icon("xmark")}</button>
    <div class="sg-form">
      <div class="sg-steps"><span class="on">Seu perfil e seu gatinho</span></div>
      <h2 id="sgH">Crie o seu <em>gatinho.</em></h2>
      <p class="s">Escolha o apelido e o visual do seu gato. Ele aparece no ranking e nos comentários.</p>
      <div class="sg-fl"><input class="t" id="sgU" placeholder=" " maxlength="20" autocomplete="username" aria-describedby="sgErrU"><label for="sgU">Apelido</label></div>
      <div class="sg-err" id="sgErrU" role="alert"></div>
      <label class="sg-chk" id="sgFotoRow" style="display:none"><input type="checkbox" id="sgFoto"><span class="bx">${icon("check")}</span><span>Usar minha foto do Discord<small>No lugar do gato, no cabeçalho e no ranking</small></span></label>
    </div>
    <div class="sg-studio">
      <div class="sg-pv">
        <div class="sg-pv-h">Personalize seu gato</div>
        <div class="big" id="sgBig"></div><div class="sg-breed" id="sgBreed"></div>
        <button class="sg-shuf" onclick="sgShuffle()">${icon("random")} Embaralhar tudo</button>
      </div>
      <div class="sg-opts">
        <div class="sg-tabs" id="sgTabs" role="tablist" aria-label="Partes do gato"></div>
        <div id="sgOpts" role="tabpanel" aria-labelledby="sgTab0"></div>
      </div>
    </div>
    <div class="sg-bar">
      <div class="sg-err" id="sgErr" role="alert"></div>
      <button class="sg-go" id="sgGo" onclick="submitSignup()"><span id="sgGoT">Salvar meu gato</span> →</button>
    </div>
  </div>
</div>`;document.body.appendChild(d.firstElementChild);
  document.body.insertAdjacentHTML("beforeend",`<dialog id="login-dialog" aria-labelledby="login-heading">
    <h2 id="login-heading">Entrar no Não Salvo</h2>
    <p class="lg-msg" id="lgMsg" role="status" hidden></p>
    <p>Entre com a sua rede para salvar o álbum, o XP e as moedas.</p>
    <div class="lg-nets">
      <a class="lg-net" id="lgDiscord" href="/api/auth/discord">${D}<span>Continuar com Discord</span></a>
      <button type="button" class="lg-net" disabled aria-disabled="true">${G}<span>Google</span><small>em breve</small></button>
    </div>
    <form method="dialog" class="lg-close"><button>Fechar</button></form>
  </dialog>`);
  document.addEventListener("keydown",e=>{
    if(e.key==="Tab"){const m=document.getElementById("sgm");if(m&&m.classList.contains("open")){
      const fs=[...m.querySelectorAll('.sg-box button:not([disabled]),.sg-box input:not([disabled]):not([type=hidden])')].filter(x=>x.offsetParent!==null||getComputedStyle(x).position==="fixed");
      if(fs.length){const i=fs.indexOf(document.activeElement);
        if(e.shiftKey&&(i<=0)){e.preventDefault();fs[fs.length-1].focus()}
        else if(!e.shiftKey&&(i===fs.length-1||i<0&&document.activeElement.classList.contains("sg-box"))){e.preventDefault();fs[0].focus()}}}}
    // setas nas abas do editor (padrão WAI-ARIA de tablist): ←/→ trocam de aba, Home/End vão às pontas
    const aba=e.target&&e.target.closest&&e.target.closest("#sgTabs [role=tab]");
    if(aba&&["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){
      const n=SG_TABS.length,i=[...aba.parentElement.children].indexOf(aba);
      sgTab=e.key==="Home"?0:e.key==="End"?n-1:(i+(e.key==="ArrowRight"?1:-1)+n)%n;
      e.preventDefault();sgRender();const nova=document.getElementById("sgTab"+sgTab);if(nova)nova.focus({preventScroll:true});return;
    }
    if(e.key==="Escape"){closeSignup();const t=document.getElementById("tp");t&&t.classList.remove("open");const p=document.getElementById("pop");p&&p.classList.remove("open")}});
})();


// ---- redes sociais (logos oficiais) ----
const SOC_P={"kick": "M4 3h5v6h2V6h2V3h5v5h-2v3h-2v2h2v3h2v5h-5v-3h-2v-3H9v6H4z", "twitch": "M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z", "x": "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z", "instagram": "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077", "youtube": "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"};
const socSvg=k=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${SOC_P[k]}"/></svg>`;
const YT_CH=[["Cid Cidoso","@CidCidoso","698 mil inscritos"],["Cortes CidCidoso [OFICIAL]","@CortesCidCidoso","68,5 mil inscritos"],["Lives CidCidoso [OFICIAL]","@LivesCidCidoso","25,6 mil inscritos"]];
function socialHTML(){
  return `<div class="soc"><span class="soc-t">Siga o Não Salvo</span>
   <a class="sb s-tw" href="https://twitch.tv/cidcidoso" target="_blank" rel="noopener" aria-label="Twitch">${socSvg("twitch")}</a>
   <a class="sb s-kick" href="https://kick.com/cidcidoso" target="_blank" rel="noopener" aria-label="Kick">${socSvg("kick")}</a>
   <a class="sb s-x" href="https://x.com/naosalvo" target="_blank" rel="noopener" aria-label="X (Twitter)">${socSvg("x")}</a>
   <a class="sb s-ig" href="https://www.instagram.com/naosalvo" target="_blank" rel="noopener" aria-label="Instagram">${socSvg("instagram")}</a>
   <span class="ytw"><button class="sb s-yt" onclick="this.parentElement.classList.toggle('open');event.stopPropagation()" aria-label="Canais no YouTube" aria-haspopup="true">${socSvg("youtube")}</button>
    <span class="ytpop" role="menu"><b>Canais no YouTube</b>${YT_CH.map(([n,h,i])=>`<a href="https://www.youtube.com/${h}" target="_blank" rel="noopener" role="menuitem"><span class="yi">${socSvg("youtube")}</span><span><em>${n}</em><small>${h} · ${i}</small></span></a>`).join("")}</span></span>
  </div>`;
}
document.addEventListener("click",e=>{if(!e.target.closest(".ytw"))document.querySelectorAll(".ytw.open").forEach(x=>x.classList.remove("open"))});

// ---- Rodapé: feedback + links + aviso legal ----
const PHONE_SVG=`<svg viewBox="0 0 160 150" aria-hidden="true"><defs><linearGradient id="phg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset="1" stop-color="#c81e3a"/></linearGradient></defs>
<ellipse cx="80" cy="16" rx="34" ry="9" fill="none" stroke="#ffd23f" stroke-width="6"/><ellipse cx="80" cy="16" rx="34" ry="9" fill="none" stroke="#fff6" stroke-width="2"/>
<path d="M34 92c0-14 10-26 24-28h44c14 2 24 14 24 28l8 36c1 6-3 10-9 10H35c-6 0-10-4-9-10z" fill="url(#phg)" stroke="#7a0f22" stroke-width="3"/>
<circle cx="80" cy="102" r="24" fill="#fff" stroke="#7a0f22" stroke-width="3"/>
${[0,1,2,3,4,5,6,7].map(i=>{const a=(i/8)*Math.PI*1.6-Math.PI*1.3;return`<circle cx="${80+16*Math.cos(a)}" cy="${102+16*Math.sin(a)}" r="3.6" fill="#c81e3a"/>`}).join("")}
<circle cx="80" cy="102" r="6" fill="#7a0f22"/>
<path d="M22 58c-4-18 10-30 26-30h64c16 0 30 12 26 30l-4 8c-2 4-6 5-10 3l-14-6c-4-2-5-5-4-9l2-6H52l2 6c1 4 0 7-4 9l-14 6c-4 2-8 1-10-3z" fill="url(#phg)" stroke="#7a0f22" stroke-width="3"/>
<path d="M40 34c10-4 70-4 80 0" stroke="#fff8" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
function nsPage(){const p=location.pathname;return /album\.html/.test(p)?"album":/(memepedia|linha-do-tempo)\.html/.test(p)?"outra":"index"}
function ftGo(k){
  const onIdx=nsPage()==="index";
  const fns={rank:"openRank",mod:"openMod",send:"openSubmit",rand:"randomPick"};
  if(k==="feedback")return openFeedback();
  if(onIdx&&fns[k]&&typeof window[fns[k]]==="function")return window[fns[k]]();
  if(k==="tl"){location.href="linha-do-tempo.html";return}
  if(onIdx&&k==="todos"&&typeof setView==="function")return setView("todos");
  if(onIdx&&k==="top")return window.scrollTo({top:0,behavior:"smooth"});
  location.href=k==="album"?"album.html":"index.html#"+k;
}
function renderFooter(){
  if(document.getElementById("nsft"))return;
  const f=document.createElement("footer");f.id="nsft";f.className="nsft nsft2";
  f.innerHTML=`  <div class="ft-band"><div class="ft-band-in">
    <div class="ft-legal">${socialHTML()}<b>Aviso legal</b>
      <p>O Não Salvo é apenas um compilado de vídeos e fotos que já estão publicados na internet. Não hospedamos nenhum vídeo: todos são exibidos direto do YouTube, pelo player oficial, e continuam pertencendo aos seus autores e canais de origem. As fotos e marcas citadas pertencem aos seus respectivos donos.</p>
      <p>É dono de algum conteúdo e quer que ele saia daqui? <button onclick="openFeedback('remocao')">Peça a remoção</button> e a gente tira.</p>
      <small>© ${new Date().getFullYear()} Não Salvo · projeto do Xet, sem fins lucrativos</small></div>
    <div class="fq fq-in">
      <span class="fq-art" onclick="openFeedback()" aria-hidden="true">${PHONE_SVG}</span>
      <span class="fq-txt"><span class="fq-logo">fala<i>.</i>que<i>.</i>eu<i>.</i>te<i>.</i>escut<span class="fq-o">o</span></span>
        <span class="fq-l1">Tem ideia, bug ou crítica?</span><span class="fq-l2">Ajoelha e envia: a gente lê tudo.</span></span>
      <span class="fq-acts"><button class="fq-go" onclick="openFeedback()">${icon("send")}Mandar feedback</button><a class="fq-go alt" href="/contribuir/">${icon("user")}Quero contribuir</a></span>
    </div>
    <img class="ft-boneco" src="boneco.png?v=2" alt="" width="478" height="600">
  </div></div>`;
  document.body.appendChild(f);
  mostrarVersao();
}
// Tarja sutil com a versão publicada: "dev · PR #63 · 1540939 · 25/11/2026 12:27" (o deployer grava /versao.json a cada merge).
// Sem o arquivo (rodando local, ou deployer antigo) ou com ele inválido, não mostra nada.
function formatarVersao(v){
  if(!v||typeof v!=="object"||!/^[0-9a-f]{7,40}$/.test(String(v.sha||"")))return "";
  const d=new Date(v.em),quando=isNaN(d)?"":d.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
  return [/^[a-z0-9._-]{1,30}$/i.test(String(v.ramo||""))?v.ramo:"",/^[0-9]{1,6}$/.test(String(v.pr||""))?"PR #"+v.pr:"",v.sha,quando].filter(Boolean).join(" · ");
}
function mostrarVersao(){
  fetch("/versao.json",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(v=>{
    const txt=formatarVersao(v),l=document.querySelector("#nsft .ft-legal");
    if(!txt||!l||document.getElementById("nsver"))return;
    const s=document.createElement("small");s.id="nsver";s.textContent=txt;s.title="Versão publicada neste ambiente";s.style.marginTop="4px";
    l.appendChild(s);
  }).catch(()=>{});
}
function openFeedback(tipo){
  let m=document.getElementById("fbm");
  if(!m){m=document.createElement("div");m.id="fbm";m.onclick=e=>{if(e.target===m)m.classList.remove("open")};
    m.innerHTML=`<form class="fb-box" id="fbF" name="feedback" onsubmit="return sendFeedback(event)">
      <button type="button" class="fb-x" onclick="document.getElementById('fbm').classList.remove('open')" aria-label="Fechar">${icon("xmark")}</button>
      <div class="fb-top"><span class="fb-art">${PHONE_SVG}</span><div><span class="fq-logo sm">fala<i>.</i>que<i>.</i>eu<i>.</i>te<i>.</i>escut<span class="fq-o">o</span></span><p>Ideia, bug, crítica ou pedido de remoção. A gente lê tudo.</p></div></div>
      <div class="fb-tipos">${[["ideia","Ideia"],["bug","Bug"],["elogio","Elogio"],["remocao","Remoção"]].map(([k,t])=>`<label><input type="radio" name="tipo" value="${k}"><span>${t}</span></label>`).join("")}</div>
      <input name="solicitante" id="fbSol" placeholder="Seu nome (obrigatório no pedido de remoção)" maxlength="120" autocomplete="name" hidden>
      <textarea name="msg" id="fbMsg" rows="5" maxlength="2000" placeholder="Escreve aqui, sem vergonha…" required></textarea>
      <input name="contato" id="fbC" placeholder="Seu e-mail ou nick (opcional, pra gente responder)" maxlength="120">
      <p class="fb-hp"><input name="bot-field" tabindex="-1" autocomplete="off"></p>
      <div class="fb-err" id="fbErr"></div>
      <button class="fb-go" type="submit">${icon("send")}Ajoelha e envia</button>
    </form>`;document.body.appendChild(m)}
  const r=m.querySelector(`input[value="${tipo||"ideia"}"]`);if(r)r.checked=true;
  const ajustaRemocao=()=>{const rem=m.querySelector('input[name="tipo"]:checked');const eh=!!rem&&rem.value==="remocao";const s=m.querySelector("#fbSol"),msg=m.querySelector("#fbMsg");s.hidden=!eh;s.required=eh;msg.placeholder=eh?"Qual é o conteúdo (cole o link) e por que quer a remoção? Respondemos em até 72 horas.":"Escreve aqui, sem vergonha…"};
  m.querySelectorAll('input[name="tipo"]').forEach(i=>i.onchange=ajustaRemocao);ajustaRemocao();
  m.querySelector("#fbErr").textContent="";m.classList.add("open");setTimeout(()=>m.querySelector("#fbMsg").focus(),60);
}
async function sendFeedback(e){
  e.preventDefault();const f=e.target,msg=f.msg.value.trim(),er=document.getElementById("fbErr");
  if(msg.length<5){er.textContent="Escreve um pouquinho mais.";return false}
  if((f.tipo.value||"")==="remocao"){
    const sol=(f.solicitante.value||"").trim();
    if(sol.length<2){er.textContent="Diga o seu nome para pedir a remoção.";return false}
    if(msg.length<10){er.textContent="Explique o pedido com pelo menos 10 caracteres.";return false}
    const b=f.querySelector(".fb-go");b.disabled=true;er.textContent="";
    try{
      const resp=await fetch("/api/remocoes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({solicitante:sol,motivo:msg,contato:f.contato.value.trim()||undefined})});
      if(!resp.ok){let j=null;try{j=await resp.json()}catch(_){}throw {status:resp.status,erro:j&&j.erro,campos:j&&j.campos}}
      f.reset();document.getElementById("fbm").classList.remove("open");toast("Pedido de remoção recebido. A gente responde em até 72 horas.",4200);
    }catch(e){
      const c=e&&e.campos?Object.entries(e.campos).map(([k,v])=>k+" ("+v+")")[0]:"";
      er.textContent=e&&e.status===429?"Muitos pedidos seguidos. Tente de novo daqui a pouco.":e&&e.status===0?"Sem conexão: o pedido NÃO foi enviado. Tente de novo.":(c?"Confira o pedido, campo "+c+".":((e&&e.erro)||"Não consegui enviar o pedido. Tente de novo."));
    }
    b.disabled=false;return false;
  }
  const data={"form-name":"feedback",tipo:(f.tipo.value||"ideia"),msg,contato:f.contato.value.trim(),pagina:location.pathname+location.hash,"bot-field":f["bot-field"].value};
  const btn=f.querySelector(".fb-go");btn.disabled=true;
  let ok=false;
  try{const r=await fetch("/api/feedback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});ok=r.ok}catch(_){}
  if(!ok){try{const k="ns_feedback",a=JSON.parse(localStorage.getItem(k)||"[]");a.push({...data,ts:Date.now()});localStorage.setItem(k,JSON.stringify(a))}catch(_){}}
  btn.disabled=false;f.reset();document.getElementById("fbm").classList.remove("open");
  toast(ok?"Amém! Feedback recebido.":"Sem conexão: feedback salvo neste navegador.",3400);
  return false;
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",renderFooter);else renderFooter();

// Links <a onclick> sem href não recebem foco do teclado: viram botões acessíveis.
(function(){
  function fix(root){
    (root||document).querySelectorAll("a[onclick]:not([href])").forEach(a=>{
      if(a.dataset.kb)return;a.dataset.kb="1";a.setAttribute("role","button");a.tabIndex=0;
      a.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();a.click()}});
    });
  }
  const run=()=>{fix();new MutationObserver(()=>fix()).observe(document.body,{childList:true,subtree:true})};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run);else run();
})();


// ---- visitas e cliques (Sobe.Desce de verdade) ----
// visita = abriu o meme; clique = deu play. O servidor conta 1 por meme, pessoa e dia.
// Aqui fica uma cópia local (só deste navegador) para o Sobe.Desce funcionar antes de a API estar no ar.
function registrarEvento(id,tipo){
  if(!id||!/^(visita|clique)$/.test(tipo))return;
  NS.ev=NS.ev||{};const d=nsToday(),e=NS.ev[id]||(NS.ev[id]={});const k=tipo==="visita"?"v":"c";
  const dias=e[k]||(e[k]={});if(!dias[d]){dias[d]=1;e[k+"t"]=(e[k+"t"]||0)+1;
    // guarda só os últimos 3 dias por meme
    Object.keys(dias).sort().slice(0,-3).forEach(x=>delete dias[x]);nsSave()}
  try{fetch("/api/eventos",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,tipo}),keepalive:true}).catch(()=>{})}catch(err){}
}


// ---- easter-egg: a jujuba escondida ----
// Todo dia uma jujuba se esconde num cantinho de UMA página do site (início, linha do tempo, Memepédia ou álbum).
// Quem acha vê um aviso (1 vez por dia), sem prêmio por enquanto: a recompensa volta quando o servidor decidir (Fase 3). O lugar muda todo dia e é igual para todo mundo.
const JUJUBA_SVG='<svg viewBox="0 0 40 40" aria-hidden="true"><defs><radialGradient id="jjg" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#fff6"/><stop offset=".25" stop-color="#ff5ca8"/><stop offset="1" stop-color="#c2185b"/></radialGradient></defs><path d="M8 26c0-9 5-17 12-17s12 8 12 17c0 4-5 6-12 6s-12-2-12-6z" fill="url(#jjg)"/><g fill="#fff" opacity=".85"><circle cx="15" cy="20" r="1.1"/><circle cx="22" cy="16" r="1"/><circle cx="26" cy="23" r="1.1"/><circle cx="18" cy="27" r="1"/><circle cx="12" cy="25" r=".9"/></g></svg>';
// esconderijos que não são redesenhados pela página, cada um com o canto livre (sem cobrir texto)
const JUJUBA_LUGARES={
  index:[[".hero .sun","left","bottom"],[".sdp","right","bottom"],[".facts","right","top"],[".pulse .panel:first-child","right","bottom"]],
  linha:[[".lt-top","right","top"],[".lt-rail","right","bottom"]],
  memepedia:[[".wk-logo","right","top"]],
  album:[[".side .tot","right","top"],[".side .wallet","right","top"]]
};
function paginaDaJujuba(){const p=location.pathname;return /album\.html/.test(p)?"album":/memepedia\.html/.test(p)?"memepedia":/linha-do-tempo\.html/.test(p)?"linha":"index"}
function jujubaDeHoje(){const d=nsToday();let h=7;for(const c of d)h=(h*131+c.charCodeAt(0))>>>0;
  const pags=Object.keys(JUJUBA_LUGARES),pg=pags[h%pags.length],L=JUJUBA_LUGARES[pg];
  const h2=Math.imul(h^(h>>>13),2654435761)>>>0,x=L[h2%L.length];
  return{pagina:pg,lugar:x[0],canto:[x[1],x[2]],todos:L.map(y=>y[0])}}
function esconderJujuba(){
  if(document.querySelector(".jjb")||NS.jujuba===nsToday())return;
  const j=jujubaDeHoje();if(j.pagina!==paginaDaJujuba())return;
  const el=document.querySelector(j.lugar)||j.todos.map(q=>document.querySelector(q)).find(Boolean)||document.getElementById("nsft");if(!el)return;
  if(getComputedStyle(el).position==="static")el.style.position="relative";
  const b=document.createElement("button");b.className="jjb";b.type="button";b.title="?";b.setAttribute("aria-label","Uma jujuba?");b.innerHTML=JUJUBA_SVG;
  b.style[j.canto[0]]="8px";b.style[j.canto[1]]="6px";
  b.onclick=ev=>{ev.preventDefault();ev.stopPropagation();NS.jujuba=nsToday();NS.jujubas=(NS.jujubas||0)+1;nsSave();
    b.classList.add("pego");setTimeout(()=>b.remove(),700);
    toast(NS.jujubas===1?"🍬 Você achou a jujuba escondida! Amanhã ela se esconde em outro lugar do site.":`🍬 Jujuba nº ${NS.jujubas} encontrada!`,4200)};
  el.appendChild(b);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(esconderJujuba,400));else setTimeout(esconderJujuba,400);
