// Faixa facts da home: copy curta, título em Baloo 2 15px, texto 14px/1.45, células de altura igual no 2x2,
// linha única no desktop, quebra de linha sem órfã, respiro da nota Protótipo, contraste e sem erro de console.
// Roda com arquivo explícito: node --test tests/front-facts-peso.test.js
// Precisa do Playwright (npm i playwright; npx playwright install chromium). Sem ele os testes são pulados.
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

async function abrir({ w, h, tema = "light", relogio = false }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: '{"erro":"x"}' }));
  await ctx.addInitScript((t) => { try { localStorage.setItem("ns_convidado", "1"); localStorage.setItem("ns_theme", t); } catch (e) { /* sem storage */ } }, tema);
  const page = await ctx.newPage();
  if (relogio) await page.clock.install();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + "/index.html");
  await page.waitForSelector(".facts .fact");
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(500);
  return { ctx, page, erros };
}

/** linhas de texto de um elemento (via Range) e se a última é uma órfã curta */
const linhas = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); const r = document.createRange(); r.selectNodeContents(e); const rs = [...r.getClientRects()]; const ys = {}; rs.forEach((q) => { const k = Math.round(q.top); ys[k] = (ys[k] || 0) + q.width; }); const larg = Object.keys(ys).sort((a, b) => a - b).map((k) => ys[k]); return larg; })()`;

const COPY = {
  Colaborativo: "A comunidade envia, a moderação aprova. Zero vídeo repetido.",
  Organizado: "Por ano, categoria e contexto. Cada meme no seu quadrado.",
  Eternizado: "Caiu na internet? Fica aqui pra sempre.",
  "Você chegou agora": "Bem-vindo ao museu."
};

test("copy curta (as 4 frases, mais curtas que antes) e título em Baloo 2 15px, texto 14px/1.45", opts, async () => {
  const { ctx, page, erros } = await abrir({ w: 1280, h: 900 });
  const r = await page.evaluate(() => [...document.querySelectorAll(".fact")].map((f) => { const b = f.querySelector("b"), s = f.querySelector("span"), cb = getComputedStyle(b), cs = getComputedStyle(s); return { titulo: b.textContent.trim(), texto: s.textContent.trim(), fam: cb.fontFamily, tam: cb.fontSize, peso: cb.fontWeight, tTam: cs.fontSize, tLh: cs.lineHeight, cor: cb.color }; }));
  assert.deepStrictEqual(r.map((x) => [x.titulo, x.texto]), Object.entries(COPY));
  const antes = ["A comunidade envia, a moderação aprova, e ninguém sobe o mesmo vídeo duas vezes.", "Separado por ano, categoria e contexto.", "Se caiu na internet, aqui fica pra sempre."];
  assert.ok(r[0].texto.length < antes[0].length, "Colaborativo ficou mais curto");
  for (const x of r) {
    assert.match(x.fam, /Baloo 2/);
    assert.strictEqual(x.tam, "15px"); assert.ok(parseInt(x.peso) >= 700);
    assert.strictEqual(x.tTam, "14px"); assert.strictEqual(parseFloat(x.tLh), 14 * 1.45);
  }
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

for (const tema of ["light", "dark"]) {
  test(`título do timer na cor de marca (texto) e o resto em --txt; contraste >= 4,5:1 (${tema})`, opts, async () => {
    const { ctx, page } = await abrir({ w: 1280, h: 900, tema });
    const r = await page.evaluate(() => {
      const css = (v) => { const t = document.createElement("i"); t.style.color = `var(${v})`; document.body.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c; };
      const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); return m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); };
      const L = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bg = parse(getComputedStyle(document.body).backgroundColor);
      const cr = (c) => { const x = L(parse(c)), y = L(bg); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const bs = [...document.querySelectorAll(".fact b")].map((b) => getComputedStyle(b).color), ss = [...document.querySelectorAll(".fact span")].map((b) => getComputedStyle(b).color);
      return { tempo: bs[3], brandText: css("--brand-text"), txt: css("--txt"), outros: bs.slice(0, 3), ratios: [...bs, ...ss].map(cr) };
    });
    assert.strictEqual(r.tempo, r.brandText, "título do timer em --brand-text");
    assert.ok(r.outros.every((c) => c === r.txt), "demais títulos em --txt");
    assert.ok(r.ratios.every((x) => x >= 4.5), "contraste: " + r.ratios.map((x) => x.toFixed(2)));
    await ctx.close();
  });
}

for (const [w, h] of [[390, 844], [360, 740]]) {
  test(`celular ${w}px: 2x2 com células de altura igual, sem órfã nas quebras, sem overflow`, opts, async () => {
    const { ctx, page, erros } = await abrir({ w, h });
    const g = await page.evaluate(() => ({ cx: [...document.querySelectorAll(".fact")].map((f) => { const r = f.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height) }; }), sw: [document.documentElement.scrollWidth, document.documentElement.clientWidth], rows: getComputedStyle(document.querySelector(".facts")).gridAutoRows }));
    assert.strictEqual(new Set(g.cx.map((c) => c.x)).size, 2, "2 colunas");
    assert.strictEqual(new Set(g.cx.map((c) => c.y)).size, 2, "2 linhas");
    assert.ok(new Set(g.cx.map((c) => c.h)).size === 1, "as 4 células têm a mesma altura: " + g.cx.map((c) => c.h));
    assert.ok(g.sw[0] <= g.sw[1], "sem overflow");
    for (let i = 1; i <= 4; i++) {
      const l = await page.evaluate(linhas(`.fact:nth-child(${i}) span`));
      if (l.length > 1) assert.ok(l[l.length - 1] >= Math.max(...l) * 0.35, `frase ${i} termina em órfã: ${l.map(Math.round)}`);
      const t = await page.evaluate(linhas(`.fact:nth-child(${i}) b`));
      if (t.length > 1) assert.ok(t[t.length - 1] >= Math.max(...t) * 0.35, `título ${i} termina em órfã: ${t.map(Math.round)}`);
    }
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("desktop 1280px: linha única com 4 colunas iguais, títulos de uma linha e textos sem órfã", opts, async () => {
  const { ctx, page, erros } = await abrir({ w: 1280, h: 900 });
  const g = await page.evaluate(() => [...document.querySelectorAll(".fact")].map((f) => { const r = f.getBoundingClientRect(), b = f.querySelector("b").getBoundingClientRect(); return { y: Math.round(r.y), w: Math.round(r.width), tituloH: Math.round(b.height) }; }));
  assert.strictEqual(new Set(g.map((c) => c.y)).size, 1, "uma linha");
  assert.strictEqual(new Set(g.map((c) => c.w)).size, 1, "colunas iguais");
  assert.ok(g.every((c) => c.tituloH <= 20), "título numa linha só: " + g.map((c) => c.tituloH));
  for (let i = 1; i <= 4; i++) { const l = await page.evaluate(linhas(`.fact:nth-child(${i}) span`)); if (l.length > 1) assert.ok(l[l.length - 1] >= Math.max(...l) * 0.35, `frase ${i} termina em órfã: ${l.map(Math.round)}`); }
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

for (const [w, h] of [[1280, 900], [390, 844]]) {
  test(`nota Prototipo separada da faixa com respiro (${w}px)`, opts, async () => {
    const { ctx, page } = await abrir({ w, h });
    const r = await page.evaluate(() => { const f = [...document.querySelectorAll(".fact")], ult = Math.max(...f.map((x) => x.getBoundingClientRect().bottom)), n = document.querySelector(".note").getBoundingClientRect(); return { folga: n.top - ult, fonte: parseFloat(getComputedStyle(document.querySelector(".note")).fontSize) }; });
    assert.ok(r.folga >= 30, "folga entre a faixa e a nota: " + r.folga);
    assert.ok(r.fonte >= 12);
    await ctx.close();
  });
}

test("timer: copy nova antes e depois de 1 minuto, título do timer continua na cor de marca", opts, async () => {
  const { ctx, page, erros } = await abrir({ w: 390, h: 844, relogio: true });
  const ler = () => page.evaluate(() => [document.getElementById("timerB").textContent, document.getElementById("timer").textContent]);
  assert.deepStrictEqual(await ler(), ["Você chegou agora", "Bem-vindo ao museu."]);
  await page.clock.runFor(75000);
  assert.deepStrictEqual(await ler(), ["Você está aqui há", "1 min passeando pelo museu."]);
  assert.strictEqual(await page.evaluate(() => document.querySelector(".fact-tempo") !== null), true);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});
