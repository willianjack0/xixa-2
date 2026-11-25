// Ranking (GET /api/ranking) e criador de gato (PATCH /api/eu), com a API mockada via page.route.
// Roda com arquivo explícito: node --test tests/front-ranking-gato.test.js
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

function criarApi(over = {}) {
  const st = {
    usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: true },
    boasVindas: { estoque_id: 5 }, patchStatus: 200, patchErro: null, patches: [], log: [],
    ranking: {
      xp: { metrica: "xp", itens: [
        { posicao: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, valor: 900, patente: "Banda larga" },
        { posicao: 2, apelido: "Fotinha", avatar_gato: GATO, avatar_url: FOTO, valor: 500, patente: "Discado" },
        { posicao: 3, apelido: "<img src=x onerror=window.__xss=1>", avatar_gato: GATO, avatar_url: null, valor: 10, patente: "Discado" }] },
      cartas: { metrica: "cartas", itens: [{ posicao: 1, apelido: "Colecionador", avatar_gato: GATO, avatar_url: null, valor: 42, patente: "Colaborador" }] }
    },
    rankingStatus: 200, ...over
  };
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  const euCorpo = () => ({ usuario: st.usuario, patente: PAT, proxima_patente: null, moedas: 10, xp: 200, csrf: "tok" });
  async function instalar(ctx) {
    // nada de rede externa (fontes do Google etc.): deixa o evento load rápido e o teste determinístico
    await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
    // foto do Discord: um PNG de 1x1 (a rota mais recente vale primeiro)
    await ctx.route((url) => url.hostname === "cdn.discordapp.com", (r) => r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }));
    await ctx.route("**/api/**", async (route) => {
      const req = route.request(), u = new URL(req.url()), p = u.pathname, m = req.method();
      st.log.push(`${m} ${p}${u.search}`);
      if (p === "/api/eu" && m === "GET") return json(route, 200, euCorpo());
      if (p === "/api/eu" && m === "PATCH") {
        const corpo = JSON.parse(req.postData() || "{}");
        st.patches.push({ corpo, csrf: req.headers()["x-csrf"] });
        if (st.patchStatus !== 200) return json(route, st.patchStatus, st.patchErro || { erro: "falhou" });
        st.usuario = { ...st.usuario, ...("apelido" in corpo ? { apelido: corpo.apelido } : {}), avatar_gato: corpo.avatar_gato || st.usuario.avatar_gato,
          ...("usar_foto" in corpo ? { usar_foto: corpo.usar_foto } : {}), cadastro_completo: true };
        const bv = st.boasVindas; st.boasVindas = null;
        return json(route, 200, { usuario: st.usuario, pacote_boas_vindas: bv });
      }
      if (p === "/api/ranking") {
        if (st.rankingStatus !== 200) return json(route, st.rankingStatus, { erro: "falhou" });
        return json(route, 200, st.ranking[u.searchParams.get("metrica")] || { itens: [] });
      }
      if (p === "/api/carteira") return json(route, 200, { usuario: { id: 1, apelido: st.usuario.apelido }, moedas: 10, xp: 200, patente: PAT, proxima_patente: null, pacotes: st.boasVindas ? [] : [{ tipo: "boas", nome: "Boas-vindas", colecao_id: null, quantidade: 1 }], cartas: { distintas: 0 }, valor_das_repetidas: 0 });
      if (p === "/api/album") return json(route, 200, { colecoes: [], total: 0, tenho: 0, colecoes_completas: 0 });
      if (p === "/api/visita") return json(route, 200, { dia: "2026-11-20", primeira_visita_do_dia: false, xp_ganho: 0, pacotes_ganhos: [], carteira: { xp: 200, moedas: 10 } });
      if (p === "/api/pacotes/tipos") return json(route, 200, { itens: [] });
      if (p === "/api/eventos") return json(route, 202, { ok: true });
      return json(route, 404, { erro: "não mockado" });
    });
  }
  return { st, instalar, n: (re) => st.log.filter((x) => re.test(x)).length };
}

async function abrirPagina(pagina, over) {
  const api = criarApi(over);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await api.instalar(ctx);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + pagina);
  await page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
  return { ctx, page, api, erros };
}
const toastTxt = (page) => page.evaluate(() => document.getElementById("toast")?.textContent || "");
const modalAberto = (page) => page.evaluate(() => document.getElementById("sgm").classList.contains("open"));

