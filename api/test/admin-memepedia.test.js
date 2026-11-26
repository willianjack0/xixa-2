// Memepédia no painel: cobertura, editor por campo, histórico, restaurar, pendentes, permissão, auditoria e limites.
// Postgres descartável (pulado sem TEST_DB_NAME). Login = auth-stub (X-Test-User).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { lerTextoEFonte, TEXTO_MAX } from '../routes/admin-memepedia.js';

const CAMPOS = ['origem', 'porque', 'usos', 'rede', 'hoje', 'curiosidades'];

// ---- partes puras ----
test('lerTextoEFonte: limites do texto (10 a 2000) e fonte http/https de até 300 caracteres', () => {
  assert.deepEqual(lerTextoEFonte({ texto: '  Um texto com mais de dez letras.  ' }), { texto: 'Um texto com mais de dez letras.', fonte: null });
  assert.equal(lerTextoEFonte({ texto: 'curto' }).erro.includes('10'), true);
  assert.match(lerTextoEFonte({ texto: 'a'.repeat(TEXTO_MAX + 1) }).erro, /2000/);
  assert.equal(lerTextoEFonte({ texto: 'a'.repeat(TEXTO_MAX) }).erro, undefined);
  assert.ok(lerTextoEFonte({}).erro); assert.ok(lerTextoEFonte({ texto: 5 }).erro);
  assert.equal(lerTextoEFonte({ texto: 'texto valido aqui', fonte: 'https://pt.wikipedia.org/wiki/X' }).fonte, 'https://pt.wikipedia.org/wiki/X');
  for (const ruim of ['javascript:alert(1)', 'ftp://x.com/a', 'sem esquema', 'https://x.com/ a', 'https://x.com/' + 'a'.repeat(300), 5, {}])
    assert.ok(lerTextoEFonte({ texto: 'texto valido aqui', fonte: ruim }).erro, String(ruim).slice(0, 30));
  assert.equal(lerTextoEFonte({ texto: 'texto valido aqui', fonte: '' }).fonte, null);
  assert.equal(lerTextoEFonte({ texto: 'texto\u0000 com\u0007 controle ok' }).texto, 'texto  com  controle ok');
});

// ---- com banco ----
const skip = semBanco();
let db, s;
const q = async (sql, v = []) => (await db.pool.query(sql, v)).rows;
const como = (u) => ({ headers: { 'X-Test-User': u } });
const TOKEN = { headers: { Authorization: 'Bearer segredo' } };
let n = 0, memeN = 0;

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, { autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' }), adminToken: 'segredo', auth: { origemSite: 'https://naosalvo.teste' } });
});
after(async () => { if (skip) return; await s.fechar(); await db.fechar(); });

async function pessoa(papel = 'usuario') {
  const u = `mp${++n}x`;
  const e = await s.get('/api/eu', como(u));
  if (papel !== 'usuario') await q('UPDATE usuarios SET papel = $2 WHERE id = $1', [e.json.usuario.id, papel]);
  return { u, id: e.json.usuario.id };
}
/** um meme só para o teste, sem nenhuma edição da Memepédia */
async function meme(titulo = 'Meme de teste') {
  const id = 'mpteste-' + (++memeN) + '-' + Math.random().toString(36).slice(2, 6);
  const cat = (await q('SELECT nome FROM categorias LIMIT 1'))[0].nome;
  await q("INSERT INTO memes (id, titulo, ano, categoria, raridade) VALUES ($1,$2,2010,$3,'Comum')", [id, titulo, cat]);
  return id;
}
const publicar = (u, id, campo, corpo) => s.post(`/api/mod/memepedia/memes/${id}/campos/${campo}`, corpo, como(u));
const ver = async (u, id) => (await s.get(`/api/mod/memepedia/memes/${id}`, como(u))).json;
const lista = async (u, qs = '') => (await s.get('/api/mod/memepedia/memes' + qs, como(u))).json;
const log = (acao, alvo) => q('SELECT usuario_id, detalhe FROM log_auditoria WHERE acao = $1 AND alvo = $2 ORDER BY id', [acao, 'memes:' + alvo]);
const pendente = async (id, campo, texto, autor = 'visitante') =>
  Number((await q("INSERT INTO memepedia_edicoes (meme_id, campo, texto, autor) VALUES ($1,$2,$3,$4) RETURNING id", [id, campo, texto, autor]))[0].id);

