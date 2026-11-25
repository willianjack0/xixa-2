// Editor de gatinho (openSignup): celular com prévia e Salvar sempre visíveis, foco, alvos de 44px, aria; desktop intacto.
// API mockada via page.route. Roda com arquivo explícito: node --test tests/front-editor-gatinho.test.js
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

const GATO = { fur: 1, pat: 0, eye: 2, acc: 3, clo: 0, bg: 4 };
const FOTO = "https://cdn.discordapp.com/avatars/123456/abc_123.png?size=128";
const PAT = { id: "banda_larga", nome: "Banda larga", xp_minimo: 150, cor: "#2fbf5b" };

async function abrir({ w, h, toque = false }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: toque, isMobile: toque, deviceScaleFactor: 1 });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  const usuario = { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: FOTO, usar_foto: false, cadastro_completo: true };
  const patches = [];
  const json = (r, st, c) => r.fulfill({ status: st, contentType: "application/json", body: JSON.stringify(c) });
  await ctx.route("**/api/**", async (route) => {
    const req = route.request(), p = new URL(req.url()).pathname, m = req.method();
    if (p === "/api/eu" && m === "GET") return json(route, 200, { usuario, patente: PAT, proxima_patente: null, moedas: 10, xp: 200, csrf: "tok" });
    if (p === "/api/eu" && m === "PATCH") { patches.push(JSON.parse(req.postData() || "{}")); return json(route, 200, { usuario, pacote_boas_vindas: null }); }
    if (p === "/api/carteira") return json(route, 200, { usuario: { id: 1, apelido: "Ana" }, moedas: 10, xp: 200, patente: PAT, proxima_patente: null, pacotes: [], cartas: { distintas: 0 }, valor_das_repetidas: 0 });
    if (p === "/api/album") return json(route, 200, { colecoes: [], total: 0, tenho: 0, colecoes_completas: 0 });
    if (p === "/api/visita") return json(route, 200, { dia: "2026-11-20", primeira_visita_do_dia: false, xp_ganho: 0, pacotes_ganhos: [], carteira: { xp: 200, moedas: 10 } });
    if (p === "/api/pacotes/tipos") return json(route, 200, { itens: [] });
    if (p === "/api/eventos") return json(route, 202, { ok: true });
    return json(route, 404, { erro: "não mockado" });
  });
  await ctx.route((u) => u.hostname === "cdn.discordapp.com", (r) => r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }));
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + "/index.html");
  await page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
  return { ctx, page, erros, patches };
}
const abrirEditor = async (page) => { await page.evaluate(() => openSignup()); await page.waitForSelector("#sgm.open .sg-box"); await page.waitForTimeout(450); };
const caixa = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; });
const rolarAteOFim = (page) => page.evaluate(() => { const m = document.getElementById("sgm"); m.scrollTop = m.scrollHeight; });

