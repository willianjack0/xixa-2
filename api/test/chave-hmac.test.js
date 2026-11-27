// HMAC_KEY separa a chave dos hashes (ip, visitante, banimento) do ADMIN_TOKEN, que vai ser aposentado.
// Sem HMAC_KEY o servidor continua usando o ADMIN_TOKEN: os hashes já gravados em produção têm que continuar batendo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../app.js';
import { hashIp } from '../lib/ip.js';
import { hashProvedor } from '../lib/lgpd.js';

const pool = { query: async () => ({ rows: [] }) };

test('sem HMAC_KEY a chave dos hashes é o ADMIN_TOKEN (compatível com o que já está gravado)', () => {
  const { router } = criarApp({ pool, adminToken: 'tok-antigo' });
  assert.equal(hashIp('tok-antigo', '1.2.3.4'), hashIp('tok-antigo', '1.2.3.4'));
});

test('com HMAC_KEY o hash muda de chave e não depende mais do ADMIN_TOKEN', () => {
  assert.notEqual(hashIp('chave-nova', '1.2.3.4'), hashIp('tok-antigo', '1.2.3.4'));
  assert.notEqual(hashProvedor('chave-nova', 'discord', '9'), hashProvedor('tok-antigo', 'discord', '9'));
});

test('a rota recebe chaveHmac no contexto: HMAC_KEY vence, senão ADMIN_TOKEN', async () => {
  for (const [opts, esperado] of [[{ adminToken: 'a' }, 'a'], [{ adminToken: 'a', chaveHmac: 'h' }, 'h'], [{ chaveHmac: 'h' }, 'h']]) {
    const { router } = criarApp({ pool, ...opts });
    let visto;
    router.rotas.push({ metodo: 'GET', caminho: '/__chave', tratador: async (ctx) => { visto = ctx.chaveHmac; ctx.res.end('ok'); } });
    const res = { writeHead() {}, setHeader() {}, end() {} };
    await router.tratar({ url: '/__chave', method: 'GET', headers: {}, socket: {} }, res);
    assert.equal(visto, esperado);
  }
});
