// Página temporária enviar-arte.html e o botão "Enviar arte de carta" do rodapé.
// Parte 1 (sempre roda, sem navegador): regras puras do arquivo, versão ?v= coerente, rodapé, textos sem innerHTML, CSS (fontes >= 12 px).
// Parte 2 (precisa do Playwright; sem ele é pulada): lista de cartas, busca, escolha, validação do arquivo, envio com X-CSRF,
// 44 px de toque, sem rolagem lateral, tema escuro. Roda com arquivo explícito: node --test tests/front-enviar-arte.test.js
// Se o Playwright estiver fora do projeto: PLAYWRIGHT_MODULE=/caminho/node_modules/playwright · CHROMIUM_PATH=/caminho/chrome
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const RAIZ = path.join(__dirname, "..");
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

// ---------------------------------------------------------------- parte 1: sem navegador
const { validarArquivo, mensagemDeErro, LIMITES } = require(path.join(RAIZ, "enviar-arte.js"));

test("validarArquivo: tipo, peso, dimensões mínimas e proporção (mesmas regras do servidor)", () => {
  const ok = { tipo: "image/png", bytes: 200000, largura: 600, altura: 800 };
  assert.strictEqual(validarArquivo(ok), "");
  assert.strictEqual(validarArquivo({ ...ok, tipo: "image/webp" }), "");
  assert.strictEqual(validarArquivo({ ...ok, largura: 400, altura: 400 }), "", "400 px é o mínimo");
  for (const tipo of ["image/svg+xml", "image/gif", "text/html", "application/pdf", "", undefined]) assert.match(validarArquivo({ ...ok, tipo }), /PNG, JPEG ou WebP/, String(tipo));
  assert.match(validarArquivo({ ...ok, bytes: 0 }), /vazio/);
  assert.match(validarArquivo({ ...ok, bytes: LIMITES.maxBytes + 1 }), /5 MB/);
  assert.strictEqual(validarArquivo({ ...ok, bytes: LIMITES.maxBytes }), "");
  assert.match(validarArquivo({ ...ok, largura: 399, altura: 800 }), /pequena demais/);
  assert.match(validarArquivo({ ...ok, largura: 800, altura: 399 }), /pequena demais/);
  assert.match(validarArquivo({ ...ok, largura: 2400, altura: 600 }), /Proporção/);
  assert.match(validarArquivo({ ...ok, largura: 600, altura: 1400 }), /Proporção/);
  assert.match(validarArquivo({ ...ok, largura: 0, altura: 0 }), /dimensões/);
  assert.match(validarArquivo(null), /PNG, JPEG ou WebP/);
});

test("mensagemDeErro: usa o texto da API e traduz falhas de rede e de serviço", () => {
  assert.match(mensagemDeErro({ status: 0 }), /Sem conexão/);
  assert.match(mensagemDeErro({ status: 413 }), /5 MB/);
  assert.match(mensagemDeErro({ status: 503 }), /indisponível/);
  assert.strictEqual(mensagemDeErro({ status: 422, erro: "imagem pequena demais" }), "imagem pequena demais");
  assert.match(mensagemDeErro(undefined), /Tente de novo/);
});

test("rodapé: botão 'Enviar arte de carta' leva a enviar-arte.html, com CSS de 44 px", () => {
  const c = ler("common.js");
  assert.match(c, /socialHTML\(`<a class="ft-arte" href="enviar-arte\.html">\$\{icon\("photo"\)\}Enviar arte de carta<\/a>`\)/); // na mesma fileira dos ícones sociais: não aumenta a altura do rodapé
  assert.ok(fs.existsSync(path.join(RAIZ, "enviar-arte.html")));
  const css = ler("theme.css");
  assert.match(css, /\.ft-legal \.ft-arte\{[^}]*min-height:44px/);
  assert.match(css, /\.ft-legal \.ft-arte:focus-visible/);
});