test('permissão: sem login 401; usuário comum 403 em todas as rotas; moderador e admin passam', { skip }, async () => {
  const id = await meme(); const comum = await pessoa(), mod = await pessoa('moderador'), adm = await pessoa('admin');
  const ed = await pendente(id, 'origem', 'Texto pendente com tamanho ok');
  const rotas = [['get', '/api/mod/memepedia/memes'], ['get', `/api/mod/memepedia/memes/${id}`], ['post', `/api/mod/memepedia/memes/${id}/campos/origem`, { texto: 'Texto novo valido aqui' }],
    ['post', `/api/mod/memepedia/edicoes/${ed}/decidir`, { status: 'aprovado' }], ['post', `/api/mod/memepedia/edicoes/${ed}/restaurar`, {}]];
  for (const [m, c, corpo] of rotas) {
    assert.equal((await (m === 'get' ? s.get(c) : s.post(c, corpo))).status, 401, 'sem login ' + c);
    assert.equal((await (m === 'get' ? s.get(c, como(comum.u)) : s.post(c, corpo, como(comum.u)))).status, 403, 'comum ' + c);
  }
  assert.equal((await s.get('/api/mod/memepedia/memes', como(mod.u))).status, 200);
  assert.equal((await s.get('/api/mod/memepedia/memes', como(adm.u))).status, 200);
  assert.equal((await publicar(mod.u, id, 'usos', { texto: 'Moderador publica direto sem fila.' })).status, 201);
  assert.equal((await q('SELECT status FROM memepedia_edicoes WHERE id = $1', [ed]))[0].status, 'pendente', 'comum não mexeu');
});

test('lista: cobertura por campo, filtros (sem, incompletos, completos, pendentes), busca, paginação e resumo', { skip }, async () => {
  const mod = await pessoa('moderador');
  const antes = (await lista(mod.u)).resumo;
  const sem = await meme('Zqxv Sem Texto'), inc = await meme('Zqxv Incompleto'), comp = await meme('Zqxv Completo'), pen = await meme('Zqxv Com Pendente');
  assert.equal(antes.campos_total, antes.memes * 6);
  assert.equal(antes.sem_nenhum + antes.incompletos + antes.completos, antes.memes);
  for (const c of ['origem', 'porque']) assert.equal((await publicar(mod.u, inc, c, { texto: 'Texto aprovado de ' + c + ' ok' })).status, 201);
  for (const c of CAMPOS) assert.equal((await publicar(mod.u, comp, c, { texto: 'Texto aprovado de ' + c + ' ok' })).status, 201);
  await pendente(pen, 'hoje', 'Texto ainda pendente de moderar');
  const get = async (qs) => (await lista(mod.u, qs));
  const por = async (filtro) => (await get(`?busca=Zqxv&filtro=${filtro}&limite=100`)).itens.map((i) => i.id).sort();
  assert.deepEqual(await por('todos'), [sem, inc, comp, pen].sort());
  assert.deepEqual(await por('sem'), [sem, pen].sort(), 'pendente não conta como texto aprovado');
  assert.deepEqual(await por('incompletos'), [inc]);
  assert.deepEqual(await por('completos'), [comp]);
  assert.deepEqual(await por('pendentes'), [pen]);
  const it = (await get('?busca=Zqxv+Incompleto')).itens[0];
  assert.equal(it.id, inc); assert.equal(it.preenchidos, 2); assert.deepEqual([...it.campos].sort(), ['origem', 'porque']); assert.equal(it.pendentes, 0);
  const itc = (await get('?busca=Zqxv+Completo')).itens[0]; assert.equal(itc.preenchidos, 6);
  assert.equal((await get('?busca=Zqxv+Com+Pendente')).itens[0].pendentes, 1);
  const depois = (await get()).resumo;
  assert.equal(depois.memes, antes.memes + 4);
  assert.equal(depois.campos_preenchidos, antes.campos_preenchidos + 8);
  assert.equal(depois.completos, antes.completos + 1); assert.equal(depois.incompletos, antes.incompletos + 1); assert.equal(depois.sem_nenhum, antes.sem_nenhum + 2);
  assert.equal(depois.pendentes, antes.pendentes + 1);
  assert.equal((await get('?busca=%25&limite=100')).total, 0, '% não vira curinga');
  assert.equal((await get('?busca=' + encodeURIComponent(inc))).itens[0].id, inc, 'busca também pelo id');
  const p1 = await get('?limite=2&pagina=1'), p2 = await get('?limite=2&pagina=2');
  assert.equal(p1.itens.length, 2); assert.notEqual(p1.itens[0].id, p2.itens[0].id); assert.deepEqual(p1.campos, CAMPOS);
  for (const ruim of ['?filtro=xx', '?limite=0', '?limite=101', '?pagina=0', '?busca=' + 'a'.repeat(61)]) assert.equal((await s.get('/api/mod/memepedia/memes' + ruim, como(mod.u))).status, 400, ruim);
  await q("UPDATE memes SET status = 'removido' WHERE id = $1", [sem]);
  assert.ok(!(await por('todos')).includes(sem), 'meme removido não entra');
});

