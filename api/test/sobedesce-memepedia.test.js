// Sobe.Desce (visitas/cliques reais) e Memepédia (textos moderados). Precisa de Postgres de teste.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bancoDeTeste, servidor, semBanco } from './helpers.js';

const pular = semBanco();
let db, api;
before(async () => { if (pular) return; db = await bancoDeTeste({ seed: true }); api = await servidor(db.pool, { adminToken: 'segredo' }); });
after(async () => { if (pular) return; await api.fechar(); await db.fechar(); });
const ip = (n) => ({ headers: { 'X-Forwarded-For': '10.0.0.' + n } });

test('eventos: 1 visita por meme, IP e dia; clique conta à parte', { skip: pular }, async () => {
  assert.equal((await api.post('/api/eventos', { id: 'para-nossa-alegria', tipo: 'visita' }, ip(1))).status, 202);
  await api.post('/api/eventos', { id: 'para-nossa-alegria', tipo: 'visita' }, ip(1)); // repetido: não conta
  await api.post('/api/eventos', { id: 'para-nossa-alegria', tipo: 'visita' }, ip(2));
  await api.post('/api/eventos', { id: 'calma-calabreso', tipo: 'visita' }, ip(3));
  await api.post('/api/eventos', { id: 'calma-calabreso', tipo: 'clique' }, ip(3));
  const v = await api.get('/api/sobedesce?tipo=visitados&periodo=hoje');
  assert.equal(v.status, 200);
  assert.deepEqual(v.json.sobe.map((x) => [x.id, x.hoje]), [['para-nossa-alegria', 2], ['calma-calabreso', 1]]);
  const c = await api.get('/api/sobedesce?tipo=clicados&periodo=sempre');
  assert.equal(c.json.sobe[0].id, 'calma-calabreso');
  assert.equal(c.json.sobe[0].total, 1);
  assert.equal(c.json.desce.length, 5);
});

test('eventos: rejeita tipo ou meme inválido', { skip: pular }, async () => {
  assert.equal((await api.post('/api/eventos', { id: 'para-nossa-alegria', tipo: 'like' })).status, 400);
  assert.equal((await api.post('/api/eventos', { id: 'nao-existe-esse', tipo: 'visita' })).status, 404);
});

test('sobedesce hoje: desce = quem caiu desde ontem', { skip: pular }, async () => {
  await db.pool.query(`INSERT INTO eventos_meme_dia (meme_id, tipo, dia, total) VALUES ('tapa-na-pantera','visita',(now() AT TIME ZONE 'America/Sao_Paulo')::date - 1, 9)`);
  const v = await api.get('/api/sobedesce?tipo=visitados&periodo=hoje');
  assert.equal(v.json.desce[0].id, 'tapa-na-pantera');
  assert.equal(v.json.desce[0].ontem, 9);
});

test('memepédia: só aparece depois de aprovado', { skip: pular }, async () => {
  const r = await api.post('/api/memepedia', { id: 'tapa-na-pantera', campo: 'origem', texto: 'Curta-metragem de 2006 dirigido por Esmir Filho, Mariana Bastos e Rafael Gomes.', autor: 'Subversivo' });
  assert.equal(r.status, 201);
  assert.deepEqual((await api.get('/api/memepedia?id=tapa-na-pantera')).json, {});
  assert.equal((await api.get('/api/admin/memepedia')).status, 401);
  const fila = await api.get('/api/admin/memepedia', { headers: { Authorization: 'Bearer segredo' } });
  const id = fila.json.items[0].id;
  assert.equal((await api.post('/api/admin/memepedia/' + id, { status: 'aprovado' }, { headers: { Authorization: 'Bearer segredo' } })).status, 200);
  const [log] = (await db.pool.query("SELECT acao, alvo, detalhe FROM log_auditoria WHERE acao = 'memepedia.moderar' ORDER BY id DESC LIMIT 1")).rows;
  assert.equal(log?.acao, 'memepedia.moderar');
  assert.equal(log?.alvo, 'memes:tapa-na-pantera');
  assert.equal(log?.detalhe?.para, 'aprovado');
  const pub = await api.get('/api/memepedia?id=tapa-na-pantera');
  assert.match(pub.json['tapa-na-pantera'].origem.texto, /Esmir Filho/);
});

test('memepédia: valida campo, tamanho e autor', { skip: pular }, async () => {
  assert.equal((await api.post('/api/memepedia', { id: 'tapa-na-pantera', campo: 'xx', texto: 'texto qualquer aqui', autor: 'Subversivo' })).status, 422);
  assert.equal((await api.post('/api/memepedia', { id: 'tapa-na-pantera', campo: 'usos', texto: 'curto', autor: 'Subversivo' })).status, 422);
  assert.equal((await api.post('/api/memepedia', { id: 'tapa-na-pantera', campo: 'usos', texto: 'texto qualquer aqui', autor: 'a' })).status, 422);
});
