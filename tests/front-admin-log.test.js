// Aba "Log" do seppzone (layout Stitch): filtros, trilha de auditoria, detalhe de/para, paginação e temas.
// API mockada via page.route. Roda com: node --test tests/front-admin-log.test.js
// PLAYWRIGHT_MODULE=/caminho/node_modules/playwright · CHROMIUM_PATH=/caminho/chrome (sem Playwright os testes de navegador são pulados)
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
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp" };
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

const XSS = '<img src=x onerror="window.__xss=1">';
const reg = (id, extra = {}) => ({ id, usuario_id: 1, apelido: "Ana", acao: "meme.editar", alvo: "memes:nyan-cat", detalhe: { campos: { titulo: { de: "Antigo", para: "Novo" } } }, criado_em: "2026-11-20T10:00:00Z", ...extra });
const PAG1 = [reg(9), reg(8, { usuario_id: null, apelido: null, acao: "usuario.banir", alvo: "usuarios:3", detalhe: { motivo: XSS } }), reg(7, { acao: "link.aprovar", detalhe: null })];
const PAG2 = [reg(6, { acao: "era.editar", alvo: "eras:2000", detalhe: { de: "a", para: "b" } })];

async function abrir({ largura = 1280, tema = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
  const chamadas = [];
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", (route) => {
    const u = new URL(route.request().url()), p = u.pathname, q = u.searchParams;
    const json = (s, c) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(c) });
    if (p === "/api/eu") return json(200, { usuario: { id: 1, apelido: "Ana" }, papel: "admin", csrf: "t", moedas: 1, xp: 1 });
    if (p === "/api/admin/log") {
      chamadas.push(Object.fromEntries(q));
      if (q.get("acao") === "nada") return json(200, { items: [], proximo: null });
      return q.get("antes") ? json(200, { items: PAG2, proximo: null }) : json(200, { items: PAG1, proximo: "6" });
    }
    return json(404, { erro: "não mockado" });
  });
  await ctx.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* */ } }, tema);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + "/seppzone/#log");
  await page.waitForSelector("#p-log .item");
  return { ctx, page, erros, chamadas };
}

test("log: css próprio ligado (admin-log.css), escopado em #p-log e só com tokens do tema", () => {
  const html = fs.readFileSync(path.join(RAIZ, "seppzone/index.html"), "utf8");
  assert.match(html, /admin-log\.css\?v=([2-9]|\d{2,})/);
  const css = fs.readFileSync(path.join(RAIZ, "seppzone/admin-log.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const seletores = [...css.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(seletores.length > 10);
  for (const s of seletores) assert.ok(s.split(",").every((x) => x.trim().startsWith("#p-log")), "fora do escopo: " + s);
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), "sem cor fixa: só tokens do theme.css");
});

test("log: registros mantêm ação, alvo, quem, data e de→para; texto da API vira texto; carregar mais e filtro funcionam", opts, async () => {
  const { ctx, page, erros, chamadas } = await abrir();
  assert.strictEqual(await page.$$eval("#p-log .item", (n) => n.length), 3);
  const t = await page.textContent("#p-log .item:nth-child(1)");
  assert.match(t, /meme\.editar/); assert.match(t, /memes:nyan-cat/); assert.match(t, /Por Ana \(ID 1\)/); assert.match(t, /titulo: Antigo → Novo/);
  assert.match(await page.textContent("#p-log .item:nth-child(2)"), /token de emergência \/ sistema/);
  assert.match(await page.textContent("#p-log .item:nth-child(2)"), /<img src=x/, "markup mostrado como texto");
  assert.strictEqual(await page.$("#p-log img"), null);
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined);
  assert.match(await page.textContent('#p-log [role="status"]'), /3 registros carregados/);
  // de/para com cor própria (de riscado, para em destaque): só pelo CSS da aba
  const est = await page.$eval("#p-log .item:nth-child(1) .det", (d) => ({ de: getComputedStyle(d.querySelector(".de")).textDecorationLine, bg: getComputedStyle(d).backgroundColor }));
  assert.match(est.de, /line-through/);
  await page.click('#p-log button:has-text("Carregar mais")');
  await page.waitForFunction(() => document.querySelectorAll("#p-log .item").length === 4);
  assert.strictEqual(chamadas[1].antes, "6");
  assert.strictEqual(await page.isVisible('#p-log button:has-text("Carregar mais")'), false);
  await page.fill('#p-log input[list]', "nada"); await page.click('#p-log button:has-text("Filtrar")');
  await page.waitForSelector("text=Nenhum registro no log com esses filtros");
  assert.strictEqual(chamadas[chamadas.length - 1].acao, "nada");
  await page.fill('#p-log input[inputmode="numeric"]', "abc"); await page.click('#p-log button:has-text("Filtrar")');
  assert.match(await page.textContent("#p-log .erro"), /só o número do ID/);
  assert.strictEqual(await page.getAttribute('#p-log input[inputmode="numeric"]', "aria-invalid"), "true");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

for (const largura of [360, 768, 1280]) {
  for (const tema of ["light", "dark"]) {
    test(`log ${largura}px ${tema}: sem rolagem lateral, alvos >= 44px, fonte >= 12px, contraste >= 4,5:1`, opts, async () => {
      const { ctx, page, erros } = await abrir({ largura, tema });
      const r = await page.evaluate(() => {
        const rgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
        const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const fundo = (e) => { for (let n = e; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && c.a > 0.95) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
        const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
        const ruins = [], pequenos = [], fontes = [];
        for (const e of document.querySelectorAll("#p-log *")) {
          if (!vis(e)) continue;
          if (e.matches("button, a, input, select") && e.getBoundingClientRect().height < 43.5) pequenos.push(e.tagName + ":" + (e.textContent || e.id).trim().slice(0, 20));
          if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          if (parseFloat(getComputedStyle(e).fontSize) < 12) fontes.push(e.textContent.trim().slice(0, 20));
          const fg = rgb(getComputedStyle(e).color), bg = fundo(e); if (!fg || !bg) continue;
          const L1 = lum(fg), L2 = lum(bg), c = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          if (c < 4.5) ruins.push(e.tagName + "." + e.className + " '" + e.textContent.trim().slice(0, 20) + "' " + c.toFixed(2));
        }
        return { ruins, pequenos, fontes, sobra: document.documentElement.scrollWidth - innerWidth };
      });
      assert.ok(r.sobra <= 0, "rolagem horizontal " + r.sobra);
      assert.deepStrictEqual(r.pequenos, [], "alvos pequenos");
      assert.deepStrictEqual(r.fontes, [], "fonte < 12px");
      assert.deepStrictEqual(r.ruins, [], "contraste");
      assert.deepStrictEqual(erros, []);
      await ctx.close();
    });
  }
}
