// Linha do tempo no mobile: (1) o ponto de cada mês fica no centro da linha vertical em TODOS os anos/temas;
// (2) na régua de anos o ano ativo não aparece (igual à home) mas o botão mantém o nome acessível.
// Roda com arquivo explícito: node --test tests/front-linha-tempo-mobile.test.js
// Precisa do Playwright (npm i playwright; npx playwright install chromium). Sem ele os testes são pulados.
// Se estiver instalado fora do projeto: PLAYWRIGHT_MODULE=/caminho/node_modules/playwright
// Navegador já baixado em outro lugar: CHROMIUM_PATH=/caminho/chrome
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

/** convidado (sem API): a linha do tempo é pública */
async function nova(w, tema) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: '{"erro":"x"}' }));
  await ctx.addInitScript((t) => { try { localStorage.setItem("ns_convidado", "1"); localStorage.setItem("ns_theme", t); } catch (e) { /* sem storage */ } }, tema);
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) erros.push("console: " + m.text()); });
  await page.goto(base + "/linha-do-tempo.html");
  await page.waitForFunction(() => typeof KEYS !== "undefined" && document.querySelector(".lt-hero"));
  return { ctx, page, erros };
}

/** geometria de cada mês: centro do ponto (::before do .lt-mes) x centro da linha (::before do .lt-list) */
const medir = () => {
  const px = (v) => parseFloat(v);
  const list = document.querySelector(".lt-list");
  if (!list) return { semLista: true };
  const lb = getComputedStyle(list, "::before");
  const linhaVisivel = lb.display !== "none" && px(lb.width) > 0;
  const linhaCentro = list.getBoundingClientRect().left + px(lb.left) + px(lb.width) / 2;
  const meses = [...list.querySelectorAll(".lt-mes")].map((m) => {
    const pb = getComputedStyle(m, "::before");
    const visivel = pb.display !== "none";
    const centro = m.getBoundingClientRect().left + px(pb.left) + px(pb.width) / 2;
    return { visivel, desvio: visivel ? centro - linhaCentro : null, diametro: px(pb.width) };
  });
  return { linhaVisivel, meses, pad: getComputedStyle(list).paddingLeft };
};

const TEMAS = ["light", "dark"];
for (const w of [360, 390, 768]) for (const tema of TEMAS) {
  test(`ponto do mês no centro da linha, todos os anos (${w}px, ${tema})`, opts, async () => {
    const { ctx, page, erros } = await nova(w, tema);
    const anos = await page.evaluate(() => KEYS.slice());
    assert.ok(anos.length >= 20, "esperava todos os anos da régua: " + anos.length);
    const falhas = [];
    let comLinha = 0;
    for (const k of anos) {
      await page.goto(`${base}/linha-do-tempo.html#${encodeURIComponent(k)}`);
      await page.waitForSelector(".lt-hero");
      await page.waitForFunction((k) => document.querySelector(".lt-hero") && document.title.includes(yLab(k)), k);
      const r = await page.evaluate(medir);
      if (r.semLista) { falhas.push(`${k}: sem lista`); continue; }
      for (const m of r.meses) {
        if (r.linhaVisivel !== m.visivel) falhas.push(`${k}: linha ${r.linhaVisivel ? "visível" : "oculta"} mas ponto ${m.visivel ? "visível" : "oculto"}`);
        else if (m.visivel) { comLinha++; if (Math.abs(m.desvio) > 0.5) falhas.push(`${k}: desvio ${m.desvio.toFixed(2)}px`); }
      }
      const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (sw[0] > sw[1]) falhas.push(`${k}: overflow horizontal ${sw[0]} > ${sw[1]}`);
    }
    assert.ok(comLinha > 20, "poucos pontos medidos: " + comLinha);
    assert.deepStrictEqual(falhas, []);
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

for (const w of [360, 390]) {
  test(`régua no mobile (${w}px): ano ativo sem texto visível, nome acessível mantido, vizinhos visíveis`, opts, async () => {
    const { ctx, page, erros } = await nova(w, "light");
    for (const k of ["2022", "2005", "1995–1999", "2026"]) {
      await page.goto(`${base}/linha-do-tempo.html#${encodeURIComponent(k)}`);
      await page.waitForSelector(".ry.on");
      const r = await page.evaluate(() => {
        const on = document.querySelector(".ry.on"), rl = on.querySelector(".rl"), sm = on.querySelector("small");
        const viz = (e) => { const cs = getComputedStyle(e); return cs.display !== "none" && cs.visibility !== "hidden"; };
        const viz2 = [...document.querySelectorAll(".ry:not(.on) .rl")].filter((e) => { const b = e.getBoundingClientRect(); return b.right > 0 && b.left < innerWidth && parseFloat(getComputedStyle(e).fontSize) > 0; }).length;
        return { fs: getComputedStyle(rl).fontSize, cor: getComputedStyle(rl).color, bg: getComputedStyle(rl).backgroundColor, smOp: getComputedStyle(sm).opacity, rlViz: viz(rl), texto: rl.textContent.trim(), vizinhosVisiveis: viz2, tamanhoDot: on.querySelector(".dt").getBoundingClientRect().width };
      });
      assert.strictEqual(r.fs, "0px", `${k}: texto do ano ativo oculto`);
      assert.strictEqual(r.cor, "rgba(0, 0, 0, 0)", `${k}: texto transparente`);
      assert.strictEqual(r.bg, "rgba(0, 0, 0, 0)", `${k}: sem pílula`);
      assert.strictEqual(r.smOp, "0", `${k}: rótulo de memes oculto`);
      assert.ok(r.rlViz, `${k}: não pode ser display:none`);
      assert.ok(r.vizinhosVisiveis >= 2, `${k}: anos vizinhos continuam visíveis (${r.vizinhosVisiveis})`);
      assert.ok(r.tamanhoDot >= 20, `${k}: bolinha do ano ativo maior (${r.tamanhoDot})`);
      const snap = await page.locator(".ry.on").ariaSnapshot();
      assert.match(snap, new RegExp(r.texto.replace(/[–-]/g, ".")), `${k}: nome acessível ${snap}`);
      assert.match(snap, /memes?/, `${k}: nome acessível inclui a contagem`);
      const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      assert.ok(sw[0] <= sw[1], `${k}: overflow horizontal`);
    }
    // o foco continua indo para o botão do ano ativo ao trocar de ano
    await page.focus('.ry[data-k="2013"]'); await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement.classList.contains("ry") && document.activeElement.classList.contains("on"));
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  });
}

test("régua no desktop/tablet (768 e 1280px) continua mostrando o ano ativo", opts, async () => {
  for (const w of [768, 1280]) {
    const { ctx, page, erros } = await nova(w, "light");
    await page.goto(`${base}/linha-do-tempo.html#2022`);
    await page.waitForSelector(".ry.on");
    const r = await page.evaluate(() => { const on = document.querySelector(".ry.on"); return { fs: getComputedStyle(on.querySelector(".rl")).fontSize, smOp: getComputedStyle(on.querySelector("small")).opacity }; });
    assert.strictEqual(r.fs, "17px", `${w}: pílula do ano ativo`);
    assert.strictEqual(r.smOp, "1", `${w}: contagem de memes visível`);
    assert.deepStrictEqual(erros, []);
    await ctx.close();
  }
});
