// Perfil: as imagens enviadas no painel (carta e meme) aparecem nas figurinhas, na carta favorita e nos memes publicados.
// Prioridade da arte: imagem do banco (midias/...) > imagem do meme no acervo > miniatura do vídeo.
// Roda com arquivo explícito: node --test tests/front-perfil-imagens.test.js (precisa do Playwright; sem ele os testes são pulados).
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
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
    const arq = path.join(RAIZ, p);
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  }).listen(0, "127.0.0.1", () => ok(s));
});

// memes reais do data.js: um com imagem própria e um só com vídeo
const vm = require("node:vm");
const dctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(RAIZ, "data.js"), "utf8") + ";this.M=MEMES", dctx);
const COM_IMG = dctx.M.find((m) => m.img && m.yt), SO_YT = dctx.M.find((m) => !m.img && m.yt);

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
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const COL = [{ id: "orkut", nome: "Lendas do Orkut", total: 5, tenho: 3, completa: false }];
const carta = (i, extra = {}) => ({ id: `orkut-${i}`, colecao_id: "orkut", numero: i + 1, nome: `Carta ${i}`, emoji: "🐱", raridade: "Raro", meme_id: null, imagem: null, ...extra });

async function abrir(layout, { favorita = null, publicacoes = [], cartas = [carta(0)] } = {}) {
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/i.ytimg.com/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await ctx.route("**/midias/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await ctx.route("**/api/**", async (route) => {
    const req = route.request(), p = decodeURIComponent(new URL(req.url()).pathname).toLowerCase(), m = req.method();
    if (p === "/api/eu" && m === "GET") return json(route, 200, { usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: true, perfil_layout: layout, carta_favorita: favorita && favorita.id }, patente: PAT, proxima_patente: null, moedas: 10, xp: 200, csrf: "tok" });
    if (p === "/api/perfil/ana/recados") return json(route, 200, { itens: [] });
    if (p === "/api/perfil/ana") return json(route, 200, { perfil: { apelido: "Ana", avatar_gato: GATO, avatar_url: null, layout, membro_desde: "2026-11-01T12:00:00Z", eh_meu: true }, patente: { id: PAT.id, nome: PAT.nome, cor: PAT.cor }, proxima_patente: null, xp: 200, carta_favorita: favorita, recados: 0, publicacoes, album: { total: 120, tenho: cartas.length, colecoes_completas: 0, colecoes: COL, cartas } });
    if (p === "/api/carteira") return json(route, 200, { usuario: { id: 1, apelido: "Ana" }, moedas: 10, xp: 200, patente: PAT, proxima_patente: null, pacotes: [], cartas: { distintas: 1, total_no_album: 120, quantidade_total: 1, repetidas: 0 }, valor_das_repetidas: 0 });
    if (p === "/api/visita") return json(route, 200, { dia: "2026-11-20", primeira_visita_do_dia: false, xp_ganho: 0, pacotes_ganhos: [], carteira: { xp: 200, moedas: 10 } });
    if (p === "/api/album") return json(route, 200, { colecoes: [], total: 0, tenho: 0, colecoes_completas: 0 });
    if (p === "/api/pacotes/tipos") return json(route, 200, { itens: [] });
    if (p === "/api/eventos") return json(route, 202, { ok: true });
    return json(route, 404, { erro: "não mockado" });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + "/perfil.html?u=Ana");
  await page.waitForSelector("[data-ed=visual]");
  return { ctx, page, erros };
}
const srcs = (page, sel) => page.$$eval(sel, (n) => n.map((i) => i.getAttribute("src")));

test("perfil: carta favorita com imagem enviada no painel mostra a imagem do S3 (e não a miniatura do vídeo)", opts, async () => {
  const fav = carta(0, { imagem: "midias/carta-aabbccddeeff.webp", meme_id: SO_YT.id });
  const { ctx, page, erros } = await abrir("orkut", { favorita: fav, cartas: [fav] });
  await page.waitForSelector(".pf-carta.grande img");
  assert.deepStrictEqual(await srcs(page, ".pf-carta.grande img"), ["/midias/carta-aabbccddeeff.webp"]);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("perfil: carta favorita sem imagem usa a imagem do meme ligado (data.js ou banco) e, sem ela, a miniatura do vídeo", opts, async () => {
  const { ctx, page } = await abrir("orkut", { favorita: carta(0, { meme_id: COM_IMG.id }), cartas: [carta(0, { meme_id: COM_IMG.id })] });
  await page.waitForSelector(".pf-carta.grande");
  assert.deepStrictEqual(await srcs(page, ".pf-carta.grande img"), ["/" + COM_IMG.img], "imagem do meme ligado");
  await ctx.close();
  const b = await abrir("orkut", { favorita: carta(0, { meme_id: SO_YT.id }), cartas: [carta(0, { meme_id: SO_YT.id })] });
  await b.page.waitForSelector(".pf-carta.grande img");
  assert.deepStrictEqual(await srcs(b.page, ".pf-carta.grande img"), ["https://i.ytimg.com/vi/" + SO_YT.yt + "/mqdefault.jpg"], "sem imagem: miniatura do vídeo");
  await b.ctx.close(); return;
  await ctx.close();
});

test("perfil (grade do Instagram): figurinha com imagem do painel e meme publicado com imagem usam as imagens do S3", opts, async () => {
  const c = carta(1, { imagem: "midias/carta-112233445566.webp" });
  const pubs = [
    { id: "f1", tipo: "figurinha", em: "2026-11-20T10:00:00Z", legenda: null, pode_apagar: true, carta: c },
    { id: "m1", tipo: "meme", em: "2026-11-19T10:00:00Z", legenda: null, pode_apagar: false, meme: { id: "meme-novo", titulo: "Meme do MCP", ano: 2020, youtube_id: "dQw4w9WgXcQ", imagem: "midias/meme-aabbccddeeff.webp", emoji: "🎬" } },
    { id: "m2", tipo: "meme", em: "2026-11-18T10:00:00Z", legenda: null, pode_apagar: false, meme: { id: "meme-so-yt", titulo: "Só vídeo", ano: 2019, youtube_id: "dQw4w9WgXcQ", imagem: null, emoji: "🎬" } }
  ];
  const { ctx, page, erros } = await abrir("instagram", { publicacoes: pubs, cartas: [c] });
  await page.waitForFunction(() => document.querySelectorAll("#pf img[src]").length >= 3 || document.body.innerHTML.includes("midias/"));
  const todas = await page.$$eval("img", (n) => n.map((i) => i.getAttribute("src")));
  assert.ok(todas.includes("/midias/carta-112233445566.webp"), "figurinha usa a imagem da carta: " + todas.join(","));
  assert.ok(todas.includes("/midias/meme-aabbccddeeff.webp"), "meme publicado usa a imagem enviada");
  assert.ok(todas.includes("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg"), "meme sem imagem segue com a miniatura do vídeo");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});
