// Teste de sugestão e aprovação de links e recompensa de link antigo (regras_economia).
// Valida:
// 1. POST /api/links sem login = 401;
// 2. POST /api/links com autor no corpo = 422;
// 3. POST /api/links com login grava usuario_id da sessão e autor = apelido da conta;
// 4. POST /api/admin/links/:id: aprovar paga a conta da sessão uma vez;
// 5. Apelido alterado depois do envio ainda paga a conta certa (paga por usuario_id);
// 6. Link antigo sem usuario_id (NULL) aprova normalmente e não paga ninguém;
// 7. Recusar não paga;
// 8. Idempotência: aprovar de novo não paga outra vez;
// 9. Razão e cache conferidos e batendo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';

const skip = semBanco();
let db, s;

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, {
    autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test_p' }),
    adminToken: 'segredo-admin'
  });
});

after(async () => {
  if (s) await s.fechar();
  if (db) await db.fechar();
});

const q = async (sql, val) => (await db.pool.query(sql, val)).rows;
const adminHeader = { Authorization: 'Bearer segredo-admin' };

async function criarUsuario(apelido) {
  const { rows: [u] } = await db.pool.query(
    'INSERT INTO usuarios (apelido, avatar_gato) VALUES ($1, $2) RETURNING id, apelido, xp, moedas',
    [apelido, JSON.stringify({ fur: 0, pat: 0, eye: 0, acc: 0, clo: 0, bg: 0 })]
  );
  return u;
}

test('POST /api/links: sem login = 401', { skip }, async () => {
  const r = await s.post('/api/links', { id: 'havaianas-de-pau', yt: 'dQw4w9WgXcQ' });
  assert.equal(r.status, 401);
  assert.equal(r.json.erro, 'login necessário');
});

test('POST /api/links: autor no corpo = 422', { skip }, async () => {
  const r = await s.post('/api/links', {
    id: 'havaianas-de-pau',
    yt: 'dQw4w9WgXcQ',
    autor: 'hacker'
  }, { headers: { 'X-Test-User': 'vitima' } });
  assert.equal(r.status, 422);
  assert.match(r.json.erro, /O autor é definido pela conta logada/);
});

test('POST /api/links: com login grava usuario_id da sessão e autor = apelido da conta', { skip }, async () => {
  const u = await criarUsuario('enviador_link_1');
  const memeId = 'havaianas-de-pau';

  const r = await s.post('/api/links', {
    id: memeId,
    yt: 'dQw4w9WgXc1'
  }, { headers: { 'X-Test-User': u.apelido } });

  assert.equal(r.status, 201);
  assert.equal(r.json.ok, true);

  const [link] = await q('SELECT meme_id, yt, autor, usuario_id, status FROM links_sugeridos WHERE yt = $1', ['dQw4w9WgXc1']);
  assert.ok(link);
  assert.equal(link.autor, u.apelido);
  assert.equal(Number(link.usuario_id), Number(u.id));
  assert.equal(link.status, 'pendente');
});

test('POST /api/admin/links/:id: aprovar paga a conta da sessão uma vez e grava auditoria', { skip }, async () => {
  const u = await criarUsuario('enviador_link_2');
  const memeId = 'havaianas-de-pau';

  const { rows: [link] } = await db.pool.query(
    "INSERT INTO links_sugeridos (meme_id, yt, autor, usuario_id, status) VALUES ($1, 'dQw4w9WgXc2', $2, $3, 'pendente') RETURNING id",
    [memeId, u.apelido, u.id]
  );

  const regras = Object.fromEntries((await q('SELECT chave, valor FROM regras_economia')).map((x) => [x.chave, x.valor]));
  const xpEsperado = regras.xp_ganho?.link_antigo || 10;
  const moedasEsperadas = regras.recompensa_moedas?.link_antigo || 5;

  const r = await s.post(`/api/admin/links/${link.id}`, { status: 'aprovado' }, { headers: adminHeader });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);

  const [linkAtualizado] = await q('SELECT status, revisado_em FROM links_sugeridos WHERE id = $1', [link.id]);
  assert.equal(linkAtualizado.status, 'aprovado');
  assert.ok(linkAtualizado.revisado_em);

  const [uAtualizado] = await q('SELECT xp, moedas FROM usuarios WHERE id = $1', [u.id]);
  assert.equal(Number(uAtualizado.xp), xpEsperado);
  assert.equal(Number(uAtualizado.moedas), moedasEsperadas);

  const [razaoXp] = await q(
    `SELECT COALESCE(sum(valor), 0)::int AS xr FROM eventos_xp WHERE usuario_id = $1 AND motivo = 'link_antigo' AND ref = $2`,
    [u.id, 'link:' + link.id]
  );
  const [razaoMoeda] = await q(
    `SELECT COALESCE(sum(valor), 0)::int AS mr FROM movimentos_moeda WHERE usuario_id = $1 AND motivo = 'link_antigo' AND ref = $2`,
    [u.id, 'link:' + link.id]
  );
  assert.equal(razaoXp.xr, xpEsperado);
  assert.equal(razaoMoeda.mr, moedasEsperadas);

  const logs = await q("SELECT acao, alvo, detalhe FROM log_auditoria WHERE acao = 'link.aprovar' AND alvo = $1", ['links_sugeridos:' + link.id]);
  assert.ok(logs.length >= 1);
  assert.equal(logs[0].detalhe.status_anterior, 'pendente');
  assert.equal(logs[0].detalhe.autor_usuario_id, u.id);

  // Idempotência: aprovar de novo não paga outra vez
  const r2 = await s.post(`/api/admin/links/${link.id}`, { status: 'aprovado' }, { headers: adminHeader });
  assert.equal(r2.status, 200);

  const [uRepetido] = await q('SELECT xp, moedas FROM usuarios WHERE id = $1', [u.id]);
  assert.equal(Number(uRepetido.xp), xpEsperado);
  assert.equal(Number(uRepetido.moedas), moedasEsperadas);
});