test('meme: 6 campos com texto atual, histórico completo (aprovadas, recusadas, pendentes) e sem dado sensível', { skip }, async () => {
  const mod = await pessoa('moderador'); const id = await meme('Meme Histórico');
  assert.equal((await s.get('/api/mod/memepedia/memes/nao-existe', como(mod.u))).status, 404);
  const v = await ver(mod.u, id);
  assert.equal(v.meme.id, id); assert.deepEqual(v.campos.map((c) => c.campo), CAMPOS); assert.ok(v.campos.every((c) => c.atual === null && c.historico.length === 0));
  assert.deepEqual(v.limites, { texto_min: 10, texto_max: 2000, fonte_max: 300 });
  await publicar(mod.u, id, 'origem', { texto: 'Primeira versão publicada.' });
  const p = await pendente(id, 'origem', 'Sugestão da comunidade pendente');
  const rec = await pendente(id, 'origem', 'Sugestão recusada da comunidade');
  await q("UPDATE memepedia_edicoes SET status = 'recusado', revisado_em = now() WHERE id = $1", [rec]);
  await publicar(mod.u, id, 'origem', { texto: 'Segunda versão publicada.', fonte: 'https://exemplo.com/fonte' });
  const o = (await ver(mod.u, id)).campos.find((c) => c.campo === 'origem');
  assert.equal(o.atual.texto, 'Segunda versão publicada.'); assert.equal(o.atual.fonte, 'https://exemplo.com/fonte'); assert.equal(o.atual_id, o.atual.id);
  assert.equal(o.pendentes, 1); assert.equal(o.historico.length, 4);
  assert.deepEqual(o.historico.map((e) => e.status).sort(), ['aprovado', 'aprovado', 'pendente', 'recusado']);
  assert.ok(o.historico.every((e) => !('ip_hash' in e)), 'ip_hash nunca sai');
  assert.ok(o.historico.some((e) => e.id === p && e.status === 'pendente'));
});

