// Front ligado à economia da API (API mockada com page.route): visita 1x, cabeçalho vindo da carteira,
// pacote sem spoiler, compra sem moedas (402), reciclar, 401 redireciona, limpeza do localStorage antigo.
// Roda com arquivo explícito: node --test tests/front-economia.test.js
// Precisa do Playwright (npm i playwright; npx playwright install chromium). Sem ele os testes são pulados.
// Se estiver instalado fora do projeto: PLAYWRIGHT_MODULE=/caminho/node_modules/playwright
// Navegador já baixado em outro lugar: CHROMIUM_PATH=/caminho/chrome
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let chromium = null;
for (const m of [process.env.PLAYWRIGHT_MODULE, "playwright"]) {
  if (!m) continue;
  try { ({ chromium } = require(m)); break; } catch { /* tenta o próximo */ }
}

const RAIZ = path.join(__dirname, "..");
const TIPOS_MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json" };
const servidor = () => new Promise((ok) => {
  const s = http.createServer((req, res) => {
    const arq = path.join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TIPOS_MIME[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  }).listen(0, "127.0.0.1", () => ok(s));
});

// coleções do data.js (ids das cartas: <colecao>-<i>, igual ao servidor)
const ctxData = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(RAIZ, "data.js"), "utf8") + ";this.C=COLLECTIONS", ctxData);
const COLECOES = ctxData.C;