for (const pg of ["/index.html", "/album.html"]) {
  test(`ranking ${pg}: gato, foto só quando vier, destaque da própria linha, patente e valor`, opts, async () => {
    const { ctx, page, api, erros } = await abrirPagina(pg);
    await page.evaluate(() => openRank());
    await page.waitForSelector(".rkx");
    if (pg === "/album.html") { // o álbum abre na aba Cartas (colecionadores)
      assert.match(await page.textContent(".rkx"), /Colecionador.*42 cartas/);
      await page.click('[data-rk="xp"]');
      await page.waitForFunction(() => document.querySelectorAll(".rkx").length === 3);
    }
    assert.strictEqual(await page.$$eval(".rkx", (l) => l.length), 3);
    assert.strictEqual(await page.$$eval(".rkx .av svg", (l) => l.length), 2, "gato desenhado nas linhas sem foto");
    const fotos = await page.$$eval(".rkx .av img", (l) => l.map((i) => i.getAttribute("src")));
    assert.deepStrictEqual(fotos, [FOTO]);
    assert.ok(await page.$eval(".rkx.me", (l) => /Ana \(você\)/.test(l.textContent)), "própria linha destacada");
    const primeira = await page.$eval(".rkx", (l) => l.textContent.replace(/\s+/g, " "));
    assert.match(primeira, /1.*Ana.*Banda larga.*900 XP/);
    assert.strictEqual(await page.evaluate(() => window.__xss), undefined, "apelido não pode virar HTML");
    assert.strictEqual(await page.$$eval(".rkx img[src=x]", (l) => l.length), 0);
    assert.ok(api.n(/GET \/api\/ranking\?metrica=(xp|cartas)/) >= 1);
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("ranking: aba Cartas pede metrica=cartas; vazio mostra mensagem", opts, async () => {
  const { ctx, page, api } = await abrirPagina("/index.html", { ranking: { xp: { itens: [] }, cartas: { itens: [] } } });
  await page.evaluate(() => openRank());
  await page.waitForFunction(() => /Ninguém no ranking/.test(document.getElementById("rkBox").textContent));
  await page.click('[data-rk="cartas"]');
  await page.waitForFunction(() => document.querySelector('[data-rk="cartas"]').classList.contains("on"));
  await page.waitForFunction(() => /Ninguém no ranking/.test(document.getElementById("rkBox").textContent));
  assert.ok(api.n(/metrica=cartas/) >= 1);
  assert.ok(api.n(/metrica=xp/) >= 1);
  await ctx.close();
});

test("ranking: erro mostra aviso com Tentar de novo e recupera", opts, async () => {
  const { ctx, page, api } = await abrirPagina("/album.html", { rankingStatus: 500 });
  await page.evaluate(() => openRank());
  await page.waitForSelector("[data-tentar]");
  assert.match(await page.textContent("#rkBox"), /Não consegui carregar/);
  api.st.rankingStatus = 200;
  await page.click("[data-tentar]");
  await page.waitForSelector(".rkx");
  await ctx.close();
});

test("cadastro_completo=false abre o criador sozinho (e reabre no próximo carregamento)", opts, async () => {
  const { ctx, page } = await abrirPagina("/album.html", { usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: false } });
  await page.waitForFunction(() => document.getElementById("sgm").classList.contains("open"));
  assert.strictEqual(await page.inputValue("#sgU"), "Ana");
  await page.keyboard.press("Escape");
  assert.strictEqual(await modalAberto(page), false, "pode fechar");
  await page.reload();
  await page.waitForFunction(() => document.getElementById("sgm").classList.contains("open"));
  await ctx.close();
});

test("cadastro_completo=true não abre o criador", opts, async () => {
  const { ctx, page } = await abrirPagina("/index.html");
  await page.waitForTimeout(500);
  assert.strictEqual(await modalAberto(page), false);
  await ctx.close();
});

test("salvar manda PATCH com X-CSRF e as 6 chaves do gato; boas-vindas só quando vier o pacote", opts, async () => {
  const { ctx, page, api, erros } = await abrirPagina("/album.html", { usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: false } });
  await page.waitForFunction(() => document.getElementById("sgm").classList.contains("open"));
  await page.click('#sgOpts [onclick="sgSet(\'fur\',3)"]');
  const cart0 = api.n(/GET \/api\/carteira/);
  await page.click("#sgGo");
  await page.waitForFunction(() => /boas-vindas/.test(document.getElementById("toast")?.textContent || ""));
  assert.strictEqual(api.st.patches.length, 1);
  const { corpo, csrf } = api.st.patches[0];
  assert.strictEqual(csrf, "tok");
  assert.deepStrictEqual(Object.keys(corpo.avatar_gato).sort(), ["acc", "bg", "clo", "eye", "fur", "pat"]);
  assert.ok(Object.values(corpo.avatar_gato).every(Number.isInteger));
  assert.strictEqual(corpo.avatar_gato.fur, 3);
  assert.ok(!("apelido" in corpo), "apelido igual não é reenviado");
  assert.ok(!("usar_foto" in corpo), "sem foto no Discord, sem usar_foto");
  assert.strictEqual(await modalAberto(page), false);
  await page.waitForFunction((n) => true, cart0);
  assert.ok(api.n(/GET \/api\/carteira/) > cart0, "carteira atualizada (estoque)");
  // segunda vez: sem pacote => sem toast de boas-vindas
  await page.evaluate(() => { document.getElementById("toast").textContent = ""; document.getElementById("toast").style.display = "none"; openSignup(); });
  await page.click("#sgGo");
  await page.waitForFunction(() => /Perfil salvo/.test(document.getElementById("toast")?.textContent || ""));
  assert.ok(!/boas-vindas/.test(await toastTxt(page)));
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("apelido novo vai no PATCH; 409 mostra erro no campo apelido e mantém o criador aberto", opts, async () => {
  const { ctx, page, api } = await abrirPagina("/index.html", { usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: false }, patchStatus: 409, patchErro: { erro: "apelido já está em uso" } });
  await page.waitForFunction(() => document.getElementById("sgm").classList.contains("open"));
  await page.fill("#sgU", "Bia_1");
  await page.click("#sgGo");
  await page.waitForFunction(() => /já está em uso/.test(document.getElementById("sgErrU").textContent));
  assert.strictEqual(api.st.patches[0].corpo.apelido, "Bia_1");
  assert.strictEqual(await page.$eval("#sgU", (i) => i.getAttribute("aria-invalid")), "true");
  assert.strictEqual(await page.$eval("#sgErr", (e) => e.textContent), "");
  assert.strictEqual(await modalAberto(page), true);
  assert.ok(!/boas-vindas/.test(await toastTxt(page)));
  await ctx.close();
});

test("422 com campo=apelido mostra a mensagem no campo; apelido inválido nem chega à API", opts, async () => {
  const { ctx, page, api } = await abrirPagina("/index.html", { usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: false }, patchStatus: 422, patchErro: { erro: "apelido inválido", campo: "apelido" } });
  await page.waitForFunction(() => document.getElementById("sgm").classList.contains("open"));
  await page.fill("#sgU", "a b");
  await page.click("#sgGo");
  await page.waitForFunction(() => /3 a 20/.test(document.getElementById("sgErrU").textContent));
  assert.strictEqual(api.st.patches.length, 0, "validação local igual à da API");
  await page.fill("#sgU", "Bia");
  await page.click("#sgGo");
  await page.waitForFunction(() => /apelido inválido/.test(document.getElementById("sgErrU").textContent));
  await ctx.close();
});

test("Usar minha foto só aparece com avatar_url e troca o avatar do cabeçalho", opts, async () => {
  const sem = await abrirPagina("/index.html");
  await sem.page.evaluate(() => openSignup());
  assert.strictEqual(await sem.page.$eval("#sgFotoRow", (e) => getComputedStyle(e).display), "none");
  assert.strictEqual(await sem.page.$$eval("#acct .sg-av svg", (l) => l.length), 1, "gato por padrão");
  await sem.ctx.close();

  const { ctx, page, api } = await abrirPagina("/index.html", { usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: FOTO, usar_foto: false, cadastro_completo: true } });
  assert.strictEqual(await page.$$eval("#acct .sg-av img", (l) => l.length), 0, "foto só com usar_foto=true");
  await page.evaluate(() => openSignup());
  assert.notStrictEqual(await page.$eval("#sgFotoRow", (e) => getComputedStyle(e).display), "none");
  await page.check("#sgFoto", { force: true });
  await page.click("#sgGo");
  await page.waitForSelector("#acct .sg-av img");
  assert.strictEqual(api.st.patches[0].corpo.usar_foto, true);
  assert.strictEqual(await page.$eval("#acct .sg-av img", (i) => i.getAttribute("src")), FOTO);
  await ctx.close();
});

test("429 do apelido (troca há menos de 24 h) explica o prazo e salvar só o gato funciona", opts, async () => {
  const { ctx, page, api } = await abrirPagina("/index.html", { usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: true }, boasVindas: null, patchStatus: 429, patchErro: { erro: "troca de apelido recente", campo: "apelido", tente_em_segundos: 7300 } });
  await page.evaluate(() => openSignup());
  await page.fill("#sgU", "Bia");
  await page.click("#sgGo");
  await page.waitForFunction(() => /3 h/.test(document.getElementById("sgErrU").textContent));
  assert.match(await page.textContent("#sgErrU"), /volte o apelido para “Ana”/);
  assert.strictEqual(await modalAberto(page), true);
  api.st.patchStatus = 200;
  await page.fill("#sgU", "Ana");
  await page.click("#sgGo");
  await page.waitForFunction(() => /Perfil salvo/.test(document.getElementById("toast")?.textContent || ""));
  assert.ok(!("apelido" in api.st.patches[1].corpo), "sem apelido no segundo PATCH");
  await ctx.close();
});