test('publicar direto: vira o texto atual, autor = apelido, auditoria, sem mudança quando igual, limites e erros', { skip }, async () => {
  const mod = await pessoa('moderador'); const id = await meme();
  const r = await publicar(mod.u, id, 'porque', { texto: '  Texto publicado direto pelo painel.  ', fonte: 'https://exemplo.com/a' });
  assert.equal(r.status, 201); assert.equal(r.json.publicado, true);
  const [e] = await q('SELECT * FROM memepedia_edicoes WHERE id = $1', [r.json.edicao_id]);
  assert.equal(e.status, 'aprovado'); assert.equal(e.autor, mod.u); assert.equal(e.texto, 'Texto publicado direto pelo painel.'); assert.ok(e.revisado_em); assert.equal(e.ip_hash, null);
  const pub = (await s.get('/api/memepedia?id=' + id)).json;
  assert.equal(pub[id].porque.texto, 'Texto publicado direto pelo painel.'); assert.equal(pub[id].porque.autor, mod.u);
  const a = await log('memepedia.direto', id);
  assert.equal(a.length, 1); assert.equal(Number(a[0].usuario_id), mod.id); assert.equal(a[0].detalhe.campo, 'porque'); assert.equal(a[0].detalhe.edicao_id, r.json.edicao_id);
  const igual = await publicar(mod.u, id, 'porque', { texto: 'Texto publicado direto pelo painel.', fonte: 'https://exemplo.com/a' });
  assert.equal(igual.status, 200); assert.equal(igual.json.sem_mudanca, true);
  assert.equal((await q('SELECT count(*)::int AS n FROM memepedia_edicoes WHERE meme_id = $1', [id]))[0].n, 1, 'igual não cria linha');
  for (const [corpo, re] of [[{ texto: 'curto' }, /10/], [{ texto: 'x'.repeat(2001) }, /2000/], [{}, /obrigatório/], [{ texto: 5 }, /obrigatório/],
    [{ texto: 'texto valido aqui', fonte: 'javascript:alert(1)' }, /fonte/], [{ texto: 'texto valido aqui', fonte: 'x'.repeat(301) }, /fonte/]]) {
    const x = await publicar(mod.u, id, 'usos', corpo); assert.equal(x.status, 422, JSON.stringify(corpo).slice(0, 40)); assert.match(x.json.erro, re);
  }
  assert.equal((await publicar(mod.u, id, 'usos', { texto: 'x'.repeat(2000) })).status, 201, 'exatamente 2000 passa');
  assert.equal((await publicar(mod.u, id, 'campo-que-nao-existe', { texto: 'texto valido aqui' })).status, 404);
  assert.equal((await publicar(mod.u, 'nao-existe-9', 'usos', { texto: 'texto valido aqui' })).status, 404);
  assert.equal((await publicar(mod.u, 'Maiuscula', 'usos', { texto: 'texto valido aqui' })).status, 404);
  const rem = await meme(); await q("UPDATE memes SET status = 'removido' WHERE id = $1", [rem]);
  assert.equal((await publicar(mod.u, rem, 'usos', { texto: 'texto valido aqui' })).status, 404);
  const xss = await publicar(mod.u, id, 'rede', { texto: '<img src=x onerror=alert(1)> texto guardado como texto' });
  assert.equal(xss.status, 201); assert.match((await ver(mod.u, id)).campos.find((c) => c.campo === 'rede').atual.texto, /^<img src=x/);
});

test('pendentes: aprovar vira o texto atual, recusar não; só pendente; segunda decisão 409; auditoria; concorrência', { skip }, async () => {
  const mod = await pessoa('moderador'), comum = await pessoa(); const id = await meme();
  await publicar(mod.u, id, 'hoje', { texto: 'Texto atual antes da sugestão.' });
  const a = await pendente(id, 'hoje', 'Sugestão que será aprovada ok'), b = await pendente(id, 'hoje', 'Sugestão que será recusada ok');
  const dec = (e, status, u = mod.u) => s.post(`/api/mod/memepedia/edicoes/${e}/decidir`, { status }, como(u));
  assert.equal((await dec(a, 'aprovado', comum.u)).status, 403);
  for (const ruim of ['pendente', 'xx', undefined]) assert.equal((await dec(a, ruim)).status, 400);
  assert.equal((await dec(999999999, 'aprovado')).status, 404);
  assert.equal((await dec(b, 'recusado')).status, 200);
  assert.equal((await ver(mod.u, id)).campos.find((c) => c.campo === 'hoje').atual.texto, 'Texto atual antes da sugestão.', 'recusar não publica');
  assert.equal((await dec(a, 'aprovado')).status, 200);
  assert.equal((await ver(mod.u, id)).campos.find((c) => c.campo === 'hoje').atual.texto, 'Sugestão que será aprovada ok');
  assert.equal((await dec(a, 'recusado')).status, 409, 'já decidida'); assert.equal((await dec(b, 'aprovado')).status, 409);
  const lg = await log('memepedia.moderar', id);
  assert.deepEqual(lg.map((x) => [x.detalhe.edicao_id, x.detalhe.de, x.detalhe.para]), [[b, 'pendente', 'recusado'], [a, 'pendente', 'aprovado']]);
  const c = await pendente(id, 'hoje', 'Sugestão para decidir em paralelo');
  const rs = await Promise.all([dec(c, 'aprovado'), dec(c, 'recusado'), dec(c, 'aprovado')]);
  assert.deepEqual(rs.map((x) => x.status).sort(), [200, 409, 409]);
  assert.equal((await log('memepedia.moderar', id)).length, 3, 'uma auditoria por decisão efetiva');
});