const opts = { skip: chromium ? false : "playwright não instalado" };
let srv, browser, base;
test.before(async () => {
  if (!chromium) return;
  srv = await servidor(); base = `http://127.0.0.1:${srv.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

const PAT = { id: "banda_larga", nome: "Banda larga", xp_minimo: 150, cor: "#2fbf5b" };
const PROX = { id: "colaborador", nome: "Colaborador", xp_minimo: 500, cor: "#2f86ff", faltam: 300 };
const TIPOS = [
  { id: "diario", nome: "Pacote Diário", descricao: "grátis", preco: 0, cartas: 5, chances: { Comum: 44, Relevante: 26, Raro: 15, "Relíquia": 9, "Lendário": 5, "Mítico": 1 }, garantia: null, escopo: "todas", gratis: true, comprar: false, icone: "pack", gradiente: "linear-gradient(160deg,#25aae3,#0b4f6e)" },
  { id: "boas", nome: "Boas-vindas", descricao: "uma vez", preco: 0, cartas: 5, chances: { Comum: 44, Raro: 56 }, garantia: "Raro", escopo: "todas", gratis: true, comprar: false, icone: "cat", gradiente: "linear-gradient(160deg,#2a6bff,#0a1a50)" },
  { id: "classico", nome: "Pacote Clássico", descricao: "5 cartas", preco: 150, cartas: 5, chances: { Comum: 44, Relevante: 26, Raro: 15, "Relíquia": 9, "Lendário": 5, "Mítico": 1 }, garantia: null, escopo: "todas", gratis: false, comprar: true, icone: "star", gradiente: "linear-gradient(160deg,#8a1d5a,#2a0618)" }
];

/** API falsa com estado. `log` guarda a ordem das chamadas. */
function criarApi(over = {}) {
  const st = {
    moedas: 123, xp: 200, patente: PAT, proxima: PROX,
    pacotes: [{ tipo: "boas", nome: "Boas-vindas", colecao_id: null, quantidade: 1 }],
    qtd: {}, valorRepetidas: 0, comprar402: false, abrir402: false, euStatus: 200, carteiraStatus: 200, log: [], ...over
  };
  const n = (k) => st.log.filter((x) => x === k).length;
  const carteira = () => ({
    usuario: { id: 1, apelido: "teste" }, moedas: st.moedas, xp: st.xp, patente: st.patente, proxima_patente: st.proxima,
    pacotes: st.pacotes, cartas: { distintas: Object.keys(st.qtd).length, total_no_album: 109, quantidade_total: 0, repetidas: 0 }, valor_das_repetidas: st.valorRepetidas
  });
  const album = () => ({
    colecoes: COLECOES.map((c) => ({ id: c.id, nome: c.n, total: c.cards.length, tenho: 0, completa: false, cartas: c.cards.map((_, i) => ({ id: `${c.id}-${i}`, numero: i + 1, quantidade: st.qtd[`${c.id}-${i}`] || 0 })) })),
    total: 109, tenho: Object.keys(st.qtd).length, colecoes_completas: 0
  });
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  async function instalar(ctx) {
    // nada de rede externa (fontes do Google etc.): deixa o evento load rápido e o teste determinístico
    await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
    await ctx.route("**/api/**", async (route) => {
      const req = route.request(), u = new URL(req.url()), p = u.pathname, m = req.method();
      const chave = `${m} ${p}`;
      st.log.push(chave);
      if (p === "/api/eu" && st.euStatus !== 200) return json(route, st.euStatus, { erro: "falhou" });
      if (p === "/api/eu") return json(route, 200, { usuario: { id: 1, apelido: "teste", avatar_gato: null, avatar_url: null, perfil_layout: st.layout || "orkut" }, patente: st.patente, proxima_patente: st.proxima, moedas: st.moedas, xp: st.xp, csrf: "tok" });
      if (p === "/api/carteira") return st.carteiraStatus === 200 ? json(route, 200, carteira()) : json(route, st.carteiraStatus, { erro: "não autenticado" });
      if (p === "/api/album") return json(route, 200, album());
      if (p === "/api/visita") return json(route, 200, { dia: "2026-11-19", primeira_visita_do_dia: true, xp_ganho: 10, pacotes_ganhos: [], carteira: { xp: st.xp, moedas: st.moedas } });
      if (p === "/api/pacotes/tipos") return json(route, 200, { itens: TIPOS });
      if (p === "/api/pacotes/comprar") return st.comprar402 ? json(route, 402, { erro: "moedas insuficientes" }) : json(route, 201, { estoque_id: 1, tipo: "classico", carteira: { xp: st.xp, moedas: st.moedas } });
      if (p === "/api/pacotes/abrir" && st.abrir402) return json(route, 402, { erro: "moedas insuficientes" });
      if (p === "/api/pacotes/abrir") {
        st.corpoAbrir = JSON.parse(req.postData() || "{}");
        const col = COLECOES[0];
        const cartas = col.cards.slice(0, 5).map((c, i) => ({ id: `${col.id}-${i}`, nome: c.name, emoji: c.e, raridade: c.r, colecao_id: col.id, meme_id: c.meme || null, nova: true }));
        cartas.forEach((c) => { st.qtd[c.id] = (st.qtd[c.id] || 0) + 1; });
        st.moedas += 50; st.xp += 600; st.patente = PROX; st.proxima = null; st.pacotes = [];
        return json(route, 200, { pacote_id: 1, tipo: "boas", nome: "Boas-vindas", cartas, novas: 5, xp_ganho: 600, moedas_ganhas: 50, colecoes_completas: [], valor_das_repetidas: 0, carteira: { xp: st.xp, moedas: st.moedas } });
      }
      if (p === "/api/album/reciclar") {
        st.corpoReciclar = JSON.parse(req.postData() || "{}");
        st.moedas += st.valorRepetidas; const ganhas = st.valorRepetidas; st.valorRepetidas = 0;
        Object.keys(st.qtd).forEach((k) => { st.qtd[k] = 1; });
        return json(route, 200, { convertidas: 3, cartas_afetadas: 2, moedas_ganhas: ganhas, carteira: { xp: st.xp, moedas: st.moedas } });
      }
      if (p === "/api/publicacoes" && m === "POST") { st.corpoPublicar = JSON.parse(req.postData() || "{}"); return json(route, 201, { id: "f1", tipo: "figurinha", em: "2026-11-25T10:00:00Z", legenda: st.corpoPublicar.legenda || null, carta: { id: st.corpoPublicar.carta_id }, pode_apagar: true }); }
      if (p === "/api/eventos") return json(route, 202, { ok: true });
      return json(route, 404, { erro: "não mockado" });
    });
  }
  return { st, n, instalar };
}

async function abrirPagina(pagina, over, { init } = {}) {
  const api = criarApi(over);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (init) await ctx.addInitScript(init);
  await api.instalar(ctx);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + pagina);
  return { ctx, page, api, erros };
}
const esperarEconomia = (page) => page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
const carteiraTxt = (page) => page.evaluate(() => (document.getElementById("wallet").textContent + "|" + document.getElementById("coins")?.textContent).replace(/\s+/g, " "));
const abrirPacoteERasgar = async (page) => {
  await page.click("#pfab");
  await page.waitForSelector("#pkW");
  await page.click("#pkW");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("pkC")).display === "block");
};

test("visita é chamada 1x por carregamento e o cabeçalho vem da carteira", opts, async () => {
  const { ctx, page, api, erros } = await abrirPagina("/album.html");
  await esperarEconomia(page);
  await page.waitForFunction(() => /Banda larga/.test(document.getElementById("wallet").textContent));
  assert.strictEqual(api.n("POST /api/visita"), 1);
  const txt = await carteiraTxt(page);
  assert.match(txt, /Banda larga/);
  assert.match(txt, /123/);
  assert.match(txt, /200 XP/);
  assert.match(txt, /300 p\/ Colaborador/);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("outras páginas também chamam visita 1x e desenham a carteira", opts, async () => {
  for (const pg of ["/index.html", "/memepedia.html", "/linha-do-tempo.html"]) {
    const { ctx, page, api } = await abrirPagina(pg);
    await esperarEconomia(page);
    assert.strictEqual(api.n("POST /api/visita"), 1, pg);
    assert.match(await carteiraTxt(page), /Banda larga/, pg);
    await ctx.close();
  }
});

test("abrir pacote sem spoiler: carteira e álbum só são buscados depois da revelação", opts, async () => {
  const { ctx, page, api, erros } = await abrirPagina("/album.html");
  await esperarEconomia(page);
  await page.waitForFunction(() => invCount() === 1);
  const antes = await carteiraTxt(page);
  const cart0 = api.n("GET /api/carteira"), alb0 = api.n("GET /api/album");
  await abrirPacoteERasgar(page);
  assert.strictEqual(api.st.corpoAbrir.tipo, "boas");
  const novas = await page.$$eval(".slot > .new", (els) => els.map((e) => getComputedStyle(e).visibility));
  assert.ok(novas.length === 5 && novas.every((v) => v === "hidden"), "NOVA! visível antes de virar: " + novas);
  assert.strictEqual(await carteiraTxt(page), antes, "cabeçalho mudou antes de revelar");
  await page.click(".flip");
  await page.waitForTimeout(300);
  assert.strictEqual(api.n("GET /api/carteira"), cart0, "carteira buscada com 1 carta virada");
  assert.strictEqual(api.n("GET /api/album"), alb0, "álbum buscado com 1 carta virada");
  assert.strictEqual(await carteiraTxt(page), antes);
  await page.click("#pkB"); // Revelar tudo
  await page.waitForFunction(() => getComputedStyle(document.getElementById("pkS")).visibility === "visible");
  await page.waitForFunction(() => /Colaborador/.test(document.getElementById("wallet").textContent));
  assert.strictEqual(api.n("GET /api/carteira"), cart0 + 1);
  assert.strictEqual(api.n("GET /api/album"), alb0 + 1);
  assert.match(await carteiraTxt(page), /173|173\b|\b173\b/);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("fechar com Esc no meio da revelação busca carteira e álbum e atualiza o cabeçalho", opts, async () => {
  const { ctx, page, api, erros } = await abrirPagina("/album.html");
  await esperarEconomia(page);
  await page.waitForFunction(() => invCount() === 1);
  const antes = await carteiraTxt(page), cart0 = api.n("GET /api/carteira");
  await abrirPacoteERasgar(page);
  assert.strictEqual(await carteiraTxt(page), antes);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => /Colaborador/.test(document.getElementById("wallet").textContent));
  assert.strictEqual(api.n("GET /api/carteira"), cart0 + 1);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("fechar e abrir a loja durante o Revelar tudo não gera erro", opts, async () => {
  const { ctx, page, erros } = await abrirPagina("/album.html");
  await esperarEconomia(page);
  await page.waitForFunction(() => invCount() === 1);
  await abrirPacoteERasgar(page);
  await page.click("#pkB");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.evaluate(() => openShop());
  await page.waitForTimeout(2500);
  assert.ok(await page.evaluate(() => document.querySelector(".shop") !== null), "loja deveria estar aberta");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("comprar sem moedas (402) mostra aviso e não guarda pacote", opts, async () => {
  const { ctx, page, api } = await abrirPagina("/album.html", { moedas: 1000, comprar402: true, pacotes: [] });
  await esperarEconomia(page);
  await page.evaluate(() => openShop());
  await page.waitForSelector(".shop .sp button");
  await page.click(".shop .sp button");
  await page.waitForFunction(() => /Moedas insuficientes/.test(document.getElementById("toast")?.textContent || ""));
  assert.strictEqual(api.st.pacotes.length, 0);
  assert.ok(await page.evaluate(() => document.querySelector(".shop") !== null), "loja continua aberta");
  await ctx.close();
});

test("reciclar repetidas chama a API e atualiza moedas", opts, async () => {
  const { ctx, page, api, erros } = await abrirPagina("/album.html", { pacotes: [], valorRepetidas: 77, qtd: { [`${COLECOES[0].id}-0`]: 3 } });
  await esperarEconomia(page);
  await page.waitForFunction(() => !document.getElementById("convBtn").disabled);
  await page.click("#convBtn");
  await page.waitForFunction(() => document.getElementById("coins").textContent.replace(/\D/g, "") === "200");
  assert.deepStrictEqual(api.st.corpoReciclar, { todas: true });
  assert.ok(await page.evaluate(() => document.getElementById("convBtn").disabled), "sem repetidas depois de converter");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("401 da API redireciona para /entrar.html?voltar=", opts, async () => {
  const { ctx, page } = await abrirPagina("/album.html", { carteiraStatus: 401 });
  await page.waitForURL(/\/entrar\.html\?voltar=/, { timeout: 8000 });
  assert.match(decodeURIComponent(page.url()), /voltar=\/album\.html/);
  await ctx.close();
});

test("localStorage: chaves antigas de economia são descartadas; tema e o resto ficam", opts, async () => {
  const { ctx, page } = await abrirPagina("/album.html", {}, {
    init: () => {
      if (localStorage.getItem("__semeado")) return;
      localStorage.setItem("__semeado", "1");
      localStorage.setItem("ns_theme", "dark");
      localStorage.setItem("naosalvo2_state", JSON.stringify({ xp: 9999, coins: 8888, owned: { a: 1 }, completed: {}, daily: { d: "x" }, welcome: true, lastVisit: "x", streak: 4, inv: [{ id: "boas" }], dayOffset: 2, fav: "orkut-1", approvedCount: 3 }));
    }
  });
  await esperarEconomia(page);
  const e = await page.evaluate(() => ({ tema: localStorage.getItem("ns_theme"), ns: JSON.parse(localStorage.getItem("naosalvo2_state")) }));
  assert.strictEqual(e.tema, "dark");
  for (const k of ["xp", "coins", "owned", "completed", "daily", "welcome", "lastVisit", "streak", "inv", "dayOffset"]) assert.ok(!(k in e.ns), "restou " + k);
  assert.strictEqual(e.ns.fav, "orkut-1");
  assert.strictEqual(e.ns.approvedCount, 3);
  await ctx.close();
});

test("animação NOVA! é desligada com prefers-reduced-motion", opts, async () => {
  const api = criarApi();
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  await api.instalar(ctx);
  const page = await ctx.newPage();
  await page.goto(base + "/album.html");
  await esperarEconomia(page);
  await page.waitForFunction(() => invCount() === 1);
  await abrirPacoteERasgar(page);
  await page.click(".flip");
  const anim = await page.$eval(".slot.rev > .new", (e) => getComputedStyle(e).animationName);
  assert.strictEqual(anim, "none");
  await ctx.close();
});

test("/api/eu com 5xx: avisa que a economia está indisponível e \"Tentar de novo\" recupera", opts, async () => {
  const { ctx, page, api, erros } = await abrirPagina("/album.html", { euStatus: 503 });
  await page.waitForSelector("#ecooff button");
  assert.match(await page.textContent("#ecooff"), /servidor/);
  await page.click("#pfab");
  await page.waitForFunction(() => /(Servidor|Serviço) indispon/.test(document.getElementById("toast")?.textContent || ""));
  api.st.euStatus = 200;
  await page.click("#ecooff button");
  await esperarEconomia(page);
  await page.waitForFunction(() => !document.getElementById("ecooff"));
  assert.match(await carteiraTxt(page), /Banda larga/);
  assert.ok(erros.every((e) => !/pageerror/.test(e)), erros.join("|"));
  await ctx.close();
});

test("Salvar viral antes da economia carregar não mostra \"precisa de XP\" errado", opts, async () => {
  const { ctx, page } = await abrirPagina("/index.html", { euStatus: 503 });
  await page.waitForSelector("#ecooff button");
  await page.evaluate(() => openSubmit());
  await page.waitForFunction(() => /(Servidor|Serviço) indispon|Carregando/.test(document.getElementById("toast")?.textContent || ""));
  assert.ok(!(await page.evaluate(() => document.getElementById("modal").classList.contains("open"))), "modal não deveria abrir");
  await ctx.close();
});

test("402 ao abrir pacote não dispara toast genérico por cima", opts, async () => {
  const { ctx, page } = await abrirPagina("/album.html", { abrir402: true });
  await esperarEconomia(page);
  await page.waitForFunction(() => invCount() === 1);
  await page.click("#pfab");
  await page.waitForFunction(() => /Moedas insuficientes/.test(document.getElementById("toast")?.textContent || ""));
  await page.waitForTimeout(400);
  assert.match(await page.textContent("#toast"), /Moedas insuficientes/);
  await ctx.close();
});

test("compartilhar figurinha: vira publicação no perfil, no jeito da rede escolhida", opts, async () => {
  const id = `${COLECOES[0].id}-0`;
  const { ctx, page, api, erros } = await abrirPagina("/album.html", { pacotes: [], qtd: { [id]: 1 }, layout: "twitter" });
  await esperarEconomia(page);
  await page.evaluate((id) => pick(id), id);
  await page.click("text=COMPARTILHAR");
  await page.waitForSelector("#shrOk");
  assert.match(await page.$eval("#mbox", (e) => e.innerText), /um tweet/);
  for (const sel of ["#shrOk", ".shr-bt .ghost2"]) assert.ok((await page.$eval(sel, (e) => e.getBoundingClientRect().height)) >= 44, sel + " >= 44px");
  await page.fill("#shrL", "  saiu!!  ");
  await page.click("#shrOk");
  await page.waitForSelector('.shr-bt a[href="perfil.html?u=teste"]');
  assert.deepStrictEqual(api.st.corpoPublicar, { carta_id: id, legenda: "saiu!!" });
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});
