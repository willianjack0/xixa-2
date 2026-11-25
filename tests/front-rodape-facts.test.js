// Rodapé fala.que.eu.te.escuto no celular e faixa "facts" da home: geometria (390/360/1280), ordem, alvos de 44px,
// contraste calculado, copy, timer, CSS sem duplicata/!important, sem overflow e sem erro de console.
// Roda com arquivo explícito: node --test tests/front-rodape-facts.test.js
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

/** convidado (sem API): home e rodapé são públicos */
async function abrir(pagina, { w, h, tema = "light", relogio = false }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: '{"erro":"x"}' }));
  await ctx.addInitScript((t) => { try { localStorage.setItem("ns_convidado", "1"); localStorage.setItem("ns_theme", t); } catch (e) { /* sem storage */ } }, tema);
  const page = await ctx.newPage();
  if (relogio) await page.clock.install();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + pagina);
  await page.waitForSelector(".nsft2 .fq-in");
  await page.waitForTimeout(300);
  return { ctx, page, erros };
}

const R = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; })()`;
const geo = (page) => page.evaluate(`({ fq: ${R(".nsft2 .fq-in")}, legal: ${R(".nsft2 .ft-legal")}, boneco: ${R(".nsft2 .ft-boneco")}, band: ${R(".nsft2 .ft-band-in")}, art: ${R(".nsft2 .fq-art")}, vw: innerWidth })`);

for (const [w, h] of [[390, 844], [360, 740]]) {
  test(`rodapé ${w}px: cartão antes do texto legal, coluna única, centrado; boneco 96px em cima do cartão`, opts, async () => {
    const { ctx, page, erros } = await abrir("/index.html", { w, h });
    const g = await geo(page);
    assert.ok(g.fq.b <= g.legal.y + 1, `cartão antes do legal: fq.b=${g.fq.b} legal.y=${g.legal.y}`);
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector(".nsft2 .ft-band-in")).gridTemplateColumns.trim().split(/\s+/).length), 1, "coluna única");
    assert.ok(Math.abs(g.fq.x - (g.vw - g.fq.r)) <= 1, `cartão centrado: esq=${g.fq.x} dir=${g.vw - g.fq.r}`);
    assert.ok(g.fq.w >= g.vw - 40, `cartão largo: ${g.fq.w}`);
    assert.ok(Math.abs(g.boneco.h - 96) <= 2, `boneco ~96px: ${g.boneco.h}`);
    assert.ok(g.boneco.b <= g.fq.y + 0.5, `boneco não desce sobre o cartão: boneco.b=${g.boneco.b} fq.y=${g.fq.y}`);
    assert.ok(g.fq.y - g.boneco.b <= 24, `boneco ancorado ao topo do cartão: folga ${g.fq.y - g.boneco.b}`);
    assert.ok(g.boneco.r <= g.fq.r && g.boneco.x >= g.fq.x, "boneco alinhado ao cartão");
    assert.ok(g.boneco.y >= g.band.y - 24, "boneco não invade o conteúdo acima");
    const sw = await page.evaluate(() => { const c = document.querySelector(".nsft2 .fq-in").getBoundingClientRect(); const fora = [...document.querySelectorAll(".nsft2 .fq-in .fq-txt *,.nsft2 .fq-in .fq-acts *,.nsft2 .fq-in .fq-art")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > c.right + 0.5).map((e) => e.className || e.tagName); return [document.documentElement.scrollWidth, document.documentElement.clientWidth, fora]; });
    assert.ok(sw[0] <= sw[1], "sem overflow horizontal da página: " + sw);
    assert.deepStrictEqual(sw[2], [], "nada do cartão passa da borda dele");
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });

  test(`rodapé ${w}px: telefone decorativo >= 44px, dois botões de 44px+, copy com UMA pergunta, textos 13,5px, sem anel amarelo`, opts, async () => {
    const { ctx, page, erros } = await abrir("/index.html", { w, h });
    const r = await page.evaluate(() => {
      const art = document.querySelector(".nsft2 .fq-art"), a = art.getBoundingClientRect();
      const btns = [...document.querySelectorAll(".nsft2 .fq-acts .fq-go")].map((b) => { const x = b.getBoundingClientRect(); return { t: b.textContent.trim(), h: x.height, w: x.width, y: x.y, alt: b.classList.contains("alt") }; });
      const nomes = [...document.querySelectorAll(".nsft2 button,.nsft2 a")].filter((e) => !e.closest("[aria-hidden=true]") && e.getClientRects().length).map((e) => (e.getAttribute("aria-label") || e.textContent.trim()));
      return {
        artW: a.width, artH: a.height, artHidden: art.getAttribute("aria-hidden"), artTag: art.tagName, artFocavel: art.matches("button,a,[tabindex]"), btns,
        perguntas: (document.querySelector(".nsft2 .fq-txt").textContent.match(/\?/g) || []).length,
        textos: document.querySelector(".nsft2 .fq-txt").textContent.replace(/\s+/g, " ").trim(),
        l2: getComputedStyle(document.querySelector(".nsft2 .fq-l2")).fontSize, l3: !!document.querySelector(".nsft2 .fq-l3"),
        halo: getComputedStyle(document.querySelector(".nsft2 .fq-o"), "::before").display,
        mandarFeedback: nomes.filter((n) => /Mandar feedback/i.test(n)).length,
        soc: [...document.querySelectorAll(".nsft2 .soc .sb")].map((b) => Math.round(Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)))
      };
    });
    assert.ok(r.artW >= 44 && r.artH >= 44, `telefone ${r.artW}x${r.artH}`);
    assert.strictEqual(r.artHidden, "true");
    assert.strictEqual(r.artTag, "SPAN", "decorativo é um span, não um botão com aria-hidden (antipadrão)");
    assert.strictEqual(r.artFocavel, false, "o telefone decorativo não é focável");
    assert.strictEqual(r.mandarFeedback, 1, "Mandar feedback aparece uma vez para leitor de tela");
    assert.deepStrictEqual(r.btns.map((b) => b.t), ["Mandar feedback", "Quero contribuir"]);
    assert.deepStrictEqual(r.btns.map((b) => b.alt), [false, true], "primário e secundário");
    assert.ok(r.btns.every((b) => b.h >= 44), "botões >= 44px");
    assert.ok(r.btns[1].y > r.btns[0].y, "botões empilhados no celular");
    assert.strictEqual(r.perguntas, 1, "uma pergunta só: " + r.textos);
    assert.strictEqual(r.l2, "13.5px"); assert.strictEqual(r.l3, false);
    assert.strictEqual(r.halo, "none", "anel amarelo não sobrepõe o título");
    assert.ok(r.soc.every((x) => x >= 44), "ícones sociais >= 44px: " + r.soc);
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("rodapé no escuro (390px): mesma ordem e geometria", opts, async () => {
  const { ctx, page, erros } = await abrir("/index.html", { w: 390, h: 844, tema: "dark" });
  const g = await geo(page);
  assert.ok(g.fq.b <= g.legal.y + 1);
  assert.ok(Math.abs(g.fq.x - (g.vw - g.fq.r)) <= 1);
  assert.ok(g.boneco.b <= g.fq.y + 0.5);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("rodapé desktop 1280px não regride: legal | cartão | boneco, 3 colunas, botões lado a lado", opts, async () => {
  const { ctx, page, erros } = await abrir("/index.html", { w: 1280, h: 800 });
  const g = await geo(page);
  assert.ok(g.legal.x < g.fq.x && g.fq.x < g.boneco.x, "ordem legal, cartão, boneco");
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector(".nsft2 .ft-band-in")).gridTemplateColumns.trim().split(/\s+/).length), 3);
  assert.ok(g.fq.w >= 300 && g.fq.w <= 352, "cartão " + g.fq.w);
  assert.ok(Math.abs(g.art.w - 52) <= 1, "telefone 52px: " + g.art.w);
  assert.ok(Math.abs(g.boneco.h - 190) <= 2, "boneco 190px: " + g.boneco.h);
  const tops = await page.$$eval(".nsft2 .fq-acts .fq-go", (l) => l.map((b) => Math.round(b.getBoundingClientRect().y)));
  assert.strictEqual(tops[0], tops[1], "botões lado a lado");
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(sw[0] <= sw[1]);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("rodapé tablet 768px: sem overflow", opts, async () => {
  const { ctx, page, erros } = await abrir("/index.html", { w: 768, h: 1024 });
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(sw[0] <= sw[1]);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

// ---- faixa facts da home ----
const medirFacts = () => {
  const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgDe = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.95) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const opac = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const ratio = (el) => { const fg = parse(getComputedStyle(el).color), bg = bgDe(el), o = opac(el); const a = fg.a * o; const ef = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) }; const x = lum(ef), y = lum(bg); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const fs = [...document.querySelectorAll(".fact")];
  const caixas = fs.map((f) => { const r = f.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; });
  return {
    n: fs.length, caixas,
    fontes: [...document.querySelectorAll(".fact b,.fact span,.note")].map((e) => [e.className || e.tagName, parseFloat(getComputedStyle(e).fontSize)]),
    opac: [...document.querySelectorAll(".fact,.facts,.note")].map((e) => opac(e)),
    contraste: [...document.querySelectorAll(".fact b,.fact span,.note")].map((e) => [e.tagName + ":" + e.textContent.trim().slice(0, 14), +ratio(e).toFixed(2)]),
    timerB: document.getElementById("timerB").textContent, timer: document.getElementById("timer").textContent,
    sw: [document.documentElement.scrollWidth, document.documentElement.clientWidth]
  };
};

for (const [w, h] of [[390, 844], [360, 740]]) for (const tema of ["light", "dark"]) {
  test(`facts ${w}px (${tema}): grade 2x2, 13px, sem opacity, contraste >= 4,5:1, nota >= 12px`, opts, async () => {
    const { ctx, page, erros } = await abrir("/index.html", { w, h, tema });
    const m = await page.evaluate(medirFacts);
    assert.strictEqual(m.n, 4, "as 4 frases continuam");
    const xs = [...new Set(m.caixas.map((c) => c.x))].sort((a, b) => a - b), ys = [...new Set(m.caixas.map((c) => c.y))];
    assert.strictEqual(xs.length, 2, "2 colunas: " + JSON.stringify(m.caixas));
    assert.strictEqual(ys.length, 2, "2 linhas: " + JSON.stringify(m.caixas));
    assert.ok(m.fontes.every(([c, f]) => f >= 12), "fontes >= 12px: " + JSON.stringify(m.fontes));
    assert.ok(m.fontes.filter(([c]) => c !== "note").every(([c, f]) => f >= 13), "frases 13px");
    assert.ok(m.opac.every((o) => o === 1), "sem opacity: " + m.opac);
    assert.deepStrictEqual(m.contraste.filter(([, r]) => r < 4.5), [], "contraste < 4,5: " + JSON.stringify(m.contraste));
    assert.ok(m.sw[0] <= m.sw[1], "sem overflow");
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("facts 1280px: uma linha só com as 4 frases, contraste e fontes ok (claro e escuro)", opts, async () => {
  for (const tema of ["light", "dark"]) {
    const { ctx, page, erros } = await abrir("/index.html", { w: 1280, h: 800, tema });
    const m = await page.evaluate(medirFacts);
    assert.strictEqual(m.n, 4);
    assert.strictEqual(new Set(m.caixas.map((c) => c.y)).size, 1, "uma linha: " + JSON.stringify(m.caixas));
    assert.strictEqual(new Set(m.caixas.map((c) => c.x)).size, 4, "4 colunas");
    assert.ok(new Set(m.caixas.map((c) => c.w)).size === 1, "colunas balanceadas (mesma largura)");
    assert.ok(m.opac.every((o) => o === 1));
    assert.deepStrictEqual(m.contraste.filter(([, r]) => r < 4.5), [], tema + ": " + JSON.stringify(m.contraste));
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  }
});

test("timer só aparece depois de 1 minuto; antes diz 'Você chegou agora'", opts, async () => {
  const { ctx, page } = await abrir("/index.html", { w: 390, h: 844, relogio: true });
  let m = await page.evaluate(() => [document.getElementById("timerB").textContent, document.getElementById("timer").textContent]);
  assert.strictEqual(m[0], "Você chegou agora");
  await page.clock.runFor(30000);
  m = await page.evaluate(() => [document.getElementById("timerB").textContent, document.getElementById("timer").textContent]);
  assert.strictEqual(m[0], "Você chegou agora", "aos 30 s ainda não mostra o tempo");
  await page.clock.runFor(45000);
  m = await page.evaluate(() => [document.getElementById("timerB").textContent, document.getElementById("timer").textContent]);
  assert.strictEqual(m[0], "Você está aqui há");
  assert.match(m[1], /^1 min passeando pelo museu./);
  await ctx.close();
});

test("CSS: .facts/.fact definidos uma vez (só no home.css) e sem !important", opts, async () => {
  const home = fs.readFileSync(path.join(RAIZ, "home.css"), "utf8"), index = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
  const regrasFacts = (t) => t.split("\n").filter((l) => /^\s*(\.facts?\b|main:has\(\.facts\)|body:has\(main \.facts\))/.test(l));
  assert.deepStrictEqual(regrasFacts(index), [], "index.html não define .facts/.fact");
  assert.strictEqual(home.split("\n").filter((l) => /^\.facts\{/.test(l)).length, 1, "uma definição base de .facts no home.css");
  assert.strictEqual(home.split("\n").filter((l) => /^\.fact\{/.test(l)).length, 1, "uma definição base de .fact");
  for (const t of [home, index]) assert.ok(!/(\.facts?|\.note)\b[^{}]*\{[^}]*!important/.test(t), "sem !important em .facts/.fact/.note");
  assert.ok(!/\.fact\{all:unset/.test(home));
});

test("timer com guarda: faixa removida ou redesenhada não gera erro de console", opts, async () => {
  const { ctx, page, erros } = await abrir("/index.html", { w: 390, h: 844, relogio: true });
  // 1) faixa redesenhada (mesmos ids): o timer continua atualizando sem erro
  await page.evaluate(() => { const f = document.querySelector(".facts"); f.innerHTML = f.innerHTML; });
  await page.clock.runFor(75000);
  assert.strictEqual(await page.evaluate(() => document.getElementById("timerB").textContent), "Você está aqui há");
  // 2) faixa removida: o intervalo se limpa sozinho (19 ticks de 15 s = ~5 min sem nenhum TypeError)
  await page.evaluate(() => document.querySelector(".facts").remove());
  await page.clock.runFor(300000);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

// ---- contraste medido por PIXEL: pixels do núcleo do texto (cor do texto) contra o fundo real atrás deles ----
async function contrastePorPixel(page, sel) {
  const el = (await page.$$(sel))[0];
  await el.scrollIntoViewIfNeeded();
  const cor = await el.evaluate((e) => getComputedStyle(e).color);
  const estilo = await page.addStyleTag({ content: ".nsft2 .fq-in *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}" });
  const semTexto = (await el.screenshot()).toString("base64");
  await estilo.evaluate((n) => n.parentNode.removeChild(n));
  const comTexto = (await el.screenshot()).toString("base64");
  return page.evaluate(async ({ a, b, cor }) => {
    const dec = async (x) => { const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + x)).blob()); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; const g = c.getContext("2d"); g.drawImage(bmp, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
    const [fundo, texto] = [await dec(a), await dec(b)];
    const m = /rgba?\(([^)]+)\)/.exec(cor), t = m[1].split(/[ ,\/]+/).map(Number);
    const L = (r, g, bl) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
    const rs = [];
    for (let i = 0; i < texto.data.length; i += 4) {
      const d = Math.hypot(texto.data[i] - t[0], texto.data[i + 1] - t[1], texto.data[i + 2] - t[2]);
      if (d > 40) continue; // só o núcleo do glifo (sem antialias)
      const x = L(texto.data[i], texto.data[i + 1], texto.data[i + 2]), y = L(fundo.data[i], fundo.data[i + 1], fundo.data[i + 2]);
      rs.push((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05));
    }
    rs.sort((p, q) => p - q);
    return { n: rs.length, min: rs[0], p5: rs[Math.floor(rs.length * 0.05)], mediana: rs[Math.floor(rs.length / 2)] };
  }, { a: semTexto, b: comTexto, cor });
}

for (const [w, h] of [[390, 844], [1280, 800]]) for (const tema of ["light", "dark"]) {
  test(`rodapé ${w}px (${tema}): pergunta, logo e apoio com contraste >= 4,5:1 medido por pixel`, opts, async () => {
    const { ctx, page, erros } = await abrir("/index.html", { w, h, tema });
    const falhas = [];
    for (const sel of [".nsft2 .fq-l1", ".nsft2 .fq-l2", ".nsft2 .fq-logo", ".nsft2 .fq-logo i"]) {
      const r = await contrastePorPixel(page, sel);
      assert.ok(r.n >= 8, `${sel}: poucos pixels de texto medidos (${r.n})`);
      if (r.min < 4.5) falhas.push(`${sel} min=${r.min.toFixed(2)} mediana=${r.mediana.toFixed(2)} n=${r.n}`);
    }
    assert.deepStrictEqual(falhas, []);
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("rodapé em ponteiro de toque 1000px: botões 44px e apoio 13,5px", opts, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, hasTouch: true, isMobile: false });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await ctx.addInitScript(() => { try { localStorage.setItem("ns_convidado", "1"); } catch (e) { /* sem storage */ } });
  const page = await ctx.newPage();
  await page.goto(base + "/index.html");
  await page.waitForSelector(".nsft2 .fq-in");
  const coarse = await page.evaluate(() => matchMedia("(pointer:coarse)").matches);
  assert.ok(coarse, "o contexto com hasTouch deveria ter pointer:coarse");
  const r = await page.evaluate(() => ({ hs: [...document.querySelectorAll(".nsft2 .fq-acts .fq-go")].map((b) => b.getBoundingClientRect().height), l2: getComputedStyle(document.querySelector(".nsft2 .fq-l2")).fontSize }));
  assert.ok(r.hs.every((h) => h >= 44), "botões 44px: " + r.hs);
  assert.strictEqual(r.l2, "13.5px");
  await ctx.close();
});
