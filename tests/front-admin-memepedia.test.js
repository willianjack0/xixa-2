// Aba "Memepédia" do seppzone: cobertura, filtros, editor por campo, histórico, restaurar e pendentes.
// Parte 1 roda sempre (sem navegador). Parte 2 precisa do Playwright (senão é pulada); API mockada via page.route.
// Roda com arquivo explícito: node --test tests/front-admin-memepedia.test.js
// PLAYWRIGHT_MODULE=/caminho/node_modules/playwright · CHROMIUM_PATH=/caminho/chrome
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

// ---------------------------------------------------------------- parte 1: sem navegador
test("admin.js: aba Memepédia para moderador e admin, API /api/mod/memepedia e nada de innerHTML no bloco novo", () => {
  const js = ler("seppzone/admin.js");
  assert.match(js, /\{ id: "memepedia", nome: "Memepédia", papeis: \["moderador", "admin"\], montar: abaMemepedia \}/);
  const i = js.indexOf("// ---------- Memepédia: cobertura"), f = js.indexOf("// ---------- telas de acesso e inicialização");
  assert.ok(i > 0 && f > i);
  const bloco = js.slice(i, f);
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(bloco), "texto da API só por textContent");
  for (const rota of ["/api/mod/memepedia/memes", "/campos/", "/decidir", "/restaurar"]) assert.ok(bloco.includes(rota), rota);
  assert.match(bloco, /MP_CAMPOS = \["origem", "porque", "usos", "rede", "hoje", "curiosidades"\]/);
});

test("seppzone: cache-bust do admin.js (6) e admin.css (5) e CSS da aba (44 px, fontes >= 12 px)", () => {
  const h = ler("seppzone/index.html");
  assert.match(h, /admin\.js\?v=6/); assert.match(h, /admin\.css\?v=5/);
  const css = ler("seppzone/admin.css");
  const bloco = css.slice(css.indexOf("/* Memepédia (aba própria)"));
  assert.match(bloco, /\.mp \.b\{min-height:44px\}/); assert.match(bloco, /\.mp-hist>summary\{[^}]*min-height:44px/);
  for (const m of bloco.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 12, "fonte < 12px: " + m[0]);
});

