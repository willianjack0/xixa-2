// Equipe do site pelo ID do Discord (migração 019): papel aplicado uma vez, patente fixa (selo) e edição direta
// da Memepédia e dos links. Contra Postgres descartável (pulado sem TEST_DB_NAME).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { acharOuCriarUsuario } from '../auth/discord.js';
import { comPatenteFixa } from '../lib/equipe.js';

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
const ID = { be: '426581750995615754', sepp: '227198444190695424', york: '813396956722102332', sub: '429830033641570307', cid: '255084717907378187' };
// conta de teste ligada a um ID do Discord, como no login de verdade
const entrar = async (discordId, nome) => {
  await q('DELETE FROM contas_oauth WHERE provedor_id = $1', [discordId]);
  await q('UPDATE equipe SET aplicado_em = NULL WHERE discord_id = $1', [discordId]);
  const u = await acharOuCriarUsuario(db.pool, { id: discordId, username: nome + (++n) });
  return u;
};

test('comPatenteFixa: vale a maior entre XP e fixa; próxima é a seguinte à atual', () => {
  const P = [{ id: 'a', xp_minimo: 0 }, { id: 'b', xp_minimo: 100 }, { id: 'c', xp_minimo: 1000 }];
  assert.deepEqual(comPatenteFixa(P, 50, null), { atual: P[0], proxima: P[1] });
  assert.deepEqual(comPatenteFixa(P, 50, 'c'), { atual: P[2], proxima: null });
  assert.deepEqual(comPatenteFixa(P, 500, 'a'), { atual: P[1], proxima: P[2] }, 'fixa menor não rebaixa');
  assert.deepEqual(comPatenteFixa(P, 50, 'nao-existe'), { atual: P[0], proxima: P[1] });
  assert.deepEqual(comPatenteFixa([], 50, 'c'), { atual: null, proxima: null });
});

test('login: Be Rampelotto e SePPZAO entram como moderador; os outros continuam usuario', { skip }, async () => {
  for (const [k, papel] of [['be', 'moderador'], ['sepp', 'moderador'], ['sub', 'usuario'], ['york', 'usuario'], ['cid', 'usuario']]) {
    const u = await entrar(ID[k], k);
    assert.equal((await q('SELECT papel FROM usuarios WHERE id = $1', [u.id]))[0].papel, papel, k);
  }
  const outro = await acharOuCriarUsuario(db.pool, { id: '100000000000000001', username: 'qualquer' });
  assert.equal((await q('SELECT papel FROM usuarios WHERE id = $1', [outro.id]))[0].papel, 'usuario', 'quem não é da equipe não ganha nada');
});

test('papel é aplicado uma vez: se o admin rebaixar, o próximo login não devolve; admin não é rebaixado', { skip }, async () => {
  const u = await entrar(ID.be, 'be');
  await q("UPDATE usuarios SET papel = 'usuario' WHERE id = $1", [u.id]);
  await acharOuCriarUsuario(db.pool, { id: ID.be, username: 'be' });
  assert.equal((await q('SELECT papel FROM usuarios WHERE id = $1', [u.id]))[0].papel, 'usuario');
  const v = await entrar(ID.sepp, 'sepp');
  await q("UPDATE usuarios SET papel = 'admin' WHERE id = $1", [v.id]);
  await q('UPDATE equipe SET aplicado_em = NULL WHERE discord_id = $1', [ID.sepp]);
  await acharOuCriarUsuario(db.pool, { id: ID.sepp, username: 'sepp' });
  assert.equal((await q('SELECT papel FROM usuarios WHERE id = $1', [v.id]))[0].papel, 'admin');
});

