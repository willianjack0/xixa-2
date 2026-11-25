// Perfil público (layout, carta favorita, álbum, patente) e recados, contra Postgres descartável (pulado sem TEST_DB_NAME).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { limparTexto } from '../perfil/publico.js';

const skip = semBanco();
let db, s, n = 0;
before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, { autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' }) });
});
after(async () => { if (skip) return; await s.fechar(); await db.fechar(); });

const q = async (sql, v) => (await db.pool.query(sql, v)).rows;
const como = (u) => ({ headers: { 'X-Test-User': u } });
const GET = (c, u) => s.get(c, como(u));
const POST = (c, corpo, u) => s.post(c, corpo, como(u));
const PATCH = (c, corpo, u) => s.patch(c, corpo, como(u));
const DEL = (c, u) => s.del(c, como(u));
const novo = async () => { const u = 'pub' + (++n) + 'x'; const e = await GET('/api/eu', u); return { u, id: e.json.usuario.id }; };
const darCartas = async (id, k) => {
  const cs = await q('SELECT id FROM cartas ORDER BY colecao_id, numero LIMIT $1', [k]);
  for (const c of cs) await q('INSERT INTO inventario_cartas (usuario_id, carta_id, quantidade) VALUES ($1,$2,1) ON CONFLICT DO NOTHING', [id, c.id]);
  return cs.map((c) => c.id);
};

test('limparTexto: tira controle e espaços repetidos, recusa vazio e acima de 300', () => {
  assert.equal(limparTexto('  oi\n\n  tudo\tbem?\u202e '), 'oi tudo bem?');
  assert.throws(() => limparTexto('   '), /escreva/);
  assert.throws(() => limparTexto(42), /escreva/);
  assert.throws(() => limparTexto('a'.repeat(301)), /300/);
  assert.equal(limparTexto('a'.repeat(300)).length, 300);
});

test('GET /api/perfil/:apelido: dados públicos, álbum e layout padrão orkut; 404 para inexistente e banido', { skip }, async () => {
  const a = await novo(), b = await novo();
  await darCartas(a.id, 3);
  const r = await GET('/api/perfil/' + a.u.toUpperCase(), b.u);
  assert.equal(r.status, 200);
  assert.equal(r.json.perfil.apelido, a.u); assert.equal(r.json.perfil.layout, 'orkut'); assert.equal(r.json.perfil.eh_meu, false);
  assert.equal(r.json.album.tenho, 3); assert.equal(r.json.album.cartas.length, 3); assert.ok(r.json.album.total >= 3);
  assert.ok(Array.isArray(r.json.album.colecoes)); assert.equal(r.json.carta_favorita, null);
  assert.equal(typeof r.json.xp, 'number'); assert.ok(r.json.patente && r.json.patente.nome);
  assert.equal(r.json.perfil.avatar_url, null);
  for (const k of ['moedas', 'csrf', 'banido', 'id']) assert.ok(!(k in r.json.perfil) && !(k in r.json), 'não vaza ' + k);
  assert.equal((await GET('/api/perfil/' + a.u, a.u)).json.perfil.eh_meu, true);
  assert.equal((await GET('/api/perfil/naoexiste_zz', b.u)).status, 404);
  assert.equal((await GET('/api/perfil/%3Cscript%3E', b.u)).status, 404);
  await q('UPDATE usuarios SET banido = true WHERE id = $1', [a.id]);
  assert.equal((await GET('/api/perfil/' + a.u, b.u)).status, 404);
  await q('UPDATE usuarios SET banido = false WHERE id = $1', [a.id]);
});

test('perfil exige login', { skip }, async () => {
  const a = await novo();
  assert.equal((await s.get('/api/perfil/' + a.u)).status, 401);
  assert.equal((await s.post('/api/perfil/' + a.u + '/recados', { texto: 'oi' })).status, 401);
});

