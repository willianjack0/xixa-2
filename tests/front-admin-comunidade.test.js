// Aba "Comunidade" do seppzone (conversão Stitch): segmentos em barra, filtros em painel, itens em grade com faixa por situação,
// sem rolagem lateral a 360/768/1280 em claro e escuro, só tokens do tema. API mockada via page.route.
// Roda com: node --test tests/front-admin-comunidade.test.js  (PLAYWRIGHT_MODULE=/caminho/node_modules/playwright)
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

test("comunidade.css: só tokens do tema (nada de cor fixa), fontes >= 12px; index sobe o ?v= do css da aba", () => {
  const css = ler("seppzone/admin-comunidade.css");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "cor fixa no css da aba");
  for (const m of css.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 12, "fonte < 12px: " + m[0]);
  assert.match(ler("seppzone/index.html"), /admin-comunidade\.css\?v=([2-9]|\d{2,})"/);
});

test("admin.js: aba Comunidade sem innerHTML e com as 5 rotas", () => {
  const js = ler("seppzone/admin.js");
  const i = js.indexOf("function abaComunidade"), f = js.indexOf("// ---------- Memepédia: cobertura");
  assert.ok(i > 0 && f > i);
  const b = js.slice(i, f);
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(b));
  for (const r of ["/api/admin/contribuidores", "/api/admin/feedback", "/api/admin/comentarios", "/api/admin/links", "/api/admin/memepedia"]) assert.ok(b.includes(r), r);
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
const DADOS = {
  "/api/admin/contribuidores": [1, 2, 3].map((n) => ({ id: n, nome: "Pessoa " + n, nick: "p" + n, discord: "p" + n + "#1", areas: ["Código", "Arte"], area_outros: null, horas_semana: 4, experiencia: "alguma", ferramentas: "git", mensagem: "oi", criado_em: "2026-11-20T10:00:00Z" })),
  "/api/admin/feedback": [{ id: 6, tipo: "bug", msg: "Quebrou a página com um texto bem comprido para quebrar linha no celular", contato: null, pagina: "/index.html", criado_em: "2026-11-20T10:00:00Z" }],
  "/api/admin/comentarios": [{ id: 8, autor: "Zé", meme_id: "nyan-cat", texto: "Muito bom", criado_em: "2026-11-20T10:00:00Z" }],
  "/api/admin/links": [{ id: 5, meme_id: "nyan-cat", yt: "QH2-TGUlwu4", autor: "Zé", status: "pendente", criado_em: "2026-11-20T10:00:00Z" }, { id: 4, meme_id: "velho", yt: "abc", autor: "Ana", status: "aprovado", criado_em: "2026-11-19T10:00:00Z" }],
  "/api/admin/memepedia": [{ id: 12, meme_id: "nyan-cat", campo: "origem", texto: "Texto sugerido", fonte: "https://example.com", autor: "AutorX", status: "pendente", criado_em: "2026-11-20T10:00:00Z", revisado_em: null }]
};

async function abrir({ largura = 1280, tema = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* */ } }, tema);
  await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/eu") return json(route, 200, { usuario: { id: 1, apelido: "Ana" }, papel: "admin", csrf: "tok", moedas: 1, xp: 1 });
    if (DADOS[p]) return json(route, 200, { items: DADOS[p] });
    return json(route, 200, { items: [], itens: [] });
  });
  const page = await ctx.newPage();
  const erros = []; page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(base + "/seppzone/#comunidade");
  await page.waitForSelector("#p-comunidade .com-lista .item", { timeout: 8000 });
  return { ctx, page, erros };
}

test("comunidade: 5 segmentos, contagem, filtros em painel e ações mantidas", opts, async () => {
  const { ctx, page, erros } = await abrir();
  assert.deepStrictEqual(await page.$$eval("#p-comunidade .com-seg button", (n) => n.map((b) => b.textContent)), ["Contribuidores", "Feedback", "Comentários", "Links sugeridos", "Memepédia"]);
  assert.match(await page.textContent("#p-comunidade .com-cont"), /3 de 3 cadastros/);
  assert.strictEqual(await page.$$eval("#p-comunidade .com-lista .item", (n) => n.length), 3);
  assert.ok(await page.$('#p-comunidade button:has-text("Exportar CSV")'));
  await page.click('#p-comunidade .com-seg button:has-text("Links sugeridos")');
  await page.waitForSelector("#p-comunidade .com-lista .item");
  assert.ok((await page.$$eval("#p-comunidade .com-lista .item", (n) => n.length)) >= 1);
  assert.deepStrictEqual(await page.$$eval("#p-comunidade .com-lista .item:first-child button", (n) => n.map((b) => b.textContent)), ["Aprovar", "Recusar"]);
  const borda = await page.$eval("#p-comunidade .com-lista .item", (e) => getComputedStyle(e).borderLeftWidth);
  assert.strictEqual(borda, "4px");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

for (const tema of ["light", "dark"]) {
  for (const largura of [360, 768, 1280]) {
    test(`comunidade ${largura}px ${tema}: sem rolagem lateral, alvos >= 44px (celular) e colunas da lista`, opts, async () => {
      const { ctx, page } = await abrir({ largura, tema });
      const cols = await page.$eval("#p-comunidade .com-lista", (g) => getComputedStyle(g).gridTemplateColumns.split(" ").length);
      assert.strictEqual(cols, largura >= 1100 && largura - 252 >= 1100 ? 2 : cols);
      for (const seg of ["Contribuidores", "Feedback", "Comentários", "Links sugeridos", "Memepédia"]) {
        await page.click(`#p-comunidade .com-seg button:has-text("${seg}")`);
        await page.waitForSelector("#p-comunidade .com-lista .item, #p-comunidade .estado");
        assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, seg + ": rolagem lateral");
        if (largura === 360) {
          const peq = await page.$$eval("#p-comunidade button, #p-comunidade select, #p-comunidade input", (n) => n.filter((e) => { const r = e.getBoundingClientRect(); return r.height && r.height < 43.5; }).length);
          assert.strictEqual(peq, 0, seg + ": alvo pequeno");
        }
      }
      await ctx.close();
    });
  }
}
