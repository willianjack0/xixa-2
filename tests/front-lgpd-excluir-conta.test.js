// LGPD: "Excluir minha conta" no perfil do próprio usuário (perfil.html): duas etapas na página (sem confirm()), texto do que some
// e do que fica, confirmação pelo apelido, envio com CSRF, volta para a entrada e erros sem perder a tela. Só serviços locais.
// Roda com arquivo explícito: node --test tests/front-lgpd-excluir-conta.test.js (precisa do Playwright; sem ele os testes são pulados).
const test = require("node:test");
const assert = require("node:assert");
const { chromium, servidor, novoContexto, contrastes, json } = require("./front-a11y-comum");

const opts = { skip: chromium ? false : "playwright não instalado" };
let srv, browser, base;
test.before(async () => {
  if (!chromium) return;
  srv = await servidor(); base = `http://127.0.0.1:${srv.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
test.after(async () => { if (browser) await browser.close(); if (srv) srv.close(); });

// abre o perfil (Ana = dono, Beto = outra pessoa). `excluir` define a resposta do POST /api/eu/excluir.
async function abrir(vp, { tema = "light", u = "Ana", excluir = null } = {}) {
  const ctx = await novoContexto(browser, vp, { tema, logado: true });
  const st = { posts: [], removida: false, dialogos: 0 };
  await ctx.route("**/api/eu", (route) => st.removida ? json(route, 401, { erro: "não autenticado" }) : route.fallback());
  await ctx.route("**/api/eu/excluir", async (route) => {
    const req = route.request();
    st.posts.push({ corpo: JSON.parse(req.postData() || "{}"), csrf: req.headers()["x-csrf"] || null });
    const r = excluir ? excluir(st) : { status: 200, corpo: { ok: true } };
    if (r.status === 200) st.removida = true;
    return json(route, r.status, r.corpo);
  });
  const page = await ctx.newPage();
  page.on("dialog", (d) => { st.dialogos++; d.dismiss(); });
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await page.goto(`${base}/perfil.html?u=${u}`);
  await page.waitForSelector("#pf h1");
  await page.waitForTimeout(300);
  return { ctx, page, st, erros };
}

test("só o dono vê 'Privacidade e conta'; no perfil de outra pessoa não existe", opts, async () => {
  const a = await abrir({ width: 1280, height: 900 });
  assert.strictEqual(await a.page.isVisible("#conta"), true);
  assert.match(await a.page.textContent("#conta h2"), /Privacidade e conta/);
  assert.strictEqual(await a.page.isVisible("#cPainel"), false, "painel fechado no começo");
  assert.strictEqual(await a.page.getAttribute("#cAbrir", "aria-expanded"), "false");
  await a.ctx.close();
  const b = await abrir({ width: 1280, height: 900 }, { u: "Beto" });
  assert.strictEqual(await b.page.isVisible("#conta"), false);
  assert.strictEqual(await b.page.$("#cAbrir"), null, "o botão nem é criado");
  await b.ctx.close();
});

test("duas etapas: abrir explica o que some e o que fica; só digitar o apelido libera; Esc cancela sem enviar nada", opts, async () => {
  const { ctx, page, st, erros } = await abrir({ width: 1280, height: 900 });
  await page.click("#cAbrir");
  assert.strictEqual(await page.isVisible("#cPainel"), true);
  assert.strictEqual(await page.getAttribute("#cAbrir", "aria-expanded"), "true");
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), "cApelido", "foco vai para o campo");
  const txt = await page.textContent("#cPainel");
  for (const t of [/O que some/, /O que fica, sem o seu nome/, /Discord/, /removida-/, /começa do zero/, /suspensão continua/]) assert.match(txt, t);
  assert.strictEqual(await page.isDisabled("#cConfirmar"), true);
  await page.fill("#cApelido", "Outra");
  assert.strictEqual(await page.isDisabled("#cConfirmar"), true, "apelido diferente não libera");
  await page.fill("#cApelido", "  aNa ");
  assert.strictEqual(await page.isDisabled("#cConfirmar"), false, "igual sem diferenciar maiúsculas e sem espaços");
  await page.keyboard.press("Escape");
  assert.strictEqual(await page.isVisible("#cPainel"), false);
  assert.strictEqual(await page.evaluate(() => document.activeElement.id), "cAbrir", "foco volta ao botão");
  assert.strictEqual(await page.inputValue("#cApelido"), "", "campo limpo");
  assert.strictEqual(st.posts.length, 0, "nada foi enviado");
  assert.strictEqual(st.dialogos, 0, "sem confirm()/alert()");
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("confirmar: POST com o apelido e X-CSRF, sessão encerrada e volta para a entrada com o aviso de conta excluída", opts, async () => {
  const { ctx, page, st, erros } = await abrir({ width: 1280, height: 900 });
  await page.click("#cAbrir");
  await page.fill("#cApelido", "Ana");
  await page.click("#cConfirmar");
  await page.waitForURL(/entrar\.html\?conta=excluida/);
  assert.strictEqual(st.posts.length, 1);
  assert.deepStrictEqual(st.posts[0].corpo, { confirmar: "Ana" });
  assert.strictEqual(st.posts[0].csrf, "tok");
  await page.waitForSelector("#aviso.on");
  assert.match(await page.textContent("#aviso"), /Conta excluída/);
  assert.match(await page.textContent("#aviso"), /dados pessoais/);
  assert.strictEqual(st.dialogos, 0);
  assert.deepStrictEqual(erros, []);
  await ctx.close();
});

test("erro da API (409/429/rede): mostra o motivo no painel, não sai da página e deixa tentar de novo", opts, async () => {
  for (const [status, corpo, esperado] of [[409, { erro: "contas da equipe precisam ter o papel retirado antes de excluir" }, /papel retirado/], [429, { erro: "Muitas tentativas. Aguarde um pouco." }, /Muitas tentativas/], [500, {}, /Não consegui excluir agora/]]) {
    const { ctx, page, st } = await abrir({ width: 1280, height: 900 }, { excluir: () => ({ status, corpo }) });
    await page.click("#cAbrir"); await page.fill("#cApelido", "Ana"); await page.click("#cConfirmar");
    await page.waitForFunction(() => document.querySelector("#cErro").textContent.trim().length > 0);
    assert.match(await page.textContent("#cErro"), esperado, String(status));
    assert.ok(page.url().includes("perfil.html"), "continua no perfil");
    assert.strictEqual(await page.isVisible("#cPainel"), true);
    assert.strictEqual(await page.isDisabled("#cConfirmar"), false, "pode tentar de novo");
    assert.strictEqual(await page.isDisabled("#cApelido"), false);
    assert.strictEqual(await page.getAttribute("#cErro", "role"), "alert");
    assert.strictEqual(st.posts.length, 1);
    await ctx.close();
  }
});

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  for (const tema of ["light", "dark"]) {
    test(`visual ${vp.width}px (${tema}): alvos de 44px, fonte >= 12px, contraste, label/aria e sem rolagem lateral`, opts, async () => {
      const { ctx, page } = await abrir(vp, { tema });
      await page.click("#cAbrir");
      await page.fill("#cApelido", "Ana");
      const m = await page.evaluate(() => {
        const alvos = ["#cAbrir", "#cConfirmar", "#cCancelar", "#cApelido"].map((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { s, h: b.height, w: b.width }; });
        const miudos = [...document.querySelectorAll("#conta *")].filter((e) => !e.closest("[hidden]") && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.tagName);
        return { alvos, miudos, overflow: document.documentElement.scrollWidth > innerWidth, label: document.querySelector("label[for=cApelido]").textContent, aria: document.querySelector("#cAbrir").getAttribute("aria-controls"), grupo: document.querySelector("#cPainel").getAttribute("aria-labelledby") };
      });
      for (const a of m.alvos) assert.ok(a.h >= 44 && a.w >= 44, JSON.stringify(a));
      assert.deepStrictEqual(m.miudos, []);
      assert.strictEqual(m.overflow, false, "sem rolagem lateral");
      assert.match(m.label, /digite o seu apelido: Ana/);
      assert.strictEqual(m.aria, "cPainel"); assert.strictEqual(m.grupo, "cP2");
      assert.deepStrictEqual(await contrastes(page, "#conta"), []);
      // foco visível (pelo teclado, como a pessoa usaria): campo -> Excluir para sempre -> Cancelar
      await page.focus("#cApelido");
      for (const id of ["cApelido", "cConfirmar", "cCancelar"]) {
        assert.strictEqual(await page.evaluate(() => document.activeElement.id), id);
        const f = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2; });
        assert.ok(f, "foco visível em #" + id);
        await page.keyboard.press("Tab");
      }
      await ctx.close();
    });
  }
}