test('restaurar: cria nova edição aprovada com o texto antigo, histórico intacto, crédito do autor original, auditoria e regras', { skip }, async () => {
  const mod = await pessoa('moderador'), adm = await pessoa('admin'), comum = await pessoa(); const id = await meme();
  const v1 = (await publicar(mod.u, id, 'origem', { texto: 'Versão um do texto da origem.', fonte: 'https://exemplo.com/v1' })).json.edicao_id;
  const v2 = (await publicar(adm.u, id, 'origem', { texto: 'Versão dois do texto da origem.' })).json.edicao_id;
  const pend = await pendente(id, 'origem', 'Sugestão ainda pendente na fila');
  const rec = await pendente(id, 'origem', 'Sugestão recusada que pode voltar'); await q("UPDATE memepedia_edicoes SET status = 'recusado' WHERE id = $1", [rec]);
  const restaurar = (e, u = mod.u) => s.post(`/api/mod/memepedia/edicoes/${e}/restaurar`, {}, como(u));
  const antes = (await ver(mod.u, id)).campos.find((c) => c.campo === 'origem').historico.length;
  assert.equal((await restaurar(v1, comum.u)).status, 403);
  assert.equal((await restaurar(v2)).status, 409, 'a versão atual não restaura');
  assert.equal((await restaurar(pend)).status, 409, 'pendente: aprovar em vez de restaurar');
  assert.equal((await restaurar(999999999)).status, 404);
  const r = await restaurar(v1);
  assert.equal(r.status, 201); assert.equal(r.json.restaurado_de, v1); assert.notEqual(r.json.edicao_id, v1);
  const [nova] = await q('SELECT * FROM memepedia_edicoes WHERE id = $1', [r.json.edicao_id]);
  assert.equal(nova.status, 'aprovado'); assert.equal(nova.texto, 'Versão um do texto da origem.'); assert.equal(nova.fonte, 'https://exemplo.com/v1'); assert.equal(nova.autor, mod.u);
  const o = (await ver(mod.u, id)).campos.find((c) => c.campo === 'origem');
  assert.equal(o.atual.id, r.json.edicao_id); assert.equal(o.atual.texto, 'Versão um do texto da origem.');
  assert.equal(o.historico.length, antes + 1, 'nada foi apagado');
  assert.ok([v1, v2, pend, rec].every((x) => o.historico.some((e) => e.id === x)));
  assert.equal((await s.get('/api/memepedia?id=' + id)).json[id].origem.texto, 'Versão um do texto da origem.', 'o site público já mostra a restaurada');
  const lg = await log('memepedia.restaurar', id);
  assert.equal(lg.length, 1); assert.equal(Number(lg[0].usuario_id), mod.id); assert.equal(lg[0].detalhe.restaurado_de, v1); assert.equal(lg[0].detalhe.substituiu, v2); assert.equal(lg[0].detalhe.campo, 'origem');
  assert.equal((await restaurar(v1)).status, 409, 'agora v1 e a restaurada têm o mesmo texto: já é a publicada');
  assert.equal((await restaurar(v2, adm.u)).status, 201, 'voltar para a versão dois');
  assert.equal((await restaurar(rec)).status, 201, 'edição recusada também pode voltar (decisão do moderador)');
});

test('a rota antiga /api/admin/memepedia (token) continua igual e usa a mesma lógica de decisão', { skip }, async () => {
  const id = await meme(); const e = await pendente(id, 'usos', 'Texto pela rota antiga do painel');
  assert.equal((await s.post('/api/admin/memepedia/' + e, { status: 'aprovado' })).status, 401);
  const r = await s.post('/api/admin/memepedia/' + e, { status: 'aprovado' }, TOKEN);
  assert.equal(r.status, 200); assert.equal(r.json.ok, true);
  assert.equal((await s.post('/api/admin/memepedia/' + e, { status: 'pendente' }, TOKEN)).status, 200, 'a rota antiga ainda reabre decisões');
  assert.equal((await s.post('/api/admin/memepedia/999999999', { status: 'aprovado' }, TOKEN)).status, 404);
  assert.equal((await s.post('/api/admin/memepedia/' + e, { status: 'xx' }, TOKEN)).status, 400);
});

test('CSRF: as rotas que alteram dados exigem papel e passam pelo roteador (cookie exige X-CSRF)', { skip }, async () => {
  const rotas = s.router.rotas.filter((x) => /mod.{1,2}memepedia/.test(String(x.caminho)));
  assert.equal(rotas.length, 5);
  for (const rt of rotas) assert.equal(rt.papel, 'moderador', String(rt.caminho));
});
