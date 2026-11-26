// Páginas legais: existem, têm título/canonical, linkam entre si e o rodapé aponta para elas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

for (const [arq, titulo, outra] of [['privacidade.html', 'Política de privacidade', 'termos.html'], ['termos.html', 'Termos de uso', 'privacidade.html']]) {
  test(`${arq}: título, canonical, link para a outra página e sem rastreio`, () => {
    const h = ler(arq);
    assert.match(h, new RegExp(`<title>${titulo} · NÃO SALVO</title>`));
    assert.ok(h.includes(`<link rel="canonical" href="https://naosalvo.fishlab.com.br/${arq}">`));
    assert.ok(h.includes(`href="${outra}"`));
    assert.doesNotMatch(h, /noindex/);
    assert.match(h, /<h1>/);
  });
}

test('rodapé liga as duas páginas legais', () => {
  const c = ler('common.js');
  assert.ok(c.includes('href="privacidade.html"') && c.includes('href="termos.html"'));
});

test('privacidade cita só o que o código faz: login com identify, sessão de 30/90 dias, IP por 3 dias', () => {
  const h = ler('privacidade.html');
  assert.match(h, /30 dias/); assert.match(h, /90 dias/);
  assert.match(h, /não recebemos e-mail nem senha/i);
  assert.match(ler('api/auth/sessao.js'), /VIDA_DA_SESSAO = 30 \* DIA/);
  assert.match(ler('api/auth/sessao.js'), /LIMITE_ABSOLUTO = 90 \* DIA/);
  assert.match(ler('api/lib/limpeza.js'), /MANTER_DIAS = 2/);
});
