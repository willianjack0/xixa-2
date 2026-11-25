// Modo convidado (issue #35): botão "Continuar sem login", gate.js e cliente de economia sem laço de redirecionamento.
// API mockada via page.route. Roda com arquivo explícito: node --test tests/front-convidado.test.js
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
    let pn = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (pn === "/") pn = "/index.html";
    const arq = path.join(RAIZ, pn);
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

/** API falsa: sem `logado`, GET /api/eu e as rotas de economia respondem 401. */
function criarApi(over = {}) {
  const st = { logado: false, euRede: false, patchStatus: 200, patchErro: null, log: [], ...over };
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  async function instalar(ctx) {
    await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort()); // sem rede externa
    await ctx.route("**/api/**", async (route) => {
      const req = route.request(), p = new URL(req.url()).pathname, m = req.method();
      st.log.push(`${m} ${p}`);
      if (p === "/api/eu" && st.euRede) return route.abort();
      const auth = p === "/api/eu" || /^\/api\/(carteira|album|visita|pacotes)/.test(p);
      if (auth && !st.logado) return json(route, 401, { erro: "não autenticado" });
      if (p === "/api/eu" && m === "GET") return json(route, 200, { usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: true }, patente: PAT, proxima_patente: null, papel: st.papel || "usuario", moedas: 10, xp: 200, csrf: "tok" });
      if (p === "/api/eu" && m === "PATCH") return json(route, st.patchStatus, st.patchErro || { erro: "falhou" });
      if (p === "/api/carteira") return json(route, 200, { usuario: { id: 1, apelido: "Ana" }, moedas: 10, xp: 200, patente: PAT, proxima_patente: null, pacotes: [], cartas: { distintas: 0 }, valor_das_repetidas: 0 });
      if (p === "/api/album") return json(route, 200, { colecoes: [], total: 0, tenho: 0, colecoes_completas: 0 });
      if (p === "/api/visita") return json(route, 200, { dia: "2026-11-20", primeira_visita_do_dia: false, xp_ganho: 0, pacotes_ganhos: [], carteira: { xp: 200, moedas: 10 } });
      if (p === "/api/pacotes/tipos") return json(route, 200, { itens: [] });
      if (p === "/api/ranking") return json(route, 200, { metrica: "xp", itens: [{ posicao: 1, apelido: "Colecionadora", avatar_gato: GATO, avatar_url: null, valor: 900, patente: "Banda larga" }] });
      if (p === "/api/eventos") return json(route, 202, { ok: true });
      return json(route, 404, { erro: "não mockado" });
    });
  }
  return { st, instalar, n: (re) => st.log.filter((x) => re.test(x)).length };
}

/** `convidado`: semeia a marca uma vez (o flag evita recriá-la depois que o login a apagar). */
async function abrir(pagina, { convidado = true, ...over } = {}) {
  const api = criarApi(over);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await api.instalar(ctx);
  if (convidado) await ctx.addInitScript(() => { try { if (!localStorage.getItem("__semeado")) { localStorage.setItem("__semeado", "1"); localStorage.setItem("ns_convidado", "1"); } } catch (e) { /* sem storage */ } });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + pagina);
  return { ctx, page, api, erros };
}
const marca = (page) => page.evaluate(() => { try { return localStorage.getItem("ns_convidado"); } catch (e) { return "erro"; } });
const dialogo = (page) => page.evaluate(() => { const d = document.getElementById("login-dialog"); return { aberto: !!d && d.open, msg: (document.getElementById("lgMsg") || {}).textContent || "" }; });
const prontoConvidado = (page) => page.waitForFunction(() => typeof ECO !== "undefined" && ECO.convidado === true);