test("cache-bust: todas as páginas usam o mesmo ?v= nos arquivos compartilhados (theme.css, common.js, cliente-economia.js)", () => {
  const paginas = fs.readdirSync(RAIZ).filter((f) => f.endsWith(".html")).concat(["seppzone/index.html"]);
  const vs = {};
  for (const f of paginas) {
    for (const m of ler(f).matchAll(/(theme\.css|common\.js|cliente-economia\.js)\?v=([A-Za-z0-9]+)/g)) (vs[m[1]] ||= new Set()).add(m[2]);
  }
  for (const [arq, set] of Object.entries(vs)) assert.strictEqual(set.size, 1, `${arq} com versões diferentes: ${[...set].join(", ")}`);
  const html = ler("enviar-arte.html");
  for (const a of ["theme.css", "enviar-arte.css", "enviar-arte.js", "common.js", "cliente-economia.js"]) assert.match(html, new RegExp(a.replace(".", "\\.") + "\\?v=" + [...vs["theme.css"]][0]), a);
});

test("página: noindex, idioma, rótulos ligados aos campos, só imagem png/jpeg/webp no input, sem SVG aceito", () => {
  const h = ler("enviar-arte.html");
  assert.match(h, /<html lang="pt-BR">/);
  assert.match(h, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(h, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  for (const m of h.matchAll(/<label for="([^"]+)"/g)) assert.match(h, new RegExp(`id="${m[1]}"`), "label sem campo: " + m[1]);
  assert.match(h, /id="arquivo" type="file" accept="image\/png,image\/jpeg,image\/webp"/);
  assert.ok(!/accept="[^"]*svg/.test(h));
  assert.match(h, /id="arqErro" role="alert"/);
  assert.match(h, /id="cartasEstado" role="status" aria-live="polite"/);
  assert.match(h, /<h1>Enviar arte de carta<\/h1>/);
  for (const t of ["600 × 800", "400 px", "5 MB", "Zona segura", "Carta no álbum", "Figurinha colada", "Carta no perfil", "Miniatura", "19% em cima e 19% embaixo", "8% de margem dos lados"]) assert.ok(h.includes(t), "guia sem: " + t);
  assert.ok(!/ on[a-z]+="/.test(h), "sem handlers inline");
});

test("zona segura: moldura desenhada pelo caso mais restritivo (quadro da arte ~1,2:1 no álbum e no perfil) e texto coerente", () => {
  const css = ler("enviar-arte.css"), h = ler("enviar-arte.html");
  assert.match(css, /\.ea-seg-z\{[^}]*inset:19% 8%/);
  assert.ok(!/inset:10%/.test(css), "sobrou a margem antiga de 10%");
  assert.doesNotMatch(h, /a 10% de cada borda/);
  // a carta do álbum e a do perfil têm o mesmo desenho: 3/4,1 com faixas de cima e do nome, arte flex:1
  assert.match(css, /\.ea-card\{[^}]*aspect-ratio:3\/4\.1/); assert.match(css, /\.ea-card \.art\{flex:1/);
  assert.match(css, /\.ea-card\.perfil \.art svg,\.ea-card\.perfil \.art img\{opacity:\.55\}/);
  assert.match(css, /\.ea-vaga\{[^}]*aspect-ratio:3\/4/); assert.match(css, /\.ea-mini\{[^}]*aspect-ratio:1\/1/);
  // confere com as folhas reais do site
  assert.match(ler("album.html"), /\.card\{[^}]*aspect-ratio:3\/4\.1/); assert.match(ler("perfil.css"), /\.pf-carta\{[^}]*aspect-ratio:3\/4\.1/);
  assert.match(ler("album.css"), /\.vaga\{[^}]*aspect-ratio:3\/4/); assert.match(ler("perfil.css"), /\.pf \.q\{[^}]*aspect-ratio:1\/1/);
  // a conta do texto: 3:4 dentro de 1,2:1 mostra 0,75/1,2 = 62,5% da altura => 18,75% de corte em cada ponta (~19%)
  assert.ok(Math.abs((1 - 0.75 / 1.2) / 2 - 0.19) < 0.005);
});

test("script: nada da API entra por innerHTML (nome de carta com HTML não vira código)", () => {
  const j = ler("enviar-arte.js");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(j));
  assert.match(j, /textContent/);
});

test("CSS da página: fontes >= 12 px, botões e campos com 44 px, só tokens do tema nas cores de texto/fundo da interface", () => {
  const css = ler("enviar-arte.css");
  for (const m of css.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 12 || /font(?:-size)?:[^;}]*?\d+px\/?/.test(m[0]) && Number(m[1]) >= 12, "fonte < 12px: " + m[0]);
  assert.match(css, /\.ea-btn\{[^}]*min-height:48px/);
  assert.match(css, /\.ea-campo input,\.ea-campo select\{min-height:44px/);
  assert.match(css, /\.ea-carta\{[^}]*min-height:64px/);
  assert.match(css, /\.ea-fim a\{[^}]*min-height:44px/);
  assert.match(css, /var\(--txt\)/); assert.match(css, /var\(--panel\)/);
});

test("cliente-economia: Blob vai como corpo binário com o próprio Content-Type; métodos de arte existem", () => {
  const c = ler("cliente-economia.js");
  assert.match(c, /corpo instanceof Blob/);
  assert.match(c, /arteEnviar: function \(cartaId, arquivo, o\) \{ return pedir\('POST', '\/api\/arte\/envios\?carta='/);
  for (const m of ["arteCartas", "arteMeus", "arteFila", "arteAprovar", "arteRejeitar"]) assert.match(c, new RegExp(m + ": function"));
});

test("seppzone: seção 'Artes de cartas' na moderação, com prévia, aprovar, rejeitar com motivo e versões novas", () => {
  const a = ler("seppzone/admin.js");
  assert.match(a, /h2", null, "Artes de cartas"/);
  assert.match(a, /\/api\/mod\/arte\/envios\?status=pendente/);
  assert.match(a, /\/aprovar/); assert.match(a, /\/rejeitar/);
  assert.match(a, /motivo: \{ rotulo: "Motivo \(3 a 300 caracteres\)"/);
  assert.ok(!/innerHTML/.test(a.slice(a.indexOf("async function carregarArtes"), a.indexOf("async function carregarMeusEnvios") > 0 ? a.indexOf("async function carregarMeusEnvios") : undefined)));
  const i = ler("seppzone/index.html");
  assert.match(i, /admin\.js\?v=6/); assert.match(i, /admin\.css\?v=5/);
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

/** PNG colorido válido w × h (sem biblioteca) */
function png(w, h) {
  const tab = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = tab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const bloco = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = 160; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco("IHDR", ihdr), bloco("IDAT", zlib.deflateSync(raw)), bloco("IEND", Buffer.alloc(0))]);
}

const GATO = { fur: 1, pat: 0, eye: 2, acc: 3, clo: 0, bg: 4 };
const PAT = { id: "discado", nome: "Discado", cor: "#9aa3b2", xp_minimo: 0 };
const CARTAS = [
  { id: "plataformas-1", colecao_id: "plataformas", colecao_nome: "Plataformas", numero: 1, nome: "Carta Um", emoji: "🎬", raridade: "Comum", pendentes: 0, meu_pendente: false },
  { id: "plataformas-2", colecao_id: "plataformas", colecao_nome: "Plataformas", numero: 2, nome: "<img src=x onerror=window.__xss=1>", emoji: "📺", raridade: "Raro", pendentes: 2, meu_pendente: false },
  { id: "musica-3", colecao_id: "musica", colecao_nome: "Música", numero: 3, nome: "Carta Três", emoji: "🎵", raridade: "Mítico", pendentes: 1, meu_pendente: true }
];

async function abrir({ w = 390, h = 844, tema = "light", cartas = CARTAS, envio = [201, { ok: true, id: 9, status: "pendente" }], cancelar = [200, { ok: true }], meus = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 700 });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  const log = [];
  let meusLista = meus || [{ id: 1, carta_id: "musica-3", carta_nome: "Carta Três", status: "rejeitado", motivo: "Fora da margem segura", criado_em: "2026-12-04T10:00:00Z", decidido_em: "2026-12-04T12:00:00Z" }];
  const json = (route, status, corpo) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  await ctx.route("**/api/**", async (route) => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname, m = req.method();
    log.push({ m, p, qs: u.search, tipo: req.headers()["content-type"] || null, csrf: req.headers()["x-csrf"] || null, bytes: req.postDataBuffer() ? req.postDataBuffer().length : 0 });
    if (p === "/api/eu") return json(route, 200, { usuario: { id: 1, apelido: "Ana", avatar_gato: GATO, avatar_url: null, usar_foto: false, cadastro_completo: true }, patente: PAT, proxima_patente: null, papel: "usuario", moedas: 10, xp: 200, csrf: "csrf-teste" });
    if (p === "/api/carteira") return json(route, 200, { usuario: { id: 1, apelido: "Ana" }, moedas: 10, xp: 200, patente: PAT, proxima_patente: null, pacotes: [], cartas: { distintas: 0, total: 0, repetidas: 0 } });
    if (p === "/api/album") return json(route, 200, { colecoes: [], total: 0, tenho: 0, colecoes_completas: 0 });
    if (p === "/api/visita") return json(route, 200, { dia: "2026-12-05", primeira_visita_do_dia: false, xp_ganho: 0, pacotes_ganhos: [], carteira: { xp: 200, moedas: 10 } });
    if (p === "/api/pacotes/tipos") return json(route, 200, { itens: [] });
    if (p === "/api/eventos") return json(route, 202, { ok: true });
    if (p === "/api/arte/cartas") {
      const b = (u.searchParams.get("busca") || "").toLowerCase(), c = u.searchParams.get("colecao_id");
      const l = cartas.filter((x) => (!b || x.nome.toLowerCase().includes(b)) && (!c || x.colecao_id === c));
      return json(route, 200, { total: l.length, pagina: 1, limite: 24, itens: l, colecoes: [{ id: "plataformas", nome: "Plataformas", sem_arte: 2 }, { id: "musica", nome: "Música", sem_arte: 1 }] });
    }
    if (/^\/api\/arte\/envios\/\d+$/.test(p) && m === "DELETE") { if (cancelar[0] === 200) meusLista = meusLista.filter((x) => x.id !== Number(p.split("/").pop())); return json(route, cancelar[0], cancelar[1]); }
    if (p === "/api/arte/meus") return json(route, 200, { itens: meusLista });
    if (p === "/api/arte/envios" && m === "POST") return json(route, envio[0], envio[1]);
    return json(route, 404, { erro: "não mockado" });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await page.addInitScript((t) => { try { localStorage.setItem("ns_theme", t); } catch (e) { /* sem storage */ } }, tema);
  await page.goto(base + "/enviar-arte.html");
  await page.waitForSelector("#cartas .ea-carta");
  return { ctx, page, log, erros };
}

test("guia, exemplos e lista de cartas sem arte; nome com HTML aparece como texto (sem XSS)", opts, async () => {
  const { ctx, page, erros } = await abrir();
  assert.strictEqual(await page.$$eval("#cartas .ea-carta", (n) => n.length), 3);
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined, "HTML do nome não executou");
  const nomes = await page.$$eval("#cartas .nm", (n) => n.map((x) => x.textContent));
  assert.ok(nomes.includes("<img src=x onerror=window.__xss=1>"));
  assert.strictEqual(await page.$$eval("#exemplos figure", (n) => n.length), 4);
  assert.ok(await page.isVisible("#segBox"));
  assert.match(await page.textContent("#cartasEstado"), /3 de 3 cartas sem arte/);
  const chips = await page.$$eval("#cartas .ea-chip", (n) => n.map((x) => x.textContent));
  assert.ok(chips.includes("2 artes esperando") && chips.includes("Você já enviou"));
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("busca e filtro de coleção refazem a lista pela API", opts, async () => {
  const { ctx, page, log } = await abrir();
  await page.fill("#busca", "Três");
  await page.waitForFunction(() => document.querySelectorAll("#cartas .ea-carta").length === 1);
  assert.ok(log.some((l) => l.p === "/api/arte/cartas" && /busca=Tr%C3%AAs/.test(l.qs)));
  await page.fill("#busca", "");
  await page.waitForFunction(() => document.querySelectorAll("#cartas .ea-carta").length === 3);
  await page.selectOption("#colecao", "plataformas");
  await page.waitForFunction(() => document.querySelectorAll("#cartas .ea-carta").length === 2);
  assert.ok(log.some((l) => /colecao_id=plataformas/.test(l.qs)));
  await ctx.close();
});

test("escolher a carta habilita o arquivo; carta com envio meu pendente trava o envio", opts, async () => {
  const { ctx, page } = await abrir();
  assert.ok(await page.isDisabled("#arquivo"));
  await page.click('#cartas .ea-carta[data-id="plataformas-1"]');
  assert.strictEqual(await page.getAttribute('#cartas .ea-carta[data-id="plataformas-1"]', "aria-pressed"), "true");
  assert.ok(!(await page.isDisabled("#arquivo")));
  assert.match(await page.textContent("#selecao"), /Carta Um/);
  await page.click('#cartas .ea-carta[data-id="musica-3"]');
  assert.ok(await page.isDisabled("#arquivo"));
  assert.match(await page.textContent("#selecao"), /já tem uma arte esperando/);
  await ctx.close();
});

test("arquivo inválido mostra o erro e não habilita o envio; arquivo bom mostra a prévia nos quatro exemplos", opts, async () => {
  const { ctx, page } = await abrir();
  await page.click('#cartas .ea-carta[data-id="plataformas-1"]');
  await page.setInputFiles("#arquivo", { name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
  await page.waitForFunction(() => document.getElementById("arqErro").textContent.length > 0);
  assert.match(await page.textContent("#arqErro"), /PNG, JPEG ou WebP/);
  assert.ok(await page.isDisabled("#btEnviar"));
  await page.setInputFiles("#arquivo", { name: "p.png", mimeType: "image/png", buffer: png(300, 300) });
  await page.waitForFunction(() => /pequena demais/.test(document.getElementById("arqErro").textContent));
  assert.ok(await page.isDisabled("#btEnviar"));
  await page.setInputFiles("#arquivo", { name: "ok.png", mimeType: "image/png", buffer: png(600, 800) });
  await page.waitForFunction(() => !document.getElementById("btEnviar").disabled);
  assert.strictEqual(await page.textContent("#arqErro"), "");
  assert.strictEqual(await page.$$eval("[data-arte-img]:not([hidden])", (n) => n.length), 4, "prévia nos quatro exemplos");
  assert.match(await page.textContent("#exTxt"), /600 × 800/);
  await ctx.close();
});

test("envio: POST binário com Content-Type da imagem e X-CSRF; sucesso marca a carta e lista em 'Seus envios'", opts, async () => {
  const { ctx, page, log, erros } = await abrir();
  await page.click('#cartas .ea-carta[data-id="plataformas-1"]');
  const buf = png(600, 800);
  await page.setInputFiles("#arquivo", { name: "ok.png", mimeType: "image/png", buffer: buf });
  await page.waitForFunction(() => !document.getElementById("btEnviar").disabled);
  await page.click("#btEnviar");
  await page.waitForFunction(() => /Arte enviada/.test(document.getElementById("envioEstado").textContent));
  const post = log.find((l) => l.m === "POST" && l.p === "/api/arte/envios");
  assert.ok(post); assert.strictEqual(post.qs, "?carta=plataformas-1"); assert.strictEqual(post.tipo, "image/png");
  assert.strictEqual(post.csrf, "csrf-teste"); assert.strictEqual(post.bytes, buf.length);
  assert.ok((await page.textContent('#cartas .ea-carta[data-id="plataformas-1"]')).includes("Você já enviou"));
  assert.ok(await page.isDisabled("#btEnviar"));
  const meus = await page.$$eval("#meus li", (n) => n.map((x) => x.textContent));
  assert.ok(meus.some((t) => /Carta Três/.test(t) && /Rejeitada/.test(t) && /Fora da margem segura/.test(t)));
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("Seus envios: pendente mostra 'Cancelar envio' (44px); cancelar chama DELETE com X-CSRF, devolve a carta e some da lista", opts, async () => {
  const pend = { id: 7, carta_id: "musica-3", carta_nome: "Carta Três", status: "pendente", motivo: null, criado_em: "2026-12-05T10:00:00Z", decidido_em: null };
  const { ctx, page, log, erros } = await abrir({ meus: [pend] });
  await page.waitForSelector("#meus .cancelar");
  assert.strictEqual(await page.$$eval("#meus .cancelar", (n) => n.length), 1, "só o pendente tem botão");
  const h = await page.$eval("#meus .cancelar", (b) => b.getBoundingClientRect().height);
  assert.ok(h >= 44, "alvo de " + h);
  assert.match(await page.getAttribute("#meus .cancelar", "aria-label"), /Carta Três/);
  assert.ok((await page.textContent('#cartas .ea-carta[data-id="musica-3"]')).includes("Você já enviou"));
  await page.click("#meus .cancelar");
  await page.waitForFunction(() => /Envio cancelado/.test(document.getElementById("meusEstado").textContent));
  const del = log.find((l) => l.m === "DELETE");
  assert.ok(del); assert.strictEqual(del.p, "/api/arte/envios/7"); assert.strictEqual(del.csrf, "csrf-teste");
  assert.strictEqual(await page.$$eval("#meus li", (n) => n.length), 0);
  assert.ok(!(await page.textContent('#cartas .ea-carta[data-id="musica-3"]')).includes("Você já enviou"), "a carta volta a ficar livre para mim");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("cancelar um envio que já foi decidido (409) mostra o aviso e recarrega a lista", opts, async () => {
  const pend = { id: 7, carta_id: "musica-3", carta_nome: "Carta Três", status: "pendente", motivo: null, criado_em: "2026-12-05T10:00:00Z", decidido_em: null };
  const { ctx, page } = await abrir({ meus: [pend], cancelar: [409, { erro: "esse envio já foi decidido e não pode mais ser cancelado" }] });
  await page.waitForSelector("#meus .cancelar");
  await page.click("#meus .cancelar");
  await page.waitForFunction(() => /já foi decidido/.test(document.getElementById("meusEstado").textContent));
  await ctx.close();
});

test("erro do servidor (422) aparece como texto e deixa tentar de novo", opts, async () => {
  const { ctx, page } = await abrir({ envio: [422, { erro: "imagem pequena demais: o menor lado precisa ter pelo menos 400 px" }] });
  await page.click('#cartas .ea-carta[data-id="plataformas-1"]');
  await page.setInputFiles("#arquivo", { name: "ok.png", mimeType: "image/png", buffer: png(600, 800) });
  await page.waitForFunction(() => !document.getElementById("btEnviar").disabled);
  await page.click("#btEnviar");
  await page.waitForFunction(() => /pequena demais/.test(document.getElementById("envioEstado").textContent));
  assert.ok(!(await page.isDisabled("#btEnviar")), "pode tentar de novo");
  await ctx.close();
});

for (const [w, h] of [[360, 740], [390, 844], [768, 900], [1280, 900]]) {
  for (const tema of ["light", "dark"]) {
    test(`layout ${w}px ${tema}: sem rolagem lateral, alvos >= 44px, textos >= 12px`, opts, async () => {
      const { ctx, page, erros } = await abrir({ w, h, tema });
      assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), tema);
      const r = await page.evaluate(() => {
        const sw = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const peq = [...document.querySelectorAll("#ea button, #ea input, #ea select, #ea .ea-fim a")].filter((e) => e.offsetParent && !e.disabled || e.id === "arquivo")
          .map((e) => ({ id: e.id || e.className, h: e.getBoundingClientRect().height })).filter((x) => x.h < 43.5);
        const fontes = [...document.querySelectorAll("#ea *")].filter((e) => e.offsetParent && e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          .map((e) => ({ c: e.className || e.tagName, px: parseFloat(getComputedStyle(e).fontSize) })).filter((x) => x.px < 12);
        return { sw, peq, fontes };
      });
      assert.ok(r.sw <= 1, "rolagem lateral de " + r.sw + "px");
      assert.deepStrictEqual(r.peq, [], "alvos pequenos: " + JSON.stringify(r.peq));
      assert.deepStrictEqual(r.fontes, [], "fontes < 12px: " + JSON.stringify(r.fontes));
      assert.deepStrictEqual(erros, []);
      await ctx.close();
    });
  }
}

test("contraste >= 4,5:1 do texto principal, dos chips e do botão nos dois temas", opts, async () => {
  for (const tema of ["light", "dark"]) {
    const { ctx, page } = await abrir({ tema });
    const r = await page.evaluate(() => {
      const p = (s) => { const v = /rgba?\(([^)]+)\)/.exec(s)[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] === undefined ? 1 : v[3] }; };
      const L = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const fundo = (e) => { for (let n = e; n; n = n.parentElement) { const c = p(getComputedStyle(n).backgroundImage !== "none" && n.id === "btEnviar" ? getComputedStyle(n).backgroundColor : getComputedStyle(n).backgroundColor); if (c.a > 0.9) return c; } return p(getComputedStyle(document.body).backgroundColor); };
      const razao = (e) => { const a = L(p(getComputedStyle(e).color)), b = L(fundo(e)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
      return ["#ea .ea-lead", "#ea .ea-sec h2", "#ea .ea-regras span", "#ea .ea-regras b", "#cartas .ea-carta .nm", "#cartas .ea-carta .md", "#cartas .ea-chip", "#ea .ea-sel", "#ea .ea-mut", "#ea .ea-campo label", "#ea .ea-fim a"]
        .map((s) => { const e = document.querySelector(s); return e ? [s, razao(e)] : [s, null]; });
    });
    for (const [s, v] of r) if (v !== null) assert.ok(v >= 4.5, `${tema}: ${s} contraste ${v.toFixed(2)}`);
    await ctx.close();
  }
});

for (const larg of [320, 360, 390]) test(`rodapé de qualquer página a ${larg}px: botão 'Enviar arte de carta' visível, com 44 px de altura e destino correto`, opts, async () => {
  const ctx = await browser.newContext({ viewport: { width: larg, height: 844 }, hasTouch: true });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await ctx.addInitScript(() => { try { localStorage.setItem("ns_convidado", "1"); } catch (e) { /* sem storage */ } });
  const page = await ctx.newPage();
  await page.goto(base + "/termos.html");
  await page.waitForSelector(".ft-arte");
  const r = await page.$eval(".ft-arte", (a) => { const b = a.getBoundingClientRect(); return { href: a.getAttribute("href"), h: b.height, w: b.width, txt: a.textContent.trim(), vw: innerWidth }; });
  assert.strictEqual(r.href, "enviar-arte.html"); assert.strictEqual(r.txt, "Enviar arte de carta");
  assert.ok(r.h >= 44 && r.w <= r.vw, JSON.stringify(r));
  await ctx.close();
});
