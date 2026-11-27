// Aba "MCP" do seppzone (layout Stitch): criar chave, segredo único, lista de chaves, revogar e llms.txt nos dois temas e 3 larguras.
// API mockada via page.route. Roda com: node --test tests/front-admin-mcp.test.js
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
const chaves = () => [
  { id: 1, usuario_id: 1, dono: "Ana", minha: true, nome: "Notebook da Ana", prefixo: "AbCdEfGh", escopos: ["ler", "escrever"], estado: "ativa", criada_em: "2026-11-20T10:00:00Z", expira_em: "2027-02-18T10:00:00Z", ultimo_uso_em: null, revogada_em: null },
  { id: 2, usuario_id: 4, dono: "Chefe", minha: false, nome: XSS, prefixo: "ZyXwVuTs", escopos: ["ler", "escrever", "publicar"], estado: "ativa", criada_em: "2026-11-21T10:00:00Z", expira_em: "2027-02-19T10:00:00Z", ultimo_uso_em: "2026-11-22T10:00:00Z", revogada_em: null },
  { id: 3, usuario_id: 1, dono: "Ana", minha: true, nome: "Antiga", prefixo: "QqQqQqQq", escopos: ["ler"], estado: "revogada", criada_em: "2026-10-01T10:00:00Z", expira_em: "2027-01-01T10:00:00Z", ultimo_uso_em: null, revogada_em: "2026-10-05T10:00:00Z" }
];

async function abrir({ largura = 1280, tema = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
  const st = { chaves: chaves(), log: [] };
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", (route) => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname, m = req.method();
    let corpo = null; try { corpo = req.postDataJSON(); } catch { /* sem corpo */ }
    st.log.push({ m, p, csrf: req.headers()["x-csrf"], corpo });
    const json = (s, c) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(c) });
    let x;
    if (p === "/api/eu") return json(200, { usuario: { id: 1, apelido: "Ana" }, papel: "admin", csrf: "tok-csrf", moedas: 1, xp: 1 });
    if (p === "/api/admin/mcp/chaves" && m === "GET") return json(200, { items: st.chaves });
    if (p === "/api/admin/mcp/chaves" && m === "POST") {
      const item = { id: 9, usuario_id: 1, dono: "Ana", minha: true, nome: corpo.nome, prefixo: "NoVaChAv", escopos: corpo.escopos, estado: "ativa", criada_em: "2026-11-25T10:00:00Z", expira_em: "2027-02-23T10:00:00Z", ultimo_uso_em: null, revogada_em: null };
      st.chaves.unshift(item); return json(201, { ok: true, chave: "ns_mcp_NoVaChAv" + "x".repeat(35), item });
    }
    if ((x = p.match(/^\/api\/admin\/mcp\/chaves\/(\d+)$/)) && m === "DELETE") { const k = st.chaves.find((c) => String(c.id) === x[1]); if (k) k.estado = "revogada"; return json(200, { ok: true }); }
    if (p === "/api/admin/mcp/llms.txt") return route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "# Não Salvo · MCP do acervo\n\n## Ferramentas\nNenhuma ferramenta está ativa ainda: <b>x</b>\n" });
    return json(404, { erro: "não mockado" });
  });
  await ctx.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* */ } }, tema);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + "/seppzone/#mcp");
  await page.waitForSelector("#p-mcp .lista .item");
  await page.waitForSelector("#p-mcp pre.llms");
  return { ctx, page, erros, st };
}

test("mcp: css próprio ligado (admin-mcp.css), escopado em #p-mcp e só com tokens do tema", () => {
  const html = fs.readFileSync(path.join(RAIZ, "seppzone/index.html"), "utf8");
  assert.match(html, /admin-mcp\.css\?v=([2-9]|\d{2,})/);
  const css = fs.readFileSync(path.join(RAIZ, "seppzone/admin-mcp.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const seletores = [...css.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(seletores.length > 15);
  for (const s of seletores) assert.ok(s.split(",").every((x) => x.trim().startsWith("#p-mcp")), "fora do escopo: " + s);
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), "sem cor fixa: só tokens do theme.css");
});