// ---------------------------------------------------------------- parte 2: navegador
let chromium = null;
for (const m of [process.env.PLAYWRIGHT_MODULE, "playwright"]) {
  if (!m) continue;
  try { ({ chromium } = require(m)); break; } catch { /* tenta o próximo */ }
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
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
const CAMPOS = ["origem", "porque", "usos", "rede", "hoje", "curiosidades"];
const ed = (id, campo, texto, status, extra = {}) => ({ id, campo, texto, fonte: null, autor: "Ana", status, criado_em: "2026-12-01T10:00:00Z", revisado_em: status === "pendente" ? null : "2026-12-01T11:00:00Z", ...extra });

function dadosIniciais() {
  return {
    memes: [
      { id: "nyan-cat", titulo: "Nyan Cat", ano: 2011, categoria: "Memes", status: "publicado", preenchidos: 2, campos: ["origem", "porque"], pendentes: 1 },
      { id: "xss-meme", titulo: XSS, ano: 2012, categoria: "Memes", status: "oculto", preenchidos: 0, campos: [], pendentes: 0 },
      { id: "completo", titulo: "Meme Completo", ano: 2013, categoria: "Memes", status: "publicado", preenchidos: 6, campos: CAMPOS, pendentes: 0 }
    ],
    // histórico do nyan-cat: origem (v1 antiga recusada, v2 atual), porque (atual), usos com pendente
    edicoes: [
      ed(1, "origem", "Primeira versão do texto da origem.", "aprovado", { revisado_em: "2026-12-01T09:00:00Z", fonte: "https://exemplo.com/v1", autor: "Bia" }),
      ed(2, "origem", "Segunda versão, a publicada agora.", "aprovado", { revisado_em: "2026-12-02T09:00:00Z", fonte: "https://exemplo.com/v2" }),
      ed(3, "origem", "Sugestão antiga recusada pela moderação.", "recusado"),
      ed(4, "porque", "Por que viralizou: texto atual do campo.", "aprovado"),
      ed(5, "usos", XSS + " sugestão com html", "pendente", { autor: "Zé" })
    ]
  };
}

function criarApi(over = {}) {
  const st = { papel: "moderador", log: [], ...dadosIniciais(), ...over };
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  const atualDe = (campo) => st.edicoes.filter((e) => e.campo === campo && e.status === "aprovado").sort((a, b) => b.revisado_em.localeCompare(a.revisado_em) || b.id - a.id)[0] || null;
  function editor() {
    return {
      meme: { id: "nyan-cat", titulo: "Nyan Cat", ano: 2011, categoria: "Memes", status: "publicado" },
      limites: { texto_min: 10, texto_max: 2000, fonte_max: 300 },
      campos: CAMPOS.map((campo) => { const a = atualDe(campo); const hist = st.edicoes.filter((e) => e.campo === campo).sort((x, y) => y.id - x.id); return { campo, atual_id: a ? a.id : null, atual: a, pendentes: hist.filter((e) => e.status === "pendente").length, historico: hist }; })
    };
  }
  async function instalar(ctx) {
    await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
    await ctx.route("**/api/**", async (route) => {
      const req = route.request(), u = new URL(req.url()), p = u.pathname, m = req.method(), q = u.searchParams;
      let corpo = null; try { corpo = req.postDataJSON(); } catch { /* sem corpo */ }
      st.log.push({ m, p, qs: u.search, csrf: req.headers()["x-csrf"], corpo });
      if (p === "/api/eu") return json(route, 200, { usuario: { id: 1, apelido: "Ana" }, papel: st.papel, csrf: "tok-csrf", moedas: 1, xp: 1 });
      if (p === "/api/envios/meus") return json(route, 200, { itens: [] });
      if (p === "/api/mod/fila" || p === "/api/mod/remocoes") return json(route, 200, { itens: [] });
      if (p === "/api/mod/arte/envios") return json(route, 200, { total: 0, itens: [] });
      if (p === "/api/mod/memepedia/memes" && m === "GET") {
        const b = (q.get("busca") || "").toLowerCase(), f = q.get("filtro") || "todos";
        let it = st.memes.filter((x) => !b || x.titulo.toLowerCase().includes(b) || x.id.includes(b));
        if (f === "sem") it = it.filter((x) => x.preenchidos === 0); else if (f === "incompletos") it = it.filter((x) => x.preenchidos > 0 && x.preenchidos < 6);
        else if (f === "completos") it = it.filter((x) => x.preenchidos === 6); else if (f === "pendentes") it = it.filter((x) => x.pendentes > 0);
        const todos = st.memes;
        return json(route, 200, { total: it.length, pagina: 1, limite: 30, campos: CAMPOS, itens: it, resumo: { memes: todos.length, sem_nenhum: todos.filter((x) => x.preenchidos === 0).length, incompletos: todos.filter((x) => x.preenchidos > 0 && x.preenchidos < 6).length, completos: todos.filter((x) => x.preenchidos === 6).length, campos_preenchidos: todos.reduce((a, x) => a + x.preenchidos, 0), campos_total: todos.length * 6, pendentes: todos.reduce((a, x) => a + x.pendentes, 0) } });
      }
      if (p === "/api/mod/memepedia/memes/nyan-cat" && m === "GET") return json(route, 200, editor());
      let x;
      if ((x = p.match(/^\/api\/mod\/memepedia\/memes\/nyan-cat\/campos\/(\w+)$/)) && m === "POST") {
        if (st.erroPublicar) return json(route, 422, { erro: st.erroPublicar });
        st.edicoes.push(ed(st.edicoes.length + 10, x[1], corpo.texto, "aprovado", { fonte: corpo.fonte || null, autor: "Ana", revisado_em: "2026-12-05T10:00:00Z" }));
        return json(route, 201, { ok: true, publicado: true, edicao_id: st.edicoes.length + 9 });
      }
      if ((x = p.match(/^\/api\/mod\/memepedia\/edicoes\/(\d+)\/decidir$/)) && m === "POST") {
        const e = st.edicoes.find((k) => String(k.id) === x[1]); if (!e || e.status !== "pendente") return json(route, 409, { erro: "essa edição já foi decidida" });
        e.status = corpo.status; e.revisado_em = "2026-12-05T10:00:00Z"; return json(route, 200, { ok: true });
      }
      if ((x = p.match(/^\/api\/mod\/memepedia\/edicoes\/(\d+)\/restaurar$/)) && m === "POST") {
        const e = st.edicoes.find((k) => String(k.id) === x[1]); st.edicoes.push({ ...e, id: st.edicoes.length + 10, status: "aprovado", revisado_em: "2026-12-05T10:00:00Z" }); return json(route, 201, { ok: true, edicao_id: 99, restaurado_de: e.id });
      }
      return json(route, 404, { erro: "não mockado: " + p });
    });
  }
  return { st, instalar, n: (re) => st.log.filter((l) => re.test(l.m + " " + l.p)) };
}

async function abrir(over = {}, { largura = 1280, tema = "light" } = {}) {
  const api = criarApi(over);
  const ctx = await browser.newContext({ viewport: { width: largura, height: largura < 500 ? 800 : 900 } });
  await api.instalar(ctx);
  await ctx.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* */ } }, tema);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + "/seppzone/#memepedia");
  await page.waitForSelector("#p-memepedia .mp .item");
  return { ctx, page, api, erros };
}
const abrirEditor = async (page) => { await page.click('#p-memepedia .item:has-text("Nyan Cat") button:has-text("Editar textos")'); await page.waitForSelector(".mp-campo"); };

