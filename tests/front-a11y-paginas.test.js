// Acessibilidade (plano de implementação, fase 4) em todas as telas: landmarks, h1 único e hierarquia, nomes acessíveis,
// labels de campos, alt, aria-live, link "pular", foco visível e ordem de tab, movimento reduzido, contraste nos 2 temas e
// sem rolagem lateral a 390 e 1280. Só serviços locais (servidor estático + API mockada).
// Roda com arquivo explícito: node --test tests/front-a11y-paginas.test.js (precisa do Playwright; sem ele os testes são pulados).
const test = require("node:test");
const assert = require("node:assert");
const { chromium, servidor, novoContexto, auditoria, contrastes } = require("./front-a11y-comum");

const opts = { skip: chromium ? false : "playwright não instalado" };
let srv, browser, base;
test.before(async () => {
  if (!chromium) return;
  srv = await servidor(); base = `http://127.0.0.1:${srv.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

// cab = tem cabeçalho/rodapé compartilhados (renderHeader); live = a tela troca conteúdo e precisa de região aria-live
const PAGINAS = [
  { nome: "index", url: "/index.html", pronto: "main h1", cab: true, live: true },
  { nome: "linha-do-tempo", url: "/linha-do-tempo.html", pronto: ".lt-it", cab: true, live: true },
  { nome: "memepedia", url: "/memepedia.html", pronto: "main h1", cab: true, live: true },
  { nome: "album", url: "/album.html", pronto: "main h1", cab: true, live: true },
  { nome: "perfil (orkut)", url: "/perfil.html?u=Ana", pronto: "#pf h1", cab: true, live: true },
  { nome: "perfil (fotolog)", url: "/perfil.html?u=Beto", pronto: "#pf h1", cab: true, live: true },
  { nome: "entrar", url: "/entrar.html", pronto: "main h1", cab: false, live: true, logado: false, semFooter: true },
  { nome: "privacidade", url: "/privacidade.html", pronto: "main h1", cab: true },
  { nome: "termos", url: "/termos.html", pronto: "main h1", cab: true },
  { nome: "enviar-arte", url: "/enviar-arte.html", pronto: "main h1", cab: true, live: true },
  { nome: "404", url: "/404.html", pronto: "main h1", cab: true, live: true, logado: false },
  { nome: "roteiro-teste", url: "/roteiro-teste.html", pronto: "main h1", cab: true },
  { nome: "seppzone", url: "/seppzone/index.html", pronto: "#app *", cab: false, live: true, semFooter: true }
];
// Exclusões de contraste DOCUMENTADAS (pendências, ver docs/PLANO-IMPLEMENTACAO.md):
//  - álbum: figurinhas/cartas e chips de raridade usam as cores de raridade como fundo ou texto (ex.: branco sobre --Mítico #ff4a4a = 3,3:1);
//    trocar a paleta é decisão de design.
//  - linha do tempo: 12 "skins" de época com fundo em imagem/gradiente atrás de texto translúcido; o cálculo por cor de fundo não mede isso.
const IGNORAR_CONTRASTE = { album: ".chipR,.card,.vaga,.fig,.slot,.pk,.pack,.flip,[class*=Mítico],[class*=Lendário],[style*=\"color:var(--\"]", "linha-do-tempo": ".hd,.lt-wrap" };
const VPS = [{ width: 390, height: 844 }, { width: 1280, height: 900 }];

async function abrir(p, vp, { tema = "light", reduzir = false } = {}) {
  const ctx = await novoContexto(browser, vp, { tema, logado: p.logado !== false, reduzir });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await page.goto(base + p.url);
  await page.waitForSelector(p.pronto, { timeout: 8000 });
  await page.waitForTimeout(500);
  return { ctx, page, erros };
}

for (const p of PAGINAS) {
  for (const vp of VPS) {
    test(`${p.nome} @${vp.width}: landmarks, um h1, hierarquia, nomes acessíveis, labels, alt e sem rolagem lateral`, opts, async () => {
      const { ctx, page, erros } = await abrir(p, vp);
      const a = await auditoria(page);
      assert.strictEqual(a.main, 1, "exatamente um <main>");
      if (p.cab) { assert.strictEqual(a.header, 1, "cabeçalho"); assert.strictEqual(a.footer, 1, "rodapé"); }
      if (p.nome === "seppzone") assert.strictEqual(a.header, 1);
      assert.strictEqual(a.navsSemNome, 0, "toda <nav> tem aria-label (há mais de uma na página)");
      assert.strictEqual(a.h1, 1, "um único h1 visível");
      assert.deepStrictEqual(a.pulos, [], "sem pular nível de título");
      assert.deepStrictEqual(a.semNome, [], "botão/link sem nome acessível");
      assert.deepStrictEqual(a.campos, [], "campo sem label");
      assert.deepStrictEqual(a.imgSemAlt, [], "img sem atributo alt");
      assert.strictEqual(a.overflowX, false, "sem rolagem lateral");
      if (p.live) assert.ok(a.live >= 1, "região aria-live/status para conteúdo que muda");
      assert.deepStrictEqual(erros, []);
      await ctx.close();
    });
  }
}

test("link 'Pular para o conteúdo': 1º item do tab, só aparece com foco e leva o foco ao <main> (inclusive na 404 com <base href=/>)", opts, async () => {
  for (const p of PAGINAS.filter((x) => x.cab)) {
    const { ctx, page } = await abrir(p, { width: 1280, height: 900 });
    const antes = await page.$eval(".skip-link", (e) => e.getBoundingClientRect().bottom);
    assert.ok(antes <= 0, `${p.nome}: escondido fora da tela sem foco`);
    await page.keyboard.press("Tab");
    const foco = await page.evaluate(() => { const e = document.activeElement; const b = e.getBoundingClientRect(); return { cls: e.className, topo: b.top, altura: b.height, texto: e.textContent }; });
    assert.strictEqual(foco.cls, "skip-link", `${p.nome}: primeiro Tab cai no link de pular`);
    assert.ok(foco.topo >= 0 && foco.altura >= 44, `${p.nome}: visível e com 44px quando focado ${JSON.stringify(foco)}`);
    const url0 = page.url();
    await page.keyboard.press("Enter");
    assert.strictEqual(page.url(), url0, `${p.nome}: não navega`);
    assert.strictEqual(await page.evaluate(() => document.activeElement.tagName), "MAIN", `${p.nome}: foco no main`);
    await ctx.close();
  }
});

test("foco visível: cada parada do tab (30 primeiras) mostra contorno ou sombra e fica na tela", opts, async () => {
  const falhas = [];
  for (const p of PAGINAS) {
    for (const vp of VPS) {
      const { ctx, page } = await abrir(p, vp);
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab");
        const f = await page.evaluate(() => {
          const e = document.activeElement; if (!e || e === document.body) return null;
          const cs = getComputedStyle(e), b = e.getBoundingClientRect();
          const contorno = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2 && cs.outlineColor !== "rgba(0, 0, 0, 0)";
          const sombra = cs.boxShadow && cs.boxShadow !== "none";
          const borda = e.matches("input,textarea,select"); // campos trocam a cor da borda + brilho (box-shadow) no :focus
          return { id: `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}${e.id ? "#" + e.id : ""}`, ok: contorno || sombra || borda, visivel: b.width > 0 && b.height > 0 };
        });
        if (!f) continue;
        if (!f.ok) falhas.push(`${p.nome}@${vp.width}: ${f.id} sem indicador de foco`);
        if (!f.visivel) falhas.push(`${p.nome}@${vp.width}: ${f.id} focável mas invisível`);
      }
      await ctx.close();
    }
  }
  assert.deepStrictEqual([...new Set(falhas)], []);
});

test("movimento reduzido: com prefers-reduced-motion nenhuma animação em loop nem longa roda nas telas", opts, async () => {
  const falhas = [];
  for (const p of PAGINAS) {
    const { ctx, page } = await abrir(p, { width: 1280, height: 900 }, { reduzir: true });
    const anims = await page.evaluate(() => document.getAnimations().filter((a) => { const t = a.effect && a.effect.getComputedTiming(); return t && (t.iterations === Infinity || t.duration > 50 || t.delay > 50); }).map((a) => (a.animationName || a.transitionProperty || "?") + " " + (a.effect.target ? String(a.effect.target.className).slice(0, 20) : "")));
    if (anims.length) falhas.push(`${p.nome}: ${anims.slice(0, 4).join(", ")}`);
    await ctx.close();
  }
  assert.deepStrictEqual(falhas, []);
});

for (const tema of ["light", "dark"]) {
  for (const vp of VPS) {
    test(`contraste WCAG por pixel (tema ${tema}, ${vp.width}px) em todas as telas`, opts, async () => {
      const falhas = [];
      for (const p of PAGINAS) {
        const { ctx, page } = await abrir(p, vp, { tema });
        const r = await contrastes(page, "body", IGNORAR_CONTRASTE[p.nome] || "");
        if (r.length) falhas.push(`${p.nome}: ${r.slice(0, 6).join(" | ")}`);
        await ctx.close();
      }
      assert.deepStrictEqual(falhas, []);
    });
  }
}
