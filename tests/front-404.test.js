// Página 404 ("Onde é que eu tô? Será que tô na Lagoinha?"): nginx usa a página, sem login não redireciona, botões, 44px, fonte, contraste e sem overflow.
// Roda com arquivo explícito: node --test tests/front-404.test.js (precisa do Playwright; sem ele os testes são pulados).
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

// ---- contraste calculado (WCAG) no navegador: cor efetiva do texto (com opacity) sobre o primeiro fundo opaco acima ----
async function contrastes(page, raiz = "#pf") {
  return page.evaluate((raiz) => {
    const rgba = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const mix = (fg, bg, a) => ({ r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) });
    const fundo = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== "none") return null; const c = rgba(cs.backgroundColor); if (c && c.a > 0.95) return c; if (c && c.a > 0) return null; } return { r: 255, g: 255, b: 255, a: 1 }; };
    const out = [];
    for (const e of document.querySelector(raiz).querySelectorAll("*")) {
      if (e.closest("[aria-hidden=true]")) continue;
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      const bg = fundo(e); if (!bg) continue;
      let op = 1; for (let x = e; x; x = x.parentElement) op *= parseFloat(getComputedStyle(x).opacity);
      const fg = rgba(cs.color); if (!fg) continue;
      const ef = mix(fg, bg, fg.a * op);
      const l1 = lum(ef), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const px = parseFloat(cs.fontSize), grande = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      if (ratio < (grande ? 3 : 4.5)) out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} "${e.textContent.trim().slice(0, 20)}" ${ratio.toFixed(2)} (${px}px)`);
    }
    return [...new Set(out)];
  }, raiz);
}


async function abrir(vp, { tema = "light", logado = false, gato = null, ctxPronto = null } = {}) {
  const ctx = ctxPronto || await browser.newContext({ viewport: vp, hasTouch: vp.width < 600, isMobile: vp.width < 600 });
  if (!ctxPronto) await ctx.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* sem storage */ } }, tema);
  if (!ctxPronto) await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.unroute("**/api/**");
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  await ctx.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (!logado) return json(route, 401, { erro: "não autenticado" });
    if (p === "/api/eu") return json(route, 200, { usuario: { id: 1, apelido: "Ana", avatar_gato: gato, avatar_url: null, cadastro_completo: true }, patente: { id: "discado", nome: "Discado", cor: "#9aa3b2" }, moedas: 7, xp: 0, csrf: "t" });
    if (p === "/api/carteira") return json(route, 200, { moedas: 7, xp: 0, patente: { id: "discado", nome: "Discado", cor: "#9aa3b2" }, proxima_patente: null, pacotes: [], cartas: { distintas: 0, total_no_album: 109, quantidade_total: 0, repetidas: 0 }, valor_das_repetidas: 0 });
    if (p === "/api/visita") return json(route, 200, { carteira: { xp: 0, moedas: 7 }, pacotes_ganhos: [] });
    return json(route, 200, { itens: [] });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + "/404.html");
  await page.waitForSelector(".e4 h1");
  await page.waitForTimeout(400);
  return { ctx, page, erros };
}

test("nginx serve a 404.html (com status 404) em endereço que não existe", () => {
  const conf = fs.readFileSync(path.join(RAIZ, "deploy/nginx.conf"), "utf8");
  assert.match(conf, /error_page\s+404\s+\/404\.html;/);
  const html = fs.readFileSync(path.join(RAIZ, "404.html"), "utf8");
  assert.match(html, /<base href="\/">/, "funciona em qualquer pasta");
  assert.match(html, /Lagoinha/);
});

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  for (const tema of ["light", "dark"]) {
    test(`404 ${vp.width}px (${tema}): texto, botões 44px com destino, fonte >= 12px, contraste e sem overflow`, opts, async () => {
      const { ctx, page, erros } = await abrir(vp, { tema });
      assert.match(await page.$eval(".e4 h1", (e) => e.textContent), /Onde é que eu tô\?\s*Será que tô na Lagoinha\?/);
      const bts = await page.$$eval(".e4-bt", (l) => l.map((a) => ({ t: a.textContent.trim(), href: a.getAttribute("href"), h: a.getBoundingClientRect().height, w: a.getBoundingClientRect().width })));
      assert.deepStrictEqual(bts.map((b) => b.href), ["index.html", "memepedia.html", "linha-do-tempo.html"]);
      for (const b of bts) assert.ok(b.h >= 44 && b.w >= 44, JSON.stringify(b));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "sem overflow horizontal");
      const miudos = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => !e.closest("[aria-hidden=true]") && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.className));
      assert.deepStrictEqual(miudos, []);
      assert.deepStrictEqual(await contrastes(page, "main"), []);
      assert.deepStrictEqual(erros, []);
      await ctx.close();
    });
  }
}

test("404 sem login: não manda para o login e mostra o botão Login no cabeçalho", opts, async () => {
  const { ctx, page, erros } = await abrir({ width: 1280, height: 900 });
  await page.waitForSelector(".account-login");
  assert.match(page.url(), /\/404\.html$/);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("404 com login: cabeçalho com a conta; Meme aleatório leva a um verbete que existe", opts, async () => {
  const { ctx, page, erros } = await abrir({ width: 1280, height: 900 }, { logado: true });
  await page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
  await page.click("#aleatorio");
  await page.waitForURL(/memepedia\.html#/);
  const id = decodeURIComponent(new URL(page.url()).hash.slice(1));
  assert.ok(await page.evaluate((id) => MEMES.some((m) => m.id === id), id), "verbete existe: " + id);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("404: o gatinho é o avatar de quem está logado e já aparece atualizado na próxima visita", opts, async () => {
  const g1 = { fur: 5, pat: 2, eye: 3, acc: 9, clo: 7, bg: 4 }, g2 = { fur: 2, pat: 1, eye: 1, acc: 0, clo: 3, bg: 1 };
  let { ctx, page, erros } = await abrir({ width: 1280, height: 900 }, { logado: true, gato: g1 });
  await page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
  const norm = (h) => h.replace(/\bg\d+/g, "g"); // ids dos gradientes mudam a cada desenho
  const svg = async (o) => norm(await page.evaluate((o) => { const d = document.createElement("div"); d.innerHTML = catSVG(o); return d.innerHTML; }, o));
  const atual = async () => norm(await page.$eval("#gato", (e) => e.innerHTML));
  assert.strictEqual(await atual(), await svg(g1));
  assert.notStrictEqual(await svg(g1), await svg({ fur: 1, pat: 1, eye: 1, acc: 3, clo: 0, bg: 0 }));
  await page.close();
  // trocou o avatar: na próxima 404 já vem o novo (e o guardado aparece antes da sessão carregar)
  ({ page, erros } = await abrir({ width: 1280, height: 900 }, { logado: true, gato: g2, ctxPronto: ctx }));
  await page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
  assert.strictEqual(await atual(), await svg(g2));
  assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("ns_gato404"))), g2);
  await page.close();
  // sem login: gatinho padrão e o guardado é esquecido
  ({ page } = await abrir({ width: 1280, height: 900 }, { ctxPronto: ctx }));
  await page.waitForSelector(".account-login");
  assert.strictEqual(await atual(), await svg({ fur: 1, pat: 1, eye: 1, acc: 3, clo: 0, bg: 0 }));
  assert.strictEqual(await page.evaluate(() => localStorage.getItem("ns_gato404")), null);
  assert.strictEqual(await page.$$eval(".rays,.rays-wrap", (l) => l.length), 0, "sem os raios próprios da 404: fica o fundo do site");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});
