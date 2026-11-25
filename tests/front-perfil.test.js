// Perfil público (perfil.html) com a API mockada via page.route: 15 visuais (as redes da linha do tempo), recados, edição e menu da conta.
// Roda com arquivo explícito: node --test tests/front-perfil.test.js (precisa do Playwright; sem ele os testes são pulados).
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
const GATO2 = { fur: 3, pat: 2, eye: 1, acc: 5, clo: 2, bg: 6 };
const PAT = { id: "banda_larga", nome: "Banda larga", xp_minimo: 150, cor: "#2fbf5b" };
const CARTAS = [
  { id: "memes-0", colecao_id: "memes", numero: 1, nome: "Que Show da Xuxa É Esse?!", emoji: "🎀", raridade: "Mítico", meme_id: null },
  { id: "orkut-8", colecao_id: "orkut", numero: 9, nome: "Dona Gel", emoji: "💇‍♀️", raridade: "Comum", meme_id: null }
];

function criarApi(over = {}) {
  const st = {
    eu: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: true, perfil_layout: "orkut", carta_favorita: null },
    perfis: {
      ana: { layout: "orkut", gato: GATO, fav: null },
      beto: { layout: "fotolog", gato: GATO2, fav: CARTAS[0] }
    },
    recados: { ana: [], beto: [{ id: 7, texto: "<img src=x onerror=window.__xss=1> oi", em: "2026-11-20T10:00:00Z", autor: { apelido: "Caio", avatar_gato: GATO, avatar_url: null }, pode_apagar: false }] },
    patches: [], posts: [], deletes: [], log: [], ...over
  };
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  const perfil = (ap) => {
    const p = st.perfis[ap.toLowerCase()]; if (!p) return null;
    const nome = ap.toLowerCase() === "ana" ? st.eu.apelido : "Beto";
    return { perfil: { apelido: nome, avatar_gato: p.gato, avatar_url: null, layout: p.layout, membro_desde: "2026-11-01T12:00:00Z", eh_meu: ap.toLowerCase() === "ana" },
      patente: { id: PAT.id, nome: PAT.nome, cor: PAT.cor }, proxima_patente: { nome: "Fibra", faltam: 50 }, xp: 200,
      carta_favorita: p.fav, recados: (st.recados[ap.toLowerCase()] || []).length,
      album: { total: 120, tenho: 2, colecoes_completas: 0, colecoes: [{ id: "memes", nome: "Memes Icônicos", icone: null, cor: "#ff3b3b", total: 20, tenho: 1, completa: false }], cartas: CARTAS } };
  };
  async function instalar(ctx) {
    await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
    await ctx.route("**/api/**", async (route) => {
      const req = route.request(), u = new URL(req.url()), p = decodeURIComponent(u.pathname), m = req.method();
      st.log.push(`${m} ${p}`);
      if (p === "/api/eu" && m === "GET") return json(route, 200, { usuario: st.eu, patente: PAT, proxima_patente: null, moedas: 10, xp: 200, csrf: "tok" });
      if (p === "/api/eu" && m === "PATCH") {
        const corpo = JSON.parse(req.postData() || "{}"); st.patches.push({ corpo, csrf: req.headers()["x-csrf"] });
        if (corpo.perfil_layout) st.perfis.ana.layout = corpo.perfil_layout;
        if ("carta_favorita" in corpo) st.perfis.ana.fav = CARTAS.find((c) => c.id === corpo.carta_favorita) || null;
        st.eu = { ...st.eu, perfil_layout: st.perfis.ana.layout, carta_favorita: corpo.carta_favorita ?? null };
        return json(route, 200, { usuario: st.eu, pacote_boas_vindas: null });
      }
      let mm;
      if ((mm = /^\/api\/perfil\/([^/]+)\/recados$/.exec(p))) {
        if (m === "GET") return json(route, 200, { itens: st.recados[mm[1].toLowerCase()] || [] });
        const corpo = JSON.parse(req.postData() || "{}"); st.posts.push({ alvo: mm[1], corpo, csrf: req.headers()["x-csrf"] });
        const r = { id: 99, texto: corpo.texto, em: new Date().toISOString(), autor: { apelido: "Ana", avatar_gato: GATO, avatar_url: null }, pode_apagar: true };
        (st.recados[mm[1].toLowerCase()] ||= []).unshift(r);
        return json(route, 201, r);
      }
      if ((mm = /^\/api\/perfil\/([^/]+)$/.exec(p))) { const x = perfil(mm[1]); return x ? json(route, 200, x) : json(route, 404, { erro: "perfil não encontrado" }); }
      if ((mm = /^\/api\/recados\/(\d+)$/.exec(p)) && m === "DELETE") { st.deletes.push(mm[1]); for (const k in st.recados) st.recados[k] = st.recados[k].filter((r) => String(r.id) !== mm[1]); return json(route, 200, { ok: true }); }
      if (p === "/api/carteira") return json(route, 200, { usuario: { id: 1, apelido: "Ana" }, moedas: 10, xp: 200, patente: PAT, proxima_patente: null, pacotes: [], cartas: { distintas: 2, total_no_album: 120, quantidade_total: 2, repetidas: 0 }, valor_das_repetidas: 0 });
      if (p === "/api/visita") return json(route, 200, { dia: "2026-11-20", primeira_visita_do_dia: false, xp_ganho: 0, pacotes_ganhos: [], carteira: { xp: 200, moedas: 10 } });
      if (p === "/api/album") return json(route, 200, { colecoes: [], total: 0, tenho: 0, colecoes_completas: 0 });
      if (p === "/api/pacotes/tipos") return json(route, 200, { itens: [] });
      if (p === "/api/eventos") return json(route, 202, { ok: true });
      return json(route, 404, { erro: "não mockado" });
    });
  }
  return { st, instalar };
}
async function abrir(url, over, vp = { width: 1280, height: 900 }) {
  const api = criarApi(over);
  const ctx = await browser.newContext({ viewport: vp });
  await api.instalar(ctx);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + url);
  return { ctx, page, api, erros };
}

