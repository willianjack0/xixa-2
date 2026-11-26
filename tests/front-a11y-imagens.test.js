// Carregamento de imagens (plano de implementação, fase 4): lazy + decoding async nas grades e abaixo da dobra,
// sem lazy na imagem principal, caixa reservada (width/height ou aspect-ratio) contra salto de layout, sem rolagem lateral.
// Só serviços locais. Roda com arquivo explícito: node --test tests/front-a11y-imagens.test.js (precisa do Playwright).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, RAIZ, servidor, novoContexto } = require("./front-a11y-comum");

const opts = { skip: chromium ? false : "playwright não instalado" };
let srv, browser, base;
test.before(async () => {
  if (!chromium) return;
  srv = await servidor(); base = `http://127.0.0.1:${srv.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

async function abrir(url, vp, pronto) {
  const ctx = await novoContexto(browser, vp);
  const page = await ctx.newPage();
  await page.goto(base + url);
  await page.waitForSelector(pronto, { timeout: 8000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}
// descreve cada <img>: abaixo da dobra? lazy? decoding? caixa reservada?
const IMGS = () => [...document.querySelectorAll("img")].filter((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.display !== "none" && (b.width > 0 || e.getAttribute("width")); }).map((e) => {
  const b = e.getBoundingClientRect();
  let caixa = !!(e.getAttribute("width") && e.getAttribute("height"));
  for (let x = e.parentElement, n = 0; x && !caixa && n < 4; x = x.parentElement, n++) if (getComputedStyle(x).aspectRatio !== "auto") caixa = true;
  return { src: (e.getAttribute("src") || "").slice(0, 60), abaixo: b.top > innerHeight, lazy: e.loading === "lazy", dec: e.decoding, caixa, prio: e.getAttribute("fetchpriority") };
});

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`index @${vp.width}: grade de memes e rodapé lazy+async, logo principal eager com prioridade e dimensões`, opts, async () => {
    const { ctx, page } = await abrir("/index.html", vp, ".card .th, .card");
    await page.evaluate(() => scrollTo(0, 0));
    const l = await page.evaluate(`(${IMGS})()`);
    assert.ok(l.length >= 3, "tem imagens");
    const hero = l.find((i) => /logo-hero/.test(i.src));
    assert.ok(hero, "logo principal");
    assert.strictEqual(hero.lazy, false, "imagem principal acima da dobra NÃO é lazy");
    assert.strictEqual(hero.prio, "high");
    assert.ok(hero.caixa, "logo principal com width/height");
    for (const i of l.filter((x) => x.abaixo)) { assert.ok(i.lazy, "abaixo da dobra deve ser lazy: " + i.src); }
    for (const i of l.filter((x) => /memes\/|ytimg/.test(x.src))) { assert.ok(i.lazy && i.dec === "async" && i.caixa, "miniatura da grade: " + JSON.stringify(i)); }
    const boneco = l.find((i) => /boneco/.test(i.src));
    if (boneco) assert.ok(boneco.lazy && boneco.dec === "async", "boneco do rodapé lazy");
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "sem rolagem lateral");
    await ctx.close();
  });
  test(`linha do tempo @${vp.width}: miniaturas lazy+async dentro de caixa 16/9 reservada, sem rolagem lateral`, opts, async () => {
    const { ctx, page } = await abrir("/linha-do-tempo.html", vp, ".lt-it");
    const l = await page.evaluate(`(${IMGS})()`);
    const th = l.filter((i) => /memes\/|ytimg/.test(i.src));
    assert.ok(th.length >= 3, "miniaturas do ano");
    for (const i of th) assert.ok(i.lazy && i.dec === "async" && i.caixa, JSON.stringify(i));
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await ctx.close();
  });
  test(`entrar @${vp.width}: polaroides lazy+async e logo principal eager, sem rolagem lateral`, opts, async () => {
    const ctx = await novoContexto(browser, vp, { logado: false });
    const page = await ctx.newPage();
    await page.goto(base + "/entrar.html"); await page.waitForSelector("main h1"); await page.waitForTimeout(400);
    const l = await page.evaluate(`(${IMGS})()`);
    assert.strictEqual(l.find((i) => /logo-hero/.test(i.src)).lazy, false);
    for (const i of l.filter((x) => /memes\//.test(x.src))) assert.ok(i.lazy && i.dec === "async", JSON.stringify(i));
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await ctx.close();
  });
}

// álbum e perfil só têm imagens com dados de cartas/posts reais: confere os modelos de HTML no código
test("álbum, perfil e rodapé: toda <img> de arte (carta, post, avatar) é lazy e decodifica async", () => {
  const ler = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
  const regras = { "album.html": 2, "perfil.html": 3, "common.js": 2 };
  for (const [f, minimo] of Object.entries(regras)) {
    const src = ler(f);
    const tags = [...src.matchAll(/<img\b[^>]*\bsrc="\$\{[^>]*>/g)].map((m) => m[0]).filter((t) => !/logo-word|ft-boneco/.test(t) || /ft-boneco/.test(t));
    const arte = tags.filter((t) => /alt=""/.test(t));
    assert.ok(arte.length >= minimo, `${f}: encontrou ${arte.length} imagens de arte`);
    for (const t of arte) {
      if (/avatar|ini\b/.test(t) && /id="|class="nav|alt=""\s+width="28"/.test(t) && !/loading="lazy"/.test(t)) continue; // avatar do cabeçalho (acima da dobra) fica eager
      assert.match(t, /loading="lazy"/, `${f}: ${t.slice(0, 90)}`);
      assert.match(t, /decoding="async"/, `${f}: ${t.slice(0, 90)}`);
    }
  }
  assert.match(ler("common.js"), /<img class="ft-boneco"[^>]*loading="lazy"[^>]*decoding="async"|<img class="ft-boneco"[^>]*decoding="async"[^>]*loading="lazy"/);
});

test("viewer e imagem do verbete da memepédia não perdem a prioridade: sem lazy acima da dobra e com decoding async", () => {
  const ler = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
  const mp = ler("memepedia.html");
  const caixa = mp.match(/<img src="\$\{escapeHtml\(fotoDe\(m\)\)\}"[^>]*>/);
  assert.ok(caixa, "imagem do verbete");
  assert.doesNotMatch(caixa[0], /loading="lazy"/, "imagem do topo do verbete não é lazy");
  assert.match(caixa[0], /decoding="async"/);
});
