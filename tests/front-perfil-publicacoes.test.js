// Perfil: publicações (figurinha compartilhada do álbum e meme aprovado) nos 13 visuais; apagar só o dono; sem overflow, 44px, contraste.
// Roda com arquivo explícito: node --test tests/front-perfil-publicacoes.test.js (precisa do Playwright; sem ele os testes são pulados).
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
const PUBS = [
  { id: "f2", tipo: "figurinha", em: "2026-11-22T10:00:00Z", legenda: "Finalmente saiu essa!!!", carta: CARTAS[0] },
  { id: "m7", tipo: "meme", em: "2026-11-21T10:00:00Z", legenda: null, meme: { id: "uma-sopa-pa-noiz", titulo: "Fazer sopa pá nóis", ano: 2013, youtube_id: null, emoji: "🍲" } },
  { id: "f1", tipo: "figurinha", em: "2026-11-20T10:00:00Z", legenda: null, carta: CARTAS[3] }
];
const COLECOES = [
  { id: "memes", nome: "Memes Icônicos", total: 20, tenho: 7, completa: false },
  { id: "orkut", nome: "Orkut e MSN da Nostalgia", total: 20, tenho: 3, completa: false },
  { id: "tv", nome: "TV Aberta", total: 20, tenho: 1, completa: false }
];

async function abrir(layout, vp, { recados = [], tema = null, meu = true, pubs = PUBS } = {}) {
  const st = { patches: [], fav: null, layout, pubs: pubs.map((x) => ({ ...x, pode_apagar: meu && x.tipo === "figurinha" })), apagados: [] };
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
    if (p.toLowerCase() === "/api/perfil/ana") return json(route, 200, { perfil: { apelido: "Ana", avatar_gato: GATO, avatar_url: null, layout: st.layout, membro_desde: "2026-11-01T12:00:00Z", eh_meu: meu }, patente: { id: PAT.id, nome: PAT.nome, cor: PAT.cor }, proxima_patente: { nome: "Fibra", faltam: 50 }, xp: 200, carta_favorita: st.fav, recados: recados.length, publicacoes: st.pubs, album: { total: 120, tenho: CARTAS.length, colecoes_completas: 0, colecoes: COLECOES, cartas: CARTAS } });
    if (/^\/api\/publicacoes\//.test(p) && m === "DELETE") { const id = p.split("/").pop(); st.apagados.push(id); st.pubs = st.pubs.filter((x) => x.id !== id); return json(route, 200, { ok: true }); }
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

const TODOS = ["homepage", "icq", "orkut", "fotolog", "msn", "twitter", "facebook", "ask", "whatsapp", "vine", "snapchat", "instagram", "tiktok"];
const VPS = [{ width: 390, height: 844 }, { width: 1280, height: 900 }];

for (const vp of VPS) {
  for (const tema of ["light", "dark"]) {
    test(`publicações nos 13 visuais ${vp.width}px (${tema}): aparecem, apagar 44px só do dono, sem overflow, contraste e sem erro`, opts, async () => {
      for (const layout of TODOS) {
        const { ctx, page, erros } = await abrir(layout, vp, { tema });
        await page.waitForSelector(".pf-tools");
        const txt = await page.$eval("#pf", (e) => e.innerText);
        assert.match(txt, /Fazer sopa pá nóis/, layout + ": meme aprovado aparece");
        assert.ok(await page.$$eval("#pf [aria-label^='Figurinha'], #pf .pf-post .pf-carta", (l) => l.length) >= 2, layout + ": figurinhas publicadas aparecem");
        const ap = await page.$$eval("[data-apub]", (l) => l.map((e) => ({ id: e.dataset.apub, h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width, nome: e.getAttribute("aria-label") })));
        assert.deepStrictEqual(ap.map((x) => x.id).sort(), ["f1", "f2"], layout + ": apagar só nas figurinhas");
        for (const a of ap) { assert.ok(a.h >= 44 && a.w >= 44, layout + ": apagar >= 44px " + JSON.stringify(a)); assert.ok(a.nome); }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), layout + ": sem overflow horizontal");
        const miudos = await page.evaluate(() => [...document.querySelectorAll("#pf .pf-post *, #pf .qw *")].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.className));
        assert.deepStrictEqual(miudos, [], layout + ": fonte >= 12px");
        assert.deepStrictEqual(await contrastes(page), [], layout + ": contraste");
        assert.deepStrictEqual(erros, [], layout);
        await ctx.close();
      }
    });
  }
}

test("visitante: vê as publicações, mas sem botão de apagar; sem publicações não aparece seção vazia", opts, async () => {
  for (const layout of ["orkut", "twitter", "instagram", "facebook"]) {
    let { ctx, page } = await abrir(layout, VPS[1], { meu: false });
    assert.match(await page.$eval("#pf", (e) => e.innerText), /Fazer sopa pá nóis/);
    assert.strictEqual(await page.$$eval("[data-apub]", (l) => l.length), 0, layout);
    await ctx.close();
    ({ ctx, page } = await abrir(layout, VPS[1], { meu: false, pubs: [] }));
    assert.strictEqual(await page.$$eval(".pf-posts, .ig-grade", (l) => l.length), 0, layout + ": sem seção vazia");
    await ctx.close();
  }
});

test("dono sem publicações: dica para compartilhar no álbum", opts, async () => {
  const { ctx, page } = await abrir("orkut", VPS[1], { pubs: [] });
  assert.match(await page.$eval(".pf-posts", (e) => e.innerText), /Compartilhe uma figurinha no álbum/);
  assert.ok(await page.$('.pf-posts a[href="album.html"]'));
  await ctx.close();
});

test("apagar publicação: 2 cliques confirmam, chama DELETE e some do perfil", opts, async () => {
  const { ctx, page, st, erros } = await abrir("twitter", VPS[1]);
  await page.click('[data-apub="f2"]');
  assert.deepStrictEqual(st.apagados, [], "o 1º clique só pede confirmação");
  await page.click('[data-apub="f2"]');
  await page.waitForFunction(() => !document.querySelector('[data-apub="f2"]'));
  assert.deepStrictEqual(st.apagados, ["f2"]);
  assert.doesNotMatch(await page.$eval("#pf", (e) => e.innerText), /Finalmente saiu essa/);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});
