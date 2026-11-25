// Perfil (PR #50 integrado): lápis de edição e Copiar link nos 15 visuais, por teclado e toque, 44px, aria-label e aria-live.
// Roda com arquivo explícito: node --test tests/front-perfil-lapis.test.js (precisa do Playwright; sem ele os testes são pulados).
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

async function abrir(layout, vp, { recados = [], tema = null } = {}) {
  const st = { patches: [], fav: null, layout };
  const eu = () => ({ id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: true, perfil_layout: st.layout, carta_favorita: st.fav });
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 600, isMobile: vp.width < 600 });
  if (tema) await ctx.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* sem storage */ } }, tema);
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
  await page.waitForSelector(".pf-tools");
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
  for (const tema of ["light", "dark"]) {
    test(`15 visuais ${vp.width}px (${tema}): lápis e copiar link presentes, 44px, aria-label, sem overflow e sem erro de console`, opts, async () => {
      for (const layout of TODOS) {
        const { ctx, page, erros } = await abrir(layout, vp, { recados: REC, tema });
        await page.waitForSelector(".pf-tools");
        assert.strictEqual(await page.$(".pf-barra"), null, layout + ": sem tarja");
        assert.strictEqual(await page.$$eval(".pf-lapis[data-ed=gato]", (l) => l.length), 1, layout + ": 1 lápis no gatinho");
        assert.strictEqual(await page.$$eval("[data-ed=fav]", (l) => l.length), 1, layout + ": 1 lápis/quadro da favorita");
        assert.strictEqual(await page.$$eval("[data-ed=visual]", (l) => l.length), 1, layout + ": Trocar visual");
        const alvos = await page.$$eval(".pf-lapis, .pf-tb, button.pf-semfav", (l) => l.map((e) => ({ k: e.dataset.ed || e.id, h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width, nome: e.getAttribute("aria-label") || e.textContent.trim() })));
        for (const a of alvos) { assert.ok(a.h >= 44 && a.w >= 44, `${layout}: alvo pequeno ${JSON.stringify(a)}`); assert.ok(a.nome && a.nome.length > 2, layout + ": sem nome acessível " + a.k); }
        assert.strictEqual(await page.$$eval(".pf-lapis", (l) => l.filter((e) => !e.getAttribute("aria-label")).length), 0, layout + ": lápis com aria-label");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), layout + ": sem overflow horizontal");
        assert.deepStrictEqual(erros, [], layout);
        await ctx.close();
      }
    });
  }
}

