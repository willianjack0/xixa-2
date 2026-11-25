// Perfil, redes modernas (vine, snapchat, instagram, tiktok, kwai, bluesky): um detalhe típico em cada, XP na cor da patente, reduced-motion.
// Roda com arquivo explícito: node --test tests/front-perfil-modernos.test.js (precisa do Playwright; sem ele os testes são pulados).
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

const MODERNOS = ["vine", "snapchat", "instagram", "tiktok", "kwai", "bluesky"];
const VPS = [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 1280, height: 900 }];
const REC = [{ id: 1, texto: "oi, que perfil legal", em: "2026-11-20T10:00:00Z", autor: { apelido: "Caio", avatar_gato: GATO, avatar_url: null }, pode_apagar: false }];
// copy exata de cada detalhe (a mesma da descrição do PR); membro_desde = 2026-11-01 e 14 cartas
const COPY = {
  vine: "↻ 6 segundos em loop. Pode repetir à vontade.",
  instagram: "♥ Curtido por Caio e outras 43 pessoas que só olharam",
  tiktok: "♫ som original · Ana · com chiado de conexão discada",
  kwai: "🪙 Assista e ganhe moedas! Aqui o prêmio é a nostalgia.",
  bluesky: "@ana.nostalgia.social ✔ domínio verificado, é gato mesmo"
};
const norm = (t) => t.replace(/\s+/g, " ").trim();

for (const layout of MODERNOS) {
  test(`${layout}: um detalhe típico, copy exata, XP na cor da patente, sem mídia automática`, opts, async () => {
    const { ctx, page, erros } = await abrir(layout, VPS[0], { recados: REC });
    await page.waitForSelector(`.pf-${layout} .det`);
    assert.strictEqual(await page.$$eval(".pf .det", (l) => l.length), 1, "um único detalhe");
    const txt = norm(await page.$eval(".pf .det", (e) => e.innerText));
    if (layout === "snapchat") assert.match(txt, /^🔥 \d+ dias? de sequência\. Não deixe a chama apagar!$/);
    else if (layout === "tiktok") assert.ok(txt.startsWith(COPY.tiktok), txt);
    else assert.strictEqual(txt, COPY[layout]);
    // barra de XP: preenchimento e trilho derivam de --pc (patente verde #2fbf5b); o contraste em si é medido por pixel no teste da barra
    const xp = await page.$eval(".pf .pf-xp i", (i) => ({ fill: getComputedStyle(i).backgroundColor, track: getComputedStyle(i.parentElement).backgroundColor }));
    const nums = (c) => (c.match(/[0-9.]+/g) || []).slice(0, 3).map(Number);
    const [r, g, bl] = nums(xp.fill);
    assert.ok(g > r && g > bl, "preenchimento na cor (verde) da patente: " + xp.fill);
    if (layout === "tiktok") assert.strictEqual(xp.fill, "rgb(47, 191, 91)");
    assert.notStrictEqual(xp.fill, xp.track);
    // sem som/mídia automática, sem logos oficiais (nenhuma imagem nova)
    assert.strictEqual(await page.$$eval("#pf audio, #pf video, #pf iframe, #pf source", (l) => l.length), 0);
    assert.strictEqual(await page.$$eval(".pf .det img, .pf .det svg", (l) => l.length), 0);
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("animações dos detalhes: ligadas por padrão e desligadas com prefers-reduced-motion", opts, async () => {
  const anim = { vine: ".loop i", snapchat: ".chama", tiktok: ".trilho", kwai: ".moeda" };
  for (const [layout, sel] of Object.entries(anim)) {
    const { ctx, page } = await abrir(layout, VPS[0], { recados: REC });
    await page.waitForSelector(`.pf-${layout} .det`);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.notStrictEqual(await page.$eval(`.det ${sel}`, (e) => getComputedStyle(e).animationName), "none", layout + " anima");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.strictEqual(await page.$eval(`.det ${sel}`, (e) => getComputedStyle(e).animationName), "none", layout + " parado com reduced-motion");
    await ctx.close();
  }
});

for (const vp of VPS) {
  test(`modernos ${vp.width}px: sem overflow, sem erro de console, fonte >= 12px e contraste >= 4,5:1 (com o detalhe)`, opts, async () => {
    for (const layout of MODERNOS) {
      const { ctx, page, erros } = await abrir(layout, vp, { recados: REC });
      await page.waitForSelector(`.pf-${layout} .det`);
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), layout + ": sem overflow horizontal");
      assert.ok(await page.$eval(".pf .det", (e) => e.getBoundingClientRect().right <= innerWidth + 1), layout + ": detalhe dentro da tela");
      const miudos = await page.evaluate(() => [...document.querySelectorAll("#pf .det, #pf .det *")].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.className));
      assert.deepStrictEqual(miudos, [], layout);
      assert.deepStrictEqual(await contrastes(page), [], layout + ": contraste");
      assert.deepStrictEqual(erros, [], layout);
      await ctx.close();
    }
  });
}

test("os outros visuais não ganharam detalhe", opts, async () => {
  for (const layout of ["orkut", "facebook", "whatsapp", "msn"]) {
    const { ctx, page } = await abrir(layout, VPS[2]);
    await page.waitForSelector(".pf [class]");
    assert.strictEqual(await page.$$eval(".pf .det", (l) => l.length), 0, layout);
    await ctx.close();
  }
});