test('PATCH /api/eu: perfil_layout (lista fechada) e carta_favorita (só carta que tem)', { skip }, async () => {
  const a = await novo(), b = await novo();
  const [c1] = await darCartas(a.id, 2);
  const outra = (await q('SELECT id FROM cartas WHERE id <> ALL($1) ORDER BY id DESC LIMIT 1', [[c1]]))[0].id;
  let r = await PATCH('/api/eu', { perfil_layout: 'fotolog', carta_favorita: c1 }, a.u);
  assert.equal(r.status, 200); assert.equal(r.json.usuario.perfil_layout, 'fotolog'); assert.equal(r.json.usuario.carta_favorita, c1);
  const p = (await GET('/api/perfil/' + a.u, b.u)).json;
  assert.equal(p.perfil.layout, 'fotolog'); assert.equal(p.carta_favorita.id, c1);
  r = await PATCH('/api/eu', { perfil_layout: 'myspace' }, a.u); assert.equal(r.status, 422); assert.equal(r.json.campo, 'perfil_layout');
  r = await PATCH('/api/eu', { perfil_layout: 3 }, a.u); assert.equal(r.status, 422);
  r = await PATCH('/api/eu', { carta_favorita: outra }, a.u); assert.equal(r.status, 422); assert.equal(r.json.campo, 'carta_favorita');
  r = await PATCH('/api/eu', { carta_favorita: '../x' }, a.u); assert.equal(r.status, 422);
  r = await PATCH('/api/eu', { perfil_layout: 'msn', carta_favorita: outra }, a.u);
  assert.equal(r.status, 422); assert.equal((await GET('/api/eu', a.u)).json.usuario.perfil_layout, 'fotolog', 'tudo ou nada');
  // carta favorita que a pessoa deixou de ter some do perfil
  await q('UPDATE inventario_cartas SET quantidade = 0 WHERE usuario_id = $1 AND carta_id = $2', [a.id, c1]);
  assert.equal((await GET('/api/perfil/' + a.u, b.u)).json.carta_favorita, null);
  r = await PATCH('/api/eu', { carta_favorita: null }, a.u); assert.equal(r.status, 200); assert.equal(r.json.usuario.carta_favorita, null);
});

test('recados: criar, listar, apagar (dono ou autor), sem recado para si mesmo', { skip }, async () => {
  const dono = await novo(), autor = await novo(), outro = await novo();
  let r = await POST(`/api/perfil/${dono.u}/recados`, { texto: '  Passando pra deixar um scrap!  ' }, autor.u);
  assert.equal(r.status, 201); assert.equal(r.json.texto, 'Passando pra deixar um scrap!'); assert.equal(r.json.autor.apelido, autor.u);
  assert.equal(r.json.pode_apagar, true);
  const id1 = r.json.id;
  const id2 = (await POST(`/api/perfil/${dono.u}/recados`, { texto: '<img src=x onerror=alert(1)>' }, outro.u)).json.id;
  r = await GET(`/api/perfil/${dono.u}/recados`, outro.u);
  assert.equal(r.status, 200); assert.equal(r.json.itens.length, 2);
  assert.equal(r.json.itens[0].id, id2, 'mais recente primeiro'); assert.equal(r.json.itens[0].texto, '<img src=x onerror=alert(1)>', 'guardado como texto; o front escapa');
  assert.deepEqual(r.json.itens.map((x) => x.pode_apagar), [true, false]);
  assert.equal((await GET('/api/perfil/' + dono.u, outro.u)).json.recados, 2);
  assert.equal((await POST(`/api/perfil/${dono.u}/recados`, { texto: 'eu mesmo' }, dono.u)).status, 422);
  assert.equal((await POST(`/api/perfil/${dono.u}/recados`, { texto: '' }, autor.u)).status, 422);
  assert.equal((await POST(`/api/perfil/${dono.u}/recados`, [1], autor.u)).status, 400);
  assert.equal((await POST('/api/perfil/ninguem_aqui/recados', { texto: 'oi' }, autor.u)).status, 404);
  // apagar: terceiro não pode (404), autor pode o seu, dono pode qualquer um
  assert.equal((await DEL('/api/recados/' + id1, outro.u)).status, 404);
  assert.equal((await DEL('/api/recados/abc', outro.u)).status, 404);
  assert.equal((await DEL('/api/recados/' + id1, autor.u)).status, 200);
  assert.equal((await DEL('/api/recados/' + id2, dono.u)).status, 200);
  assert.equal((await GET(`/api/perfil/${dono.u}/recados`, dono.u)).json.itens.length, 0);
});

test('recados: autor banido some da lista; limite de 10 por 10 min', { skip }, async () => {
  const dono = await novo(), chato = await novo();
  for (let i = 0; i < 10; i++) assert.equal((await POST(`/api/perfil/${dono.u}/recados`, { texto: 'oi ' + i }, chato.u)).status, 201);
  assert.equal((await POST(`/api/perfil/${dono.u}/recados`, { texto: 'mais um' }, chato.u)).status, 429);
  await q('UPDATE usuarios SET banido = true WHERE id = $1', [chato.id]);
  assert.equal((await GET(`/api/perfil/${dono.u}/recados`, dono.u)).json.itens.length, 0);
});
