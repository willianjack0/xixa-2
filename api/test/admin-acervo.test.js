// Admin · acervo contra Postgres descartável (pulado sem TEST_DB_NAME): memes + mídias, cartas, coleções, eras, auditoria
// e o seed que não sobrescreve edições do admin.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';

const skip = semBanco();
let db, s;
const T = { headers: { Authorization: 'Bearer segredo' } };
before(async () => { if (skip) return; db = await bancoDeTeste({ seed: true }); s = await servidor(db.pool, { adminToken: 'segredo' }); });
after(async () => { if (skip) return; await s.fechar(); await db.fechar(); });
const log = async (acao) => (await db.pool.query('SELECT usuario_id, alvo, detalhe FROM log_auditoria WHERE acao = $1 ORDER BY id', [acao])).rows;
const um = async (sql, v = []) => (await db.pool.query(sql, v)).rows[0];

test('sem token: 401 em todas as rotas do acervo', { skip }, async () => {
  for (const c of ['/api/admin/memes', '/api/admin/memes/havaianas-de-pau', '/api/admin/cartas', '/api/admin/colecoes']) assert.equal((await s.get(c)).status, 401, c);
  assert.equal((await s.post('/api/admin/memes', { id: 'x' })).status, 401);
  assert.equal((await s.patch('/api/admin/eras/2004', { lema: 'x' })).status, 401);
});

test('memes: lista inclui ocultos, filtra e mostra total', { skip }, async () => {
  const todos = await s.get('/api/admin/memes?limite=5', T);
  assert.equal(todos.status, 200); assert.equal(todos.json.itens.length, 5); assert.ok(todos.json.total > 5);
  const h = await s.get('/api/admin/memes?busca=havaianas&ano=2004&status=publicado', T);
  assert.equal(h.json.itens[0].id, 'havaianas-de-pau');
  assert.equal((await s.get("/api/admin/memes?busca=x'%25;DROP TABLE memes;--", T)).status, 200);
  const um1 = await s.get('/api/admin/memes/havaianas-de-pau', T);
  assert.equal(um1.json.titulo, 'Havaianas de Pau'); assert.ok(um1.json.midias.length >= 1); assert.equal(typeof um1.json.midias[0].id, 'number');
  assert.equal((await s.get('/api/admin/memes/nao-existe', T)).status, 404);
});

test('memes: criar com mídias, aparecer no site público e gravar no log', { skip }, async () => {
  const corpo = { id: 'meme-de-teste', titulo: 'Meme de Teste', ano: 2015, categoria: 'Zoeira', raridade: 'Raro', emoji: '🧪', youtube_id: 'dQw4w9WgXcQ',
    midias: [{ tipo: 'imagem', caminho: 'memes/teste.jpg', credito_por: 'Alguém', credito_url: 'https://exemplo.com/x' }] };
  const r = await s.post('/api/admin/memes', corpo, T);
  assert.equal(r.status, 201, JSON.stringify(r.json)); assert.equal(r.json.meme.status, 'publicado'); assert.equal(r.json.meme.tipo, 'video');
  const pub = await s.get('/api/memes/meme-de-teste');
  assert.equal(pub.status, 200); assert.equal(pub.json.midias[0].caminho, 'memes/teste.jpg');
  const [l] = await log('meme.criar'); assert.equal(l.alvo, 'memes:meme-de-teste'); assert.equal(l.detalhe.via, 'token');
  assert.equal((await s.post('/api/admin/memes', corpo, T)).status, 409, 'id repetido');
});

test('memes: validação (campos, desconhecidos, id, categoria inexistente, mídia com caminho/URL perigosos)', { skip }, async () => {
  const base = { id: 'v-teste', titulo: 'V', ano: 2010, categoria: 'Zoeira', raridade: 'Comum' };
  const r1 = await s.post('/api/admin/memes', { id: 'V Teste', titulo: 'x' }, T); assert.equal(r1.status, 422);
  const r2 = await s.post('/api/admin/memes', { ...base, ano: 1800, raridade: 'Épico', youtube_id: 'curto', tipo: 'audio', extra: 1 }, T);
  assert.equal(r2.status, 422); assert.deepEqual(Object.keys(r2.json.campos).sort(), ['ano', 'raridade', 'tipo', 'youtube_id']); assert.deepEqual(r2.json.desconhecidos, ['extra']);
  assert.equal((await s.post('/api/admin/memes', { ...base, categoria: 'Inexistente' }, T)).status, 422, 'FK da categoria');
  for (const caminho of ['../segredo.jpg', '/etc/passwd', 'memes//x.jpg', 'a b.jpg', 'javascript:alert(1)']) {
    assert.equal((await s.post('/api/admin/memes', { ...base, midias: [{ tipo: 'imagem', caminho }] }, T)).status, 422, caminho);
  }
  assert.equal((await s.post('/api/admin/memes', { ...base, midias: [{ tipo: 'imagem', caminho: 'memes/a.jpg', credito_url: 'javascript:alert(1)' }] }, T)).status, 422);
  assert.equal((await s.post('/api/admin/memes', { ...base, midias: [{ tipo: 'imagem', caminho: 'memes/a.jpg' }, { tipo: 'imagem', caminho: 'memes/a.jpg' }] }, T)).status, 422);
  assert.equal((await um("SELECT count(*)::int AS n FROM memes WHERE id = 'v-teste'")).n, 0, 'nada gravado quando inválido');
});