test("moderador vê a aba Memepédia (não vê as de admin); lista com resumo de cobertura e indicador por campo", opts, async () => {
  const { ctx, page, erros } = await abrir();
  assert.deepStrictEqual(await page.$$eval('[role="tab"]', (n) => n.map((x) => x.textContent.trim())), ["Moderação", "Memepédia"]);
  const resumo = await page.textContent("#p-memepedia .mp-resumo");
  assert.match(resumo, /8 de 18 campos com texto aprovado \(44%\) em 3 memes/); assert.match(resumo, /1 sem nenhum texto/); assert.match(resumo, /1 com texto incompleto/); assert.match(resumo, /1 completos/); assert.match(resumo, /1 edições esperando moderação/);
  assert.match(await page.getAttribute("#p-memepedia .mp-resumo .mp-barra", "aria-label"), /Cobertura da Memepédia: 8 de 18 \(44%\)/);
  const nyan = await page.$eval('#p-memepedia .item:has-text("Nyan Cat")', (li) => ({ chips: [...li.querySelectorAll(".mp-campos .chip")].map((c) => [c.textContent, c.classList.contains("ok")]), n: li.querySelector(".item-h .chip:last-child").textContent }));
  assert.deepStrictEqual(nyan.chips.filter((c) => c[1]).map((c) => c[0]), ["✓ De onde surgiu", "✓ Por que viralizou"]);
  assert.strictEqual(nyan.chips.length, 6); assert.ok(nyan.chips.filter((c) => !c[1]).every((c) => c[0].startsWith("✕ ")), "ausente marcado também por símbolo");
  assert.match(await page.textContent('#p-memepedia .item:has-text("Nyan Cat")'), /2\/6/);
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined, "HTML do título não executa");
  assert.ok((await page.textContent("#p-memepedia .mp")).includes(XSS), "o título aparece como texto");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("filtros e busca chamam a API: sem texto, incompletos, completos, com pendentes e busca por título", opts, async () => {
  const { ctx, page, api } = await abrir();
  for (const [valor, esperado] of [["sem", 1], ["incompletos", 1], ["completos", 1], ["pendentes", 1], ["todos", 3]]) {
    await page.selectOption("#p-memepedia select", valor);
    await page.waitForFunction((n) => document.querySelectorAll("#p-memepedia .mp > ul.lista > li").length === n, esperado);
    assert.ok(api.n(/GET \/api\/mod\/memepedia\/memes/).some((l) => l.qs.includes("filtro=" + valor)), valor);
  }
  await page.fill("#p-memepedia input[type=search]", "nyan");
  await page.waitForFunction(() => document.querySelectorAll("#p-memepedia .mp > ul.lista > li").length === 1);
  assert.ok(api.n(/GET \/api\/mod\/memepedia\/memes/).some((l) => l.qs.includes("busca=nyan")));
  await ctx.close();
});

test("editor: 6 campos, texto atual, contagem de caracteres, publicar só com texto válido, POST com X-CSRF e fonte", opts, async () => {
  const { ctx, page, api, erros } = await abrir();
  await abrirEditor(page);
  assert.strictEqual(await page.$$eval(".mp-campo", (n) => n.length), 6);
  assert.strictEqual(await page.inputValue("#mp-t-origem"), "Segunda versão, a publicada agora.");
  assert.strictEqual(await page.inputValue("#mp-f-origem"), "https://exemplo.com/v2");
  assert.strictEqual(await page.inputValue("#mp-t-hoje"), "", "campo sem texto vem vazio");
  assert.match(await page.textContent("#mp-c-origem"), /\d+ \/ 2000 caracteres · mínimo 10/);
  assert.ok(await page.isDisabled('.mp-campo:has(#mp-t-origem) button:has-text("Publicar agora")'), "sem mudança: desabilitado");
  const bt = '.mp-campo:has(#mp-t-hoje) button:has-text("Publicar agora")';
  await page.fill("#mp-t-hoje", "curto");
  assert.ok(await page.isDisabled(bt)); assert.strictEqual(await page.getAttribute("#mp-t-hoje", "aria-invalid"), "true");
  await page.fill("#mp-t-hoje", "Texto novo com mais de dez caracteres.");
  assert.strictEqual(await page.getAttribute("#mp-t-hoje", "aria-invalid"), "false"); assert.ok(!(await page.isDisabled(bt)));
  assert.match(await page.textContent("#mp-c-hoje"), /^38 \/ 2000/);
  await page.fill("#mp-f-hoje", "javascript:alert(1)");
  assert.ok(await page.isDisabled(bt)); assert.match(await page.textContent("#mp-e-hoje"), /http ou https/);
  await page.fill("#mp-f-hoje", "https://exemplo.com/nova");
  await page.click(bt);
  await page.waitForFunction(() => /Texto publicado/.test(document.querySelector(".avisos").textContent));
  const post = api.n(/POST \/api\/mod\/memepedia\/memes\/nyan-cat\/campos\/hoje/)[0];
  assert.ok(post); assert.strictEqual(post.csrf, "tok-csrf"); assert.deepStrictEqual(post.corpo, { texto: "Texto novo com mais de dez caracteres.", fonte: "https://exemplo.com/nova" });
  assert.strictEqual(await page.inputValue("#mp-t-hoje"), "Texto novo com mais de dez caracteres.", "recarregou do servidor");
  assert.ok((await page.textContent('.mp-campo:has(#mp-t-hoje) .item-h')).includes("Publicado"));
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("editor: erro 422 da API aparece e o botão volta; limite de 2000 no campo", opts, async () => {
  const { ctx, page } = await abrir({ erroPublicar: "Escreva pelo menos 10 caracteres." });
  await abrirEditor(page);
  assert.strictEqual(await page.getAttribute("#mp-t-hoje", "maxlength"), "2000"); assert.strictEqual(await page.getAttribute("#mp-f-hoje", "maxlength"), "300");
  await page.fill("#mp-t-hoje", "Texto com tamanho suficiente ok");
  await page.click('.mp-campo:has(#mp-t-hoje) button:has-text("Publicar agora")');
  await page.waitForFunction(() => /pelo menos 10/.test(document.querySelector("#mp-e-hoje").textContent));
  assert.ok(!(await page.isDisabled('.mp-campo:has(#mp-t-hoje) button:has-text("Publicar agora")')));
  await ctx.close();
});

test("pendentes dentro do editor: aprovar e recusar com um clique (X-CSRF), texto com HTML escapado", opts, async () => {
  const { ctx, page, api, erros } = await abrir();
  await abrirEditor(page);
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined);
  const bloco = '.mp-campo:has(#mp-t-usos) .mp-pend';
  assert.ok((await page.textContent(bloco)).includes(XSS), "a sugestão com HTML aparece como texto");
  assert.match(await page.textContent('.mp-campo:has(#mp-t-usos) .item-h'), /1 pendente/);
  await page.click(bloco + ' button:has-text("Aprovar e publicar")');
  await page.waitForFunction(() => /aprovado e publicado/.test(document.querySelector(".avisos").textContent));
  const post = api.n(/POST \/api\/mod\/memepedia\/edicoes\/5\/decidir/)[0];
  assert.ok(post); assert.strictEqual(post.csrf, "tok-csrf"); assert.deepStrictEqual(post.corpo, { status: "aprovado" });
  assert.strictEqual(await page.$$eval(".mp-pend", (n) => n.length), 0, "saiu da fila");
  assert.ok((await page.inputValue("#mp-t-usos")).includes("sugestão com html"), "virou o texto publicado");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("pendente: recusar chama decidir com recusado; conflito 409 recarrega o editor", opts, async () => {
  const { ctx, page, api } = await abrir();
  await abrirEditor(page);
  api.st.edicoes.find((e) => e.id === 5).status = "aprovado"; // outra pessoa decidiu antes
  api.st.edicoes.find((e) => e.id === 5).revisado_em = "2026-12-05T08:00:00Z";
  await page.click('.mp-campo:has(#mp-t-usos) .mp-pend button:has-text("Recusar")');
  await page.waitForFunction(() => /já foi decidida/.test(document.querySelector(".avisos").textContent));
  assert.deepStrictEqual(api.n(/decidir/)[0].corpo, { status: "recusado" });
  await page.waitForFunction(() => document.querySelectorAll(".mp-pend").length === 0);
  await ctx.close();
});

test("histórico: lista aprovadas, recusadas e pendentes com autor e data; restaurar pede confirmação e não restaura a atual", opts, async () => {
  const { ctx, page, api, erros } = await abrir();
  await abrirEditor(page);
  const bloco = ".mp-campo:has(#mp-t-origem)";
  assert.match(await page.textContent(bloco + " summary"), /Histórico \(3\)/);
  await page.click(bloco + " summary");
  const itens = await page.$$eval(bloco + " .mp-hist li.item", (n) => n.map((li) => ({ t: li.textContent, atual: li.classList.contains("mp-atual"), restaurar: !!([...li.querySelectorAll("button")].find((b) => /Restaurar/.test(b.textContent))) })));
  assert.strictEqual(itens.length, 3);
  const atual = itens.find((i) => i.atual); assert.ok(/Publicada agora/.test(atual.t) && /Segunda versão/.test(atual.t)); assert.strictEqual(atual.restaurar, false, "a publicada não restaura");
  assert.ok(itens.some((i) => /Recusada/.test(i.t) && i.restaurar)); assert.ok(itens.some((i) => /Bia/.test(i.t) && /Aprovada/.test(i.t) && i.restaurar));
  await page.click(bloco + ' li:has-text("Primeira versão") button:has-text("Restaurar esta versão")');
  await page.waitForSelector("dialog[open]");
  assert.match(await page.textContent("dialog[open]"), /histórico continua inteiro/);
  await page.click('dialog[open] button:has-text("Cancelar")');
  assert.strictEqual(api.n(/restaurar/).length, 0, "cancelar não restaura");
  await page.click(bloco + ' li:has-text("Primeira versão") button:has-text("Restaurar esta versão")');
  await page.click('dialog[open] button:has-text("Restaurar")');
  await page.waitForFunction(() => /Versão restaurada/.test(document.querySelector(".avisos").textContent));
  const post = api.n(/POST \/api\/mod\/memepedia\/edicoes\/1\/restaurar/)[0];
  assert.ok(post); assert.strictEqual(post.csrf, "tok-csrf");
  assert.strictEqual(await page.inputValue("#mp-t-origem"), "Primeira versão do texto da origem.", "a restaurada é a publicada");
  assert.ok(await page.$eval(bloco + " details", (d) => d.open), "o histórico continua aberto depois de recarregar");
  assert.match(await page.textContent(bloco + " summary"), /Histórico \(4\)/, "nada foi apagado");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("rascunho: 'Editar a partir desta' preenche o editor; voltar com texto não publicado pede confirmação", opts, async () => {
  const { ctx, page } = await abrir();
  await abrirEditor(page);
  await page.click(".mp-campo:has(#mp-t-origem) summary");
  await page.click('.mp-campo:has(#mp-t-origem) li:has-text("Primeira versão") button:has-text("Editar a partir desta")');
  assert.strictEqual(await page.inputValue("#mp-t-origem"), "Primeira versão do texto da origem.");
  assert.ok(!(await page.isDisabled('.mp-campo:has(#mp-t-origem) button:has-text("Publicar agora")')));
  await page.click('button:has-text("← Voltar à lista")');
  await page.waitForSelector("dialog[open]"); assert.match(await page.textContent("dialog[open]"), /Descartar/);
  await page.click('dialog[open] button:has-text("Cancelar")');
  assert.ok(await page.isVisible(".mp-campo"), "continua no editor");
  await page.click('button:has-text("← Voltar à lista")'); await page.click('dialog[open] button:has-text("Descartar")');
  await page.waitForSelector("#p-memepedia .mp .item");
  await ctx.close();
});

for (const [w, tema] of [[390, "light"], [390, "dark"], [1280, "light"], [1280, "dark"]]) {
  test(`layout ${w}px ${tema}: lista e editor sem rolagem lateral, alvos >= 44px, textos >= 12px, contraste >= 4,5:1`, opts, async () => {
    const { ctx, page, erros } = await abrir({}, { largura: w, tema });
    const medir = () => page.evaluate(() => {
      const sw = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const raiz = document.querySelector("#p-memepedia");
      const peq = [...raiz.querySelectorAll("button, input, select, textarea, summary, a.b")].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 43.5).map((e) => (e.id || e.className || e.tagName) + ":" + Math.round(e.getBoundingClientRect().height));
      const fontes = [...raiz.querySelectorAll("*")].filter((e) => e.offsetParent && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => [e.className || e.tagName, parseFloat(getComputedStyle(e).fontSize)]).filter((x) => x[1] < 12);
      const p = (s) => { const v = /rgba?\(([^)]+)\)/.exec(s)[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] === undefined ? 1 : v[3] }; };
      const L = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const fundo = (e) => { for (let n = e; n; n = n.parentElement) { const c = p(getComputedStyle(n).backgroundColor); if (c.a > 0.9) return c; } return p(getComputedStyle(document.body).backgroundColor); };
      const contraste = [...raiz.querySelectorAll(".mp-cobertura, .mp-numeros li, .item h3, .meta span, .chip, .mp-cont, label, summary, .txt, .mini")].filter((e) => e.offsetParent && e.textContent.trim()).map((e) => { const a = L(p(getComputedStyle(e).color)), b = L(fundo(e)); return [e.className || e.tagName, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)]; }).filter((x) => x[1] < 4.5);
      return { sw, peq, fontes, contraste };
    });
    let r = await medir();
    assert.ok(r.sw <= 1, "lista: rolagem lateral " + r.sw); assert.deepStrictEqual(r.peq, [], "lista: alvos pequenos " + r.peq); assert.deepStrictEqual(r.fontes, []); assert.deepStrictEqual(r.contraste, [], "lista: " + JSON.stringify(r.contraste));
    await abrirEditor(page); await page.click(".mp-campo:has(#mp-t-origem) summary");
    r = await medir();
    assert.ok(r.sw <= 1, "editor: rolagem lateral " + r.sw); assert.deepStrictEqual(r.peq, [], "editor: alvos pequenos " + r.peq); assert.deepStrictEqual(r.fontes, []); assert.deepStrictEqual(r.contraste, [], "editor: " + JSON.stringify(r.contraste));
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}
