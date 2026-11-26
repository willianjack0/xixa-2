// Testes do player da época (player.js), rodados com: node --test tests/
// O player.js é um script de navegador; aqui ele roda num contexto vm com os
// dois utilitários que ele usa do common.js.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregaPlayer() {
  const ctx = vm.createContext({
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    fmt: n => Number(n).toLocaleString("pt-BR"),
    document: { createElement: () => ({}), head: { appendChild() {} } },
  });
  const src = fs.readFileSync(path.join(__dirname, "..", "player.js"), "utf8");
  vm.runInContext(src + ";this.playerHTML=playerHTML;this.initPlayer=initPlayer;", ctx);
  return ctx;
}

const semVideo = { id: "gordinho-ave-maria", t: "Ave Maria, Doido!", y: 2013, e: "🎞️", dur: 105, img: "memes/gordinho-ava-maria.jpg" };
const comVideo = { id: "pelados-em-santos", t: "Mamonas Assassinas: Pelados em Santos", y: 1995, e: "🎵", yt: "Nz7101ulkK0" };

test("meme sem vídeo original não tem botão de play nem duração inventada", () => {
  const { playerHTML } = carregaPlayer();
  for (const bare of [true, false]) {
    const html = playerHTML(semVideo, bare);
    assert.match(html, /vp-noyt/);
    assert.match(html, /Vídeo original fora do ar/);
    assert.doesNotMatch(html, /data-a="play"/, "não pode haver botão de play");
    assert.doesNotMatch(html, /1:45/, "não pode mostrar a duração simulada");
  }
});

test("meme sem vídeo original não liga o player (nada para tocar)", () => {
  const { initPlayer } = carregaPlayer();
  const root = { querySelector() { throw new Error("não deveria montar controles"); }, querySelectorAll() { throw new Error("não deveria montar controles"); } };
  const p = initPlayer(root, semVideo, [], null, {});
  assert.strictEqual(typeof p.stop, "function");
  p.stop();
});

test("meme com vídeo do YouTube continua com botão de play", () => {
  const { playerHTML } = carregaPlayer();
  const html = playerHTML(comVideo, true);
  assert.doesNotMatch(html, /vp-noyt/);
  assert.match(html, /data-a="play"/);
});

test("meme que só existe no Facebook toca no mesmo player da época, com link para o Facebook", () => {
  const { playerHTML } = carregaPlayer();
  const fb = { id: "hebe-nair-lolita-jo", t: "Hebe, Nair Bello e Lolita no Jô", y: 2000, e: "👵", fb: "https://www.facebook.com/zelezinparaiba/videos/x/428872962595311/" };
  const html = playerHTML(fb, false);
  assert.doesNotMatch(html, /vp-noyt/);
  assert.doesNotMatch(html, /Vídeo original fora do ar/);
  assert.match(html, /data-a="play"/);
  assert.match(html, /vp-e0/, "continua com a cara do player do ano 2000");
  assert.match(html, /href="https:\/\/www\.facebook\.com\/zelezinparaiba\/videos\/x\/428872962595311\/"[^>]*>Assistir no Facebook/);
  assert.doesNotMatch(html, /youtube\.com\/watch/);
});

test("data.js: Hebe, Nair e Lolita no Jô usa o vídeo do Facebook (o do YouTube não toca)", () => {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8") + ";this.M=MEMES", ctx);
  const m = ctx.M.find(x => x.id === "hebe-nair-lolita-jo");
  assert.strictEqual(m.yt, undefined);
  assert.match(m.fb, /^https:\/\/www\.facebook\.com\/zelezinparaiba\/videos\/.*428872962595311\/$/);
});
