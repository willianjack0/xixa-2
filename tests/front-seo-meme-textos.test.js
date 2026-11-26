// Revisão de texto da Fase 4 (sem navegador): frases de protótipo e código morto fora da home, termos padronizados
// (patente, carta) e o mesmo ?v= nas páginas tocadas. A prévia por meme (/api/og/meme/:id) é testada em api/test/og.test.js.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

test("home: sem frase de protótipo nem código morto (SEED_QUEUE, fila/wiki de exemplo no navegador)", () => {
  const h = ler("index.html");
  for (const morto of ["SEED_QUEUE", "wikiQ", "linksQ", "moderarWiki", "moderarLink", "WIKI_CAMPO", "protótipo antigo"]) {
    assert.ok(!h.includes(morto), `index.html ainda tem ${morto}`);
  }
  assert.ok(!/Protótipo|só neste navegador/.test(h), "nota de protótipo continua na home");
  assert.match(h, /class="note"/, "o respiro do rodapé (.note) é conferido por outros testes");
  assert.match(h, /function openMod\(\)\{[^}]*\/seppzone\/#moderacao/, "o botão de moderar continua indo para a área adm");
});

test("viewer.js: o cabeçalho não fala mais de Netlify", () => {
  assert.ok(!/netlify/i.test(ler("viewer.js")));
});

test("termos: perfil usa Patente (não Nível); álbum chama de carta o que o servidor chama de carta", () => {
  const p = ler("perfil.html");
  assert.ok(!/>Nível</.test(p) && !/aria-label="Nível"/.test(p), "perfil.html ainda diz Nível");
  assert.match(p, /<h2 class="pf-h">Patente<\/h2>/);
  const a = ler("album.html");
  assert.ok(!/Figurinha \$\{c\.num\}|A figurinha <b>|sobre essa figurinha/.test(a), "album.html ainda chama a carta de figurinha");
});

test("cache-bust: index, perfil e álbum usam o mesmo ?v= e nenhum antigo", () => {
  for (const f of ["index.html", "perfil.html", "album.html"]) {
    const h = ler(f);
    assert.ok(h.includes("?v=20261207b"), `${f} sem o ?v= novo`);
    assert.ok(!/\?v=2026\d{4}[a-z]/.test(h.replace(/\?v=20261207b/g, "")), `${f} mistura ?v= de datas diferentes`);
  }
});