test("perfil próprio: gato como foto, lápis de edição (sem tarja), sem formulário de recado; edição troca layout e favorita", opts, async () => {
  const { ctx, page, api, erros } = await abrir("/perfil.html");
  await page.waitForSelector(".pf-orkut .pf-gato svg");
  assert.match(page.url(), /perfil\.html\?u=Ana$/);
  assert.strictEqual(await page.$(".pf-barra"), null, "sem tarja de dono");
  assert.ok(await page.$('.pf-lapis[data-ed="gato"]'), "lápis no gatinho");
  assert.ok(await page.$('[data-ed="fav"]'), "lápis (ou quadro) da carta favorita");
  assert.ok(await page.$('[data-ed="visual"]'), "botão Trocar visual");
  assert.ok(await page.$("#btCopiar"), "copiar link");
  assert.strictEqual(await page.$("#rcF"), null, "dono não deixa recado para si");
  assert.match(await page.textContent("#pf"), /Banda larga/);
  await page.click('[data-ed="visual"]');
  await page.check('input[name=lay][value="msn"]', { force: true });
  await page.check("#fav input[value=memes-0]", { force: true });
  await page.click("#btSalvar");
  await page.waitForSelector(".pf-msn");
  assert.deepStrictEqual(api.st.patches.at(-1).corpo, { perfil_layout: "msn", carta_favorita: "memes-0" });
  assert.strictEqual(api.st.patches.at(-1).csrf, "tok");
  assert.match(await page.textContent(".pf-msn"), /Que Show da Xuxa/);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("visitar outro perfil (Fotolog): recado escapado, enviar recado com CSRF, sem botão de editar", opts, async () => {
  const { ctx, page, api, erros } = await abrir("/perfil.html?u=Beto");
  await page.waitForSelector(".pf-fotolog .pf-carta.grande");
  assert.strictEqual(await page.$("[data-ed]"), null, "visitante não vê lápis");
  assert.strictEqual(await page.$(".pf-barra"), null, "sem tarja de visitante");
  assert.ok(await page.$("#btCopiar"), "visitante também copia o link");
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined, "texto do recado não vira HTML");
  assert.strictEqual(await page.$$eval(".pf-rc img[src=x]", (l) => l.length), 0);
  await page.fill("#rcT", "Assinando o seu flog!");
  await page.click("#rcB");
  await page.waitForFunction(() => /Assinando o seu flog!/.test(document.getElementById("pf").textContent));
  assert.strictEqual(api.st.posts[0].corpo.texto, "Assinando o seu flog!");
  assert.strictEqual(api.st.posts[0].csrf, "tok");
  // apagar o próprio recado: 2 cliques confirmam
  await page.click('[data-apagar="99"]'); await page.click('[data-apagar="99"]');
  await page.waitForFunction(() => !/Assinando o seu flog!/.test(document.getElementById("pf").textContent));
  assert.deepStrictEqual(api.st.deletes, ["99"]);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

for (const lay of ["homepage", "icq", "orkut", "fotolog", "msn", "twitter", "facebook", "ask", "whatsapp", "vine", "snapchat", "instagram", "tiktok", "kwai", "bluesky"]) {
  for (const vp of [{ width: 360, height: 780 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    test(`visual ${lay} em ${vp.width}px: sem rolagem lateral e alvos de toque ≥ 44px`, opts, async () => {
      const { ctx, page, erros } = await abrir("/perfil.html?u=Beto", { perfis: { ana: { layout: "orkut", gato: GATO, fav: null }, beto: { layout: lay, gato: GATO2, fav: CARTAS[0] } } }, vp);
      await page.waitForSelector(".pf-" + lay);
      const r = await page.evaluate(() => ({
        ovf: document.documentElement.scrollWidth > innerWidth + 1,
        peq: [...document.querySelectorAll("#pf button, #pf textarea, .pf-tools button")].filter((e) => { const b = e.getBoundingClientRect(); return b.width && b.height < 44; }).map((e) => e.id || e.className)
      }));
      assert.strictEqual(r.ovf, false, "rolagem lateral");
      assert.deepStrictEqual(r.peq, []);
      assert.deepStrictEqual(erros, []);
      await ctx.close();
    });
  }
}

test("perfil inexistente e apelido inválido mostram aviso", opts, async () => {
  let { ctx, page } = await abrir("/perfil.html?u=Ninguem");
  await page.waitForFunction(() => /Perfil não encontrado/.test(document.getElementById("pf").textContent));
  await ctx.close();
  ({ ctx, page } = await abrir("/perfil.html?u=%3Cscript%3E"));
  await page.waitForFunction(() => /Perfil não encontrado/.test(document.getElementById("pf").textContent));
  await ctx.close();
});

test("menu da conta: clicar no avatar abre Ver/Editar perfil e Editar gatinho; Esc fecha", opts, async () => {
  const { ctx, page, erros } = await abrir("/index.html");
  await page.waitForSelector(".sg-acct");
  await page.click(".sg-acct");
  assert.strictEqual(await page.getAttribute(".sg-acct", "aria-expanded"), "true");
  const itens = await page.$$eval("#acct-menu [role=menuitem]", (l) => l.map((x) => x.textContent.trim()));
  assert.deepStrictEqual(itens, ["Ver o meu perfil", "Editar o meu perfil", "Editar gatinho e apelido"]);
  await page.keyboard.press("Escape");
  assert.strictEqual(await page.isHidden("#acct-menu"), true);
  await page.click(".sg-acct"); await page.click("#acct-menu a[href='perfil.html#editar']");
  await page.waitForSelector("#dlg[open]");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("copiar link do perfil: copia o endereço completo e o botão confirma", opts, async () => {
  const { ctx, page, erros } = await abrir("/perfil.html?u=Beto");
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  await page.waitForSelector("#btCopiar");
  await page.click("#btCopiar");
  await page.waitForFunction(() => /copiado/i.test(document.getElementById("btCopiar").textContent));
  const txt = await page.evaluate(() => navigator.clipboard.readText());
  assert.strictEqual(txt, base + "/perfil.html?u=Beto");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("lápis: gatinho abre o criador de gato; carta favorita abre a edição com a favorita em foco", opts, async () => {
  const { ctx, page, erros } = await abrir("/perfil.html");
  await page.waitForSelector('.pf-lapis[data-ed="gato"]');
  await page.click('.pf-lapis[data-ed="gato"]');
  await page.waitForFunction(() => document.getElementById("sgm") && document.getElementById("sgm").classList.contains("open"));
  await page.keyboard.press("Escape");
  await page.evaluate(() => typeof closeSignup === "function" && closeSignup());
  await page.click('[data-ed="fav"]');
  await page.waitForSelector("#dlg[open]");
  assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.closest("#fav") !== null), "foco na fileira da carta favorita");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});