test("mcp: chaves mantêm nome, prefixo, dono, escopos, datas e Revogar só nas ativas; texto da API vira texto; llms.txt com Copiar e Baixar", opts, async () => {
  const { ctx, page, erros } = await abrir();
  const itens = await page.$$eval("#p-mcp .lista .item", (n) => n.map((x) => ({ h: x.querySelector("h3").textContent, txt: x.textContent, revogar: !!x.querySelector("button.bad"), feito: x.classList.contains("feito") })));
  assert.strictEqual(itens.length, 3);
  assert.ok(itens[0].h === "Notebook da Ana" && itens[0].txt.includes("ns_mcp_AbCdEfGh…") && itens[0].txt.includes("Dono: Ana") && itens[0].txt.includes("Escopos: Ler, Escrever") && itens[0].txt.includes("Minha") && itens[0].txt.includes("nunca") && itens[0].revogar);
  assert.ok(itens[1].h.includes("<img") && itens[1].txt.includes("Publicar"));
  assert.ok(itens[2].txt.includes("Revogada") && itens[2].feito && !itens[2].revogar);
  assert.strictEqual(await page.$$eval("#p-mcp img", (n) => n.length), 0);
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined);
  assert.match(await page.textContent("#p-mcp pre.llms"), /<b>x<\/b>/);
  assert.ok(await page.isVisible('#p-mcp button:has-text("Copiar")') && await page.isVisible('#p-mcp button:has-text("Baixar llms.txt")'));
  // revogada fica riscada e com faixa de erro; ativa com faixa de ok (só pelo CSS da aba)
  const est = await page.$$eval("#p-mcp .lista .item", (n) => n.map((x) => [getComputedStyle(x.querySelector("h3")).textDecorationLine, getComputedStyle(x, "::before").backgroundColor]));
  assert.match(est[2][0], /line-through/); assert.doesNotMatch(est[0][0], /line-through/);
  assert.notStrictEqual(est[0][1], est[2][1]);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("mcp: criar chave mostra o segredo uma vez em faixa de alerta, manda CSRF e o corpo certo; revogar pede confirmação", opts, async () => {
  const { ctx, page, st, erros } = await abrir();
  await page.fill('#p-mcp input[id^="mn"]', "Chave de teste");
  await page.click('#p-mcp button:has-text("Criar chave")');
  await page.waitForSelector("#p-mcp .segredo");
  const post = st.log.find((l) => l.m === "POST" && l.p === "/api/admin/mcp/chaves");
  assert.strictEqual(post.csrf, "tok-csrf");
  assert.deepStrictEqual(post.corpo, { nome: "Chave de teste", escopos: ["ler", "escrever"], dias: 90 });
  assert.match(await page.inputValue("#p-mcp .segredo input.cod"), /^ns_mcp_NoVaChAv/);
  assert.match(await page.textContent("#p-mcp .segredo pre.llms"), /claude mcp add --transport http naosalvo/);
  assert.ok(await page.$eval("#p-mcp .segredo", (e) => parseFloat(getComputedStyle(e).borderLeftWidth) >= 6), "faixa de alerta");
  await page.click('#p-mcp .segredo button:has-text("Já guardei")');
  assert.strictEqual(await page.$("#p-mcp .segredo"), null, "segredo some e não é guardado");
  await page.click('#p-mcp .lista .item:has-text("Notebook da Ana") button:has-text("Revogar")');
  assert.match(await page.textContent("dialog"), /para de funcionar na hora/);
  await page.click('dialog button:has-text("Cancelar")');
  assert.strictEqual(st.log.some((l) => l.m === "DELETE"), false);
  await page.click('#p-mcp .lista .item:has-text("Notebook da Ana") button:has-text("Revogar")');
  await page.click('dialog button:has-text("Revogar")');
  await page.waitForFunction(() => [...document.querySelectorAll("#p-mcp .lista .item")].some((i) => /Notebook da Ana/.test(i.textContent) && /Revogada/.test(i.textContent)));
  assert.strictEqual(st.log.find((l) => l.m === "DELETE").csrf, "tok-csrf");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

for (const largura of [360, 768, 1280]) {
  for (const tema of ["light", "dark"]) {
    test(`mcp ${largura}px ${tema}: sem rolagem lateral, alvos >= 44px, fonte >= 12px, contraste >= 4,5:1`, opts, async () => {
      const { ctx, page, erros } = await abrir({ largura, tema });
      await page.fill('#p-mcp input[id^="mn"]', "Mostra segredo");
      await page.click('#p-mcp button:has-text("Criar chave")');
      await page.waitForSelector("#p-mcp .segredo");
      const r = await page.evaluate(() => {
        const rgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
        const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const fundo = (e) => { for (let n = e; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && c.a > 0.95) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
        const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
        const ruins = [], pequenos = [], fontes = [];
        for (const e of document.querySelectorAll("#p-mcp *")) {
          if (!vis(e)) continue;
          if (e.matches("button, a, select, input:not([type=checkbox])") && e.getBoundingClientRect().height < 43.5) pequenos.push(e.tagName + ":" + (e.textContent || e.id).trim().slice(0, 20));
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
