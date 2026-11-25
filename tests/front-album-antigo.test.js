// Álbum com cara de álbum de banca (anos 90/2000) e o modo expandido (duas páginas, folha molinha virando).
// Roda com arquivo explícito: node --test tests/front-album-antigo.test.js (precisa do Playwright; sem ele os testes são pulados).
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let chromium = null;
for (const m of [process.env.PLAYWRIGHT_MODULE, "playwright"]) {
  if (!m) continue;
  try { ({ chromium } = require(m)); break; } catch { /* tenta o próximo */ }
}

const RAIZ = path.join(__dirname, "..");
const TIPOS_MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json" };
const servidor = () => new Promise((ok) => {
  const s = http.createServer((req, res) => {
    const arq = path.join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TIPOS_MIME[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  }).listen(0, "127.0.0.1", () => ok(s));
});

// coleções do data.js (ids das cartas: <colecao>-<i>, igual ao servidor)
const ctxData = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(RAIZ, "data.js"), "utf8") + ";this.C=COLLECTIONS", ctxData);
const COLECOES = ctxData.C;

const opts = { skip: chromium ? false : "playwright não instalado" };
let srv, browser, base;
test.before(async () => {
  if (!chromium) return;
  srv = await servidor(); base = `http://127.0.0.1:${srv.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

const PAT = { id: "banda_larga", nome: "Banda larga", xp_minimo: 150, cor: "#2fbf5b" };
const PROX = { id: "colaborador", nome: "Colaborador", xp_minimo: 500, cor: "#2f86ff", faltam: 300 };
const TIPOS = [
  { id: "diario", nome: "Pacote Diário", descricao: "grátis", preco: 0, cartas: 5, chances: { Comum: 44, Relevante: 26, Raro: 15, "Relíquia": 9, "Lendário": 5, "Mítico": 1 }, garantia: null, escopo: "todas", gratis: true, comprar: false, icone: "pack", gradiente: "linear-gradient(160deg,#25aae3,#0b4f6e)" },
  { id: "boas", nome: "Boas-vindas", descricao: "uma vez", preco: 0, cartas: 5, chances: { Comum: 44, Raro: 56 }, garantia: "Raro", escopo: "todas", gratis: true, comprar: false, icone: "cat", gradiente: "linear-gradient(160deg,#2a6bff,#0a1a50)" },
  { id: "classico", nome: "Pacote Clássico", descricao: "5 cartas", preco: 150, cartas: 5, chances: { Comum: 44, Relevante: 26, Raro: 15, "Relíquia": 9, "Lendário": 5, "Mítico": 1 }, garantia: null, escopo: "todas", gratis: false, comprar: true, icone: "star", gradiente: "linear-gradient(160deg,#8a1d5a,#2a0618)" }
];

/** API falsa com estado. `log` guarda a ordem das chamadas. */
function criarApi(over = {}) {
  const st = {
    moedas: 123, xp: 200, patente: PAT, proxima: PROX,
    pacotes: [{ tipo: "boas", nome: "Boas-vindas", colecao_id: null, quantidade: 1 }],
    qtd: {}, valorRepetidas: 0, comprar402: false, abrir402: false, euStatus: 200, carteiraStatus: 200, log: [], ...over
  };
  const n = (k) => st.log.filter((x) => x === k).length;
  const carteira = () => ({
    usuario: { id: 1, apelido: "teste" }, moedas: st.moedas, xp: st.xp, patente: st.patente, proxima_patente: st.proxima,
    pacotes: st.pacotes, cartas: { distintas: Object.keys(st.qtd).length, total_no_album: 109, quantidade_total: 0, repetidas: 0 }, valor_das_repetidas: st.valorRepetidas
  });
  const album = () => ({
    colecoes: COLECOES.map((c) => ({ id: c.id, nome: c.n, total: c.cards.length, tenho: 0, completa: false, cartas: c.cards.map((_, i) => ({ id: `${c.id}-${i}`, numero: i + 1, quantidade: st.qtd[`${c.id}-${i}`] || 0 })) })),
    total: 109, tenho: Object.keys(st.qtd).length, colecoes_completas: 0
  });
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  async function instalar(ctx) {
    // nada de rede externa (fontes do Google etc.): deixa o evento load rápido e o teste determinístico
    await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
    // imagens do S3 (/midias/...): um PNG de 1 pixel, para a imagem carregar de verdade
    await ctx.route("**/midias/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }));
    await ctx.route("**/api/**", async (route) => {
      const req = route.request(), u = new URL(req.url()), p = u.pathname, m = req.method();
      const chave = `${m} ${p}`;
      st.log.push(chave);
      if (p === "/api/eu" && st.euStatus !== 200) return json(route, st.euStatus, { erro: "falhou" });
      if (p === "/api/eu") return json(route, 200, { usuario: { id: 1, apelido: "teste", avatar_gato: null, avatar_url: null }, patente: st.patente, proxima_patente: st.proxima, moedas: st.moedas, xp: st.xp, csrf: "tok" });
      if (p === "/api/carteira") return st.carteiraStatus === 200 ? json(route, 200, carteira()) : json(route, st.carteiraStatus, { erro: "não autenticado" });
      if (p === "/api/cartas") return st.cartas ? json(route, 200, { itens: st.cartas }) : json(route, 404, { erro: "não mockado" });
      if (p === "/api/album") return json(route, 200, album());
      if (p === "/api/visita") return json(route, 200, { dia: "2026-11-19", primeira_visita_do_dia: true, xp_ganho: 10, pacotes_ganhos: [], carteira: { xp: st.xp, moedas: st.moedas } });
      if (p === "/api/pacotes/tipos") return json(route, 200, { itens: TIPOS });
      if (p === "/api/pacotes/comprar") return st.comprar402 ? json(route, 402, { erro: "moedas insuficientes" }) : json(route, 201, { estoque_id: 1, tipo: "classico", carteira: { xp: st.xp, moedas: st.moedas } });
      if (p === "/api/pacotes/abrir" && st.abrir402) return json(route, 402, { erro: "moedas insuficientes" });
      if (p === "/api/pacotes/abrir") {
        st.corpoAbrir = JSON.parse(req.postData() || "{}");
        const col = COLECOES[0];
        const cartas = col.cards.slice(0, 5).map((c, i) => ({ id: `${col.id}-${i}`, nome: c.name, emoji: c.e, raridade: c.r, colecao_id: col.id, meme_id: c.meme || null, nova: true }));
        cartas.forEach((c) => { st.qtd[c.id] = (st.qtd[c.id] || 0) + 1; });
        st.moedas += 50; st.xp += 600; st.patente = PROX; st.proxima = null; st.pacotes = [];
        return json(route, 200, { pacote_id: 1, tipo: "boas", nome: "Boas-vindas", cartas, novas: 5, xp_ganho: 600, moedas_ganhas: 50, colecoes_completas: [], valor_das_repetidas: 0, carteira: { xp: st.xp, moedas: st.moedas } });
      }
      if (p === "/api/album/reciclar") {
        st.corpoReciclar = JSON.parse(req.postData() || "{}");
        st.moedas += st.valorRepetidas; const ganhas = st.valorRepetidas; st.valorRepetidas = 0;
        Object.keys(st.qtd).forEach((k) => { st.qtd[k] = 1; });
        return json(route, 200, { convertidas: 3, cartas_afetadas: 2, moedas_ganhas: ganhas, carteira: { xp: st.xp, moedas: st.moedas } });
      }
      if (p === "/api/eventos") return json(route, 202, { ok: true });
      return json(route, 404, { erro: "não mockado" });
    });
  }
  return { st, n, instalar };
}

async function abrirPagina(pagina, over, { init } = {}) {
  const api = criarApi(over);
  const ctx = await browser.newContext({ viewport: over && over.vp || { width: 1280, height: 900 }, reducedMotion: over && over.reduz ? "reduce" : "no-preference" });
  if (over && over.tema) await ctx.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* sem storage */ } }, over.tema);
  if (init) await ctx.addInitScript(init);
  await api.instalar(ctx);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + pagina);
  return { ctx, page, api, erros };
}
const esperarEconomia = (page) => page.waitForFunction(() => typeof ECO !== "undefined" && ECO.pronto === true);
// metade das cartas de cada coleção (ids <colecao>-<i>), algumas repetidas
const QTD = {};
COLECOES.forEach((c) => c.cards.forEach((_, i) => { if (i % 2 === 0) QTD[`${c.id}-${i}`] = i % 4 === 0 ? 2 : 1; }));
const abrirAlbum = async (o = {}) => { const r = await abrirPagina("/album.html", { pacotes: [], qtd: { ...QTD }, ...o }); await esperarEconomia(r.page); await r.page.waitForSelector("#cards .slot"); return r; };

// contraste no papel: fundo = cor sólida mais próxima ou a cor do papel da página (--papel)
const medirPapel = (raiz) => {
  const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const hex = (h) => { h = h.trim().replace("#", ""); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }; };
  const L = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const mix = (f, b, a) => ({ r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 });
  const out = { falhas: [], pequenas: [] };
  for (const e of document.querySelector(raiz).querySelectorAll("*")) {
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
    if (e.closest("[aria-hidden=true],button:disabled,h1,h3.tt")) continue; // títulos: arte de época grande (contorno/sombra), medidos à parte
    const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const px = parseFloat(cs.fontSize); if (px < 12) out.pequenas.push(e.className + " " + px + "px " + e.textContent.trim().slice(0, 15));
    let bg = null, pilha = [];
    for (let x = e; x; x = x.parentElement) { const c = parse(getComputedStyle(x).backgroundColor); if (c && c.a > 0) { pilha.push(c); if (c.a > 0.95) break; } if (x.classList.contains("pg")) { pilha.push(hex(getComputedStyle(x).getPropertyValue("--papel"))); break; } }
    bg = pilha.pop() || { r: 255, g: 255, b: 255, a: 1 }; while (pilha.length) { const c = pilha.pop(); bg = mix(c, bg, c.a); }
    const fg = parse(cs.color); const ef = mix(fg, bg, fg.a), x = L(ef), y = L(bg), ratio = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    const grande = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight) >= 700);
    if (ratio < (grande ? 3 : 4.5)) out.falhas.push(`${e.className} ${cs.color} ${ratio.toFixed(2)} ${e.textContent.trim().slice(0, 15)}`);
  }
  return out;
};

for (const tema of ["light", "dark"]) for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`álbum antigo ${vp.width}px (${tema}): 8 coleções com tema próprio, 3 vagas por linha, alvos 44px, fonte >= 12px, contraste e sem overflow`, opts, async () => {
    const { ctx, page, erros } = await abrirAlbum({ vp, tema });
    const temas = new Set();
    for (let k = 0; k < COLECOES.length; k++) {
      await page.evaluate((k) => setCol(k), k);
      const c = await page.evaluate(() => ({ cls: document.getElementById("pagina").className, t: document.getElementById("ct").textContent }));
      assert.ok(c.cls.includes("t-" + COLECOES[k].id), c.cls); assert.strictEqual(c.t, COLECOES[k].n);
      temas.add(await page.$eval("#ct", (h) => getComputedStyle(h).fontFamily + "|" + getComputedStyle(h).color));
      const cols = await page.$$eval("#cards .slot", (l) => new Set(l.map((x) => Math.round(x.getBoundingClientRect().left))).size);
      assert.strictEqual(cols, Math.min(3, Math.min(6, COLECOES[k].cards.length)), "3 vagas por linha");
      const alvos = await page.$$eval("#cards .vaga, #pagina .about, #pagina .pager button", (l) => l.map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height, e.getAttribute("aria-label") || e.textContent.trim()]));
      for (const [w, h, n] of alvos) { assert.ok(w >= 44 && h >= 44, `alvo pequeno ${w}x${h} ${n}`); assert.ok(n, "sem nome acessível"); }
      const m = await page.evaluate(medirPapel, "#pagina");
      assert.deepStrictEqual(m.pequenas, [], COLECOES[k].id + " fontes"); assert.deepStrictEqual(m.falhas, [], COLECOES[k].id + " contraste");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "sem overflow");
    }
    assert.ok(temas.size >= 7, "títulos diferentes por coleção: " + temas.size);
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("vaga: figurinha que tenho mostra nome, número e cópias; a que falta mostra o número e ???; clicar seleciona", opts, async () => {
  const { ctx, page, erros } = await abrirAlbum();
  const v = await page.$$eval("#cards .slot", (l) => l.slice(0, 2).map((s) => ({ nm: s.querySelector(".nm").textContent, fig: !!s.querySelector(".fig"), cp: (s.querySelector(".cp") || {}).textContent, nv: s.querySelector(".nv").textContent })));
  assert.deepStrictEqual(v[0], { nm: COLECOES[0].cards[0].name, fig: true, cp: "x2", nv: "001" });
  assert.deepStrictEqual(v[1], { nm: "???", fig: false, cp: undefined, nv: "002" });
  await page.click("#cards .slot:nth-child(3) .vaga");
  assert.ok(await page.$eval("#cards .slot:nth-child(3) .vaga", (b) => b.classList.contains("sel")));
  assert.match(await page.$eval("#det", (d) => d.textContent), new RegExp(COLECOES[0].cards[2].name));
  assert.match(await page.$eval("#premio", (d) => d.textContent), new RegExp(`Complete do nº 001 ao nº ${String(COLECOES[0].cards.length).padStart(3, "0")}`));
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("expandir: abre na página atual, setas viram de 2 em 2, Esc fecha e o foco volta; Tab fica na mesa", opts, async () => {
  const { ctx, page, erros } = await abrirAlbum({ reduz: true });
  await page.evaluate(() => { setCol(2); pg(1); });
  await page.click("#btExp");
  assert.strictEqual(await page.getAttribute("#mesa", "aria-modal"), "true");
  const n0 = await page.textContent("#mesaN");
  assert.match(n0, /^Páginas \d+ e \d+ de \d+$/);
  const total = await page.evaluate(() => PAGS.length);
  assert.strictEqual(total, COLECOES.reduce((s, c) => s + Math.ceil(c.cards.length / 6), 0));
  // a página atual (Memes Icônicos, 2ª página) está aberta
  assert.ok(await page.evaluate(() => { const gi = PAGS.findIndex((P) => P.ci === 2 && P.pg === 1); return gi === esq || gi === esq + 1; }));
  const e0 = await page.evaluate(() => esq);
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction((e) => esq === e + 2 && !document.querySelector(".mola"), e0, { timeout: 2000 });
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction((e) => esq === e && !document.querySelector(".mola"), e0, { timeout: 2000 });
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  assert.ok(await page.evaluate(() => document.getElementById("mesa").contains(document.activeElement)), "foco preso na mesa");
  await page.keyboard.press("Escape");
  assert.strictEqual(await page.$eval("#mesa", (m) => m.hidden), true);
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), "btExp");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("expandir: a folha vira molinha (tiras) e some no fim; clicar numa figurinha do livro seleciona e fecha", opts, async () => {
  const { ctx, page, erros } = await abrirAlbum();
  await page.click("#btExp");
  await page.click("#btProx");
  await page.waitForSelector(".mola .tira");
  const n = await page.$$eval(".mola .tira", (l) => l.length);
  assert.strictEqual(n, 12);
  const angulos = await page.$$eval(".mola .tira", (l) => l.map((t) => t.style.transform));
  assert.ok(new Set(angulos).size > 2, "as tiras dobram em ângulos diferentes (papel curvando)");
  await page.waitForFunction(() => !document.querySelector(".mola"), null, { timeout: 4000 });
  assert.strictEqual(await page.evaluate(() => esq), 2);
  const id = await page.$eval("#ladoE .vaga .fig", (f) => f.closest(".vaga").getAttribute("onclick").match(/'([^']+)'/)[1]);
  await page.click("#ladoE .vaga:has(.fig)");
  assert.strictEqual(await page.$eval("#mesa", (m) => m.hidden), true);
  assert.strictEqual(await page.evaluate(() => sel), id);
  assert.ok(await page.$eval("#cards .vaga.sel", (b) => !!b));
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("expandir com prefers-reduced-motion: a folha ainda vira, inteira e rápida (sem dobrar em tiras)", opts, async () => {
  const { ctx, page } = await abrirAlbum({ reduz: true });
  await page.click("#btExp");
  await page.click("#btProx");
  await page.waitForSelector(".mola .tira");
  assert.strictEqual(await page.$$eval(".mola .tira", (l) => l.length), 1);
  await page.waitForFunction(() => !document.querySelector(".mola"), null, { timeout: 2000 });
  assert.strictEqual(await page.evaluate(() => esq), 2);
  await ctx.close();
});

// ---------- cartas do banco no álbum: imagem enviada no painel, edição e carta nova ----------
const NOVA_ID = `orkut-${COLECOES.find((c) => c.id === "orkut").cards.length}`;
const cartasApi = () => {
  const col = COLECOES.find((c) => c.id === "orkut");
  return col.cards.map((x, i) => ({ id: `orkut-${i}`, colecao_id: "orkut", numero: i + 1, nome: i === 0 ? "Carta Editada" : x.name, emoji: x.e, raridade: x.r, meme_id: x.meme || null, imagem: i === 0 ? "midias/carta-aabbccddeeff.webp" : null }))
    .concat({ id: NOVA_ID, colecao_id: "orkut", numero: col.cards.length + 1, nome: "Carta Nova do Painel", emoji: "🆕", raridade: "Raro", meme_id: null, imagem: "midias/carta-112233445566.webp" });
};

test("álbum: carta do painel com imagem mostra a imagem do S3, nome editado e carta nova no fim da coleção", opts, async () => {
  const { ctx, page, erros } = await abrirAlbum({ cartas: cartasApi(), qtd: { ...QTD, [NOVA_ID]: 1 } });
  await page.waitForFunction(() => typeof CARDS !== "undefined" && CARDS.some((c) => c.id === "orkut-0" && c.img));
  const r = await page.evaluate((nid) => ({ img: byId["orkut-0"].img, nome: byId["orkut-0"].name, nova: !!byId[nid], num: byId[nid] && byId[nid].num, pags: PAGS.filter((p) => p.ci === 0).reduce((s, p) => s + p.l.length, 0), total: COLLECTIONS[0].cards.length }), NOVA_ID);
  assert.strictEqual(r.img, "midias/carta-aabbccddeeff.webp"); assert.strictEqual(r.nome, "Carta Editada");
  assert.strictEqual(r.nova, true); assert.strictEqual(r.pags, r.total, "a carta nova entrou nas páginas do álbum expandido");
  await page.waitForSelector('#cards img[src="/midias/carta-aabbccddeeff.webp"]');
  assert.ok(await page.$('#cards img[src="/midias/carta-aabbccddeeff.webp"]'), "a imagem da carta aparece na vaga");
  assert.strictEqual(await page.evaluate(() => document.querySelector('#cards img[src="/midias/carta-aabbccddeeff.webp"]').nextElementSibling.hidden), true, "emoji escondido atrás da imagem");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("álbum: sem /api/cartas (404) segue com o data.js, sem erro", opts, async () => {
  const { ctx, page, erros } = await abrirAlbum();
  await page.waitForTimeout(800);
  assert.strictEqual(await page.evaluate(() => byId["orkut-0"].img), undefined);
  assert.ok(await page.$("#cards .slot"));
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("álbum: carta que perde a imagem no painel volta para a miniatura do vídeo ou emoji", opts, async () => {
  const lista = cartasApi(); lista[0].imagem = null;
  const { ctx, page } = await abrirAlbum({ cartas: lista });
  await page.waitForFunction(() => byId["orkut-0"].name === "Carta Editada");
  assert.strictEqual(await page.evaluate(() => byId["orkut-0"].img), undefined);
  assert.strictEqual(await page.$('#cards img[src^="/midias/"]'), null);
  await ctx.close();
});