for (const [w, h] of [[390, 844], [360, 740]]) {
  test(`celular ${w}x${h}: prévia (96px) e Salvar visíveis depois de rolar até o Fundo; Salvar fora do formulário`, opts, async () => {
    const { ctx, page, erros } = await abrir({ w, h, toque: true });
    await abrirEditor(page);
    assert.strictEqual(await page.$eval("#sgGo", (b) => !!b.closest(".sg-form")), false, "Salvar não pode ficar dentro do bloco do formulário");
    await page.click('#sgTabs [role=tab]:nth-child(4)'); // Fundo
    await rolarAteOFim(page);
    await page.waitForTimeout(150);
    const big = await caixa(page, "#sgBig"), go = await caixa(page, "#sgGo");
    assert.ok(Math.abs(big.w - 96) <= 1 && Math.abs(big.h - 96) <= 1, `prévia ~96px: ${big.w}x${big.h}`);
    assert.ok(big.y >= 0 && big.b <= h, `prévia visível: y=${big.y} b=${big.b}`);
    assert.ok(go.y >= 0 && go.b <= h + 0.5, `Salvar visível: y=${go.y} b=${go.b}`);
    assert.ok(go.h >= 44, "Salvar com 44px+: " + go.h);
    // a barra do Salvar e a prévia aparecem também no meio da rolagem
    await page.evaluate(() => { document.getElementById("sgm").scrollTop = 120; });
    await page.waitForTimeout(100);
    const big2 = await caixa(page, "#sgBig"), go2 = await caixa(page, "#sgGo");
    assert.ok(big2.y >= 0 && big2.b <= h && go2.b <= h + 0.5 && go2.y >= 0, "prévia e Salvar visíveis no meio da rolagem");
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.getElementById("sgm").scrollWidth, document.getElementById("sgm").clientWidth]);
    assert.ok(sw[0] <= sw[1] && sw[2] <= sw[3], "sem overflow horizontal: " + sw);
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });

  test(`celular ${w}x${h}: alvos de toque >= 44px, fontes >= 12px nos textos do editor`, opts, async () => {
    const { ctx, page, erros } = await abrir({ w, h, toque: true });
    await abrirEditor(page);
    const medidas = async () => page.evaluate(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
      const peq = [];
      const alvo = (rotulo, el) => { if (!el) return; const [bw, bh] = r(el); if (bw < 44 || bh < 44) peq.push(`${rotulo} ${bw}x${bh}`); };
      alvo(".sg-x", document.querySelector(".sg-x"));
      document.querySelectorAll("#sgTabs button").forEach((b, i) => alvo("aba" + i, b));
      alvo("embaralhar", document.querySelector(".sg-shuf"));
      alvo("foto", document.getElementById("sgFotoRow"));
      alvo("salvar", document.getElementById("sgGo"));
      document.querySelectorAll(".sg-o").forEach((b, i) => alvo("opção" + i, b));
      const fontes = [];
      document.querySelectorAll(".sg-opts h5,.sg-tabs button,.sg-o,.sg-chk small,.sg-steps,.sg-breed,.sg-pv-h").forEach((e) => { const f = parseFloat(getComputedStyle(e).fontSize); if (f < 12) fontes.push(e.className || e.tagName); });
      return { peq, fontes, fotoVisivel: getComputedStyle(document.getElementById("sgFotoRow")).display !== "none" };
    });
    for (let aba = 0; aba < 4; aba++) {
      await page.click(`#sgTabs [role=tab]:nth-child(${aba + 1})`);
      const m = await medidas();
      assert.ok(m.fotoVisivel);
      assert.deepStrictEqual(m.peq, [], `aba ${aba}`);
      assert.deepStrictEqual(m.fontes, [], `fontes < 12px na aba ${aba}`);
    }
    // a área clicável do checkbox é a linha inteira
    await page.evaluate(() => { document.getElementById("sgm").scrollTop = 0; });
    const antes = await page.$eval("#sgFoto", (i) => i.checked);
    const lb = await caixa(page, "#sgFotoRow");
    await page.mouse.click(lb.x + lb.w - 12, lb.y + lb.h / 2);
    assert.notStrictEqual(await page.$eval("#sgFoto", (i) => i.checked), antes, "clicar no fim da linha alterna a opção");
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("celular: foco vai para o diálogo ao abrir, Esc fecha e devolve o foco a quem abriu", opts, async () => {
  const { ctx, page, erros } = await abrir({ w: 390, h: 844, toque: true });
  // no celular o avatar fica dentro do menu fechado: usa um botão visível como quem abriu
  await page.evaluate(() => { const b = document.createElement("button"); b.id = "abridor"; b.textContent = "abrir"; b.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:1"; b.onclick = () => openSignup(); document.body.appendChild(b); });
  await page.focus("#abridor");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#sgm.open");
  assert.ok(await page.evaluate(() => document.getElementById("sgm").contains(document.activeElement)), "foco dentro do diálogo (não no body)");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("sgm").classList.contains("open"));
  assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), "abridor", "foco devolvido a quem abriu");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("desktop: Editar gatinho pelo menu da conta abre o editor e Esc devolve o foco ao avatar", opts, async () => {
  const { ctx, page, erros } = await abrir({ w: 1280, h: 900 });
  await page.focus("#acct .sg-acct");
  await page.keyboard.press("Enter"); // abre o menu da conta
  await page.click('#acct-menu button[role=menuitem]');
  await page.waitForSelector("#sgm.open");
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), "sgU");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("sgm").classList.contains("open"));
  assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("sg-acct")), "foco devolvido ao avatar");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("ponteiro fino em tela pequena: foco cai no apelido; Tab não escapa do diálogo", opts, async () => {
  const { ctx, page } = await abrir({ w: 390, h: 844, toque: false });
  await abrirEditor(page);
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), "sgU", "primeiro campo");
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => document.getElementById("sgm").contains(document.activeElement)), "foco preso no diálogo (passo " + i + ")");
  }
  await page.keyboard.press("Shift+Tab");
  assert.ok(await page.evaluate(() => document.getElementById("sgm").contains(document.activeElement)));
  await ctx.close();
});