test('POST /api/admin/links/:id: apelido alterado depois do envio ainda paga a conta certa (paga por usuario_id)', { skip }, async () => {
  const u = await criarUsuario('enviador_original');
  const memeId = 'havaianas-de-pau';

  const { rows: [link] } = await db.pool.query(
    "INSERT INTO links_sugeridos (meme_id, yt, autor, usuario_id, status) VALUES ($1, 'dQw4w9WgXc3', $2, $3, 'pendente') RETURNING id",
    [memeId, u.apelido, u.id]
  );

  // O usuário muda de apelido
  await db.pool.query("UPDATE usuarios SET apelido = 'enviador_renomeado' WHERE id = $1", [u.id]);

  const regras = Object.fromEntries((await q('SELECT chave, valor FROM regras_economia')).map((x) => [x.chave, x.valor]));
  const xpEsperado = regras.xp_ganho?.link_antigo || 10;
  const moedasEsperadas = regras.recompensa_moedas?.link_antigo || 5;

  const r = await s.post(`/api/admin/links/${link.id}`, { status: 'aprovado' }, { headers: adminHeader });
  assert.equal(r.status, 200);

  const [uApos] = await q('SELECT xp, moedas FROM usuarios WHERE id = $1', [u.id]);
  assert.equal(Number(uApos.xp), xpEsperado);
  assert.equal(Number(uApos.moedas), moedasEsperadas);
});

test('POST /api/admin/links/:id: link antigo sem usuario_id (NULL) aprova normalmente e não paga', { skip }, async () => {
  const memeId = 'havaianas-de-pau';

  const { rows: [link] } = await db.pool.query(
    "INSERT INTO links_sugeridos (meme_id, yt, autor, usuario_id, status) VALUES ($1, 'dQw4w9WgXc4', 'autor_antigo_sem_conta', NULL, 'pendente') RETURNING id",
    [memeId]
  );

  const r = await s.post(`/api/admin/links/${link.id}`, { status: 'aprovado' }, { headers: adminHeader });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);

  const [linkAtualizado] = await q('SELECT status FROM links_sugeridos WHERE id = $1', [link.id]);
  assert.equal(linkAtualizado.status, 'aprovado');

  const [qtdEventos] = await q("SELECT count(*)::int AS n FROM eventos_xp WHERE ref = $1", ['link:' + link.id]);
  assert.equal(qtdEventos.n, 0);
});

test('POST /api/admin/links/:id: recusar link pendente NÃO paga moedas nem XP', { skip }, async () => {
  const u = await criarUsuario('enviador_recusado');
  const memeId = 'havaianas-de-pau';

  const { rows: [link] } = await db.pool.query(
    "INSERT INTO links_sugeridos (meme_id, yt, autor, usuario_id, status) VALUES ($1, 'dQw4w9WgXc5', $2, $3, 'pendente') RETURNING id",
    [memeId, u.apelido, u.id]
  );

  const r = await s.post(`/api/admin/links/${link.id}`, { status: 'recusado' }, { headers: adminHeader });
  assert.equal(r.status, 200);

  const [uApos] = await q('SELECT xp, moedas FROM usuarios WHERE id = $1', [u.id]);
  assert.equal(Number(uApos.xp), 0);
  assert.equal(Number(uApos.moedas), 0);

  const [qtdEventos] = await q("SELECT count(*)::int AS n FROM eventos_xp WHERE ref = $1", ['link:' + link.id]);
  assert.equal(qtdEventos.n, 0);

  const logs = await q("SELECT acao, detalhe FROM log_auditoria WHERE acao = 'link.recusar' AND alvo = $1", ['links_sugeridos:' + link.id]);
  assert.ok(logs.length >= 1);
  assert.equal(logs[0].detalhe.status_anterior, 'pendente');
});
