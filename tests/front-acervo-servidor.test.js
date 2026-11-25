// O site parte do data.js, mas o banco é a fonte da verdade: /api/memes atualiza o acervo de todas as páginas.
// Link de vídeo trocado (no painel ou pela moderação) troca também a miniatura; meme oculto sai; meme novo (ex.: pelo MCP) entra.
// A linha do tempo aberta pelo menu (sem ano no endereço) sorteia um ano que a pessoa ainda não viu.
// Roda com arquivo explícito: node --test tests/front-acervo-servidor.test.js (precisa do Playwright; sem ele os testes são pulados).
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
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json" };
const servidor = () => new Promise((ok) => {
  const s = http.createServer((req, res) => {
    const arq = path.join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  }).listen(0, "127.0.0.1", () => ok(s));
});
const ctxData = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(RAIZ, "data.js"), "utf8") + ";this.M=MEMES;this.Y=YEAR_INFO", ctxData);
const MEMES = ctxData.M;

// o que o banco devolve: o acervo do data.js, com o link do Pintinho trocado, Havaianas com o vídeo novo
// (a imagem antiga era captura do vídeo anterior), Cala Boca Galvão oculto e um meme novo cadastrado pelo MCP
function acervoDoBanco() {
  const itens = MEMES.filter((m) => m.id !== "cala-boca-galvao").map((m) => ({
    id: m.id, titulo: m.t, ano: m.y, data: m.date ? m.date + "T03:00:00.000Z" : null, categoria: m.c, tipo: m.tipo === "foto" ? "foto" : "video", raridade: m.r,
    emoji: m.e, descricao: m.d, autor: m.by || null, duracao: m.dur || null, youtube_id: m.yt || null, adicionado_em: m.added || null,
    midias: m.img ? [{ tipo: "imagem", caminho: m.img, origem_url: m.srcImg || null, credito_por: m.credit ? m.credit.by : null, credito_url: m.credit ? m.credit.url : ("https://www.youtube.com/watch?v=" + m.yt) }] : []
  }));
  itens.find((m) => m.id === "o-pintinho-piu").youtube_id = "AAAAAAAAAAA";
  itens.find((m) => m.id === "havaianas-de-pau").youtube_id = "BBBBBBBBBBB";
  itens.push({ id: "meme-do-mcp", titulo: "Meme Novo do MCP", ano: 2012, data: "2012-05-10T03:00:00.000Z", categoria: "Vídeos", tipo: "video", raridade: "Raro", emoji: "🤖", descricao: "Cadastrado pelo MCP.", autor: null, duracao: null, youtube_id: "CCCCCCCCCCC", adicionado_em: "2026-11-27", midias: [] });
  return itens;
}
const opts = { skip: chromium ? false : "playwright não instalado" };
let srv, browser, base;
test.before(async () => {
  if (!chromium) return;
  srv = await servidor(); base = `http://127.0.0.1:${srv.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

async function abrir(url, { comBanco = true, vistos = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (vistos) await ctx.addInitScript((v) => { try { localStorage.setItem("ns_anos_vistos", JSON.stringify(v)); } catch (e) { /* sem storage */ } }, vistos);
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  await ctx.route("**/api/**", (route) => {
    const u = new URL(route.request().url()), p = u.pathname;
    if (p === "/api/memes" && comBanco) { const it = acervoDoBanco(), off = +(u.searchParams.get("offset") || 0), lim = +(u.searchParams.get("limite") || 500); return json(route, 200, { total: it.length, itens: it.slice(off, off + lim) }); }
    if (p === "/api/links/aprovados") return json(route, 200, {});
    if (p === "/api/eu") return json(route, 200, { usuario: { id: 1, apelido: "teste", avatar_gato: null, avatar_url: null, cadastro_completo: true }, patente: { id: "banda_larga", nome: "Banda larga", xp_minimo: 150, cor: "#2fbf5b" }, proxima_patente: null, moedas: 10, xp: 200, csrf: "tok" });
    if (p === "/api/visita") return json(route, 200, { dia: "2026-11-27", primeira_visita_do_dia: false, xp_ganho: 0, pacotes_ganhos: [], carteira: { xp: 200, moedas: 10 } });
    return json(route, 404, { erro: "não mockado" });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await page.goto(base + url);
  await page.waitForFunction(() => typeof ST !== "undefined" && document.querySelector(".lt-it"));
  return { ctx, page, erros };
}

test("linha do tempo: troca de link no banco troca a miniatura; oculto sai; meme novo entra", opts, async () => {
  const { ctx, page, erros } = await abrir("/linha-do-tempo.html#2012");
  await page.waitForFunction(() => MEMES.some((m) => m.id === "meme-do-mcp"));
  await page.waitForSelector('.lt-ab[data-id="meme-do-mcp"]');
  const thumb = await page.$eval('.lt-ab[data-id="o-pintinho-piu"]', (b) => b.closest(".lt-it").querySelector("img").getAttribute("src"));
  assert.match(thumb, /AAAAAAAAAAA/);
  assert.strictEqual(await page.evaluate(() => MEMES.some((m) => m.id === "cala-boca-galvao")), false);
  // a captura antiga do Havaianas não vale mais: a miniatura é a do vídeo novo
  const hav = await page.evaluate(() => { const m = MEMES.find((x) => x.id === "havaianas-de-pau"); return { img: m.img || null, yt: m.yt }; });
  assert.deepStrictEqual(hav, { img: null, yt: "BBBBBBBBBBB" });
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("sem a API (ou com resposta vazia) o site segue com o data.js", opts, async () => {
  const { ctx, page, erros } = await abrir("/linha-do-tempo.html#2010", { comBanco: false });
  await page.waitForTimeout(400);
  assert.strictEqual(await page.evaluate(() => MEMES.length), MEMES.length);
  assert.ok(await page.$('.lt-ab[data-id="cala-boca-galvao"]'));
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("linha do tempo pelo menu (sem ano): sorteia um ano ainda não visto e guarda como visto", opts, async () => {
  const anos = Object.keys(ctxData.Y);
  const falta = anos[anos.length - 3];
  const { ctx, page } = await abrir("/linha-do-tempo.html", { vistos: anos.filter((k) => k !== falta) });
  assert.strictEqual(await page.evaluate(() => ST.ano), falta);
  assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem("ns_anos_vistos")))).includes(falta));
  await ctx.close();
  // com ano no endereço (link da home) abre nesse ano
  const b = await abrir("/linha-do-tempo.html#2014");
  assert.strictEqual(await b.page.evaluate(() => ST.ano), "2014");
  await b.ctx.close();
});