test("salvar fecha o editor e o foco volta para o avatar (novo botão da conta)", opts, async () => {
  const { ctx, page, patches, erros } = await abrir({ w: 1280, h: 900 });
  await abrirEditor(page);
  await page.click("#sgGo");
  await page.waitForFunction(() => !document.getElementById("sgm").classList.contains("open"));
  assert.strictEqual(patches.length, 1);
  assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("sg-acct")), "foco no avatar");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("a11y: opções com aria-pressed, abas com role=tab/aria-selected e foco preservado ao trocar de aba pelo teclado", opts, async () => {
  const { ctx, page } = await abrir({ w: 390, h: 844, toque: false });
  await abrirEditor(page);
  const r = await page.evaluate(() => ({
    semPressed: [...document.querySelectorAll(".sg-o")].filter((b) => !b.hasAttribute("aria-pressed")).length,
    semNome: [...document.querySelectorAll(".sg-o")].filter((b) => !(b.getAttribute("aria-label") || b.textContent.trim())).length,
    pressedPorLinha: [...document.querySelectorAll(".sg-row")].map((row) => [...row.querySelectorAll('.sg-o[aria-pressed="true"]')].length),
    lista: document.getElementById("sgTabs").getAttribute("role"), abas: [...document.querySelectorAll("#sgTabs [role=tab]")].map((b) => b.getAttribute("aria-selected")), painel: document.getElementById("sgOpts").getAttribute("role")
  }));
  assert.strictEqual(r.semPressed, 0); assert.strictEqual(r.semNome, 0);
  assert.ok(r.pressedPorLinha.every((n) => n <= 1) && r.pressedPorLinha[0] === 1, "no máximo uma opção marcada por linha: " + r.pressedPorLinha);
  assert.strictEqual(r.lista, "tablist"); assert.strictEqual(r.painel, "tabpanel");
  assert.deepStrictEqual(r.abas, ["true", "false", "false", "false"]);
  await page.focus("#sgTabs [role=tab]:nth-child(2)");
  await page.keyboard.press("Enter");
  assert.deepStrictEqual(await page.$$eval("#sgTabs [role=tab]", (l) => l.map((b) => b.getAttribute("aria-selected"))), ["false", "true", "false", "false"]);
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), "sgTab1", "foco continua na aba");
  await page.focus("#sgOpts .sg-o:nth-child(3)");
  await page.keyboard.press("Enter");
  assert.ok(await page.evaluate(() => document.activeElement.classList.contains("sg-o")), "foco continua em uma opção");
  assert.strictEqual(await page.evaluate(() => document.querySelectorAll('.sg-o[aria-pressed="true"]').length), 1);
  await ctx.close();
});

