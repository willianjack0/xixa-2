// hashIp unificado em lib/ip.js: tem que gerar os MESMOS valores da função antiga (copiada em 3 rotas),
// senão os hashes já gravados em eventos_meme_ip / links / memepédia deixam de bater.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hashIp } from '../lib/ip.js';

// implementação antiga, literal
const antiga = (adminToken, ip) => createHmac('sha256', adminToken || 'naosalvo').update(String(ip)).digest('hex').slice(0, 32);

// valores gerados com a função antiga antes da unificação (congelados)
const CONHECIDOS = [
  ['', '203.0.113.7', 'e671b5dff190cdc95e21078e650dce77'],
  ['segredo-admin', '203.0.113.7', 'f864184108d2123bafc13a62f0c215c1'],
  ['segredo-admin', '2001:db8::1', '0c0888edf811d48a96c03f6ce565d286'],
  [undefined, '127.0.0.1', '4be22c0d32a8c1612eb7230589a8561f'],
  ['x', '', 'f27e6527d6b8408430a666b746070c30']
];

test('hashIp gera os mesmos valores de antes (valores fixos)', () => {
  for (const [token, ip, esperado] of CONHECIDOS) assert.equal(hashIp(token, ip), esperado, `${token}/${ip}`);
});

test('hashIp bate com a implementação antiga em entradas variadas', () => {
  for (const token of ['', undefined, null, 'a', 'segredo-longo-do-admin']) {
    for (const ip of ['1.2.3.4', '::1', '2001:db8::ff', 'unknown', 42, undefined]) {
      assert.equal(hashIp(token, ip), antiga(token, ip));
    }
  }
});

test('hashIp: 32 hex, chave padrão naosalvo sem token, token muda o resultado', () => {
  assert.match(hashIp('t', '1.1.1.1'), /^[0-9a-f]{32}$/);
  assert.equal(hashIp('', '1.1.1.1'), hashIp('naosalvo', '1.1.1.1'));
  assert.notEqual(hashIp('a', '1.1.1.1'), hashIp('b', '1.1.1.1'));
});
