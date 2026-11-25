// Equipe e moderação no front: Moderação só para moderador/admin; equipe publica direto na Memepédia e troca link de vídeo.
// Roda com arquivo explícito: node --test tests/front-equipe.test.js (precisa do Playwright; sem ele os testes são pulados).
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
const PAT = { id: "banda_larga", nome: "Banda larga", xp_minimo: 150, cor: "#2fbf5b" };

async function abrir(pagina, { papel = "usuario", direto = false, vp = { width: 1280, height: 900 } } = {}) {
  const st = { posts: [] };
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", async (route) => {
    const req = route.request(), p = new URL(req.url()).pathname, m = req.method();
    if (p === "/api/eu") return json(route, 200, { usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: true }, patente: PAT, proxima_patente: null, papel, edita_direto: direto, moedas: 10, xp: 200, csrf: "tok" });
    if (p === "/api/carteira") return json(route, 200, { usuario: { id: 1, apelido: "Ana" }, moedas: 10, xp: 200, patente: PAT, proxima_patente: null, pacotes: [], cartas: { distintas: 0, total_no_album: 109, quantidade_total: 0, repetidas: 0 }, valor_das_repetidas: 0 });
    if (p === "/api/visita") return json(route, 200, { dia: "2026-11-26", primeira_visita_do_dia: false, xp_ganho: 0, pacotes_ganhos: [], carteira: { xp: 200, moedas: 10 } });
    if (m === "POST" && /^\/api\/(memepedia|links)\/direto$/.test(p)) { st.posts.push({ p, csrf: req.headers()["x-csrf"], corpo: JSON.parse(req.postData() || "{}") }); return json(route, 201, { ok: true, publicado: true }); }
    if (p === "/api/memepedia" || p === "/api/links/aprovados") return json(route, 200, {});
    return json(route, 200, { itens: [] });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + pagina);
  await page.waitForFunction(() => typeof SESSAO !== "undefined" && SESSAO && SESSAO.usuario);
  return { ctx, page, st, erros };
}
const visivel = (page, sel) => page.$$eval(sel, (l) => l.some((e) => e.getClientRects().length > 0 && getComputedStyle(e).display !== "none"));

test("Moderação (mecanismo do dev: papel + data-gate): escondida para usuário comum, o atalho avisa; aparece para moderador e admin", opts, async () => {
  let { ctx, page, erros } = await abrir("/index.html");
  await page.waitForSelector("#sub button");
  const itens = async () => page.$$eval("#sub a, #sub button", (n) => n.map((x) => x.textContent.trim()));
  assert.ok(!(await itens()).some((t) => t.includes("Moderação")), "menu sem Moderação");
  assert.strictEqual(await visivel(page, '[data-gate="moderador"]'), false, "Fila → escondido");
  await page.evaluate(() => openMod());
  await page.waitForFunction(() => /só para moderadores/.test(document.body.innerText));
  assert.deepStrictEqual(erros, []);
  await ctx.close();
  for (const papel of ["moderador", "admin"]) {
    ({ ctx, page, erros } = await abrir("/index.html", { papel }));
    await page.waitForFunction(() => document.documentElement.dataset.papel && /moderador/.test(document.documentElement.dataset.papel));
    assert.ok((await itens()).some((t) => t.includes("Moderação")), papel + ": menu com Moderação");
    assert.strictEqual(await visivel(page, '[data-gate="moderador"]'), true, papel + ": Fila → visível");
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  }
});

test("Memepédia: equipe publica direto (com CSRF) e o texto aparece na hora", opts, async () => {
  const { ctx, page, st, erros } = await abrir("/memepedia.html#" + "uma-sopa-pa-noiz", { direto: true });
  await page.waitForSelector("form[id^=f-]", { state: "attached" });
  const campo = await page.$eval("form[id^=f-]", (f) => f.id.slice(2));
  await page.evaluate((c) => editar(c), campo);
  await page.fill(`#f-${campo} textarea`, "Texto publicado pela equipe direto, sem fila.");
  await page.click(`#f-${campo} button[type=submit]`);
  await page.waitForFunction(() => /Texto publicado pela equipe direto/.test(document.body.innerText));
  assert.strictEqual(st.posts.length, 1);
  assert.strictEqual(st.posts[0].p, "/api/memepedia/direto"); assert.strictEqual(st.posts[0].csrf, "tok");
  assert.strictEqual(st.posts[0].corpo.campo, campo);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("vídeo: equipe vê 'Trocar o link' até em meme com vídeo e publica direto; usuário comum não vê a caixa", opts, async () => {
  let { ctx, page, st, erros } = await abrir("/index.html", { direto: true });
  const id = await page.evaluate(() => { const m = MEMES.find((x) => x.yt && !x.cuidado); openViewer(m, {}); return m.id; });
  await page.waitForSelector(".lbx .ol");
  assert.match(await page.$eval(".lbx", (e) => e.innerText), /Trocar o link do vídeo/);
  await page.fill(".lbx .ol", "https://youtu.be/zbnwWlrN5mo");
  await page.click(".lbx [data-act=savelink]");
  await page.waitForSelector(".lbx .chk.ok");
  assert.deepStrictEqual(st.posts.map((x) => [x.p, x.corpo.id, x.corpo.yt]), [["/api/links/direto", id, "zbnwWlrN5mo"]]);
  assert.strictEqual(await page.evaluate((id) => MEMES.find((x) => x.id === id).yt, id), "zbnwWlrN5mo");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
  ({ ctx, page, erros } = await abrir("/index.html"));
  await page.evaluate(() => openViewer(MEMES.find((x) => x.yt && !x.cuidado), {}));
  await page.waitForTimeout(300);
  assert.strictEqual(await page.$$eval(".lbx", (l) => l.length), 0);
  await ctx.close();
});