test('CidCidoso: patente Lenda da internet sem XP (em /api/eu, carteira e perfil), sem ganhar XP nem moedas', { skip }, async () => {
  const u = await entrar(ID.cid, 'cid');
  const eu = (await s.get('/api/eu', como(u.apelido))).json;
  assert.equal(eu.patente.id, 'lenda'); assert.equal(eu.proxima_patente, null); assert.equal(eu.xp, 0);
  assert.equal((await s.get('/api/carteira', como(u.apelido))).json.patente.id, 'lenda');
  assert.equal((await q('SELECT count(*)::int AS n FROM eventos_xp WHERE usuario_id = $1', [u.id]))[0].n, 0);
  const outro = await acharOuCriarUsuario(db.pool, { id: '100000000000000002', username: 'visita' });
  assert.equal((await s.get('/api/perfil/' + u.apelido, como(outro.apelido))).json.patente.id, 'lenda');
});

test('edita_direto: Subversivo e yorkshire publicam na Memepédia e trocam link na hora; usuário comum recebe 403', { skip }, async () => {
  const meme = (await q('SELECT id FROM memes ORDER BY id LIMIT 1'))[0].id;
  const sub = await entrar(ID.sub, 'sub'), york = await entrar(ID.york, 'york');
  const comum = await acharOuCriarUsuario(db.pool, { id: '100000000000000003', username: 'comum' });
  assert.equal((await s.get('/api/eu', como(sub.apelido))).json.edita_direto, true);
  assert.equal((await s.get('/api/eu', como(comum.apelido))).json.edita_direto, false);
  assert.equal((await s.post('/api/memepedia/direto', { id: meme, campo: 'origem', texto: 'curto' })).status, 401);
  let r = await s.post('/api/memepedia/direto', { id: meme, campo: 'origem', texto: 'Texto de teste da equipe, com fonte.' }, como(comum.apelido));
  assert.equal(r.status, 403);
  r = await s.post('/api/memepedia/direto', { id: meme, campo: 'origem', texto: 'Texto de teste da equipe, com fonte.', fonte: 'https://exemplo.com/x' }, como(sub.apelido));
  assert.equal(r.status, 201);
  const pub = (await s.get('/api/memepedia?id=' + meme)).json[meme].origem;
  assert.equal(pub.texto, 'Texto de teste da equipe, com fonte.'); assert.equal(pub.autor, sub.apelido);
  assert.equal((await s.post('/api/memepedia/direto', { id: meme, campo: 'xx', texto: 'Texto de teste da equipe.' }, como(sub.apelido))).status, 422);
  // link: adiciona e depois troca; o aprovado mais recente vale
  assert.equal((await s.post('/api/links/direto', { id: meme, yt: 'aaaaaaaaaaa' }, como(comum.apelido))).status, 403);
  assert.equal((await s.post('/api/links/direto', { id: meme, yt: 'aaaaaaaaaaa' }, como(york.apelido))).status, 201);
  assert.equal((await s.get('/api/links/aprovados')).json[meme], 'aaaaaaaaaaa');
  await new Promise((ok) => setTimeout(ok, 20));
  assert.equal((await s.post('/api/links/direto', { id: meme, yt: 'bbbbbbbbbbb' }, como(sub.apelido))).status, 201);
  assert.equal((await s.get('/api/links/aprovados')).json[meme], 'bbbbbbbbbbb');
  assert.equal((await s.post('/api/links/direto', { id: meme, yt: 'curto' }, como(sub.apelido))).status, 422);
  // sem XP por isso (por enquanto)
  assert.equal((await q('SELECT count(*)::int AS n FROM eventos_xp WHERE usuario_id = ANY($1)', [[sub.id, york.id]]))[0].n, 0);
});

test('moderador não publica direto; admin sim', { skip }, async () => {
  const be = await entrar(ID.be, 'be');
  await q("UPDATE usuarios SET papel = 'moderador' WHERE id = $1", [be.id]);
  assert.equal((await s.get('/api/eu', como(be.apelido))).json.edita_direto, false);
  await q("UPDATE usuarios SET papel = 'admin' WHERE id = $1", [be.id]);
  assert.equal((await s.get('/api/eu', como(be.apelido))).json.edita_direto, true);
});
