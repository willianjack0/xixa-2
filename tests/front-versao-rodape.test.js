// Tarja de versão no rodapé: lê /versao.json (gravado pelo deployer a cada merge) e mostra ramo, PR, SHA e hora.
// Sem o arquivo ou com ele inválido, não mostra nada. Roda com arquivo explícito: node --test tests/front-versao-rodape.test.js
// Precisa do Playwright (npm i playwright; npx playwright install chromium). Sem ele os testes são pulados.
// Se estiver instalado fora do projeto: PLAYWRIGHT_MODULE=/caminho/node_modules/playwright · CHROMIUM_PATH=/caminho/chrome
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
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json" };
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

/** `versao`: corpo de /versao.json (objeto, string crua) ou null para 404. */
async function abrir(pagina, versao, { w = 1280, h = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem("ns_convidado", "1"); } catch (e) { /* sem storage */ } }); // sem a marca o 401 manda para entrar.html
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: '{"erro":"x"}' }));
  await ctx.route("**/versao.json", (r) => (versao === null
    ? r.fulfill({ status: 404, body: "" })
    : r.fulfill({ status: 200, contentType: "application/json", body: typeof versao === "string" ? versao : JSON.stringify(versao) })));
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await page.goto(base + pagina);
  await page.waitForSelector("#nsft");
  await page.waitForTimeout(600);
  return { ctx, page, erros };
}
const tarja = (page) => page.evaluate(() => { const e = document.getElementById("nsver"); return e ? e.textContent : null; });

for (const pg of ["/index.html", "/album.html", "/memepedia.html", "/linha-do-tempo.html"]) {
  test(`${pg}: mostra ramo, PR, SHA e hora (horário de Brasília)`, opts, async () => {
    const { ctx, page, erros } = await abrir(pg, { ramo: "dev", sha: "1540939", pr: "63", em: "2026-11-25T15:27:22Z" });
    assert.strictEqual(await tarja(page), "dev · PR #63 · 1540939 · 25/11/2026, 12:27");
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("sem PR (push direto): omite o PR; sem hora válida: omite a hora", opts, async () => {
  const a = await abrir("/index.html", { ramo: "main", sha: "abcdef1", pr: "", em: "2026-01-02T03:04:05Z" });
  assert.strictEqual(await tarja(a.page), "main · abcdef1 · 02/01/2026, 00:04");
  await a.ctx.close();
  const b = await abrir("/index.html", { ramo: "dev", sha: "abcdef1", pr: "7", em: "" });
  assert.strictEqual(await tarja(b.page), "dev · PR #7 · abcdef1");
  await b.ctx.close();
});

test("sem versao.json (local) ou com conteúdo inválido/malicioso: nenhuma tarja e nenhum erro", opts, async () => {
  for (const v of [null, "isto não é json", "[]", { sha: "<img src=x onerror=alert(1)>" }, { ramo: "dev" }, { sha: "xyz" }]) {
    const { ctx, page, erros } = await abrir("/index.html", v);
    assert.strictEqual(await tarja(page), null, JSON.stringify(v));
    assert.deepStrictEqual(erros, [], JSON.stringify(v));
    await ctx.close();
  }
});

test("ramo e PR fora do formato são descartados (texto, nunca HTML)", opts, async () => {
  const { ctx, page } = await abrir("/index.html", { ramo: "<b>x</b>", sha: "1540939", pr: "63; DROP", em: "2026-11-25T15:27:22Z" });
  assert.strictEqual(await tarja(page), "1540939 · 25/11/2026, 12:27");
  assert.strictEqual(await page.$$eval("#nsver b", (n) => n.length), 0);
  await ctx.close();
});

test("tarja legível: >= 12px, contraste >= 4,5:1, uma linha em 390px e sem rolagem horizontal", opts, async () => {
  const { ctx, page } = await abrir("/index.html", { ramo: "dev", sha: "1540939", pr: "63", em: "2026-11-25T15:27:22Z" }, { w: 390, h: 800 });
  const r = await page.evaluate(() => {
    const e = document.getElementById("nsver"), cs = getComputedStyle(e);
    const parse = (s) => { const p = /rgba?\(([^)]+)\)/.exec(s)[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2] }; };
    const L = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    let bg = null; for (let x = e; x && !bg; x = x.parentElement) { const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(x).backgroundColor); if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); if (p.length < 4 || p[3] > 0.95) bg = { r: p[0], g: p[1], b: p[2] }; } }
    const a = L(parse(cs.color)), b = L(bg);
    return { px: parseFloat(cs.fontSize), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), altura: e.getBoundingClientRect().height, rolagem: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  assert.ok(r.px >= 12, "fonte " + r.px);
  assert.ok(r.ratio >= 4.5, "contraste " + r.ratio.toFixed(2));
  assert.ok(r.altura <= r.px * 3.2, "cabe em até 2 linhas, altura " + r.altura);
  assert.strictEqual(r.rolagem, false);
  await ctx.close();
});
