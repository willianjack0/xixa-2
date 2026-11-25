// Tela de admin (seppzone/index.html): acesso por papel, abas, CSRF, confirmações, erros 403/422, XSS, mobile e contraste.
// API mockada via page.route. Roda com arquivo explícito: node --test tests/front-admin.test.js
// Precisa do Playwright; sem ele os testes são pulados. PLAYWRIGHT_MODULE=/caminho/node_modules/playwright, CHROMIUM_PATH=/caminho/chrome
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
const futuro = (h) => new Date(Date.now() + h * 36e5).toISOString();

function dadosIniciais() {
  return {
    usuarios: [
      { id: 1, apelido: "Ana", papel: "admin", xp: 200, moedas: 10, banido: false, criado_em: "2026-01-01T10:00:00Z", ultimo_acesso: "2026-11-20T10:00:00Z" },
      { id: 2, apelido: "Bruno", papel: "usuario", xp: 50, moedas: 3, banido: false, criado_em: "2026-02-01T10:00:00Z", ultimo_acesso: null },
      { id: 3, apelido: XSS, papel: "usuario", xp: 5, moedas: 0, banido: false, criado_em: "2026-03-01T10:00:00Z", ultimo_acesso: null },
      { id: 4, apelido: "Chefe", papel: "admin", xp: 900, moedas: 0, banido: false, criado_em: "2026-03-01T10:00:00Z", ultimo_acesso: null }
    ],
    memes: [
      { id: "nyan-cat", titulo: "Nyan Cat", ano: 2011, data: "2011-04-02", categoria: "Memes", tipo: "video", raridade: "Raro", emoji: "🐱", descricao: "Gato", autor: "prguitarman", duracao: 180, youtube_id: "QH2-TGUlwu4", adicionado_em: "2026-01-01", status: "publicado" },
      { id: "xss-meme", titulo: XSS, ano: 2012, data: null, categoria: "Memes", tipo: "foto", raridade: "Comum", emoji: null, descricao: null, autor: null, duracao: null, youtube_id: null, adicionado_em: "2026-01-01", status: "oculto" }
    ],
    fila: [{ id: 10, titulo: "Meme novo", ano: 2020, categoria: "Memes", url: "https://exemplo.com/x", descricao: XSS, criado_em: "2026-11-20T10:00:00Z", autor: "Carla", meu_voto: null, votos: 1 }],
    remocoes: [
      { id: 1, meme_id: "nyan-cat", meme_titulo: "Nyan Cat", solicitante: "Dono", motivo: "É meu", contato: "d@x.com", status: "aberta", prazo_em: futuro(10), criado_em: "2026-11-24T10:00:00Z", respondido_em: null, atrasada: false },
      { id: 2, meme_id: "velho", meme_titulo: "Velho", solicitante: "Outro", motivo: "Tarde", contato: "o@x.com", status: "aberta", prazo_em: futuro(-5), criado_em: "2026-11-20T10:00:00Z", respondido_em: null, atrasada: true }
    ]
  };
}

