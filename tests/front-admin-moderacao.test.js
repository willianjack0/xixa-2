// Aba "Moderação" do seppzone (conversão Stitch): seções numeradas com contagem, cartões em grade, "Seus envios" em linhas,
// sem rolagem lateral a 360/768/1280 em claro e escuro, só tokens do tema. API mockada via page.route.
// Roda com: node --test tests/front-admin-moderacao.test.js  (PLAYWRIGHT_MODULE=/caminho/node_modules/playwright)
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

test("moderacao.css: só tokens do tema (nada de cor fixa), fontes >= 12px e alvo 44px; index liga o css e sobe o ?v=", () => {
  const css = ler("seppzone/admin-moderacao.css");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "cor fixa no css da aba");
  for (const m of css.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 12, "fonte < 12px: " + m[0]);
  assert.match(css, /min-height:44px/);
  assert.match(ler("seppzone/index.html"), /admin-moderacao\.css\?v=([2-9]|\d{2,})"/);
});

test("admin.js: a aba Moderação segue sem innerHTML e mantém as rotas", () => {
  const js = ler("seppzone/admin.js");
  const i = js.indexOf("// ---------- Moderação ----------"), f = js.indexOf("// ---------- Usuários ----------");
  const b = js.slice(i, f);
  assert.ok(i > 0 && f > i);
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(b));
  for (const r of ["/api/mod/fila", "/api/mod/remocoes", "/api/mod/arte/envios", "/api/envios/meus"]) assert.ok(b.includes(r), r);
});

let chromium = null;
for (const m of [process.env.PLAYWRIGHT_MODULE, "playwright"]) { if (!m) continue; try { ({ chromium } = require(m)); break; } catch { /* próximo */ } }
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };
const opts = { skip: chromium ? false : "playwright não instalado" };
let srv, browser, base;
test.before(async () => {
  if (!chromium) return;
  srv = await new Promise((ok) => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
      const arq = path.join(RAIZ, p);
      if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": MIME[path.extname(arq)] || "application/octet-stream" }); fs.createReadStream(arq).pipe(res);
    }).listen(0, "127.0.0.1", () => ok(s));
  });
  base = `http://127.0.0.1:${srv.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const agora = Date.now();
const DADOS = {
  fila: [1, 2, 3].map((n) => ({ id: n, titulo: "Envio número " + n + " com um título bem comprido para quebrar linha", ano: 2012, categoria: "Memes", url: "https://exemplo.com/" + n, descricao: "desc " + n, criado_em: "2026-11-20T10:00:00Z", autor: "Carla", meu_voto: null, votos: n - 1 })),
  artes: [{ id: "a1", carta_nome: "Carta Rara", colecao_nome: "Clássicos", raridade: "Raro", autor: "Zé", criado_em: "2026-11-20T10:00:00Z", largura: 600, altura: 800, bytes: 20480, outros_pendentes: 1, carta_ja_tem_arte: false }],
  meus: [{ id: 7, titulo: "Meu envio", ano: 2012, categoria: "Vídeos", status: "aberto", motivo: null, criado_em: "2026-11-20T10:00:00Z", decidido_em: null }, { id: 6, titulo: "Outro", ano: 2010, categoria: "TV", status: "aprovado", motivo: "ok", criado_em: "2026-11-19T10:00:00Z", decidido_em: "2026-11-19T12:00:00Z" }],
  remocoes: [
    { id: 1, meme_id: "nyan", meme_titulo: "Nyan Cat", status: "aberta", solicitante: "Maria", contato: "m@x.com", motivo: "É meu", criado_em: "2026-11-20T10:00:00Z", prazo_em: new Date(agora + 36e5 * 40).toISOString(), atrasada: false },
    { id: 2, meme_id: "velho", meme_titulo: "Velho", status: "aberta", solicitante: "João", contato: null, motivo: null, criado_em: "2026-11-10T10:00:00Z", prazo_em: new Date(agora - 36e5).toISOString(), atrasada: true }
  ]
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function abrir({ largura = 1280, tema = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* */ } }, tema);
  await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/mod/arte/envios/a1/arquivo") return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    if (p === "/api/mod/fila") return json(route, 200, { itens: DADOS.fila });
    if (p === "/api/mod/arte/envios") return json(route, 200, { itens: DADOS.artes, total: DADOS.artes.length });
    if (p === "/api/envios/meus") return json(route, 200, { itens: DADOS.meus });
    if (p === "/api/mod/remocoes") return json(route, 200, { itens: DADOS.remocoes });
    if (p === "/api/eu") return json(route, 200, { usuario: { id: 1, apelido: "Ana" }, papel: "admin", csrf: "tok", moedas: 1, xp: 1 });
    return json(route, 200, { items: [], itens: [] });
  });
  const page = await ctx.newPage();
  const erros = []; page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(base + "/seppzone/#moderacao");
  await page.waitForSelector("#p-moderacao .mod-rem-s .item", { timeout: 8000 });
  return { ctx, page, erros };
}

test("moderação: seções numeradas com contagem, mesma informação e ações", opts, async () => {
  const { ctx, page, erros } = await abrir();
  assert.deepStrictEqual(await page.$$eval("#p-moderacao .mod-sec>h2", (n) => n.map((x) => x.textContent.trim())),
    ["Fila de envios3 pendentes", "Artes de cartas1 pendente", "Seus envios2 registros", "Pedidos de remoção2 abertas"]);
  assert.strictEqual(await page.$$eval("#p-moderacao .mod-fila .item", (n) => n.length), 3);
  assert.strictEqual(await page.$$eval("#p-moderacao .mod-fila .item button", (n) => n.length), 12, "4 votos por envio");
  assert.strictEqual(await page.$$eval("#p-moderacao .mod-artes .item button", (n) => n.map((b) => b.textContent).join()), "Aprovar,Rejeitar");
  assert.strictEqual(await page.$$eval("#p-moderacao .mod-rem-s .item.atrasada", (n) => n.length), 1);
  assert.match(await page.textContent("#p-moderacao .mod-meus"), /Meu envio.*Aguardando moderação/);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

for (const tema of ["light", "dark"]) {
  for (const largura of [360, 768, 1280]) {
    test(`moderação ${largura}px ${tema}: sem rolagem lateral, alvos >= 44px (celular), colunas da grade e linhas de Seus envios`, opts, async () => {
      const { ctx, page } = await abrir({ largura, tema });
      assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "rolagem horizontal");
      const col = await page.$eval("#p-moderacao .mod-fila .mod-grade", (g) => getComputedStyle(g).gridTemplateColumns.split(" ").length);
      if (largura === 360) assert.strictEqual(col, 1);
      if (largura === 768) assert.ok(col >= 1 && col <= 2, "colunas: " + col);
      if (largura === 1280) assert.ok(col >= 2, "colunas: " + col);
      if (largura === 360) {
        const peq = await page.$$eval("#p-moderacao button, #p-moderacao select, #p-moderacao textarea", (n) => n.filter((e) => e.getBoundingClientRect().height && e.getBoundingClientRect().height < 43.5).length);
        assert.strictEqual(peq, 0);
      }
      if (largura >= 900) assert.strictEqual(await page.$eval("#p-moderacao .mod-meu", (e) => getComputedStyle(e).display), "grid");
      assert.notStrictEqual(await page.$eval("#p-moderacao .mod-item", (e) => getComputedStyle(e).backgroundColor), "rgba(0, 0, 0, 0)");
      await ctx.close();
    });
  }
}
