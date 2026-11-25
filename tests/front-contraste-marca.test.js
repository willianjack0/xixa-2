// Contraste do azul da marca (texto >= 4,5:1 em claro e escuro), botão primário, fontes >= 12px, aria-controls das abas da home,
// logo com width/height, margem da faixa facts. Contraste calculado pelos tokens E medido no navegador (texto sobre gradiente por pixel).
// Roda com arquivo explícito: node --test tests/front-contraste-marca.test.js
// Precisa do Playwright (npm i playwright; npx playwright install chromium). Sem ele os testes de navegador são pulados.
// Se estiver instalado fora do projeto: PLAYWRIGHT_MODULE=/caminho/node_modules/playwright
// Navegador já baixado em outro lugar: CHROMIUM_PATH=/caminho/chrome
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

let chromium = null;
for (const m of [process.env.PLAYWRIGHT_MODULE, "playwright"]) {
  if (!m) continue;
  try { ({ chromium } = require(m)); break; } catch { /* tenta o próximo */ }
}
const RAIZ = path.join(__dirname, "..");

// ---------- 1) tokens (sem navegador) ----------
const hex = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)); };
const lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const cr = (a, b) => { const x = lum(hex(a)), y = lum(hex(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const css = fs.readFileSync(path.join(RAIZ, "theme.css"), "utf8");
const bloco = (re) => { const m = re.exec(css); assert.ok(m, "bloco de tokens não encontrado: " + re); const t = {}; for (const [, k, v] of m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\b/g)) t[k] = v.slice(0, 7); return t; };
const TEMAS = { claro: bloco(/:root,:root\[data-theme="light"\]\{([\s\S]*?)\n\}/), escuro: bloco(/:root\[data-theme="dark"\]\{([\s\S]*?)\n\}/) };

for (const [nome, t] of Object.entries(TEMAS)) {
  test(`tokens (${nome}): --brand-text >= 4,5:1 sobre os fundos de texto; --brand-display >= 3:1; texto sobre botão >= 4,5:1`, () => {
    for (const fundo of ["bg", "panel", "panel2", "sunk", "brand-soft"]) assert.ok(cr(t["brand-text"], t[fundo]) >= 4.5, `${nome}: brand-text sobre ${fundo} = ${cr(t["brand-text"], t[fundo]).toFixed(2)}`);
    assert.ok(cr(t["brand-display"], t.bg) >= 3, `${nome}: brand-display (texto grande) sobre bg = ${cr(t["brand-display"], t.bg).toFixed(2)}`);
    for (const fundo of ["brand-fill", "btn-a", "btn-b"]) assert.ok(cr(t["on-brand"], t[fundo]) >= 4.5, `${nome}: on-brand sobre ${fundo} = ${cr(t["on-brand"], t[fundo]).toFixed(2)}`);
    for (const fundo of ["bg", "panel", "panel2", "brand-soft"]) assert.ok(cr(t["gold-text"], t[fundo]) >= 4.5, `${nome}: gold-text sobre ${fundo}`);
    for (const fundo of ["bg", "panel", "panel2"]) assert.ok(cr(t.faint, t[fundo]) >= 4.5, `${nome}: faint sobre ${fundo} = ${cr(t.faint, t[fundo]).toFixed(2)}`);
  });
}

// ---------- 2) navegador ----------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const servidor = () => new Promise((ok) => {
  const s = http.createServer((req, res) => {
    const arq = path.join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  }).listen(0, "127.0.0.1", () => ok(s));
});
const opts = { skip: chromium ? false : "playwright não instalado" };
let srv, browser, base;
test.before(async () => {
  if (!chromium) return;
  srv = await servidor(); base = `http://127.0.0.1:${srv.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

async function abrir(pagina, { w, h, tema }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: '{"erro":"x"}' }));
  await ctx.addInitScript((t) => { try { localStorage.setItem("ns_convidado", "1"); localStorage.setItem("ns_theme", t); } catch (e) { /* sem storage */ } }, tema);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + pagina);
  await page.waitForSelector(".nsft2 .fq-in, .lt-it");
  await page.waitForTimeout(2000); // transições e animações de entrada terminam
  return { ctx, page, erros };
}

/** todo texto visível: cor efetiva x fundo sólido (texto sobre gradiente é medido por pixel, em outro teste) */
const medir = () => {
  const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const L = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const mix = (f, b, a) => ({ r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 });
  const bgDe = (el) => { const pilha = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== "none") return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { pilha.push(c); if (c.a > 0.95) break; } } let base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }; for (let i = pilha.length - 1; i >= 0; i--) base = mix(pilha[i], base, pilha[i].a); return base; };
  const opac = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const sel = (e) => { const p = []; for (let x = e, i = 0; x && x.tagName && i < 3; x = x.parentElement, i++) p.unshift(x.tagName.toLowerCase() + (x.id ? "#" + x.id : "") + (typeof x.className === "string" && x.className ? "." + x.className.trim().split(/\s+/).slice(0, 2).join(".") : "")); return p.join(" > "); };
  const falhas = [], pequenas = [], vistos = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    const t = n.nodeValue.trim(); if (!t) continue;
    const e = n.parentElement; if (!e || vistos.has(e) || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(e.tagName)) continue; vistos.add(e);
    const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none") continue;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (e.closest("button:disabled,[disabled],[aria-hidden=true],.vw,#sgm:not(.open)")) continue;
    const px = parseFloat(cs.fontSize);
    if (px < 1) continue; // texto escondido de propósito (ano ativo da régua no celular: o nome acessível continua no DOM)
    if (px < 12) pequenas.push(sel(e) + " " + px + "px | " + t.slice(0, 20));
    const fg = parse(cs.color), bg = bgDe(e); if (!fg || !bg) continue;
    const o = opac(e); if (o < 0.05) continue; // ainda animando de entrada
    const ef = mix(fg, bg, fg.a * o), x = L(ef), y = L(bg), ratio = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    const grande = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight) >= 700);
    if (ratio < (grande ? 3 : 4.5)) falhas.push(`${sel(e)} | ${cs.color} | ${px}px | ${ratio.toFixed(2)} | ${t.slice(0, 20)}`);
  }
  return { falhas, pequenas };
};
// o que fica de fora, com justificativa: arte das cartas travadas ("???" é placeholder), cores semânticas de raridade,
// e o visual de época da linha do tempo (cada época tem paleta própria, fora do azul da marca)
const FORA = /card\.lock|\.kv > b|\.kv b|chipR|\.lt-stage|ep-fb|\.lt-top|\.lt-marcas|\.lt-chips/;

for (const pagina of ["/index.html", "/album.html", "/memepedia.html"]) for (const tema of ["light", "dark"]) for (const [w, h] of [[1280, 900], [390, 844]]) {
  test(`texto >= 4,5:1 e fontes >= 12px: ${pagina} (${tema}, ${w}px)`, opts, async () => {
    const { ctx, page, erros } = await abrir(pagina, { w, h, tema });
    const r = await page.evaluate(medir);
    const f = r.falhas.filter((x) => !FORA.test(x)), p = r.pequenas.filter((x) => !FORA.test(x));
    assert.deepStrictEqual(f, [], "contraste < 4,5:1:\n" + f.join("\n"));
    assert.deepStrictEqual(p, [], "fontes < 12px:\n" + p.join("\n"));
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("linha do tempo: cabeçalho da página e seletor de anos sem o azul vivo como texto pequeno (claro e escuro)", opts, async () => {
  for (const tema of ["light", "dark"]) {
    const { ctx, page } = await abrir("/linha-do-tempo.html#2012", { w: 1280, h: 900, tema });
    const r = await page.evaluate(medir);
    const f = r.falhas.filter((x) => /rl-arr|lt-yrs|\.ry/.test(x));
    assert.deepStrictEqual(f, [], tema + ": " + f.join("\n"));
    const p = r.pequenas.filter((x) => /lt-yrs|\.ry|lt-rail|lt-top|lt-foot|\.yb|lt-tick/.test(x));
    assert.deepStrictEqual(p, [], tema + " fontes: " + p.join("\n"));
    await ctx.close();
  }
});

// ---------- texto sobre gradiente: por pixel ----------
async function contrastePorPixel(page, el, corTexto) {
  await el.scrollIntoViewIfNeeded();
  const estilo = await page.addStyleTag({ content: "*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}" });
  const semTexto = (await el.screenshot()).toString("base64");
  await estilo.evaluate((n) => n.parentNode.removeChild(n));
  const comTexto = (await el.screenshot()).toString("base64");
  return page.evaluate(async ({ a, b, cor }) => {
    const dec = async (x) => { const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + x)).blob()); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; const g = c.getContext("2d"); g.drawImage(bmp, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
    const [fundo, texto] = [await dec(a), await dec(b)];
    const m = /rgba?\(([^)]+)\)/.exec(cor), t = m[1].split(/[ ,\/]+/).map(Number);
    const L = (r, g, bl) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
    // pixels do núcleo do glifo = os que mais mudaram ao esconder o texto (vale também com filtros de hover), só no miolo do botão
    const m8 = 8, dif = [];
    let maxd = 0;
    for (let i = 0; i < texto.data.length; i += 4) {
      const px = (i / 4) % texto.width, py = Math.floor(i / 4 / texto.width);
      if (px < m8 || py < m8 || px >= texto.width - m8 || py >= texto.height - m8) { dif.push(0); continue; }
      const d = Math.hypot(texto.data[i] - fundo.data[i], texto.data[i + 1] - fundo.data[i + 1], texto.data[i + 2] - fundo.data[i + 2]);
      dif.push(d); if (d > maxd) maxd = d;
    }
    const rs = [];
    for (let i = 0; i < texto.data.length; i += 4) {
      if (dif[i / 4] < maxd * 0.85 || dif[i / 4] < 30) continue;
      const x = L(texto.data[i], texto.data[i + 1], texto.data[i + 2]), y = L(fundo.data[i], fundo.data[i + 1], fundo.data[i + 2]);
      rs.push((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05));
    }
    rs.sort((p, q) => p - q);
    return { n: rs.length, min: rs[0], mediana: rs[Math.floor(rs.length / 2)] };
  }, { a: semTexto, b: comTexto, cor: corTexto });
}

for (const tema of ["light", "dark"]) {
  test(`botões primários (texto sobre gradiente) >= 4,5:1 medido por pixel, em repouso e com hover (${tema})`, opts, async () => {
    // logado: o "Enviar meme" do cabeçalho só existe com sessão
    const { ctx, page } = await abrirLogado({ w: 1280, h: 900, tema, apelido: "Ana", patente: "Banda larga" });
    const alvos = [["Explorar por ano", ".hero .btn:not(.ghost)"], ["Enviar meme (cabeçalho)", ".sub .cta"]];
    const falhas = [];
    for (const [nome, sel] of alvos) {
      const el = (await page.$$(sel))[0];
      if (!el) { falhas.push(nome + ": não encontrado"); continue; }
      for (const estado of ["repouso", "hover"]) {
        if (estado === "hover") { await el.hover(); await page.waitForTimeout(300); } else { await page.mouse.move(2, 2); await page.waitForTimeout(300); }
        const cor = await el.evaluate((e) => getComputedStyle(e).color);
        const r = await contrastePorPixel(page, el, cor);
        if (r.n < 20 || r.min < 4.5) falhas.push(`${nome} ${estado}: n=${r.n} min=${r.min && r.min.toFixed(2)}`);
      }
    }
    assert.deepStrictEqual(falhas, []);
    await ctx.close();
  });
}

test("hover dos links e botões de marca mantém >= 4,5:1 (claro e escuro)", opts, async () => {
  for (const tema of ["light", "dark"]) {
    const { ctx, page } = await abrir("/index.html", { w: 1280, h: 900, tema });
    const falhas = [];
    for (const sel of [".sec-title a", ".lnk", ".ft-cols button", ".side", ".chip:not(.on)"]) {
      const el = (await page.$$(sel))[0]; if (!el) continue;
      await el.scrollIntoViewIfNeeded(); await el.hover(); await page.waitForTimeout(350);
      const r = await el.evaluate((e) => {
        const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
        const L = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        let bg = null; for (let x = e; x && !bg; x = x.parentElement) { const c = parse(getComputedStyle(x).backgroundColor); if (c.a > 0.95) bg = c; }
        bg = bg || parse(getComputedStyle(document.body).backgroundColor);
        const fg = parse(getComputedStyle(e).color), a = fg.a, ef = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
        const x = L(ef), y = L(bg); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      });
      if (r < 4.5) falhas.push(`${tema} ${sel} hover = ${r.toFixed(2)}`);
    }
    assert.deepStrictEqual(falhas, []);
    await ctx.close();
  }
});

// ---------- aria, logo, margem, caixa-alta ----------
test("abas da home ligadas ao painel (aria-controls -> tabpanel) e período em grupo com aria-pressed", opts, async () => {
  const { ctx, page, erros } = await abrir("/index.html", { w: 1280, h: 900, tema: "light" });
  const r = await page.evaluate(() => {
    const painel = document.getElementById("sd-painel");
    return {
      painel: painel && painel.getAttribute("role"), rotulo: painel && painel.getAttribute("aria-labelledby"),
      abas: [...document.querySelectorAll(".sd-tabs [role=tab]")].map((b) => [b.id, b.getAttribute("aria-controls"), b.getAttribute("aria-selected")]),
      periodo: [...document.querySelectorAll(".sd-seg button")].map((b) => [b.getAttribute("aria-controls"), b.getAttribute("aria-pressed")]),
      grupo: document.querySelector(".sd-seg").getAttribute("role")
    };
  });
  assert.strictEqual(r.painel, "tabpanel");
  assert.deepStrictEqual(r.abas.map((a) => a[1]), ["sd-painel", "sd-painel"]);
  assert.strictEqual(r.rotulo, r.abas.find((a) => a[2] === "true")[0], "painel rotulado pela aba ativa");
  assert.ok(r.periodo.every((p) => p[0] === "sd-painel"));
  assert.strictEqual(r.grupo, "group");
  await page.click(".sd-tabs [role=tab]:nth-child(2)");
  await page.waitForTimeout(400);
  assert.strictEqual(await page.getAttribute("#sd-painel", "aria-labelledby"), "sd-tab-clicados");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("logo-word.png com width e height em todas as páginas (sem salto de layout)", opts, async () => {
  for (const pagina of ["/index.html", "/album.html", "/memepedia.html", "/linha-do-tempo.html#2012"]) {
    const { ctx, page } = await abrir(pagina, { w: 1280, h: 900, tema: "light" });
    const r = await page.$$eval('img[src*="logo-word.png"]', (l) => l.map((i) => [i.getAttribute("width"), i.getAttribute("height")]));
    assert.ok(r.length >= 1, pagina + ": logo não encontrado");
    assert.ok(r.every(([w, h]) => w && h), pagina + ": " + JSON.stringify(r));
    await ctx.close();
  }
  const admin = fs.readFileSync(path.join(RAIZ, "seppzone/index.html"), "utf8");
  assert.match(admin, /<img src="\/logo-word\.png"[^>]*width="\d+"[^>]*height="\d+"/);
});

test("margem lateral da faixa facts no celular = a do rodapé (16px)", opts, async () => {
  for (const w of [390, 360]) {
    const { ctx, page } = await abrir("/index.html", { w, h: 844, tema: "light" });
    const r = await page.evaluate(() => ({ facts: document.querySelector(".facts").getBoundingClientRect().x, rodape: parseFloat(getComputedStyle(document.querySelector(".nsft2 .ft-band-in")).paddingLeft), sw: [document.documentElement.scrollWidth, document.documentElement.clientWidth] }));
    assert.strictEqual(r.facts, 16, `${w}px: facts a ${r.facts}px da borda`);
    assert.strictEqual(r.rodape, 16);
    assert.ok(r.sw[0] <= r.sw[1], "sem overflow");
    await ctx.close();
  }
});

test("home: nenhum texto corrido em caixa alta (só rótulos curtos)", opts, async () => {
  for (const w of [1280, 390]) {
    const { ctx, page } = await abrir("/index.html", { w, h: 900, tema: "light" });
    const longos = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).textTransform === "uppercase" && !e.closest("[aria-hidden=true]") && e.getClientRects().length).map((e) => e.textContent.trim().replace(/\s+/g, " ")).filter((t) => t.split(" ").length > 4 || t.length > 28));
    assert.deepStrictEqual(longos, [], `${w}px: caixa alta em texto longo`);
    await ctx.close();
  }
});

// ---------- cabeçalho logado: patente cabe sem cortar; menu do cabeçalho legível ----------
async function abrirLogado({ w, h = 800, apelido, patente, tema = "light", pagina = "/index.html" }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  const GATO = { fur: 1, pat: 0, eye: 2, acc: 3, clo: 0, bg: 4 };
  const PAT = { id: "x", nome: patente, xp_minimo: 0, cor: "#2fbf5b" };
  const json = (r, st, c) => r.fulfill({ status: st, contentType: "application/json", body: JSON.stringify(c) });
  await ctx.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/eu") return json(route, 200, { usuario: { id: 1, apelido, avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: true }, patente: PAT, proxima_patente: null, moedas: 1234, xp: 200, csrf: "t" });
    if (p === "/api/carteira") return json(route, 200, { usuario: { id: 1, apelido }, moedas: 1234, xp: 200, patente: PAT, proxima_patente: null, pacotes: [], cartas: { distintas: 0 }, valor_das_repetidas: 0 });
    if (p === "/api/album") return json(route, 200, { colecoes: [], total: 0, tenho: 0, colecoes_completas: 0 });
    if (p === "/api/visita") return json(route, 200, { dia: "2026-11-20", primeira_visita_do_dia: false, xp_ganho: 0, pacotes_ganhos: [], carteira: { xp: 200, moedas: 1234 } });
    if (p === "/api/pacotes/tipos") return json(route, 200, { itens: [] });
    return json(route, 404, { erro: "x" });
  });
  await ctx.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* sem storage */ } }, tema);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await page.goto(base + pagina);
  await page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
  await page.waitForTimeout(500);
  return { ctx, page, erros };
}

test("cabeçalho logado: 'Banda larga' (12px) cabe inteira de 1200 a 1849px; patente longa corta só com ellipsis e tem tooltip", opts, async () => {
  const falhas = [];
  for (const w of [1200, 1280, 1366, 1440, 1500, 1600, 1849]) {
    const curto = await abrirLogado({ w, apelido: "Ana", patente: "Banda larga" });
    const a = await curto.page.evaluate(() => { const s = document.querySelector(".sg-acct > span:last-child"), b = s.querySelector("b"); return { sw: s.scrollWidth, cw: s.clientWidth, patente: b.textContent, hd: Math.round(document.querySelector(".hd").getBoundingClientRect().height), page: [document.documentElement.scrollWidth, document.documentElement.clientWidth] }; });
    if (a.sw > a.cw) falhas.push(`${w}px: "${a.patente}" cortada (${a.sw} > ${a.cw})`);
    await curto.ctx.close();
    const longo = await abrirLogado({ w, apelido: "ApelidoComVinteLetra", patente: "Dono de comunidade" });
    const b = await longo.page.evaluate(() => { const hd = document.querySelector(".hd"), t = document.querySelector(".sg-acct"), menu = [...document.querySelectorAll(".hd .sub a,.hd .sub button")].filter((e) => e.getClientRects().length), ultimo = menu[menu.length - 1].getBoundingClientRect(), conta = t.getBoundingClientRect(); return { hd: Math.round(hd.getBoundingClientRect().height), page: [document.documentElement.scrollWidth, document.documentElement.clientWidth], title: t.getAttribute("title"), contaNaTela: conta.right <= innerWidth + 0.5, menuAntesDaConta: ultimo.right <= conta.left + 1, linhaUnica: new Set(menu.map((e) => Math.round(e.getBoundingClientRect().top))).size === 1 }; });
    if (b.hd !== a.hd) falhas.push(`${w}px: altura do cabeçalho muda com nomes longos (${a.hd} -> ${b.hd})`);
    if (b.page[0] > b.page[1]) falhas.push(`${w}px: overflow horizontal com nomes longos`);
    if (!b.contaNaTela) falhas.push(`${w}px: conta fora da tela`);
    if (!b.menuAntesDaConta) falhas.push(`${w}px: menu empurrado sobre a conta`);
    if (!b.linhaUnica) falhas.push(`${w}px: menu quebrou em duas linhas`);
    if (!/Dono de comunidade/.test(b.title) || !/ApelidoComVinteLetra/.test(b.title)) falhas.push(`${w}px: sem tooltip com apelido e patente: ${b.title}`);
    await longo.ctx.close();
  }
  assert.deepStrictEqual(falhas, []);
});

test("menu do cabeçalho e botão Sair legíveis (>= 7:1 no DOM, margem para o antialiasing) em claro e escuro", opts, async () => {
  const falhas = [];
  for (const tema of ["light", "dark"]) for (const pagina of ["/index.html", "/memepedia.html", "/linha-do-tempo.html#2012"]) {
    const { ctx, page } = await abrirLogado({ w: 1280, apelido: "Ana", patente: "Banda larga", tema, pagina });
    const r = await page.evaluate(() => {
      const parse = (s) => { const m = /rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/.exec(s); if (m[1]) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; } const p = m[2].split(/[ \/]+/).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] === undefined ? 1 : p[3] }; };
      const L = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const body = parse(getComputedStyle(document.body).backgroundColor), hd = parse(getComputedStyle(document.querySelector(".hd")).backgroundColor);
      const bg = { r: hd.r * hd.a + body.r * (1 - hd.a), g: hd.g * hd.a + body.g * (1 - hd.a), b: hd.b * hd.a + body.b * (1 - hd.a) };
      const alvos = [...document.querySelectorAll(".hd .sub > a:not(.on):not(.cta), .hd .sub > button:not(.cta):not(.on)")].slice(0, 3).concat([...document.querySelectorAll(".account-actions > button")].filter((b) => /Sair/.test(b.textContent)));
      return alvos.map((e) => { const x = L(parse(getComputedStyle(e).color)), y = L(bg); return [e.textContent.trim().slice(0, 14), (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)]; });
    });
    for (const [t, ratio] of r) if (ratio < 7) falhas.push(`${tema} ${pagina} "${t}" = ${ratio.toFixed(2)}`);
    await ctx.close();
  }
  assert.deepStrictEqual(falhas, []);
});

test("em.nw ('ontem') da home >= 5:1 sobre o fundo esverdeado, claro e escuro", opts, async () => {
  for (const tema of ["light", "dark"]) {
    const { ctx, page } = await abrir("/index.html", { w: 1280, h: 900, tema });
    const r = await page.evaluate(() => {
      const e = document.querySelector("em.nw"); if (!e) return null;
      const parse = (s) => { const m = /rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/.exec(s); if (m[1]) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; } const p = m[2].split(/[ \/]+/).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] === undefined ? 1 : p[3] }; };
      const L = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      let base = null; for (let x = e.parentElement; x && !base; x = x.parentElement) { const c = parse(getComputedStyle(x).backgroundColor); if (c.a > 0.95) base = c; }
      const t = parse(getComputedStyle(e).backgroundColor), bg = { r: t.r * t.a + base.r * (1 - t.a), g: t.g * t.a + base.g * (1 - t.a), b: t.b * t.a + base.b * (1 - t.a) };
      const x = L(parse(getComputedStyle(e).color)), y = L(bg); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    });
    assert.ok(r !== null, "em.nw não encontrado");
    assert.ok(r >= 5, `${tema}: ${r.toFixed(2)}`);
    await ctx.close();
  }
});

test("linha do tempo: subtítulo e rodapé da PÁGINA (.lt-top small, .lt-marcas) >= 4,5:1 em todos os anos, claro e escuro", opts, async () => {
  const falhas = [];
  for (const tema of ["light", "dark"]) {
    const { ctx, page } = await abrir("/linha-do-tempo.html#2012", { w: 1280, h: 900, tema });
    const anos = await page.evaluate(() => KEYS.slice());
    for (const k of anos) {
      await page.evaluate((k) => ir(k), k);
      await page.waitForTimeout(650); // o fundo da página anima (.4s) ao trocar de época
      const r = await page.evaluate(() => {
        const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
        const L = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        const bg = parse(getComputedStyle(document.body).backgroundColor);
        return ["main .lt-top small", ".lt-marcas"].map((s) => { const e = document.querySelector(s); const cs = getComputedStyle(e); const x = L(parse(cs.color)), y = L(bg); return [s, (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05), cs.opacity]; });
      });
      for (const [s, ratio] of r) if (ratio < 4.5) falhas.push(`${tema} ${k} ${s} = ${ratio.toFixed(2)}`);
    }
    await ctx.close();
  }
  assert.deepStrictEqual(falhas, []);
});
