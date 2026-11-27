// Aba "Visão geral" do seppzone (layout Stitch): KPIs, navegação do site, gráfico, rankings e memes nos dois temas e 3 larguras.
// API mockada via page.route. Roda com: node --test tests/front-admin-visao.test.js
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
const serie = Array.from({ length: 30 }, (_, i) => ({ dia: "2026-11-" + String(i + 1).padStart(2, "0"), visualizacoes: 10 + i * 10, sessoes: i, visitantes: i, segundos: i * 60 }));
const z = { visualizacoes: 0, sessoes: 0, visitantes: 0, segundos: 0, tempo_medio_sessao: 0 };
const respostas = (p, q) => {
  if (p === "/api/eu") return { usuario: { id: 1, apelido: "Ana" }, papel: "admin", csrf: "t", moedas: 1, xp: 1 };
  if (p === "/api/admin/memes") return { total: 5, itens: [] };
  if (p === "/api/mod/fila") return { itens: [{ id: 1, meu_voto: null }, { id: 2, meu_voto: "ok" }] };
  if (p === "/api/mod/remocoes") return { itens: [{ id: 1, status: "aberta", atrasada: true }, { id: 2, status: "aberta", atrasada: false }] };
  if (p === "/api/admin/links") return { items: [{ id: 1, status: "pendente" }] };
  if (p === "/api/admin/feedback") return { items: [{ id: 1 }, { id: 2 }] };
  if (p === "/api/admin/analytics") return { periodo: q.get("periodo"), periodos: { hoje: { visualizacoes: 1234, sessoes: 300, visitantes: 210, segundos: 36000, tempo_medio_sessao: 120 }, "7d": z, "30d": z, total: z }, serie, paginas: [{ nome: "home", visualizacoes: 900, sessoes: 250, segundos: 30000 }, { nome: "album", visualizacoes: 334, sessoes: 50, segundos: 6000 }], origens: [{ nome: "google", visualizacoes: 700, sessoes: 200, segundos: 0 }, { nome: "direto", visualizacoes: 534, sessoes: 100, segundos: 0 }], dispositivos: [{ nome: "celular", visualizacoes: 1000, sessoes: 250, segundos: 0 }, { nome: "desktop", visualizacoes: 234, sessoes: 50, segundos: 0 }] };
  if (p === "/api/admin/analytics/memes") return { itens: [{ id: "a", titulo: XSS, status: "publicado", total: 80 }, { id: "b", titulo: "Velho", status: "oculto", total: 20 }] };
  return null;
};
async function abrir({ largura = 1280, tema = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", (route) => {
    const u = new URL(route.request().url()); const c = respostas(u.pathname, u.searchParams);
    return route.fulfill({ status: c ? 200 : 404, contentType: "application/json", body: JSON.stringify(c || { erro: "não mockado" }) });
  });
  await ctx.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* */ } }, tema);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + "/seppzone/#visao");
  await page.waitForSelector("#p-visao .rk-memes li");
  await page.waitForFunction(() => [...document.querySelectorAll("#p-visao .kpi .num")].every((n) => n.textContent !== "…"));
  return { ctx, page, erros };
}

test("visão geral: css próprio ligado (admin-visao.css), escopado em #p-visao e só com tokens do tema", () => {
  const html = fs.readFileSync(path.join(RAIZ, "seppzone/index.html"), "utf8");
  assert.match(html, /admin-visao\.css\?v=([2-9]|\d{2,})/);
  const css = fs.readFileSync(path.join(RAIZ, "seppzone/admin-visao.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const seletores = [...css.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(seletores.length > 20);
  for (const s of seletores) assert.ok(s.split(",").every((x) => x.trim().startsWith("#p-visao")), "fora do escopo: " + s);
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), "sem cor fixa: só tokens do theme.css");
});

test("visão geral: 5 KPIs com número, atalho para a aba e alerta de remoção atrasada; 4 KPIs de navegação; informação preservada", opts, async () => {
  const { ctx, page, erros } = await abrir();
  const kpis = await page.$$eval("#p-visao .kpi", (c) => c.map((x) => (x.querySelector("h2,h3") || {}).textContent + "=" + x.querySelector(".num").textContent));
  assert.deepStrictEqual(kpis, ["Memes=5", "Moderação=2", "Remoções=2", "Links sugeridos=1", "Feedback=2", "Visualizações=1.234", "Visitantes=210", "Sessões=300", "Tempo por sessão=2 min 00 s"]);
  assert.strictEqual(await page.$eval("#p-visao .kpi:nth-child(3) .num", (n) => n.classList.contains("alerta")), true);
  assert.deepStrictEqual(await page.$$eval("#p-visao .kpi .acts a", (a) => a.map((x) => x.getAttribute("href"))), ["#memes", "#moderacao", "#moderacao", "#comunidade", "#comunidade"]);
  assert.match(await page.textContent("#p-visao .kpi:nth-child(2) .mini"), /1 esperando seu voto/);
  await page.click("#p-visao .kpi:nth-child(2) .acts a");
  await page.waitForFunction(() => location.hash === "#moderacao");
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("visão geral: memes mais vistos numerados por CSS (01, 02) e título com HTML continua texto", opts, async () => {
  const { ctx, page } = await abrir();
  const n = await page.$$eval("#p-visao ol.rk-memes > li", (l) => l.map((x) => getComputedStyle(x, "::before").content));
  assert.strictEqual(n.length, 2);
  assert.ok(n.every((c) => /counter\(pos, decimal-leading-zero\)/.test(c)), "numeração 01, 02… por counter()");
  assert.deepStrictEqual(await page.evaluate(() => document.querySelectorAll("#p-visao ol.rk-memes > li").length), 2);
  assert.ok(await page.$eval("#p-visao .rk-memes", (e) => e.textContent.includes("<img")), "markup mostrado como texto");
  await ctx.close();
});

for (const largura of [360, 768, 1280]) {
  for (const tema of ["light", "dark"]) {
    test(`visão geral ${largura}px ${tema}: sem rolagem lateral, alvos >= 44px, fonte >= 12px, contraste >= 4,5:1`, opts, async () => {
      const { ctx, page, erros } = await abrir({ largura, tema });
      const r = await page.evaluate(() => {
        const rgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
        const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const fundo = (e) => { for (let n = e; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && c.a > 0.95) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
        const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
        const ruins = [], pequenos = [], fontes = [];
        for (const e of document.querySelectorAll("#p-visao *")) {
          if (!vis(e)) continue;
          if (e.matches("button, a, summary") && e.getBoundingClientRect().height < 43.5) pequenos.push(e.textContent.trim().slice(0, 20));
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
