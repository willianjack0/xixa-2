// Perfil: em todos os visuais (e no celular), número, raridade, nome e coleção ficam dentro da figurinha, mesmo com nome comprido
// (o texto que não cabe é cortado com reticências dentro da carta, nunca vaza para fora dela).
// Roda com arquivo explícito: node --test tests/front-perfil-carta-cabe.test.js (precisa do Playwright; sem ele os testes são pulados).
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
const CARTAS = Array.from({ length: 14 }, (_, i) => ({ id: `comunidades-${i}`, colecao_id: i % 2 ? "comunidades" : "grupinhos", numero: i + 1, nome: i === 3 ? "Se macumba funcionasse, o Baiano terminava empatado" : i === 2 ? "Discografias" : `Carta ${i + 1}`, emoji: "🎀", raridade: RAR[i % 6], meme_id: null }));
const COLECOES = [
  { id: "comunidades", nome: "Comunidades Clássicas", total: 76, tenho: 7, completa: false },
  { id: "grupinhos", nome: "Grupinhos e Criadores", total: 28, tenho: 7, completa: false }
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
  await page.waitForSelector("[data-ed=visual]");
  return { ctx, page, st, erros };
}

const LAYOUTS = ["homepage", "icq", "orkut", "fotolog", "msn", "twitter", "facebook", "ask", "whatsapp", "vine", "snapchat", "instagram", "tiktok"];
for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`figurinhas do perfil: nome e coleção cabem na carta em todos os visuais (${vp.width}px)`, opts, async () => {
    for (const lay of LAYOUTS) {
      const { ctx, page, erros } = await abrir(lay, vp);
      await page.waitForTimeout(150);
      const fora = await page.evaluate(() => {
        const out = [];
        for (const c of document.querySelectorAll(".pf-carta")) {
          const r = c.getBoundingClientRect(); if (!r.width) continue;
          for (const s of c.querySelectorAll(".tp,.nm,.ft")) {
            const q = s.getBoundingClientRect();
            if (q.width && (q.bottom > r.bottom + 1 || q.right > r.right + 1 || q.left < r.left - 1)) out.push(`${s.className}: ${s.textContent.trim().slice(0, 30)}`);
          }
        }
        return out;
      });
      assert.deepStrictEqual(fora, [], `${lay}: ${fora.join(" | ")}`);
      assert.deepStrictEqual(erros, [], lay);
      await ctx.close();
    }
  });
}