test('memes: editar campos, ocultar some do site, trocar mídias e log com de/para', { skip }, async () => {
  const r = await s.patch('/api/admin/memes/meme-de-teste', { titulo: 'Meme Editado', raridade: 'Mítico', midias: [{ tipo: 'imagem', caminho: 'memes/novo.jpg' }, { tipo: 'imagem', caminho: 'midias/meme-aabbccddeeff.webp' }] }, T);
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.meme.titulo, 'Meme Editado');
  const adm = await s.get('/api/admin/memes/meme-de-teste', T);
  assert.deepEqual(adm.json.midias.map((m) => m.caminho), ['memes/novo.jpg', 'midias/meme-aabbccddeeff.webp']);
  const l = (await log('meme.editar')).at(-1);
  assert.deepEqual(l.detalhe.campos.titulo, { de: 'Meme de Teste', para: 'Meme Editado' }); assert.equal(l.detalhe.midias, 2);
  assert.equal((await s.patch('/api/admin/memes/meme-de-teste', { status: 'oculto' }, T)).status, 200);
  assert.equal((await s.get('/api/memes/meme-de-teste')).status, 404, 'oculto não aparece no site');
  assert.equal((await s.get('/api/admin/memes/meme-de-teste', T)).status, 200, 'mas o admin ainda vê');
  assert.equal((await s.patch('/api/admin/memes/meme-de-teste', {}, T)).status, 400);
  assert.equal((await s.patch('/api/admin/memes/nao-existe', { titulo: 'x' }, T)).status, 404);
  assert.equal((await s.patch('/api/admin/memes/meme-de-teste', { status: 'apagado' }, T)).status, 422);
  // mesmo valor: não polui o log
  const antes = (await log('meme.editar')).length;
  await s.patch('/api/admin/memes/meme-de-teste', { titulo: 'Meme Editado' }, T);
  assert.equal((await log('meme.editar')).length, antes);
});

test('cartas: criar na próxima posição, editar, validar meme e coleção', { skip }, async () => {
  const col = (await s.get('/api/admin/colecoes', T)).json.itens[0];
  const antes = (await s.get('/api/admin/cartas?colecao=' + col.id, T)).json.itens;
  const r = await s.post('/api/admin/cartas', { colecao_id: col.id, nome: 'Carta Nova', raridade: 'Lendário', emoji: '🃏', meme_id: 'meme-de-teste' }, T);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.carta.numero, antes.length + 1); assert.equal(r.json.carta.id, `${col.id}-${antes.length}`);
  assert.equal((await s.post('/api/admin/cartas', { colecao_id: col.id, nome: 'X', raridade: 'Lendário', meme_id: 'nao-existe' }, T)).status, 422);
  assert.equal((await s.post('/api/admin/cartas', { colecao_id: 'colecao-fantasma', nome: 'X', raridade: 'Raro' }, T)).status, 404);
  assert.equal((await s.post('/api/admin/cartas', { colecao_id: col.id, nome: 'X', raridade: 'Clássico' }, T)).status, 422, 'carta não tem Clássico');
  const e = await s.patch('/api/admin/cartas/' + r.json.carta.id, { nome: 'Carta Renomeada', meme_id: null }, T);
  assert.equal(e.status, 200); assert.equal(e.json.carta.meme_id, null);
  assert.deepEqual((await log('carta.editar')).at(-1).detalhe.campos.nome, { de: 'Carta Nova', para: 'Carta Renomeada' });
  assert.equal((await s.patch('/api/admin/cartas/nao-existe-0', { nome: 'x' }, T)).status, 404);
  assert.equal((await s.patch('/api/admin/cartas/' + r.json.carta.id, { colecao_id: 'outra' }, T)).status, 422, 'não move de coleção');
});

test('coleções e eras: listar com contagem, editar e registrar', { skip }, async () => {
  const cols = (await s.get('/api/admin/colecoes', T)).json.itens;
  assert.ok(cols.length > 0 && cols.every((c) => c.cartas > 0));
  const r = await s.patch('/api/admin/colecoes/' + cols[0].id, { nome: 'Coleção Editada', cores_fundo: ['#111111', '#222222'], ordem: 3 }, T);
  assert.equal(r.status, 200); assert.deepEqual(r.json.colecao.cores_fundo, ['#111111', '#222222']);
  assert.equal((await s.patch('/api/admin/colecoes/' + cols[0].id, { cores_fundo: 'vermelho' }, T)).status, 422);
  assert.equal((await log('colecao.editar')).length, 1);
  const e = await s.patch('/api/admin/eras/2004', { lema: 'Lema novo' }, T);
  assert.equal(e.status, 200); assert.equal(e.json.era.lema, 'Lema novo');
  assert.equal((await s.get('/api/eras')).json.itens.find((x) => x.ano === 2004).lema, 'Lema novo');
  assert.equal((await s.patch('/api/admin/eras/1850', { lema: 'x' }, T)).status, 404);
});

test('seed: com o acervo já carregado NÃO sobrescreve edições do admin; --forcar recarrega', { skip }, async () => {
  const { carregarAcervo } = await import('../seed/acervo.js');
  const titulo = (await um("SELECT titulo FROM memes WHERE id = 'havaianas-de-pau'")).titulo;
  await db.pool.query("UPDATE memes SET titulo = 'Editado pelo admin' WHERE id = 'havaianas-de-pau'");
  const msgs = []; await carregarAcervo(db.pool, { log: (m) => msgs.push(m) });
  assert.equal((await um("SELECT titulo FROM memes WHERE id = 'havaianas-de-pau'")).titulo, 'Editado pelo admin');
  assert.ok(msgs.some((m) => /mantendo as edições/.test(m)));
  assert.equal((await um("SELECT count(*)::int AS n FROM memes WHERE id = 'meme-de-teste'")).n, 1, 'meme criado pelo admin continua');
  await carregarAcervo(db.pool, { log: () => {}, forcar: true });
  assert.equal((await um("SELECT titulo FROM memes WHERE id = 'havaianas-de-pau'")).titulo, titulo);
});
