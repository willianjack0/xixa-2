// Voto por usuário (migração 016): um voto por pessoa e por meme; legado congelado somado; repetir não infla.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';

const skip = semBanco();
let db, s, n = 0;
before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, { autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' }) });
});
after(async () => { if (skip) return; await s.fechar(); await db.fechar(); });
const como = (u) => ({ headers: { 'X-Test-User': u } });
const novo = async () => { const u = 'voto' + (++n) + 'x'; await s.get('/api/eu', como(u)); return u; };
const ID = 'stefhany-crossfox';
const tot = async () => (await s.get('/api/votos?ids=' + ID)).json[ID];

test('curtir de novo não soma; trocar o voto troca; estrelas por pessoa', { skip }, async () => {
  const a = await novo(), b = await novo();
  const base = await tot();
  for (let i = 0; i < 3; i++) assert.equal((await s.post('/api/votos', { id: ID, v: 1 }, como(a))).status, 200);
  assert.equal((await tot()).up, base.up + 1, 'curtir 3x conta 1');
  let r = await s.post('/api/votos', { id: ID, v: -1 }, como(a));
  assert.equal(r.json.up, base.up); assert.equal(r.json.down, base.down + 1); assert.deepEqual(r.json.meu, { v: -1, s: 0 });
  await s.post('/api/votos', { id: ID, v: 1 }, como(b));
  r = await s.post('/api/votos', { id: ID, s: 4 }, como(b));
  assert.deepEqual(r.json.meu, { v: 1, s: 4 }, 'estrela não apaga a curtida');
  assert.equal(r.json.n, base.n + 1); assert.equal(r.json.sum, base.sum + 4);
  r = await s.post('/api/votos', { id: ID, s: 2 }, como(b));
  assert.equal(r.json.n, base.n + 1); assert.equal(r.json.sum, base.sum + 2, 'trocar estrela não soma');
  // formato antigo (from/to) continua aceito
  r = await s.post('/api/votos', { id: ID, from: 1, to: 0 }, como(b));
  assert.deepEqual(r.json.meu, { v: 0, s: 2 });
  const meus = (await s.get('/api/votos/meus?ids=' + ID + ',havaianas-de-pau', como(a))).json;
  assert.deepEqual(meus, { [ID]: { v: -1, s: 0 }, 'havaianas-de-pau': { v: 0, s: 0 } });
});

test('legado congelado entra na soma (curtidas antigas não somem)', { skip }, async () => {
  await db.pool.query("INSERT INTO votos_legado (id, up, down, sum, n) VALUES ('havaianas-de-pau', 7, 1, 9, 2) ON CONFLICT (id) DO UPDATE SET up = 7, down = 1, sum = 9, n = 2");
  const a = await novo();
  const r = await s.post('/api/votos', { id: 'havaianas-de-pau', v: 1 }, como(a));
  assert.equal(r.json.up, 8); assert.equal(r.json.down, 1);
});

test('validação: sem login 401; id inválido 400; sem v/s 400', { skip }, async () => {
  const a = await novo();
  assert.equal((await s.post('/api/votos', { id: ID, v: 1 })).status, 401);
  assert.equal((await s.get('/api/votos/meus?ids=' + ID)).status, 401);
  assert.equal((await s.post('/api/votos', { id: '../x', v: 1 }, como(a))).status, 400);
  assert.equal((await s.post('/api/votos', { id: ID }, como(a))).status, 400);
  assert.equal((await s.post('/api/votos', { id: ID, v: 99 }, como(a))).json.meu.v, 0, 'valor fora vira 0');
});