/** API falsa. st.papel: null = 401. Guarda cada chamada em st.log com método, caminho, csrf e corpo. */
function criarApi(over = {}) {
  const st = { papel: "admin", modAusente: false, log: [], ...dadosIniciais(), ...over };
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  async function instalar(ctx) {
    await ctx.route((url) => url.hostname !== "127.0.0.1", (r) => r.abort());
    await ctx.route("**/api/**", async (route) => {
      const req = route.request(), u = new URL(req.url()), p = u.pathname, m = req.method(), q = u.searchParams;
      let corpo = null; try { corpo = req.postDataJSON(); } catch { /* sem corpo */ }
      st.log.push({ m, p, csrf: req.headers()["x-csrf"], ct: req.headers()["content-type"], corpo });
      if (p === "/api/eu") return st.papel ? json(route, 200, { usuario: { id: 1, apelido: "Ana" }, papel: st.papel, csrf: "tok-csrf", moedas: 1, xp: 1 }) : json(route, 401, { erro: "não autenticado" });
      if (st.expirou && p !== "/api/eu") return json(route, 401, { erro: "sessão expirada" });
      if (p === "/api/categorias") return json(route, 200, { itens: [{ nome: "Memes" }, { nome: "Música" }] });
      if (p === "/api/eras") return json(route, 200, { itens: [{ ano: 2000, ano_fim: 2005, rotulo: "Discado", lema: "Lema", texto: "Texto da era" }] });
      if (p === "/api/mod/fila") return st.modAusente ? json(route, 404, { erro: "não existe" }) : json(route, 200, { itens: st.fila });
      if (p === "/api/mod/remocoes" && m === "GET") return st.modAusente ? json(route, 404, { erro: "não existe" }) : json(route, 200, { itens: st.remocoes });
      let x;
      if ((x = p.match(/^\/api\/mod\/fila\/(\d+)\/voto$/))) { st.fila = []; return json(route, 200, { ok: true, decidido: "aprovado", por: "consenso", meme_id: "meme-novo", votos: 2 }); }
      if ((x = p.match(/^\/api\/mod\/remocoes\/(\d+)$/))) { st.remocoes = st.remocoes.filter((r) => String(r.id) !== x[1]); return json(route, 200, { ok: true }); }
      if (p === "/api/admin/usuarios") { let it = st.usuarios; if (q.get("busca")) it = it.filter((a) => a.apelido.toLowerCase().includes(q.get("busca").toLowerCase())); return json(route, 200, { items: it, proximo: null }); }
      if ((x = p.match(/^\/api\/admin\/usuarios\/(\d+)\/papel$/))) { if (x[1] === "4") return json(route, 403, { erro: "só o token de emergência altera outro admin" }); const u2 = st.usuarios.find((a) => String(a.id) === x[1]); u2.papel = corpo.papel; return json(route, 200, { ok: true, usuario: u2 }); }
      if ((x = p.match(/^\/api\/admin\/usuarios\/(\d+)\/banir$/))) { const u2 = st.usuarios.find((a) => String(a.id) === x[1]); u2.banido = corpo.banido; return json(route, 200, { ok: true, usuario: u2 }); }
      if (p === "/api/admin/log") return json(route, 200, { items: [{ id: 9, usuario_id: 1, apelido: "Ana", acao: "meme.editar", alvo: "memes:nyan-cat", detalhe: { campos: { titulo: { de: "Antigo", para: "Novo" } } }, criado_em: "2026-11-20T10:00:00Z" }], proximo: null });
      if (p === "/api/admin/memes" && m === "GET") { const s = q.get("status"); const it = st.memes.filter((a) => !s || a.status === s); return json(route, 200, { total: it.length, itens: it }); }
      if (p === "/api/admin/memes" && m === "POST") { if (!/^[a-z0-9-]+$/.test(corpo.id || "")) return json(route, 422, { erro: "campos inválidos", campos: { id: "slug a-z, 0-9 e hífen, até 80" }, desconhecidos: [] }); return json(route, 201, { ok: true, meme: { ...corpo, status: "publicado" } }); }
      if ((x = p.match(/^\/api\/admin\/memes\/([a-z0-9-]+)$/))) { const a = st.memes.find((k) => k.id === x[1]); if (m === "GET") return json(route, 200, { ...a, midias: [{ id: 1, tipo: "imagem", caminho: "memes/nyan.jpg", origem_url: null, credito_por: "Fulano", credito_url: null, largura: 10, altura: 20 }] }); Object.assign(a, corpo); return json(route, 200, { ok: true, meme: a }); }
      if (p === "/api/admin/colecoes" && m === "GET") return json(route, 200, { itens: [{ id: "c1", nome: "Clássicos", icone: "★", cor: "#25aae3", cores_fundo: ["#000"], sobre: "Sobre", ordem: 1, cartas: 1 }] });
      if (p === "/api/admin/cartas" && m === "GET") return json(route, 200, { itens: [{ id: "c1-01", colecao_id: "c1", numero: 1, nome: "Carta Um", emoji: "🐱", raridade: "Raro", meme_id: null }] });
      if (p === "/api/admin/links") return json(route, 200, { items: [{ id: 5, meme_id: "nyan-cat", yt: "QH2-TGUlwu4", autor: "Zé", status: "pendente", criado_em: "2026-11-20T10:00:00Z" }] });
      if (p === "/api/admin/feedback") return json(route, 200, { items: [{ id: 6, tipo: "bug", msg: XSS, contato: null, pagina: "/index.html", criado_em: "2026-11-20T10:00:00Z" }] });
      if (p === "/api/admin/comentarios") return json(route, 200, { items: [] });
      if (p === "/api/admin/contribuidores") return json(route, 200, { items: [{ id: 7, nome: "Dani", nick: "dani", discord: "dani#1", areas: ["Código"], area_outros: null, horas_semana: 4, experiencia: "pouca", ferramentas: "git", mensagem: null, criado_em: "2026-11-20T10:00:00Z" }] });
      if ((x = p.match(/^\/api\/admin\/feedback\/(\d+)$/)) && m === "DELETE") return json(route, 200, { ok: true });
      return json(route, 404, { erro: "não mockado: " + p });
    });
  }
  return { st, instalar, n: (re) => st.log.filter((l) => re.test(l.m + " " + l.p)).length };
}

