// Área adm (/seppzone), "Área adm" no menu da conta (só admin), insígnia de moderador no ranking, envio de meme e pedido de remoção
// ligados à API. API mockada via page.route. Roda com arquivo explícito: node --test tests/front-seppzone-envios.test.js
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
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
    const arq = path.join(RAIZ, p);
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
const PAT = { id: "banda_larga", nome: "Banda larga", xp_minimo: 150, cor: "#2fbf5b" };
const RANK = [
  { posicao: 1, apelido: "ModeradoraMaria", avatar_gato: GATO, avatar_url: null, valor: 900, patente: "Banda larga", moderador: true },
  { posicao: 2, apelido: "ChefeAdmin", avatar_gato: GATO, avatar_url: null, valor: 800, patente: "Banda larga", moderador: false },
  { posicao: 3, apelido: "Zeca", avatar_gato: GATO, avatar_url: null, valor: 700, patente: "Banda larga", moderador: false }
];

/** `papel` do usuário logado; `resp` troca as respostas de POST /api/envios e POST /api/remocoes */
async function abrir(pagina, { papel = "usuario", envio = [201, { ok: true }], remocao = [201, { ok: true, id: 1 }] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  const log = [];
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  await ctx.route("**/api/**", async (route) => {
    const req = route.request(), p = new URL(req.url()).pathname, m = req.method();
    log.push({ m, p, corpo: req.postData() ? JSON.parse(req.postData()) : null, csrf: req.headers()["x-csrf"] || null });
    if (p === "/api/eu") return json(route, 200, { usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: true }, patente: PAT, proxima_patente: null, papel, moedas: 10, xp: 200, csrf: "tok" });
    if (p === "/api/carteira") return json(route, 200, { usuario: { id: 1, apelido: "Ana" }, moedas: 10, xp: 200, patente: PAT, proxima_patente: null, pacotes: [], cartas: { distintas: 0 }, valor_das_repetidas: 0 });
    if (p === "/api/album") return json(route, 200, { colecoes: [], total: 0, tenho: 0, colecoes_completas: 0 });
    if (p === "/api/visita") return json(route, 200, { dia: "2026-11-20", primeira_visita_do_dia: false, xp_ganho: 0, pacotes_ganhos: [], carteira: { xp: 200, moedas: 10 } });
    if (p === "/api/pacotes/tipos") return json(route, 200, { itens: [] });
    if (p === "/api/ranking") return json(route, 200, { metrica: "xp", itens: RANK });
    if (p === "/api/envios" && m === "POST") return json(route, envio[0], envio[1]);
    if (p === "/api/remocoes" && m === "POST") return json(route, remocao[0], remocao[1]);
    if (p === "/api/eventos") return json(route, 202, { ok: true });
    return json(route, 404, { erro: "não mockado" });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await page.goto(base + pagina);
  await page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
  return { ctx, page, log, erros };
}
const itensDoMenuConta = async (page) => {
  await page.click(".sg-acct");
  return page.$$eval("#acct-menu [role=menuitem]", (n) => n.map((x) => ({ t: x.textContent.trim(), href: x.getAttribute("href") })));
};

test("menu da conta: 'Área adm' só para admin, apontando para /seppzone/", opts, async () => {
  for (const [papel, ve] of [["admin", true], ["moderador", false], ["usuario", false]]) {
    const { ctx, page, erros } = await abrir("/index.html", { papel });
    const itens = await itensDoMenuConta(page);
    const adm = itens.find((i) => /Área adm/.test(i.t));
    assert.strictEqual(!!adm, ve, `${papel}: Área adm ${ve ? "deveria" : "não deveria"} aparecer (${itens.map((i) => i.t).join(" | ")})`);
    if (ve) assert.strictEqual(adm.href, "/seppzone/");
    assert.ok(itens.some((i) => /Ver o meu perfil/.test(i.t)), "o resto do menu continua");
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  }
});

test("ranking: insígnia 'Moderador' só em quem é moderador (não em admin nem em usuário)", opts, async () => {
  const { ctx, page, erros } = await abrir("/index.html");
  await page.evaluate(() => openRank());
  await page.waitForSelector(".rkx");
  const linhas = await page.$$eval(".rkx", (n) => n.map((x) => ({ nome: x.querySelector(".n").textContent.trim(), mb: !!x.querySelector(".mb"), txt: (x.querySelector(".mb") || {}).textContent || "" })));
  assert.deepStrictEqual(linhas.map((l) => [l.nome, l.mb]), [["ModeradoraMaria", true], ["ChefeAdmin", false], ["Zeca", false]]);
  assert.match(linhas[0].txt, /Moderador/);
  // legível: >= 12px e contraste >= 4,5:1 nos dois temas
  for (const tema of ["light", "dark"]) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
    const r = await page.$eval(".rkx .mb", (e) => {
      const cs = getComputedStyle(e), p = (s) => { const v = /rgba?\(([^)]+)\)/.exec(s)[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2] }; };
      const L = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const a = L(p(cs.color)), b = L(p(cs.backgroundColor));
      return { px: parseFloat(cs.fontSize), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
    assert.ok(r.px >= 12, "fonte " + r.px); assert.ok(r.ratio >= 4.5, `${tema}: contraste ${r.ratio.toFixed(2)}`);
  }
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

async function preencherEnvio(page) {
  await page.evaluate(() => openSubmit());
  await page.waitForSelector("#sU");
  await page.fill("#sU", "https://youtu.be/abcdefghijk");
  await page.fill("#sN", "Meme Novo Muito Engraçado");
  await page.selectOption("#sY", "2012");
  await page.fill("#sD", "Contexto do vídeo.");
}

test("envio de meme: POST /api/envios com CSRF, corpo certo e sem fila de exemplo no navegador", opts, async () => {
  const { ctx, page, log, erros } = await abrir("/index.html");
  await preencherEnvio(page);
  await page.click("#sGo");
  await page.waitForFunction(() => /Envio recebido/.test(document.getElementById("toast")?.textContent || ""));
  const req = log.find((l) => l.m === "POST" && l.p === "/api/envios");
  assert.ok(req, "chamou a API");
  assert.strictEqual(req.csrf, "tok");
  assert.deepStrictEqual(req.corpo, { url: "https://youtu.be/abcdefghijk", titulo: "Meme Novo Muito Engraçado", ano: 2012, categoria: await page.evaluate(() => Object.keys(CAT_EMO)[0]), descricao: "Contexto do vídeo." });
  assert.strictEqual(await page.evaluate(() => document.getElementById("modal").classList.contains("open")), false, "fechou o formulário");
  assert.strictEqual(await page.evaluate(() => NS.subs.length), 0, "não cria ticket falso local");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("envio de meme: erros do servidor aparecem no formulário e ele continua aberto (duplicado, patente, limite, rede)", opts, async () => {
  const casos = [
    [[409, { erro: "esse vídeo já está no acervo", duplicado_de: { meme: "x", titulo: "X" } }], /já está no acervo/],
    [[403, { erro: "exige a patente Banda larga", patente_atual: "Discado" }], /patente Banda larga/],
    [[429, { erro: "Você já tem 5 envios aguardando moderação." }], /5 envios aguardando/],
    [[422, { erro: "campos inválidos", campos: { url: "link http(s) válido" } }], /url.*link http/]
  ];
  for (const [envio, re] of casos) {
    const { ctx, page, erros } = await abrir("/index.html", { envio });
    await preencherEnvio(page);
    await page.click("#sGo");
    await page.waitForFunction(() => /chk bad/.test(document.getElementById("dup").innerHTML));
    assert.match(await page.textContent("#dup"), re);
    assert.strictEqual(await page.evaluate(() => document.getElementById("modal").classList.contains("open")), true, "continua aberto");
    assert.strictEqual(await page.evaluate(() => document.getElementById("sGo").disabled), false, "botão liberado para tentar de novo");
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  }
});

async function abrirRemocao(page, { nome = "Dono do vídeo", motivo = "Este vídeo é meu e não autorizei a publicação." } = {}) {
  await page.evaluate(() => openFeedback("remocao"));
  await page.waitForSelector("#fbSol:not([hidden])");
  if (nome) await page.fill("#fbSol", nome);
  await page.fill("#fbMsg", motivo);
}

test("pedido de remoção: POST /api/remocoes (nome, motivo, contato), confirma o prazo e fecha", opts, async () => {
  const { ctx, page, log, erros } = await abrir("/index.html");
  await abrirRemocao(page);
  await page.fill("#fbC", "dono@exemplo.com");
  await page.click(".fb-go");
  await page.waitForFunction(() => /72 horas/.test(document.getElementById("toast")?.textContent || ""));
  const req = log.find((l) => l.m === "POST" && l.p === "/api/remocoes");
  assert.ok(req);
  assert.deepStrictEqual(req.corpo, { solicitante: "Dono do vídeo", motivo: "Este vídeo é meu e não autorizei a publicação.", contato: "dono@exemplo.com" });
  assert.ok(!log.some((l) => l.p === "/api/feedback"), "não vai para o feedback comum");
  assert.strictEqual(await page.evaluate(() => document.getElementById("fbm").classList.contains("open")), false);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("pedido de remoção: exige nome e motivo; falha de servidor/rede NÃO some em silêncio", opts, async () => {
  const a = await abrir("/index.html");
  await abrirRemocao(a.page, { nome: "" });
  await a.page.click(".fb-go");
  await a.page.waitForTimeout(300);
  assert.ok(!a.log.some((l) => l.p === "/api/remocoes"), "nada enviado sem nome");
  assert.strictEqual(await a.page.evaluate(() => document.getElementById("fbm").classList.contains("open")), true, "continua aberto");
  assert.strictEqual(await a.page.evaluate(() => document.getElementById("fbSol").validity.valueMissing), true, "o navegador exige o nome");
  await a.ctx.close();
  const b = await abrir("/index.html", { remocao: [429, { erro: "Muitos pedidos seguidos. Aguarde um pouco." }] });
  await abrirRemocao(b.page);
  await b.page.click(".fb-go");
  await b.page.waitForFunction(() => /Muitos pedidos/.test(document.getElementById("fbErr").textContent));
  assert.strictEqual(await b.page.evaluate(() => document.getElementById("fbm").classList.contains("open")), true, "continua aberto");
  assert.strictEqual(await b.page.evaluate(() => localStorage.getItem("ns_feedback")), null, "pedido de remoção não vai para o rascunho local");
  await b.ctx.close();
  const c = await abrir("/index.html", { remocao: [422, { erro: "campos inválidos", campos: { motivo: "de 10 a 2000 caracteres" } }] });
  await abrirRemocao(c.page);
  await c.page.click(".fb-go");
  await c.page.waitForFunction(() => /campo motivo \(de 10 a 2000/.test(document.getElementById("fbErr").textContent));
  await c.ctx.close();
});

test("outros tipos de feedback continuam indo para /api/feedback e o campo de nome só aparece em Remoção", opts, async () => {
  const { ctx, page } = await abrir("/index.html");
  await page.evaluate(() => openFeedback("ideia"));
  await page.waitForSelector("#fbMsg");
  assert.strictEqual(await page.evaluate(() => document.getElementById("fbSol").hidden), true);
  await page.check('input[name="tipo"][value="remocao"]');
  assert.strictEqual(await page.evaluate(() => document.getElementById("fbSol").hidden), false);
  await page.check('input[name="tipo"][value="bug"]');
  assert.strictEqual(await page.evaluate(() => document.getElementById("fbSol").hidden), true);
  await ctx.close();
});

test("/seppzone/ abre a área adm e /admin/ não existe mais", opts, async () => {
  const ctx = await browser.newContext();
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: '{"erro":"x"}' }));
  const page = await ctx.newPage();
  const novo = await page.goto(base + "/seppzone/");
  assert.strictEqual(novo.status(), 200);
  assert.match(await page.title(), /Admin/);
  assert.strictEqual((await ctx.request.get(base + "/admin/")).status(), 404);
  assert.strictEqual((await ctx.request.get(base + "/admin/admin.js")).status(), 404);
  await page.goto(base + "/seppzone/");
  await page.waitForSelector("#app a.b");
  assert.strictEqual(await page.getAttribute("#app a.b", "href"), "/entrar.html?voltar=/seppzone/");
  await ctx.close();
});
