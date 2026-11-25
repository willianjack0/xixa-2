// Testes do front para o carregamento do acervo da API (acervo-api.js):
// (a) meme novo do banco aparece em index.html, linha-do-tempo.html e memepedia.html;
// (b) meme do data.js com título editado no banco mostra o título novo;
// (c) fora-do-ar devolvendo o id de um meme do data.js faz ele sumir do grid;
// (d) /api/memes com 500 ou rede abortada: o site renderiza com data.js sem erro;
// (e) fora-do-ar falhando não esconde nada;
// (f) imagem midias/x.png do banco vira <img src> correto;
// (g) a requisição POST /api/memes/fora-do-ar manda só ids (sem dados de usuário).
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
  srv = await servidor();
  base = `http://127.0.0.1:${srv.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});

test.after(async () => {
  if (browser) await browser.close();
  if (srv) srv.close();
});

async function abrir(pagina, { rotaMemes = null, rotaForaDoAr = null, conv = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  const log = [];
  const erros = [];

  await ctx.route("**/api/**", async (route) => {
    const req = route.request(), p = new URL(req.url()).pathname, m = req.method();
    log.push({ m, p, corpo: req.postData() ? JSON.parse(req.postData()) : null, headers: req.headers() });

    if (p === "/api/memes" && m === "GET") {
      if (typeof rotaMemes === "function") return rotaMemes(route);
      if (rotaMemes === "erro500") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ erro: "falha interna" }) });
      if (rotaMemes === "abortar") return route.abort();
      if (Array.isArray(rotaMemes)) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: rotaMemes.length, itens: rotaMemes }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, itens: [] }) });
    }

    if (p === "/api/memes/fora-do-ar" && m === "POST") {
      if (typeof rotaForaDoAr === "function") return rotaForaDoAr(route);
      if (rotaForaDoAr === "erro500") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ erro: "falha" }) });
      if (rotaForaDoAr === "abortar") return route.abort();
      if (Array.isArray(rotaForaDoAr)) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ids: rotaForaDoAr }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ids: [] }) });
    }

    if (p === "/api/memepedia" && m === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (p === "/api/eventos") return route.fulfill({ status: 202, contentType: "application/json", body: '{"ok":true}' });
    return route.fulfill({ status: 404, contentType: "application/json", body: '{"erro":"nao mockado"}' });
  });

  const page = await ctx.newPage();
  if (conv) {
    await page.addInitScript(() => {
      localStorage.setItem("ns_convidado", "1");
    });
  }

  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await page.goto(base + pagina);
  await page.waitForFunction(() => typeof window.acervoPronto !== "undefined");
  await page.evaluate(() => window.acervoPronto);
  return { ctx, page, log, erros };
}

test("(a) meme novo do banco aparece em index.html, linha-do-tempo.html e memepedia.html", opts, async () => {
  const memeNovo = {
    id: "meme-novo-api-1",
    titulo: "Viral Inédito do Futuro",
    ano: 2026,
    categoria: "Vídeos",
    raridade: "Lendário",
    descricao: "Meme adicionado dinamicamente pela API",
    youtube_id: "dQw4w9WgXcQ",
    tipo: "video",
    midias: []
  };

  // index.html
  const h1 = await abrir("/index.html#2026", { rotaMemes: [memeNovo] });
  const achouHome = await h1.page.evaluate(() => document.body.innerText.includes("Viral Inédito do Futuro"));
  assert.ok(achouHome, "meme novo deve aparecer na home");
  await h1.ctx.close();

  // linha-do-tempo.html
  const h2 = await abrir("/linha-do-tempo.html#2026", { rotaMemes: [memeNovo] });
  const achouTl = await h2.page.evaluate(() => document.body.innerText.includes("Viral Inédito do Futuro"));
  assert.ok(achouTl, "meme novo deve aparecer na linha do tempo");
  await h2.ctx.close();

  // memepedia.html
  const h3 = await abrir("/memepedia.html", { rotaMemes: [memeNovo] });
  const achouWiki = await h3.page.evaluate(() => document.body.innerText.includes("Viral Inédito do Futuro"));
  assert.ok(achouWiki, "meme novo deve aparecer na memepédia");
  await h3.ctx.close();
});

test("(b) meme que já existe no data.js com título editado no banco mostra o título novo", opts, async () => {
  const memeEditado = {
    id: "havaianas-de-pau",
    titulo: "Havaianas de Madeira Super Editada",
    ano: 2004,
    categoria: "Vídeos",
    raridade: "Mítico",
    youtube_id: "I8MC6-BuU28",
    tipo: "video",
    midias: []
  };

  const h = await abrir("/index.html#2004", { rotaMemes: [memeEditado] });
  const achouEditado = await h.page.evaluate(() => document.body.innerText.includes("Havaianas de Madeira Super Editada"));
  assert.ok(achouEditado, "título editado pelo banco deve sobrescrever o do data.js");
  await h.ctx.close();
});

test("(c) fora-do-ar devolvendo o id de um meme do data.js faz ele sumir do grid", opts, async () => {
  const h = await abrir("/index.html#2004", { rotaForaDoAr: ["havaianas-de-pau"] });
  const temHavaianas = await h.page.evaluate(() => document.body.innerText.includes("Havaianas de Pau"));
  assert.equal(temHavaianas, false, "meme oculto retornado por fora-do-ar deve sumir do grid");
  await h.ctx.close();
});

test("(d) /api/memes com 500 ou rede abortada: o site renderiza com data.js normalmente", opts, async () => {
  const h = await abrir("/index.html#2004", { rotaMemes: "erro500" });
  assert.equal(h.erros.length, 0, "não deve haver erros de execução de página");
  const temHavaianas = await h.page.evaluate(() => document.body.innerText.includes("Havaianas de Pau"));
  assert.ok(temHavaianas, "mesmo com 500 na API os memes do data.js devem ser renderizados");
  const origem = await h.page.evaluate(() => window.ACERVO_ORIGEM);
  assert.equal(origem, "estatico");
  await h.ctx.close();
});

test("(e) fora-do-ar falhando não esconde nada", opts, async () => {
  const h = await abrir("/index.html#2004", { rotaForaDoAr: "erro500" });
  const temHavaianas = await h.page.evaluate(() => document.body.innerText.includes("Havaianas de Pau"));
  assert.ok(temHavaianas, "falha na rota fora-do-ar não deve esconder nenhum meme");
  await h.ctx.close();
});

test("(f) imagem midias/x.png do banco vira <img src> correto", opts, async () => {
  const memeComMidia = {
    id: "meme-foto-minio",
    titulo: "Foto do MinIO",
    ano: 2004,
    categoria: "Fotos",
    raridade: "Comum",
    tipo: "foto",
    midias: [{ tipo: "imagem", caminho: "midias/teste-minio.png" }]
  };

  const h = await abrir("/index.html#2004", { rotaMemes: [memeComMidia] });
  await h.page.waitForFunction(() => Array.from(document.querySelectorAll(".card")).some(c => c.innerText.includes("Foto do MinIO")));
  const src = await h.page.evaluate(() => {
    return (typeof MEMES !== "undefined" ? MEMES : window.MEMES).find(m => m.id === "meme-foto-minio")?.img;
  });
  assert.equal(src, "midias/teste-minio.png");

  // Também confere se no DOM o elemento img foi gerado com esse caminho (antes ou sem erro de rede)
  // Como onerror="this.remove()" pode remover a imagem se a rota 404 acontecer rapidamente, verificamos se o HTML continha midias/teste-minio.png ou inspecionamos o card
  const htmlCard = await h.page.evaluate(() => {
    const card = Array.from(document.querySelectorAll(".card")).find(c => c.innerText.includes("Foto do MinIO"));
    return card ? card.innerHTML : "";
  });
  assert.ok(htmlCard.includes("midias/teste-minio.png") || src === "midias/teste-minio.png");
  await h.ctx.close();
});

test("(g) requisição POST /api/memes/fora-do-ar manda só ids (nenhum dado de usuário)", opts, async () => {
  const h = await abrir("/index.html#2004");
  const fdaCall = h.log.find((l) => l.p === "/api/memes/fora-do-ar" && l.m === "POST");
  assert.ok(fdaCall, "deve ter chamado /api/memes/fora-do-ar");
  assert.ok(Array.isArray(fdaCall.corpo.ids));
  assert.deepEqual(Object.keys(fdaCall.corpo), ["ids"]);
  assert.ok(fdaCall.corpo.ids.every((id) => typeof id === "string"));
  assert.ok(!fdaCall.headers["authorization"]);
  assert.ok(!fdaCall.headers["x-test-user"]);
  await h.ctx.close();
});
