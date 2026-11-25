// Perfil: grade de visuais com contador, Facebook sem roles falsos, acessibilidade do diálogo, fontes e contraste nos 15 visuais.
// Roda com arquivo explícito: node --test tests/front-perfil-grade-facebook.test.js (precisa do Playwright; sem ele os testes são pulados).
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
const RAR = ["Mítico", "Lendário", "Relíquia", "Raro", "Relevante", "Comum"];
const CARTAS = Array.from({ length: 14 }, (_, i) => ({ id: `memes-${i}`, colecao_id: i % 2 ? "orkut" : "memes", numero: i + 1, nome: i === 3 ? "Um nome de carta bem comprido para quebrar linha" : `Carta ${i + 1}`, emoji: "🎀", raridade: RAR[i % 6], meme_id: null }));
const COLECOES = [
  { id: "memes", nome: "Memes Icônicos", total: 20, tenho: 7, completa: false },
  { id: "orkut", nome: "Orkut e MSN da Nostalgia", total: 20, tenho: 3, completa: false },
  { id: "tv", nome: "TV Aberta", total: 20, tenho: 1, completa: false }
];

async function abrir(layout, vp, { recados = [] } = {}) {
  const st = { patches: [], fav: null, layout };
  const eu = () => ({ id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: true, perfil_layout: st.layout, carta_favorita: st.fav });
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 600, isMobile: vp.width < 600 });
  await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", async (route) => {
    const req = route.request(), p = decodeURIComponent(new URL(req.url()).pathname), m = req.method();
    if (p === "/api/eu" && m === "GET") return json(route, 200, { usuario: eu(), patente: PAT, proxima_patente: null, moedas: 10, xp: 200, csrf: "tok" });
    if (p === "/api/eu" && m === "PATCH") { const c = JSON.parse(req.postData() || "{}"); st.patches.push(c); if (c.perfil_layout) st.layout = c.perfil_layout; if ("carta_favorita" in c) st.fav = CARTAS.find((x) => x.id === c.carta_favorita) || null; return json(route, 200, { usuario: eu(), pacote_boas_vindas: null }); }
    if (/^\/api\/perfil\/ana\/recados$/i.test(p)) return json(route, 200, { itens: recados });
    if (p.toLowerCase() === "/api/perfil/ana") return json(route, 200, { perfil: { apelido: "Ana", avatar_gato: GATO, avatar_url: null, layout: st.layout, membro_desde: "2026-11-01T12:00:00Z", eh_meu: true }, patente: { id: PAT.id, nome: PAT.nome, cor: PAT.cor }, proxima_patente: { nome: "Fibra", faltam: 50 }, xp: 200, carta_favorita: st.fav, recados: recados.length, album: { total: 120, tenho: CARTAS.length, colecoes_completas: 0, colecoes: COLECOES, cartas: CARTAS } });
    if (p === "/api/carteira") return json(route, 200, { usuario: { id: 1, apelido: "Ana" }, moedas: 10, xp: 200, patente: PAT, proxima_patente: null, pacotes: [], cartas: { distintas: 2, total_no_album: 120, quantidade_total: 2, repetidas: 0 }, valor_das_repetidas: 0 });
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
  return { ctx, page, st, erros };
}
// ---- contraste calculado (WCAG) no navegador: cor efetiva do texto (com opacity) sobre o primeiro fundo opaco acima ----
async function contrastes(page, raiz = "#pf") {
  return page.evaluate((raiz) => {
    const rgba = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const mix = (fg, bg, a) => ({ r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) });
    const fundo = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== "none") return null; const c = rgba(cs.backgroundColor); if (c && c.a > 0.95) return c; if (c && c.a > 0) return null; } return { r: 255, g: 255, b: 255, a: 1 }; };
    const out = [];
    for (const e of document.querySelector(raiz).querySelectorAll("*")) {
      if (e.closest("[aria-hidden=true]")) continue;
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      const bg = fundo(e); if (!bg) continue;
      let op = 1; for (let x = e; x; x = x.parentElement) op *= parseFloat(getComputedStyle(x).opacity);
      const fg = rgba(cs.color); if (!fg) continue;
      const ef = mix(fg, bg, fg.a * op);
      const l1 = lum(ef), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const px = parseFloat(cs.fontSize), grande = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      if (ratio < (grande ? 3 : 4.5)) out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} "${e.textContent.trim().slice(0, 20)}" ${ratio.toFixed(2)} (${px}px)`);
    }
    return [...new Set(out)];
  }, raiz);
}

const TODOS = ["homepage", "icq", "orkut", "fotolog", "msn", "twitter", "facebook", "ask", "whatsapp", "vine", "snapchat", "instagram", "tiktok", "kwai", "bluesky"];
const VPS = [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 1280, height: 900 }];
const REC = [{ id: 1, texto: "oi, que perfil legal", em: "2026-11-20T10:00:00Z", autor: { apelido: "Caio", avatar_gato: GATO, avatar_url: null }, pode_apagar: false }];

for (const vp of VPS) {
  test(`grade de visuais ${vp.width}px: contador Visual N de 15 acompanha a escolha, atual rolado para a vista, miniaturas uniformes`, opts, async () => {
    const { ctx, page, erros } = await abrir("bluesky", vp);
    await page.click("[data-ed=visual]");
    await page.waitForSelector("#dlg[open]");
    assert.strictEqual(await page.$eval("#laysN", (e) => e.textContent), "Visual 15 de 15");
    assert.ok(await page.$eval("#lays input:checked", (i) => { const l = i.closest("label").getBoundingClientRect(), c = document.getElementById("dlgCorpo").getBoundingClientRect(); return l.top >= c.top - 1 && l.bottom <= c.bottom + 1; }), "o 15º (último) já abre à vista");
    const cols = await page.$eval("#lays", (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length);
    assert.strictEqual(cols, vp.width <= 520 ? 2 : 3, "colunas");
    assert.strictEqual(await page.$$eval("#lays .mini", (l) => new Set(l.map((x) => Math.round(x.getBoundingClientRect().height))).size), 1, "miniaturas com a mesma altura");
    await page.keyboard.press("ArrowLeft");
    assert.strictEqual(await page.$eval("#laysN", (e) => e.textContent), "Visual 14 de 15");
    await page.click("#lays label.l-orkut");
    assert.strictEqual(await page.$eval("#laysN", (e) => e.textContent), "Visual 3 de 15");
    assert.match(await page.$eval("#favN", (e) => e.textContent), /^14 cartas$/);
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("diálogo: aria-modal, padding próprio, radiogroups nomeados e Tab real com 1 parada por radiogroup", opts, async () => {
  const { ctx, page, erros } = await abrir("orkut", VPS[0]);
  await page.click("[data-ed=visual]");
  await page.waitForSelector("#dlg[open]");
  assert.strictEqual(await page.getAttribute("#dlg", "aria-modal"), "true");
  const pad = await page.$eval("#dlg", (d) => parseFloat(getComputedStyle(d).paddingTop));
  assert.ok(pad >= 8, "padding do diálogo " + pad);
  for (const id of ["lays", "fav"]) {
    assert.strictEqual(await page.getAttribute("#" + id, "role"), "radiogroup");
    const nome = await page.$eval("#" + id, (e) => document.getElementById(e.getAttribute("aria-labelledby")).textContent.trim());
    assert.ok(nome.length > 3, id + " tem nome");
  }
  const paradas = [];
  for (let i = 0; i < 12; i++) {
    const a = await page.evaluate(() => { const e = document.activeElement; return e ? (e.name ? "radio:" + e.name : (e.id || e.tagName)) : "?"; });
    paradas.push(a);
    if (a === "btSalvar") break;
    await page.keyboard.press("Tab");
  }
  console.log("paradas do Tab:", paradas.join(" > "));
  assert.strictEqual(paradas.filter((x) => x === "radio:lay").length, 1, "1 parada no grupo de visuais: " + paradas);
  assert.strictEqual(paradas.filter((x) => x === "radio:fav").length, 1, "1 parada no grupo de cartas: " + paradas);
  assert.ok(paradas.includes("btGato") && paradas.includes("btCancelar") && paradas.at(-1) === "btSalvar");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

for (const vp of VPS) {
  test(`perfil nos 15 visuais ${vp.width}px: sem overflow, sem erro de console, texto de leitura >= 12px e contraste >= 4,5:1`, opts, async () => {
    for (const layout of TODOS) {
      const { ctx, page, erros } = await abrir(layout, vp, { recados: REC });
      await page.waitForSelector(".pf [class]");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), layout + ": sem overflow horizontal");
      const miudos = await page.evaluate(() => {
        const o = [];
        for (const e of document.querySelectorAll("#pf *")) {
          if (e.closest("[aria-hidden=true]")) continue;
          if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") continue;
          if (parseFloat(cs.fontSize) < 12) o.push(e.tagName + "." + e.className + " " + cs.fontSize + " " + e.textContent.trim().slice(0, 16));
        }
        return [...new Set(o)];
      });
      assert.deepStrictEqual(miudos, [], layout + ": fonte < 12px");
      assert.deepStrictEqual(await contrastes(page), [], layout + ": contraste");
      assert.deepStrictEqual(erros, [], layout);
      await ctx.close();
    }
  });
}

test("desktop 1280 intacto: diálogo de até 620px com 3 colunas e rodapé fixo", opts, async () => {
  const { ctx, page } = await abrir("facebook", VPS[2]);
  await page.click("[data-ed=visual]");
  await page.waitForSelector("#dlg[open]");
  assert.ok(await page.$eval("#dlg", (d) => d.getBoundingClientRect().width <= 620));
  assert.strictEqual(await page.$eval("#lays", (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length), 3);
  assert.ok(await page.$eval("#btSalvar", (b) => b.getBoundingClientRect().bottom <= innerHeight));
  await ctx.close();
});

test("WhatsApp 1280: perfil compacto, não passa dos outros visuais (antes ~2x)", opts, async () => {
  const alt = {};
  for (const l of ["whatsapp", "orkut", "facebook", "icq"]) {
    const o = await abrir(l, VPS[2]); await o.page.waitForSelector(".pf [class]");
    alt[l] = await o.page.evaluate(() => document.documentElement.scrollHeight); await o.ctx.close();
  }
  console.log("alturas 1280 (página inteira, com cabeçalho e rodapé):", JSON.stringify(alt));
  assert.ok(alt.whatsapp <= 1500, "whatsapp " + alt.whatsapp);
  assert.ok(alt.whatsapp <= Math.max(alt.orkut, alt.facebook), "não maior que os outros: " + JSON.stringify(alt));
});