test("teclado: Tab chega ao lápis, Enter abre o criador de gato; Espaço no lápis/quadro da favorita abre a edição já na favorita", opts, async () => {
  const { ctx, page, erros } = await abrir("orkut", VPS[2]);
  await page.waitForSelector(".pf-lapis");
  const paradas = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const a = await page.evaluate(() => { const e = document.activeElement; return e ? (e.dataset && e.dataset.ed ? "ed:" + e.dataset.ed : e.id || e.tagName) : "?"; });
    paradas.push(a);
    if (["ed:gato", "ed:fav", "ed:visual", "btCopiar"].every((k) => paradas.includes(k))) break;
  }
  console.log("Tab até os botões de edição:", paradas.filter((x) => /^ed:|btCopiar/.test(x)).join(" > "));
  for (const k of ["ed:gato", "ed:fav", "ed:visual", "btCopiar"]) assert.ok(paradas.includes(k), k + " alcançável por Tab: " + paradas);
  await page.focus(".pf-lapis[data-ed=gato]");
  assert.ok(await page.$eval(".pf-lapis[data-ed=gato]", (e) => { const o = getComputedStyle(e); return o.outlineStyle !== "none" && parseFloat(o.outlineWidth) >= 2; }), "foco visível no lápis");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.getElementById("sgm") && document.getElementById("sgm").classList.contains("open"));
  await page.evaluate(() => closeSignup());
  await page.focus("[data-ed=fav]");
  await page.keyboard.press("Space");
  await page.waitForSelector("#dlg[open]");
  assert.ok(await page.evaluate(() => document.activeElement.closest("#fav") !== null), "foco na carta favorita");
  await page.keyboard.press("Escape");
  await page.focus("[data-ed=visual]");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#dlg[open]");
  assert.ok(await page.evaluate(() => document.activeElement.name === "lay"), "foco no visual atual");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("toque (390px): tap no lápis do gatinho, na favorita e em Copiar link", opts, async () => {
  const { ctx, page, erros } = await abrir("instagram", VPS[0]);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  await page.waitForSelector(".pf-lapis");
  await page.tap(".pf-lapis[data-ed=gato]");
  await page.waitForFunction(() => document.getElementById("sgm") && document.getElementById("sgm").classList.contains("open"));
  await page.evaluate(() => closeSignup());
  await page.tap("[data-ed=fav]");
  await page.waitForSelector("#dlg[open]");
  await page.keyboard.press("Escape");
  await page.tap("#btCopiar");
  await page.waitForFunction(() => /copiado/i.test(document.getElementById("btCopiar").textContent));
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("copiar link: Enter pelo teclado copia, o botão anuncia (aria-live) e volta ao normal", opts, async () => {
  const { ctx, page, erros } = await abrir("whatsapp", VPS[2]);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  await page.waitForSelector("#btCopiar");
  assert.strictEqual(await page.getAttribute("#btCopiar", "aria-live"), "polite");
  assert.strictEqual(await page.getAttribute("#aviso", "aria-live"), "polite");
  await page.focus("#btCopiar");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => /Link copiado!/.test(document.getElementById("btCopiar").textContent));
  assert.strictEqual(await page.evaluate(() => navigator.clipboard.readText()), base + "/perfil.html?u=Ana");
  await page.waitForFunction(() => /Link do perfil copiado/.test(document.getElementById("aviso").textContent));
  await page.waitForFunction(() => /Copiar link/.test(document.getElementById("btCopiar").textContent), null, { timeout: 5000 });
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("copiar link sem a API de área de transferência: usa execCommand de reserva", opts, async () => {
  const { ctx, page, erros } = await abrir("orkut", VPS[2]);
  await page.waitForSelector("#btCopiar");
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }); window.__copiado = ""; document.execCommand = (c) => { if (c === "copy") { window.__copiado = document.activeElement && document.activeElement.value; return true; } return false; }; });
  await page.click("#btCopiar");
  await page.waitForFunction(() => /Link copiado!/.test(document.getElementById("btCopiar").textContent));
  assert.ok(/\/perfil\.html\?u=Ana$/.test(await page.evaluate(() => window.__copiado)));
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

// ---- ajustes do Vigia-PR: contraste dos botões (normal e "Link copiado!"), foco depois de salvar, anúncio na falha ----
for (const tema of ["light", "dark"]) {
  test(`contraste >= 4,5:1 dos botões (.pf-tb, normal e "Link copiado!") e do lápis nos 15 visuais (${tema})`, opts, async () => {
    for (const layout of TODOS) {
      const { ctx, page } = await abrir(layout, VPS[0], { recados: REC, tema });
      await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
      await page.waitForSelector(".pf-tools");
      assert.deepStrictEqual(await contrastes(page, ".pf-tools"), [], layout + ": botões");
      await page.click("#btCopiar");
      await page.waitForFunction(() => /Link copiado!/.test(document.getElementById("btCopiar").textContent));
      assert.ok(await page.$eval("#btCopiar", (e) => e.classList.contains("ok")));
      assert.deepStrictEqual(await contrastes(page, ".pf-tools"), [], layout + ": Link copiado!");
      await ctx.close();
    }
  });
}

test("fundos dos botões do WhatsApp e do 'copiado' (cor sólida) com texto branco >= 4,5:1", opts, async () => {
  const { ctx, page } = await abrir("whatsapp", VPS[0]);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  await page.waitForSelector("#btCopiar");
  const bg = await page.$eval("#btCopiar", (e) => getComputedStyle(e).backgroundColor);
  const m = bg.match(/[0-9.]+/g).slice(0, 3).map(Number);
  assert.ok(razaoBranco(m) >= 4.5, "WhatsApp " + bg + " " + razaoBranco(m).toFixed(2));
  await page.click("#btCopiar");
  await page.waitForFunction(() => /Link copiado!/.test(document.getElementById("btCopiar").textContent));
  const ok = (await page.$eval("#btCopiar", (e) => getComputedStyle(e).backgroundColor)).match(/[0-9.]+/g).slice(0, 3).map(Number);
  assert.ok(razaoBranco(ok) >= 5, "copiado " + razaoBranco(ok).toFixed(2));
  await ctx.close();
});
function razaoBranco([r, g, b]) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 1.05 / (0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) + 0.05); }

test("depois de salvar gatinho/apelido o perfil recarrega e o foco vai para o lápis do gatinho (não para o body)", opts, async () => {
  const { ctx, page, erros } = await abrir("orkut", VPS[2]);
  await page.waitForSelector(".pf-lapis");
  await page.focus("[data-ed=visual]");
  await page.evaluate(() => onAccountChange());
  await page.waitForFunction(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.ed === "gato");
  assert.notStrictEqual(await page.evaluate(() => document.activeElement.tagName), "BODY");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("copiar link com falha total: toast com o link e anúncio no #aviso (aria-live)", opts, async () => {
  const { ctx, page, erros } = await abrir("orkut", VPS[2]);
  await page.waitForSelector("#btCopiar");
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }); document.execCommand = () => false; });
  await page.click("#btCopiar");
  await page.waitForFunction(() => /Não deu para copiar\. O link está na tela\./.test(document.getElementById("aviso").textContent));
  assert.match(await page.textContent("#toast"), /perfil\.html\?u=Ana/);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});