test("desktop 1280: tudo cabe sem rolar, prévia 210px, Salvar na coluna do formulário (sem regressão)", opts, async () => {
  const { ctx, page, erros } = await abrir({ w: 1280, h: 900 });
  await abrirEditor(page);
  const g = await page.evaluate(() => {
    const m = document.getElementById("sgm"), box = document.querySelector(".sg-box").getBoundingClientRect(), form = document.querySelector(".sg-form").getBoundingClientRect(), stu = document.querySelector(".sg-studio").getBoundingClientRect(), go = document.getElementById("sgGo").getBoundingClientRect(), big = document.getElementById("sgBig").getBoundingClientRect();
    return { rolavel: m.scrollHeight > m.clientHeight, boxH: Math.round(box.height), formX: Math.round(form.x), studioX: Math.round(stu.x), goX: Math.round(go.x), goR: Math.round(go.right), goB: Math.round(go.bottom), big: Math.round(big.width), pos: getComputedStyle(document.querySelector(".sg-bar")).position, pvPos: getComputedStyle(document.querySelector(".sg-pv")).position, x: Math.round(document.querySelector(".sg-x").getBoundingClientRect().width) };
  });
  assert.strictEqual(g.rolavel, false, "cabe sem rolar");
  assert.ok(g.boxH <= 900, "altura " + g.boxH);
  assert.strictEqual(g.big, 210);
  assert.ok(g.goR <= g.studioX, "Salvar na coluna da esquerda");
  assert.ok(g.goB < 900);
  assert.strictEqual(g.pos, "static"); assert.strictEqual(g.pvPos, "relative");
  assert.deepStrictEqual(erros, []);
  await page.screenshot({ path: path.join(RAIZ, "..", "_pw-tools", "shots", "gatinho-1280.png") }).catch(() => { });
  await ctx.close();
});

test("tablet 768: sem overflow e Salvar visível depois de rolar", opts, async () => {
  const { ctx, page, erros } = await abrir({ w: 768, h: 1024, toque: true });
  await abrirEditor(page);
  await rolarAteOFim(page);
  const go = await caixa(page, "#sgGo");
  assert.ok(go.b <= 1024.5 && go.y >= 0);
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(sw[0] <= sw[1]);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("celular: a barra do Salvar fica colada embaixo da tela (não no meio) e é a última da ordem de foco", opts, async () => {
  const { ctx, page } = await abrir({ w: 390, h: 844, toque: true });
  await abrirEditor(page);
  for (const topo of [0, 150, 99999]) {
    await page.evaluate((t) => { document.getElementById("sgm").scrollTop = t; }, topo);
    await page.waitForTimeout(80);
    const b = await caixa(page, ".sg-bar");
    assert.ok(Math.abs(b.b - 844) <= 1, `barra colada embaixo com scroll=${topo}: bottom=${b.b}`);
  }
  assert.strictEqual(await page.evaluate(() => { const l = [...document.querySelector(".sg-box").children]; return l[l.length - 1].className; }), "sg-bar", "última no DOM (ordem do Tab)");
  await ctx.close();
});

test("abas do editor: setas ←/→, Home e End trocam de aba e o foco acompanha", opts, async () => {
  const { ctx, page, erros } = await abrir({ w: 1280, h: 900 });
  await abrirEditor(page);
  const sel = () => page.$$eval("#sgTabs [role=tab]", (l) => l.map((b) => b.getAttribute("aria-selected")).indexOf("true"));
  await page.focus("#sgTabs [role=tab]:nth-child(1)");
  await page.keyboard.press("ArrowRight"); assert.strictEqual(await sel(), 1);
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), "sgTab1");
  await page.keyboard.press("End"); assert.strictEqual(await sel(), 3);
  await page.keyboard.press("ArrowRight"); assert.strictEqual(await sel(), 0, "dá a volta");
  await page.keyboard.press("ArrowLeft"); assert.strictEqual(await sel(), 3, "dá a volta para trás");
  await page.keyboard.press("Home"); assert.strictEqual(await sel(), 0);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("o botão de fechar do painel de perfil não herda o estilo do X do editor no celular", opts, async () => {
  const { ctx, page } = await abrir({ w: 390, h: 844, toque: true });
  await page.evaluate(() => openTestPanel());
  await page.waitForSelector("#tp.open .sg-x");
  const r = await page.$eval("#tp .sg-x", (b) => { const cs = getComputedStyle(b); return { pos: cs.position, w: Math.round(b.getBoundingClientRect().width) }; });
  assert.notStrictEqual(r.pos, "fixed", "o X do painel de perfil continua absoluto no painel");
  assert.notStrictEqual(r.w, 44);
  await ctx.close();
});

test("celular: ao fechar o editor com o avatar escondido no menu, o foco vai para o botão do menu", opts, async () => {
  const { ctx, page } = await abrir({ w: 390, h: 844, toque: true });
  await abrirEditor(page);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("sgm").classList.contains("open"));
  assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("menu-toggle")), "foco no botão Menu principal");
  await ctx.close();
});