async function abrir(over = {}, { largura = 1280, tema, hash = "" } = {}) {
  const api = criarApi(over);
  const ctx = await browser.newContext({ viewport: { width: largura, height: largura < 500 ? 800 : 900 } });
  await api.instalar(ctx);
  if (tema) await ctx.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* */ } }, tema);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + "/seppzone/" + hash);
  return { ctx, page, api, erros };
}
const abas = (page) => page.$$eval('[role="tab"]', (n) => n.map((x) => x.textContent.trim()));
const irPara = async (page, nome) => { await page.click(`[role="tab"]:has-text("${nome}")`); };

test("sem sessão (401): pede para entrar, com link de volta para /seppzone/, sem abas", opts, async () => {
  const { ctx, page, api, erros } = await abrir({ papel: null });
  await page.waitForSelector("text=Entre para acessar");
  assert.strictEqual(await page.getAttribute("#app a.b", "href"), "/entrar.html?voltar=/seppzone/");
  assert.deepStrictEqual(await abas(page), []);
  assert.strictEqual(api.n(/\/api\/admin|\/api\/mod/), 0);
  assert.strictEqual(await page.$("text=Tela de exemplo"), null, "sem banner de exemplo");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("papel usuário: acesso negado e nenhuma chamada além de /api/eu", opts, async () => {
  const { ctx, page, api } = await abrir({ papel: "usuario" });
  await page.waitForSelector("text=Acesso negado");
  assert.deepStrictEqual(api.st.log.map((l) => l.p), ["/api/eu"]);
  assert.deepStrictEqual(await abas(page), []);
  await ctx.close();
});

test("moderador: só a aba Moderação; fila ausente (404) vira aviso, sem quebrar e sem chamar /api/admin", opts, async () => {
  const { ctx, page, api, erros } = await abrir({ papel: "moderador", modAusente: true });
  await page.waitForSelector("text=ainda não está disponível");
  assert.deepStrictEqual(await abas(page), ["Moderação"]);
  assert.strictEqual(api.n(/\/api\/admin/), 0);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("admin: todas as abas, visão geral só com números das rotas, sem Ver como/Reiniciar/banner", opts, async () => {
  const { ctx, page, erros } = await abrir();
  await page.waitForSelector("#p-visao .num");
  assert.deepStrictEqual(await abas(page), ["Visão geral", "Moderação", "Usuários", "Memes", "Cartas e coleções", "Eras", "Comunidade", "Log"]);
  await page.waitForFunction(() => [...document.querySelectorAll("#p-visao .num")].every((n) => n.textContent !== "…"));
  const nums = await page.$$eval("#p-visao .card", (c) => c.map((x) => x.querySelector("h2").textContent + "=" + x.querySelector(".num").textContent));
  assert.deepStrictEqual(nums, ["Memes=1", "Moderação=1", "Remoções=2", "Links sugeridos=1", "Feedback=1"]);
  const corpo = await page.textContent("body");
  for (const proibido of ["Ver como", "Reiniciar exemplo", "Tela de exemplo"]) assert.ok(!corpo.includes(proibido), proibido);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("usuários: nome com HTML vira texto (sem XSS), papel e ban mandam X-CSRF, 403 mostra a mensagem do servidor", opts, async () => {
  const { ctx, page, api, erros } = await abrir();
  await irPara(page, "Usuários");
  await page.waitForSelector("#p-usuarios .item");
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined);
  assert.strictEqual(await page.$("#p-usuarios img"), null, "nada de <img> vindo da API");
  assert.ok((await page.textContent("#p-usuarios")).includes(XSS));
  // a própria conta não tem controles
  assert.match(await page.textContent("#p-usuarios .item:first-child"), /não dá para alterá-la/);
  // muda o papel de Bruno
  await page.selectOption('select[aria-label="Papel de Bruno"]', "moderador");
  await page.click('dialog button:has-text("Mudar papel")');
  await page.waitForSelector("#av-ok .aviso");
  const post = api.st.log.find((l) => l.p === "/api/admin/usuarios/2/papel");
  assert.strictEqual(post.csrf, "tok-csrf"); assert.match(post.ct, /application\/json/); assert.deepStrictEqual(post.corpo, { papel: "moderador" });
  // 403 em outro admin
  await page.selectOption('select[aria-label="Papel de Chefe"]', "usuario");
  await page.click('dialog button:has-text("Mudar papel")');
  await page.waitForSelector("#av-erro .aviso");
  assert.match(await page.textContent("#av-erro"), /só o token de emergência altera outro admin/);
  assert.strictEqual(await page.inputValue('select[aria-label="Papel de Chefe"]'), "admin", "volta ao papel anterior");
  // banir com motivo
  await page.click('.item:has-text("Bruno") button:has-text("Banir")');
  await page.fill("dialog textarea", "spam");
  await page.click('dialog button:has-text("Banir")');
  await page.waitForSelector('.item:has-text("Bruno") button:has-text("Desbanir")');
  assert.deepStrictEqual(api.st.log.find((l) => l.p === "/api/admin/usuarios/2/banir").corpo, { banido: true, motivo: "spam" });
  // cancelar não chama a API
  const antes = api.n(/POST/);
  await page.click('.item:has-text("Bruno") button:has-text("Desbanir")');
  await page.click('dialog button:has-text("Cancelar")');
  assert.strictEqual(api.n(/POST/), antes);
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("moderação: voto manda CSRF e mostra o resultado; remoção atrasada em destaque, contagem e confirmação", opts, async () => {
  const { ctx, page, api, erros } = await abrir({}, { hash: "#moderacao" });
  await page.waitForSelector("#p-moderacao .item");
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined);
  const prazos = await page.$$eval("#p-moderacao .cd", (n) => n.map((x) => x.textContent));
  assert.ok(prazos.some((t) => /Prazo de 72 h: faltam \d+ h \d\d min/.test(t)), prazos.join("|"));
  assert.ok(prazos.some((t) => /atrasada há/.test(t)));
  assert.strictEqual(await page.$$eval("#p-moderacao .item.atrasada", (n) => n.length), 1);
  assert.match(await page.textContent("#p-moderacao .item.atrasada"), /Velho/);
  // voto
  await page.fill("#p-moderacao textarea", "ok");
  await page.click('#p-moderacao button:has-text("Aprovar")');
  await page.waitForSelector("#av-ok .aviso");
  assert.match(await page.textContent("#av-ok"), /Decidido: aprovado.*Meme criado: meme-novo/);
  const v = api.st.log.find((l) => /voto$/.test(l.p));
  assert.strictEqual(v.csrf, "tok-csrf"); assert.deepStrictEqual(v.corpo, { voto: "aprovado", motivo: "ok" });
  await page.waitForSelector("text=Nenhum envio esperando votos");
  // atender remoção pede confirmação
  await page.click('#p-moderacao .item:has-text("Nyan Cat") button:has-text("Atender")');
  assert.match(await page.textContent("dialog"), /sai do site/);
  await page.click('dialog button:has-text("Atender e tirar")');
  await page.waitForFunction(() => !document.body.textContent.includes("É meu"));
  assert.deepStrictEqual(api.st.log.find((l) => /remocoes\/1$/.test(l.p) && l.m === "POST").corpo, { decisao: "atendida" });
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("memes: meme com HTML no título é texto; criar com slug inválido mostra o erro junto do campo; editar manda só o que mudou", opts, async () => {
  const { ctx, page, api, erros } = await abrir();
  await irPara(page, "Memes");
  await page.waitForSelector("#p-memes .item");
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined);
  await page.click('#p-memes button:has-text("Novo meme")');
  await page.fill('dialog input[id^="f-id-"]', "Slug Ruim");
  await page.fill('dialog input[id^="f-titulo-"]', "Teste");
  await page.fill('dialog input[id^="f-ano-"]', "2020");
  await page.click('dialog button:has-text("Criar meme")');
  await page.waitForSelector('dialog .erro:not(:empty)');
  assert.match(await page.textContent('dialog [id^="f-id-"][id$="-e"]'), /slug/);
  assert.strictEqual(await page.getAttribute('dialog input[id^="f-id-"]', "aria-invalid"), "true");
  await page.fill('dialog input[id^="f-id-"]', "slug-bom");
  await page.click('dialog button:has-text("Criar meme")');
  await page.waitForSelector("#av-ok .aviso");
  assert.strictEqual(api.st.log.filter((l) => l.m === "POST" && l.p === "/api/admin/memes").length, 2);
  // editar só o título
  await page.click('#p-memes .item:has-text("Nyan Cat") button:has-text("Editar")');
  await page.fill('dialog input[id^="f-titulo-"]', "Nyan Cat 2");
  await page.click('dialog button:has-text("Salvar meme")');
  await page.waitForSelector('#p-memes .item:has-text("Nyan Cat 2")');
  const pa = api.st.log.find((l) => l.m === "PATCH");
  assert.strictEqual(pa.csrf, "tok-csrf"); assert.deepStrictEqual(pa.corpo, { titulo: "Nyan Cat 2" });
  // ocultar pede confirmação e manda só o status
  await page.click('#p-memes .item:has-text("Nyan Cat 2") button:has-text("Ocultar")');
  await page.click('dialog button:has-text("Ocultar")');
  await page.waitForSelector('#p-memes .item:has-text("Nyan Cat 2"):has-text("Oculto")');
  assert.deepStrictEqual(api.st.log.filter((l) => l.m === "PATCH").pop().corpo, { status: "oculto" });
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("log mostra de/para legível; comunidade exclui feedback com confirmação e lista vazia mostra estado vazio", opts, async () => {
  const { ctx, page, api, erros } = await abrir();
  await irPara(page, "Log");
  await page.waitForSelector("#p-log .item");
  const t = await page.textContent("#p-log .item");
  assert.match(t, /meme\.editar/); assert.match(t, /titulo: Antigo → Novo/);
  await irPara(page, "Comunidade");
  await page.click('#p-comunidade button:has-text("Feedback")');
  await page.waitForSelector("#p-comunidade .item");
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined);
  await page.click('#p-comunidade button:has-text("Excluir")');
  await page.click('dialog button:has-text("Excluir")');
  await page.waitForSelector("text=Nenhum feedback recebido ainda");
  assert.strictEqual(api.st.log.find((l) => l.m === "DELETE").csrf, "tok-csrf");
  await page.click('#p-comunidade button:has-text("Comentários")');
  await page.waitForSelector("text=Nenhum comentário ainda");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("cartas, coleções e eras carregam e abrem o formulário de edição", opts, async () => {
  const { ctx, page, erros } = await abrir();
  await irPara(page, "Cartas e coleções");
  await page.waitForSelector("#p-cartas .item");
  assert.match(await page.textContent("#p-cartas"), /Carta Um/);
  await page.click('#p-cartas button:has-text("Nova carta")');
  assert.ok(await page.$('dialog select option[value="Mítico"]'));
  assert.strictEqual(await page.$('dialog select option[value="Clássico"]'), null, "carta não tem Clássico");
  await page.click('dialog button:has-text("Cancelar")');
  await irPara(page, "Eras");
  await page.waitForSelector("#p-eras .item");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("sessão que expira no meio (401) leva à tela de entrar", opts, async () => {
  const { ctx, page, api } = await abrir();
  await irPara(page, "Usuários"); await page.waitForSelector("#p-usuarios .item");
  api.st.expirou = true;
  await irPara(page, "Log");
  await page.waitForSelector("text=Sua sessão expirou");
  assert.deepStrictEqual(await abas(page), []);
  await ctx.close();
});

test("celular 390px: sem rolagem horizontal, fonte >= 12px e alvos >= 44px em todas as abas", opts, async () => {
  const { ctx, page, erros } = await abrir({}, { largura: 390 });
  for (const nome of ["Visão geral", "Moderação", "Usuários", "Memes", "Cartas e coleções", "Eras", "Comunidade", "Log"]) {
    await irPara(page, nome);
    await page.waitForTimeout(300);
    await page.waitForFunction(() => !document.querySelector(".spin"));
    const r = await page.evaluate(() => {
      const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
      const pequenos = [...document.querySelectorAll("button, a.b, select, input:not([type=checkbox])")].filter(vis).filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => e.tagName + ":" + (e.textContent || e.id).trim().slice(0, 20));
      const fontes = [...document.querySelectorAll("#app *")].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.tagName + ":" + e.textContent.trim().slice(0, 20));
      return { sobra: document.documentElement.scrollWidth - innerWidth, pequenos, fontes };
    });
    assert.ok(r.sobra <= 0, nome + ": rolagem horizontal " + r.sobra);
    assert.deepStrictEqual(r.pequenos, [], nome + ": alvos pequenos");
    assert.deepStrictEqual(r.fontes, [], nome + ": fonte < 12px");
  }
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

for (const tema of ["light", "dark"]) {
  test(`contraste >= 4,5:1 no tema ${tema} (texto, chips e botões em Moderação e Usuários)`, opts, async () => {
    const { ctx, page } = await abrir({}, { tema, hash: "#moderacao" });
    const medir = () => page.evaluate(() => {
      const rgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
      const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const fundo = (e) => { for (let n = e; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && c.a > 0.95) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
      const ruins = [];
      for (const e of document.querySelectorAll("#app *, header *")) {
        if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const b = e.getBoundingClientRect(); if (!b.width || !b.height || e.disabled) continue;
        const fg = rgb(getComputedStyle(e).color), bg = fundo(e); if (!fg || !bg) continue;
        const L1 = lum(fg), L2 = lum(bg), c = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        if (c < 4.5) ruins.push(e.tagName + "." + e.className + " '" + e.textContent.trim().slice(0, 20) + "' " + c.toFixed(2));
      }
      return ruins;
    });
    await page.waitForSelector("#p-moderacao .item");
    assert.deepStrictEqual(await medir(), [], "moderação");
    await irPara(page, "Usuários"); await page.waitForSelector("#p-usuarios .item");
    assert.deepStrictEqual(await medir(), [], "usuários");
    await ctx.close();
  });
}
