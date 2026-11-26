// Roteador e rotas sem banco real: o pool é um falso que registra as consultas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { servidor } from './helpers.js';

const poolFalso = (resposta = () => ({ rows: [], rowCount: 0 })) => {
  const chamadas = [];
  return { chamadas, query: async (sql, val) => { chamadas.push({ sql, val }); return resposta(sql, val); } };
};

test('health: 200 com banco ok', async () => {
  const s = await servidor(poolFalso());
  const r = await s.get('/api/health');
  assert.equal(r.status, 200); assert.deepEqual(r.json, { ok: true, banco: 'ok' });
  await s.fechar();
});

test('health: 503 quando o banco falha', async () => {
  const s = await servidor({ query: async () => { throw new Error('conexão recusada'); } });
  const r = await s.get('/api/health');
  assert.equal(r.status, 503); assert.equal(r.json.ok, false);
  await s.fechar();
});

test('rota inexistente: 404 no formato antigo', async () => {
  const s = await servidor(poolFalso());
  const r = await s.get('/api/nada');
  assert.equal(r.status, 404); assert.deepEqual(r.json, { error: 'Não encontrado.' });
  await s.fechar();
});

test('/api/admin/*: sem token 401 mesmo em caminho inexistente; token errado 401; token certo passa', async () => {
  const s = await servidor(poolFalso(), { adminToken: 'segredo' });
  for (const c of ['/api/admin/feedback', '/api/admin/qualquer-coisa']) {
    const r = await s.get(c);
    assert.equal(r.status, 401, c); assert.equal(r.headers.get('www-authenticate'), 'Bearer');
  }
  assert.equal((await s.get('/api/admin/feedback', { headers: { Authorization: 'Bearer errado' } })).status, 401);
  assert.equal((await s.get('/api/admin/feedback', { headers: { Authorization: 'Bearer segredo' } })).status, 200);
  assert.equal((await s.get('/api/admin/qualquer-coisa', { headers: { Authorization: 'Bearer segredo' } })).status, 404);
  await s.fechar();
});

test('admin sem ADMIN_TOKEN configurado nunca autoriza', async () => {
  const s = await servidor(poolFalso(), { adminToken: '' });
  assert.equal((await s.get('/api/admin/feedback', { headers: { Authorization: 'Bearer ' } })).status, 401);
  await s.fechar();
});

test('validação de entrada continua igual (sem tocar no banco)', async () => {
  const pool = poolFalso(); const s = await servidor(pool, { autenticar: async () => ({ id: 1, banido: false }) });
  assert.equal((await s.get('/api/comentarios?id=ID_INVALIDO')).status, 400);
  assert.equal((await s.get('/api/memes/ID_INVALIDO')).status, 400);
  assert.equal((await s.post('/api/feedback', { msg: 'oi' })).status, 422);
  assert.equal((await s.post('/api/feedback', { 'bot-field': 'x' })).status, 201); // honeypot finge sucesso
  assert.equal((await s.post('/api/links', { id: 'abc', yt: 'curto' })).status, 422);
  assert.equal((await s.post('/api/links', { id: 'abc', yt: 'dQw4w9WgXcQ', autor: 'falsificado' })).status, 422);
  assert.equal((await s.post('/api/comentarios', { id: 'abc', autor: 'x', texto: 'oi' })).status, 422);
  assert.equal((await s.post('/api/contribuidores', { nome: 'a' })).status, 422);
  assert.equal(pool.chamadas.length, 0, 'nenhuma consulta para entrada inválida');
  await s.fechar();
});

test('JSON inválido: 400', async () => {
  const s = await servidor(poolFalso());
  const r = await fetch(s.base + '/api/feedback', { method: 'POST', body: '{nao-json' });
  assert.equal(r.status, 400);
  await s.fechar();
});

test('erro inesperado vira 500 sem vazar detalhe', async () => {
  const s = await servidor({ query: async () => { throw new Error('segredo interno'); } });
  const r = await s.get('/api/eras');
  assert.equal(r.status, 500); assert.deepEqual(r.json, { error: 'Erro interno.' });
  await s.fechar();
});

test('GET /api/memes monta filtros parametrizados e limita o tamanho', async () => {
  const pool = poolFalso((sql) => (/count\(\*\)/.test(sql) ? { rows: [{ total: 0 }] } : { rows: [] }));
  const s = await servidor(pool);
  const r = await s.get('/api/memes?ano=2008&categoria=V%C3%ADdeos&limite=99999');
  assert.equal(r.status, 200); assert.deepEqual(r.json, { total: 0, itens: [] });
  const q = pool.chamadas[0];
  assert.deepEqual(q.val, [2008, 'Vídeos']);
  assert.match(q.sql, /LIMIT 500 OFFSET 0/);
  assert.ok(!q.sql.includes('Vídeos'), 'valores nunca entram no SQL');
  await s.fechar();
});