// ---- barra de XP: contraste por pixel (WCAG 1.4.11, componente não textual >= 3:1) ----
const zlib = require("node:zlib");
function lerPng(buf) {
  let o = 8, w = 0, h = 0, ct = 0; const dados = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), tipo = buf.toString("latin1", o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (tipo === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    if (tipo === "IDAT") dados.push(d);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(dados)), st = w * bpp, px = Buffer.alloc(h * st);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], lin = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1));
    for (let x = 0; x < st; x++) {
      const a = x >= bpp ? px[y * st + x - bpp] : 0, b = y ? px[(y - 1) * st + x] : 0, c = x >= bpp && y ? px[(y - 1) * st + x - bpp] : 0;
      let v = lin[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * st + x] = v & 255;
    }
  }
  return { w, h, at: (x, y) => [px[y * st + x * bpp], px[y * st + x * bpp + 1], px[y * st + x * bpp + 2]] };
}
const lumRgb = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const razao = (a, b) => { const x = lumRgb(a), y = lumRgb(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const PATENTES = [["discado", "#9aa3b2"], ["banda_larga", "#2fbf5b"], ["colaborador", "#2f86ff"], ["moderador", "#a855f7"], ["dono", "#f5b70a"], ["lenda", "#ff3b47"]];

async function medirXp(layout, cor, tema) {
  const { ctx, page } = await abrir(layout, { width: 1280, height: 900 }, { tema });
  await page.waitForSelector(`.pf-${layout} .pf-xp`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const el = await page.$(".pf .pf-xp");
  await el.scrollIntoViewIfNeeded();
  const r = await el.evaluate((e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  const png = lerPng(await page.screenshot({ clip: { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: r.w + 20, height: r.h + 20 } }));
  const ox = Math.round(r.x - Math.max(0, r.x - 10)), oy = Math.round(r.y - Math.max(0, r.y - 10)), cy = oy + Math.round(r.h / 2);
  const fill = png.at(ox + Math.round(r.w * 0.4), cy), track = png.at(ox + Math.round(r.w * 0.93), cy), fundo = png.at(ox + Math.round(r.w * 0.5), Math.max(0, oy - 6));
  const borda = png.at(ox + Math.round(r.w * 0.93), oy + 1);
  await ctx.close();
  return { fillTrack: razao(fill, track), bordaFundo: razao(borda, fundo), fillFundo: razao(fill, fundo) };
}

test("barra de XP dos modernos: preenchimento x trilho >= 3:1 e contorno x fundo >= 3:1 (por pixel, 6 patentes, claro e escuro)", opts, async () => {
  const tabela = []; const falhas = [];
  for (const layout of MODERNOS) for (const [id, cor] of PATENTES) for (const tema of ["light", "dark"]) {
    PAT.id = id; PAT.cor = cor;
    const m = await medirXp(layout, cor, tema);
    tabela.push(`${layout}|${id}|${tema}|fill/trilho ${m.fillTrack.toFixed(2)}|contorno/fundo ${m.bordaFundo.toFixed(2)}`);
    if (m.fillTrack < 3 || m.bordaFundo < 3) falhas.push(tabela.at(-1));
  }
  PAT.id = "banda_larga"; PAT.cor = "#2fbf5b";
  const min = (k) => Math.min(...tabela.map((t) => parseFloat(t.split("|")[k].split(" ").at(-1))));
  console.log("XP min fill/trilho:", min(3).toFixed(2), "min contorno/fundo:", min(4).toFixed(2), "(72 combinações)");
  if (process.env.XP_TABELA) console.log(tabela.join("\n"));
  assert.deepStrictEqual(falhas, []);
});

test("vine: a barrinha do loop anima transform (sem layout por quadro) mantendo 6 s e reinício", opts, async () => {
  const { ctx, page } = await abrir("vine", VPS[0]);
  await page.waitForSelector(".det-vine .loop i");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const cs = await page.$eval(".det-vine .loop i", (e) => { const c = getComputedStyle(e); return { nome: c.animationName, dur: c.animationDuration, it: c.animationIterationCount }; });
  assert.strictEqual(cs.dur, "6s"); assert.strictEqual(cs.it, "infinite");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const lay = async () => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "LayoutCount").value;
  const a = await lay(); await page.waitForTimeout(3000); const b = await lay();
  console.log("LayoutCount do vine em 3 s:", b - a);
  assert.ok(b - a <= 6, "layouts em 3 s: " + (b - a));
  const props = await page.evaluate((nome) => { const o = new Set(); for (const s of document.styleSheets) { let rs; try { rs = s.cssRules; } catch (e) { continue; } for (const r of rs) if (r.type === CSSRule.KEYFRAMES_RULE && r.name === nome) for (const k of r.cssRules) for (let i = 0; i < k.style.length; i++) o.add(k.style[i]); } return [...o]; }, cs.nome);
  assert.deepStrictEqual(props, ["transform"], "só transform nos keyframes: " + props);
  await ctx.close();
});

test("bluesky: espaço real entre handle, selo e texto no DOM", opts, async () => {
  const { ctx, page } = await abrir("bluesky", VPS[0]);
  await page.waitForSelector(".det-bluesky");
  assert.strictEqual(await page.$eval(".det-bluesky", (e) => e.textContent), "@ana.nostalgia.social ✔ domínio verificado, é gato mesmo");
  await ctx.close();
});
