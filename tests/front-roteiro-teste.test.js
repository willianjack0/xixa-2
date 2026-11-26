// Página temporária roteiro-teste.html (roteiro de teste para a comunidade). Sem navegador: confere a estrutura e os dados.
// Remover junto com roteiro-teste.html/.css/.js quando o teste acabar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const ler = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const { BLOCOS, totalDePassos, idDoPasso } = require('../roteiro-teste.js');

test('página: título, noindex, descrição e scripts do casco do site', () => {
  const h = ler('roteiro-teste.html');
  assert.match(h, /<title>Roteiro de teste · NÃO SALVO<\/title>/);
  assert.match(h, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(h, /Página temporária/);
  assert.match(h, /<h1>/);
  for (const s of ['gate.js', 'cliente-economia.js', 'common.js', 'roteiro-teste.js', 'roteiro-teste.css', 'theme.css']) assert.ok(h.includes(s), s);
  assert.match(h, /RoteiroTeste\.iniciar\(\)/);
});

test('cache-bust das mesmas versões do resto do site nos arquivos compartilhados', () => {
  const h = ler('roteiro-teste.html'), a = ler('enviar-arte.html');
  for (const arq of ['theme.css', 'common.js', 'cliente-economia.js', 'data.js', 'gate.js']) {
    const v = (t) => (t.match(new RegExp(arq.replace('.', '\\.') + '\\?v=(\\d{8}[a-z])')) || [])[1];
    assert.equal(v(h), v(a), arq + ' com a mesma versão de enviar-arte.html');
  }
});

test('roteiro: 11 blocos, 47 passos, ids únicos e textos preenchidos', () => {
  assert.equal(BLOCOS.length, 11);
  assert.equal(totalDePassos(), 47);
  const ids = BLOCOS.flatMap((b) => b.passos.map((_, i) => idDoPasso(b, i)));
  assert.equal(new Set(ids).size, ids.length);
  for (const b of BLOCOS) { assert.ok(b.t.length > 2); for (const p of b.passos) assert.ok(p.length > 15); }
});

test('roteiro cobre o gato com as opções do fim das listas e a página de arte', () => {
  const j = ler('roteiro-teste.js');
  assert.match(j, /Prata/); assert.match(j, /Peludo/); assert.match(j, /Heterocromia/);
  assert.ok(BLOCOS.some((b) => b.t === 'Enviar arte de carta'));
});

test('página temporária fica fora do rodapé e do mapa do site (só link direto)', () => {
  assert.ok(!ler('common.js').includes('roteiro-teste'));
  assert.doesNotMatch(ler('roteiro-teste.html'), /canonical/);
});

test('CSS: alvos de 44px nos controles e sem texto abaixo de 12px', () => {
  const c = ler('roteiro-teste.css');
  assert.match(c, /\.rt-reset\{[^}]*min-height:44px/);
  assert.match(c, /\.rt-btn\{[^}]*min-height:44px/);
  assert.match(c, /\.rt-passo\{[^}]*min-height:52px/);
  const tamanhos = [...c.matchAll(/font:\d{3} (\d+)px/g)].map((m) => +m[1]);
  assert.ok(tamanhos.length > 0 && tamanhos.every((n) => n >= 12), 'fontes >= 12px: ' + tamanhos.join(','));
});