for (const pg of ["/index.html", "/memepedia.html", "/linha-do-tempo.html"]) {
  test(`convidado em ${pg}: sem laço, cabeçalho com Login, carteira vazia e sem erro de console`, opts, async () => {
    const { ctx, page, api, erros } = await abrir(pg);
    await prontoConvidado(page);
    await page.waitForTimeout(1200); // se houvesse laço, a URL já teria mudado
    assert.strictEqual(new URL(page.url()).pathname, pg, "não pode redirecionar");
    assert.strictEqual(await page.$$eval("#acct .account-login", (l) => l.length), 1, "botão Login no cabeçalho");
    assert.match(await page.textContent("#wallet"), /Convidado/);
    assert.strictEqual(api.n(/POST \/api\/visita/), 0, "convidado não chama visita");
    assert.ok(api.n(/GET \/api\/eu/) <= 3, "sem laço de /api/eu: " + api.n(/GET \/api\/eu/));
    assert.strictEqual(await marca(page), "1", "a marca continua enquanto não há sessão");
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

const itensDoMenu = (page) => page.$$eval("#sub a, #sub button", (n) => n.map((x) => x.textContent.trim()));
const GATED = ["Ranking", "Álbum de figurinhas", "Moderação", "Enviar meme"];

test("convidado em /album.html: volta para o início sem laço (o álbum só aparece com conta)", opts, async () => {
  const { ctx, page, erros } = await abrir("/album.html");
  await page.waitForURL(/\/index\.html$/, { timeout: 8000 });
  await prontoConvidado(page);
  await page.waitForTimeout(1200); // se houvesse laço, a URL já teria mudado de novo
  assert.strictEqual(new URL(page.url()).pathname, "/index.html");
  assert.strictEqual(await marca(page), "1", "a marca de convidado continua");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("convidado: o menu não mostra Ranking, Álbum, Moderação nem Enviar meme (nem os botões da home)", opts, async () => {
  const { ctx, page, erros } = await abrir("/index.html");
  await prontoConvidado(page);
  const itens = await itensDoMenu(page);
  for (const g of GATED) assert.ok(!itens.some((t) => t.includes(g)), "convidado não deveria ver " + g + " (menu: " + itens.join(" | ") + ")");
  assert.ok(itens.some((t) => t.includes("Linha do tempo")) && itens.some((t) => t.includes("Memepédia")), "o resto do menu continua");
  const escondidos = await page.$$eval("[data-gate]", (n) => n.length > 0 && n.every((x) => getComputedStyle(x).display === "none"));
  assert.ok(escondidos, "botões [data-gate] da home escondidos para convidado");
  assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.papel), "");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("usuário comum logado: vê Ranking, Álbum e Enviar meme, mas NÃO a Moderação", opts, async () => {
  const { ctx, page, erros } = await abrir("/index.html", { logado: true, convidado: false, papel: "usuario" });
  await page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
  const itens = await itensDoMenu(page);
  for (const g of ["Ranking", "Álbum de figurinhas", "Enviar meme"]) assert.ok(itens.some((t) => t.includes(g)), "usuário deveria ver " + g);
  assert.ok(!itens.some((t) => t.includes("Moderação")), "usuário comum não vê Moderação");
  assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.papel), "logado");
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('[data-gate="moderador"]')).display), "none", "Fila → escondida");
  await page.evaluate(() => openMod()); // chamada direta também é barrada
  await page.waitForFunction(() => /só para moderadores/.test(document.getElementById("toast").textContent));
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

for (const papel of ["moderador", "admin"]) {
  test(`${papel}: vê a Moderação no menu e o botão da fila`, opts, async () => {
    const { ctx, page, erros } = await abrir("/index.html", { logado: true, convidado: false, papel });
    await page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
    const itens = await itensDoMenu(page);
    for (const g of GATED) assert.ok(itens.some((t) => t.includes(g)), papel + " deveria ver " + g);
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.papel), "logado moderador");
    assert.notStrictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('[data-gate="moderador"]')).display), "none");
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("convidado: criador de gato não abre sozinho; editar perfil e enviar meme pedem login", opts, async () => {
  const { ctx, page, erros } = await abrir("/index.html");
  await prontoConvidado(page);
  assert.strictEqual(await page.evaluate(() => document.getElementById("sgm").classList.contains("open")), false);
  await page.evaluate(() => openSignup());
  await page.waitForFunction(() => document.getElementById("login-dialog").open);
  assert.match((await dialogo(page)).msg, /editar o perfil/);
  await page.keyboard.press("Escape");
  await page.evaluate(() => openSubmit());
  await page.waitForFunction(() => document.getElementById("login-dialog").open);
  assert.match((await dialogo(page)).msg, /enviar um meme/);
  assert.strictEqual(new URL(page.url()).pathname, "/index.html");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("convidado: ranking pede login; acervo e linha do tempo funcionam", opts, async () => {
  const { ctx, page, erros } = await abrir("/index.html");
  await prontoConvidado(page);
  await page.evaluate(() => openRank());
  await page.waitForFunction(() => document.getElementById("login-dialog").open);
  assert.match((await dialogo(page)).msg, /ver o ranking/);
  await page.keyboard.press("Escape");
  const tl = await ctx.newPage();
  await tl.goto(base + "/linha-do-tempo.html#2012");
  await tl.waitForSelector(".lt-it");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("login (sessão válida em /api/eu) limpa a marca de convidado e liga a economia", opts, async () => {
  const { ctx, page } = await abrir("/album.html", { logado: true });
  await page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
  assert.strictEqual(await marca(page), null);
  assert.strictEqual(await page.evaluate(() => ECO.convidado), false);
  assert.match(await page.textContent("#wallet"), /Banda larga/);
  await ctx.close();
});

test("sem a marca o 401 ainda redireciona para entrar.html?voltar=", opts, async () => {
  const { ctx, page } = await abrir("/album.html", { convidado: false });
  await page.waitForURL(/\/entrar\.html\?voltar=/, { timeout: 8000 });
  assert.match(decodeURIComponent(page.url()), /voltar=\/album\.html/);
  await ctx.close();
});

test("entrar.html: Continuar sem login grava a marca e volta para a página de origem", opts, async () => {
  const { ctx, page } = await abrir("/entrar.html?voltar=%2Fmemepedia.html", { convidado: false });
  const botao = page.locator("#convidado");
  await botao.waitFor();
  assert.match(await page.textContent("#convnota"), /álbum, moedas, pacotes e perfil precisam de conta/);
  assert.ok((await botao.boundingBox()).height >= 44, "alvo de toque de 44px");
  await botao.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/memepedia\.html$/);
  assert.strictEqual(await marca(page), "1");
  await prontoConvidado(page);
  assert.strictEqual(new URL(page.url()).pathname, "/memepedia.html");
  await ctx.close();
});

test("entrar.html: voltar externo cai na raiz (mesma validação de caminho interno)", opts, async () => {
  const { ctx, page } = await abrir("/entrar.html?voltar=%2F%2Fevil.example%2Fx", { convidado: false });
  await page.waitForSelector("#convidado");
  const alvo = await page.evaluate(() => { let v = new URLSearchParams(location.search).get("voltar") || "/"; return document.getElementById("entrar").getAttribute("href"); });
  assert.strictEqual(decodeURIComponent(alvo.split("voltar=")[1]), "/");
  await ctx.close();
});

test("erro de rede em /api/eu não trava a página (gate.js)", opts, async () => {
  const { ctx, page } = await abrir("/linha-do-tempo.html", { convidado: false, euRede: true });
  await page.waitForSelector(".lt-it");
  assert.strictEqual(await page.evaluate(() => document.documentElement.style.visibility), "");
  assert.strictEqual(new URL(page.url()).pathname, "/linha-do-tempo.html");
  await ctx.close();
});

test("nits do #37: regex da foto é ancorada; 429 de apelido sem tente_em_segundos não inventa prazo", opts, async () => {
  const { ctx, page } = await abrir("/index.html", { convidado: false, logado: true, patchStatus: 429, patchErro: { erro: "troca recente", campo: "apelido" } });
  await page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
  const r = await page.evaluate(() => [
    FOTO_DISCORD.test("https://cdn.discordapp.com/avatars/123/abc_1.png?size=128"),
    FOTO_DISCORD.test("https://cdn.discordapp.com/avatars/123/abc_1.png"),
    FOTO_DISCORD.test("https://cdn.discordapp.com/avatars/123/abc_1.png?x=1\"onerror=\"alert(1)"),
    FOTO_DISCORD.test("https://cdn.discordapp.com/avatars/123/abc_1.png.evil.com/x")]);
  assert.deepStrictEqual(r, [true, true, false, false]);
  await page.evaluate(() => openSignup());
  await page.fill("#sgU", "Bia");
  await page.click("#sgGo");
  await page.waitForFunction(() => /ainda não dá/.test(document.getElementById("sgErrU").textContent));
  assert.doesNotMatch(await page.textContent("#sgErrU"), /\d+ (min|h)\b/);
  await ctx.close();
});

for (const [nome, voltar] of [["TAB", "%2F%09%2Fevil.example"], ["LF", "%2F%0a%2Fevil.example"], ["CR", "%2F%0d%2Fevil.example"], ["TAB no meio", "%2Fmemepedia.html%09"]]) {
  test(`entrar.html: voltar com ${nome} não vira open redirect (botão e link do Discord)`, opts, async () => {
    const { ctx, page } = await abrir(`/entrar.html?voltar=${voltar}`, { convidado: false });
    await page.waitForSelector("#convidado");
    const href = await page.getAttribute("#entrar", "href");
    assert.strictEqual(decodeURIComponent(href.split("voltar=")[1]), "/", "link do Discord usa a raiz");
    await page.click("#convidado");
    await page.waitForURL((u) => u.hostname === "127.0.0.1");
    assert.strictEqual(new URL(page.url()).hostname, "127.0.0.1", "ficou no próprio site");
    assert.strictEqual(new URL(page.url()).pathname, "/");
    await ctx.close();
  });
}

test("entrar.html: quem já está logado e chega com voltar malicioso fica no próprio site", opts, async () => {
  const { ctx, page } = await abrir("/entrar.html?voltar=%2F%09%2Fevil.example%2Fx", { convidado: false, logado: true });
  await page.waitForURL((u) => !/entrar\.html/.test(u.pathname));
  assert.strictEqual(new URL(page.url()).hostname, "127.0.0.1");
  assert.strictEqual(new URL(page.url()).pathname, "/");
  await ctx.close();
});

test("entrar.html: armazenamento bloqueado mostra aviso em vez de voltar ao login em silêncio", opts, async () => {
  const api = criarApi();
  const ctx = await browser.newContext();
  await api.instalar(ctx);
  await ctx.addInitScript(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === "ns_convidado") throw new Error("bloqueado"); return o.call(this, k, v); }; });
  const page = await ctx.newPage();
  await page.goto(base + "/entrar.html?voltar=%2Fmemepedia.html");
  await page.click("#convidado");
  await page.waitForFunction(() => /Armazenamento bloqueado/.test(document.getElementById("aviso").textContent));
  assert.match(await page.textContent("#aviso"), /Ative para continuar sem login/);
  assert.strictEqual(new URL(page.url()).pathname, "/entrar.html", "não navega sem a marca");
  await ctx.close();
});

test("convidado: saveOldLink chamado direto pede login (sem 'tem 0 XP')", opts, async () => {
  const { ctx, page, erros } = await abrir("/index.html");
  await prontoConvidado(page);
  const html = await page.evaluate(() => saveOldLink("x", "https://youtu.be/abc"));
  assert.match(html, /Entre na sua conta para salvar o link/);
  assert.doesNotMatch(html, /XP/);
  await page.waitForFunction(() => document.getElementById("login-dialog").open);
  assert.match((await dialogo(page)).msg, /salvar o link/);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});
