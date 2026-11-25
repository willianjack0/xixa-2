// Leitura do acervo contra Postgres descartável (pulado sem TEST_DB_NAME). Ver test/helpers.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco, dadosDataJs } from './helpers.js';

const N = dadosDataJs();

const skip = semBanco();
let db, s;
before(async () => { if (skip) return; db = await bancoDeTeste({ seed: true }); s = await servidor(db.pool); });
after(async () => { if (skip) return; await s.fechar(); await db.fechar(); });

test('GET /api/health com banco real', { skip }, async () => {
  const r = await s.get('/api/health');
  assert.equal(r.status, 200); assert.equal(r.json.banco, 'ok');
});

test('GET /api/memes: todos os memes do data.js publicados com mídias e cache curto', { skip }, async () => {
  const r = await s.get('/api/memes');
  assert.equal(r.status, 200); assert.equal(r.json.total, N.memes); assert.equal(r.json.itens.length, N.memes);
  assert.match(r.headers.get('cache-control'), /max-age=60/);
  const h = r.json.itens.find((m) => m.id === 'havaianas-de-pau');
  assert.equal(h.titulo, 'Havaianas de Pau'); assert.equal(h.ano, 2004); assert.equal(h.youtube_id, 'I8MC6-BuU28');
  assert.equal(h.midias[0].tipo, 'imagem'); assert.match(h.midias[0].caminho, /^memes\//);
  const ordem = r.json.itens.map((m) => m.ano); assert.deepEqual(ordem, [...ordem].sort((a, b) => a - b));
});

test('GET /api/memes: filtros e paginação', { skip }, async () => {
  const f = await s.get('/api/memes?categoria=' + encodeURIComponent('Vídeos'));
  assert.ok(f.json.total > 0 && f.json.itens.every((m) => m.categoria === 'Vídeos'));
  const a = await s.get('/api/memes?ano=2004');
  assert.ok(a.json.itens.every((m) => m.ano === 2004));
  const p = await s.get('/api/memes?limite=5&offset=5');
  assert.equal(p.json.itens.length, 5); assert.equal(p.json.total, N.memes);
  const todos = (await s.get('/api/memes')).json.itens;
  assert.deepEqual(p.json.itens.map((m) => m.id), todos.slice(5, 10).map((m) => m.id));
});

test('GET /api/memes/:id: 200, 404 e 400; oculto/removido não aparece', { skip }, async () => {
  const ok = await s.get('/api/memes/havaianas-de-pau');
  assert.equal(ok.status, 200); assert.equal(ok.json.id, 'havaianas-de-pau');
  assert.equal((await s.get('/api/memes/nao-existe')).status, 404);
  assert.equal((await s.get('/api/memes/ID%20RUIM')).status, 400);
  await db.pool.query("UPDATE memes SET status = 'oculto' WHERE id = 'havaianas-de-pau'");
  assert.equal((await s.get('/api/memes/havaianas-de-pau')).status, 404);
  assert.equal((await s.get('/api/memes')).json.total, N.memes - 1);
  await db.pool.query("UPDATE memes SET status = 'publicado' WHERE id = 'havaianas-de-pau'");
});

test('GET /api/eras: todas as eras em ordem, faixa dos anos 90 fechada e a última aberta', { skip }, async () => {
  const r = await s.get('/api/eras');
  assert.equal(r.json.itens.length, N.eras);
  const primeira = r.json.itens[0];
  assert.equal(primeira.rotulo, 'Anos 90'); assert.equal(primeira.ano, 1995); assert.equal(primeira.ano_fim, 1999);
  const ultima = r.json.itens.at(-1);
  assert.equal(ultima.rotulo, '2026'); assert.equal(ultima.ano, 2026); assert.equal(ultima.ano_fim, null);
});

test('GET /api/categorias: 7 categorias, total soma todos os memes', { skip }, async () => {
  const r = await s.get('/api/categorias');
  assert.equal(r.json.itens.length, 7);
  assert.equal(r.json.itens.reduce((n, c) => n + c.total, 0), N.memes);
  for (const c of r.json.itens) assert.equal(c.total, N.porCategoria[c.nome] || 0, c.nome);
});

test('rotas legadas seguem iguais: voto agregado e comentário', { skip }, async () => {
  // votar exige login (voto por usuário: migração 016); os totais são públicos
  assert.equal((await s.post('/api/votos', { id: 'havaianas-de-pau', v: 1 })).status, 401);
  assert.deepEqual((await s.get('/api/votos?ids=havaianas-de-pau')).json['havaianas-de-pau'], { up: 0, down: 0, sum: 0, n: 0 });
  const c = await s.post('/api/comentarios', { id: 'havaianas-de-pau', autor: 'zeca', texto: 'kkk' });
  assert.equal(c.status, 201);
  assert.equal((await s.post('/api/comentarios', { id: 'meme-fantasma', autor: 'zeca', texto: 'oi' })).status, 404);
  assert.equal((await s.get('/api/comentarios?id=havaianas-de-pau')).json.itens.length, 1);
});
