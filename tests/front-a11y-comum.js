// Utilitários dos testes front-a11y-*.test.js (não é um teste: não termina em .test.js).
// Só serviços LOCAIS: servidor estático em 127.0.0.1 + API mockada via route (qualquer host externo é abortado).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

let chromium = null;
for (const m of [process.env.PLAYWRIGHT_MODULE, "playwright"]) {
  if (!m) continue;
  try { ({ chromium } = require(m)); break; } catch { /* tenta o próximo */ }
}
const RAIZ = path.join(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json" };
const servidor = () => new Promise((ok) => {
  const s = http.createServer((req, res) => {
    const arq = path.join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  }).listen(0, "127.0.0.1", () => ok(s));
});

const GATO = { fur: 1, pat: 0, eye: 2, acc: 3, clo: 0, bg: 4 };
const PAT = { id: "banda_larga", nome: "Banda larga", cor: "#2fbf5b" };
const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });

// API mínima: sem login (401) ou logado (papel configurável). Perfis "ana" (orkut) e "beto" (fotolog).
function instalarApi(ctx, { logado = true, papel = "admin" } = {}) {
  return ctx.route("**/api/**", (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    if (!logado) return json(route, 401, { erro: "não autenticado" });
    if (p === "/api/eu") return json(route, 200, { usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: true, perfil_layout: "orkut", carta_favorita: null }, patente: PAT, proxima_patente: null, moedas: 7, xp: 200, papel, csrf: "tok" });
    if (p === "/api/carteira") return json(route, 200, { usuario: { id: 1, apelido: "Ana" }, moedas: 7, xp: 200, patente: PAT, proxima_patente: null, pacotes: [], cartas: { distintas: 0, total_no_album: 109, quantidade_total: 0, repetidas: 0 }, valor_das_repetidas: 0 });
    if (p === "/api/visita") return json(route, 200, { dia: "2026-11-20", primeira_visita_do_dia: false, xp_ganho: 0, pacotes_ganhos: [], carteira: { xp: 200, moedas: 7 } });
    if (p === "/api/album") return json(route, 200, { colecoes: [], total: 0, tenho: 0, colecoes_completas: 0 });
    if (p === "/api/eventos") return json(route, 202, { ok: true });
    let mm;
    if ((mm = /^\/api\/perfil\/([^/]+)\/recados$/.exec(p))) return json(route, 200, { itens: [] });
    if ((mm = /^\/api\/perfil\/([^/]+)$/.exec(p))) {
      const ap = mm[1].toLowerCase(); if (ap !== "ana" && ap !== "beto") return json(route, 404, { erro: "perfil não encontrado" });
      const eu = ap === "ana";
      return json(route, 200, { perfil: { apelido: eu ? "Ana" : "Beto", avatar_gato: GATO, avatar_url: null, layout: eu ? "orkut" : "fotolog", membro_desde: "2026-11-01T12:00:00Z", eh_meu: eu }, patente: PAT, proxima_patente: { nome: "Fibra", faltam: 50 }, xp: 200, carta_favorita: null, recados: 0, album: { total: 120, tenho: 0, colecoes_completas: 0, colecoes: [], cartas: [] } });
    }
    if (p === "/api/admin/analytics") { const z = { visualizacoes: 0, sessoes: 0, visitantes: 0, segundos: 0, tempo_medio_sessao: 0 }; return json(route, 200, { periodo: "hoje", periodos: { hoje: z, "7d": z, "30d": z, total: z }, serie: [{ dia: "2026-11-01", visualizacoes: 1, sessoes: 1, visitantes: 1, segundos: 1 }], paginas: [], origens: [], dispositivos: [] }); }
    return json(route, 200, { itens: [], items: [], total: 0 });
  });
}

async function novoContexto(browser, vp, { tema = "light", logado = true, papel, reduzir = false } = {}) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 600, isMobile: vp.width < 600, reducedMotion: reduzir ? "reduce" : "no-preference" });
  await ctx.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* sem storage */ } }, tema);
  await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
  await instalarApi(ctx, { logado, papel });
  return ctx;
}

// ---- medições feitas dentro do navegador ----
const MEDIDORES = {
  // nome acessível aproximado (aria-label > aria-labelledby > conteúdo com alt de imagens > title)
  nome: `(e)=>{
    const al=e.getAttribute("aria-label"); if(al&&al.trim()) return al.trim();
    const lb=e.getAttribute("aria-labelledby"); if(lb){const t=lb.split(/\\s+/).map(i=>(document.getElementById(i)||{}).textContent||"").join(" ").trim(); if(t) return t}
    let t=""; const w=(n)=>{ if(n.nodeType===3) t+=n.textContent; else if(n.nodeType===1){ if(n.getAttribute("aria-hidden")==="true") return; if(n.tagName==="IMG") t+=n.alt||""; const tt=n.tagName.toLowerCase()==="svg"&&n.querySelector("title"); if(tt) t+=tt.textContent; n.childNodes.forEach(w) } };
    e.childNodes.forEach(w); if(t.trim()) return t.trim();
    if(e.getAttribute("title")) return e.getAttribute("title"); return "" }`,
  visivel: `(e)=>{const cs=getComputedStyle(e),b=e.getBoundingClientRect();return cs.display!=="none"&&cs.visibility!=="hidden"&&b.width>0&&b.height>0}`
};

async function auditoria(page) {
  return page.evaluate(({ nomeSrc, visSrc }) => {
    const nome = eval(nomeSrc), vis = eval(visSrc), o = {};
    o.semNome = [...document.querySelectorAll("button,a[href],[role=button],[role=link],[role=tab],[role=switch],summary,input[type=button],input[type=submit]")]
      .filter((e) => vis(e) && !nome(e)).map((e) => e.outerHTML.slice(0, 120));
    const contar = (s) => [...document.querySelectorAll(s)].filter(vis).length;
    o.main = document.querySelectorAll("main,[role=main]").length;
    o.header = contar("header,[role=banner]"); o.footer = contar("footer,[role=contentinfo]");
    const navs = [...document.querySelectorAll("nav,[role=navigation]")].filter((e) => vis(e) && !e.closest("[aria-hidden=true]"));
    o.navs = navs.length; o.navsSemNome = navs.filter((n) => !(n.getAttribute("aria-label") || n.getAttribute("aria-labelledby"))).length;
    const niv = (h) => (h.getAttribute("aria-level") ? +h.getAttribute("aria-level") : /^H[1-6]$/.test(h.tagName) ? +h.tagName[1] : 2);
    const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]")].filter((h) => vis(h) && !h.closest("[aria-hidden=true],dialog:not([open])")).map(niv);
    o.h1 = hs.filter((x) => x === 1).length;
    o.pulos = []; let ant = 0; for (const n of hs) { if (ant && n - ant > 1) o.pulos.push(`h${ant}->h${n}`); ant = n; }
    o.campos = [...document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea")]
      .filter((e) => vis(e) && !nome(e) && !(e.id && document.querySelector(`label[for="${e.id}"]`)) && !e.closest("label")).map((e) => e.outerHTML.slice(0, 120));
    o.imgSemAlt = [...document.querySelectorAll("img")].filter((e) => !e.hasAttribute("alt")).map((e) => e.outerHTML.slice(0, 100));
    o.live = document.querySelectorAll("[aria-live]:not([aria-live=off]),[role=status],[role=alert]").length;
    o.overflowX = document.documentElement.scrollWidth > innerWidth;
    return o;
  }, { nomeSrc: MEDIDORES.nome, visSrc: MEDIDORES.visivel });
}

// contraste por pixel/WCAG: cor efetiva do texto (com opacity) sobre o primeiro fundo opaco acima (mesma ideia dos outros testes)
async function contrastes(page, raiz = "body", ignorar = "") {
  return page.evaluate(([raiz, ignorar]) => {
    const rgba = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const mix = (fg, bg, a) => ({ r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) });
    const fundo = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== "none") return null; const c = rgba(cs.backgroundColor); if (c && c.a > 0.95) return c; if (c && c.a > 0) return null; } return { r: 255, g: 255, b: 255, a: 1 }; };
    const out = [];
    for (const e of document.querySelector(raiz).querySelectorAll("*")) {
      if (e.closest("[aria-hidden=true],dialog:not([open]),[hidden]")) continue;
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (ignorar && e.closest(ignorar)) continue;
      if (e.closest(":disabled,[aria-disabled=true],fieldset:disabled")) continue; // controle desabilitado é isento (WCAG 1.4.3)
      const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.fontSize) < 1) continue;
      const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      const bg = fundo(e); if (!bg) continue;
      let op = 1; for (let x = e; x; x = x.parentElement) op *= parseFloat(getComputedStyle(x).opacity);
      if (op < 0.1) continue; // invisível (ex.: legenda que só aparece no ano selecionado)
      const fg = rgba(cs.color); if (!fg) continue;
      const ef = mix(fg, bg, fg.a * op);
      const l1 = lum(ef), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const px = parseFloat(cs.fontSize), grande = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      if (ratio < (grande ? 3 : 4.5)) out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} "${e.textContent.trim().slice(0, 20)}" ${ratio.toFixed(2)} (${px}px)`);
    }
    return [...new Set(out)];
  }, [raiz, ignorar]);
}

module.exports = { chromium, RAIZ, servidor, novoContexto, auditoria, contrastes, MEDIDORES, json };
