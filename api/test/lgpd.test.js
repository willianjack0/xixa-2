// LGPD: exclusão de conta (anonimização), banimento que sobrevive, IDOR, CSRF, rate limit, retenção do ip_hash e remoção de
// contribuidor com auditoria. Postgres descartável (pulado sem TEST_DB_NAME).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticador } from '../auth/autenticador.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { excluirConta, hashProvedor, ErroConta } from '../lib/lgpd.js';
import { limparIpHash, agendarLimpezaEventosIp } from '../lib/limpeza.js';

const skip = semBanco();
const SITE = 'https://naosalvo-dev.fishlab.com.br';
const CFG = { clientId: '111', clientSecret: 'segredo-do-app', redirectUri: SITE + '/api/auth/discord/callback', guildId: null, exigirMembro: false };
const TOKEN = 'token-admin-teste';
let db, s, sAdmin, ipN = 0, idDc = 700000;

function discordFalso() {
  const codes = {};
  const resp = (status, corpo) => ({ ok: status < 400, status, json: async () => corpo });
  const fetchFalso = async (url, op = {}) => {
    if (url.endsWith('/oauth2/token')) { const code = new URLSearchParams(op.body).get('code'); return codes[code] ? resp(200, { access_token: 'at-' + code }) : resp(400, {}); }
    const code = (op.headers?.Authorization || '').replace('Bearer at-', '');
    if (url.endsWith('/users/@me')) return codes[code] ? resp(200, codes[code]) : resp(401, {});
    return resp(404, {});
  };
  return { codes, fetch: fetchFalso };
}
const dc = discordFalso();

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  const stub = criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' });
  const opcoes = { autenticar: criarAutenticador({ stub, cookieSecure: true }), auth: { discord: CFG, fetch: dc.fetch, cookieSecure: true, origemSite: SITE } };
  s = await servidor(db.pool, opcoes);
  sAdmin = await servidor(db.pool, { ...opcoes, adminToken: TOKEN });
});
after(async () => { if (skip) return; await s.fechar(); await sAdmin.fechar(); await db.fechar(); });

const q = async (sql, v) => (await db.pool.query(sql, v)).rows;
const um = async (sql, v) => (await q(sql, v))[0];
const cookieDe = (cookies, nome) => { const c = cookies.find((x) => x.startsWith(nome + '=')); return c ? c.split(';')[0] : null; };
const ip = () => ({ 'X-Forwarded-For': `10.77.${Math.floor(++ipN / 250)}.${(ipN % 250) + 1}` });
const novoId = () => String(++idDc);
const perfilDe = (id, nome) => ({ id, username: nome.toLowerCase(), global_name: nome, avatar: 'abc123' });

async function login(perfil) {
  const code = 'c' + Math.random().toString(36).slice(2);
  dc.codes[code] = perfil;
  const ini = await s.get('/api/auth/discord?voltar=%2Fperfil.html', { headers: ip() });
  const state = new URL(ini.headers.get('location')).searchParams.get('state');
  const cb = await s.get(`/api/auth/discord/callback?code=${code}&state=${state}`, { headers: { ...ip(), Cookie: cookieDe(ini.cookies, 'ns_oauth') } });
  return { cb, cookie: cookieDe(cb.cookies, 'ns_sessao') };
}
/** Cria conta pelo login do Discord e devolve { id, apelido, cookie, csrf, discordId }. */
async function conta(nome) {
  const discordId = novoId();
  const l = await login(perfilDe(discordId, nome));
  assert.ok(l.cookie, 'login deu sessão');
  const eu = await s.get('/api/eu', { headers: { Cookie: l.cookie } });
  return { id: eu.json.usuario.id, apelido: eu.json.usuario.apelido, cookie: l.cookie, csrf: eu.json.csrf, discordId };
}
const excluir = (c, corpo, extra = {}) => s.post('/api/eu/excluir', corpo, { headers: { Cookie: c.cookie, 'X-CSRF': c.csrf, Origin: SITE, ...extra } });

/** Semeia conteúdo ligado à conta para conferir o que some e o que fica. */
async function semear(c) {
  const meme = (await um('SELECT id FROM memes ORDER BY id LIMIT 1')).id;
  const carta = (await um('SELECT id FROM cartas ORDER BY id LIMIT 1')).id;
  await q('INSERT INTO comentarios (meme_id, autor, texto, usuario_id) VALUES ($1,$2,$3,$4)', [meme, c.apelido, 'comentario publico', c.id]);
  await q('INSERT INTO votos (usuario_id, meme_id, curtida, estrelas) VALUES ($1,$2,1,5)', [c.id, meme]);
  await q('INSERT INTO links_sugeridos (meme_id, yt, autor, usuario_id, ip_hash) VALUES ($1,$2,$3,$4,$5)', [meme, ('yt' + c.id).padEnd(11, 'x').slice(0, 11), c.apelido, c.id, 'hashdoip']);
  await q('INSERT INTO memepedia_edicoes (meme_id, campo, texto, autor, ip_hash, status) VALUES ($1,$2,$3,$4,$5,$6)', [meme, 'origem', 'texto da memepedia com mais de dez', c.apelido, 'hashdoip', 'aprovado']);
  await q('INSERT INTO feedback (tipo, msg, contato, usuario_id) VALUES ($1,$2,$3,$4)', ['ideia', 'mensagem de teste', 'contato@exemplo.com', c.id]);
  await q('INSERT INTO publicacoes (usuario_id, carta_id, legenda) VALUES ($1,$2,$3)', [c.id, carta, 'minha legenda']);
  await q("UPDATE usuarios SET carta_favorita = $2, perfil_layout = 'fotolog', usar_foto = true, xp = 50, moedas = 9 WHERE id = $1", [c.id, carta]);
  await q('INSERT INTO eventos_xp (usuario_id, valor, motivo, ref) VALUES ($1,50,$2,$3)', [c.id, 'teste', 'lgpd-' + c.id]);
  await q("INSERT INTO chaves_api (usuario_id, nome, prefixo, hash, expira_em, ultimo_ip) VALUES ($1,'k','abcdefgh',$2, now() + interval '1 day','1.2.3.4')", [c.id, String(c.id).padStart(64, '0')]);
  const outro = await um("INSERT INTO usuarios (apelido) VALUES ('Visitante' || $1::text) RETURNING id", [c.id]);
  await q('INSERT INTO recados (dono_id, autor_id, texto) VALUES ($1,$2,$3)', [c.id, outro.id, 'recado no perfil dela']);
  await q('INSERT INTO recados (dono_id, autor_id, texto) VALUES ($1,$2,$3)', [outro.id, c.id, 'recado que ela deixou']);
  return { meme, carta, outroId: Number(outro.id) };
}

test('exclusão: anonimiza os dados pessoais, mantém o conteúdo público, encerra a sessão e grava auditoria sem dado pessoal', { skip }, async () => {
  const c = await conta('Pessoa Exclui');
  const x = await semear(c);
  const r = await excluir(c, { confirmar: c.apelido });
  assert.equal(r.status, 200); assert.deepEqual(r.json, { ok: true });
  assert.ok(r.cookies.some((k) => /^ns_sessao=;|^ns_sessao=$|Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(k)), 'cookie de sessão limpo');

  const novo = 'removida-' + c.id;
  const u = await um('SELECT * FROM usuarios WHERE id = $1', [c.id]);
  assert.equal(u.apelido, novo);
  assert.deepEqual(u.avatar_gato, {}); assert.equal(u.usar_foto, false); assert.equal(u.perfil_layout, 'orkut');
  assert.equal(u.carta_favorita, null); assert.equal(u.cadastro_completo_em, null); assert.equal(u.ultimo_acesso, null);
  assert.ok(u.removida_em); assert.equal(u.banido, false); assert.equal(u.papel, 'usuario');
  assert.equal((await q('SELECT 1 FROM contas_oauth WHERE usuario_id = $1', [c.id])).length, 0, 'vínculo OAuth e foto do Discord');
  assert.equal((await q('SELECT 1 FROM sessoes WHERE usuario_id = $1', [c.id])).length, 0);
  const k = await um('SELECT revogada_em, ultimo_ip FROM chaves_api WHERE usuario_id = $1', [c.id]);
  assert.ok(k.revogada_em); assert.equal(k.ultimo_ip, null);
  assert.equal((await q('SELECT 1 FROM publicacoes WHERE usuario_id = $1', [c.id])).length, 0);
  assert.equal((await q('SELECT 1 FROM recados WHERE dono_id = $1', [c.id])).length, 0, 'recados recebidos somem com o perfil');
  assert.equal((await um('SELECT contato FROM feedback WHERE usuario_id = $1', [c.id])).contato, null);

  // fica, sem o nome
  assert.equal((await um('SELECT autor FROM comentarios WHERE usuario_id = $1', [c.id])).autor, novo);
  const l = await um('SELECT autor, ip_hash FROM links_sugeridos WHERE usuario_id = $1', [c.id]);
  assert.equal(l.autor, novo); assert.equal(l.ip_hash, null);
  const m = await um("SELECT autor, ip_hash FROM memepedia_edicoes WHERE texto LIKE 'texto da memepedia%' AND meme_id = $1", [x.meme]);
  assert.equal(m.autor, novo); assert.equal(m.ip_hash, null);
  assert.equal((await q('SELECT 1 FROM votos WHERE usuario_id = $1', [c.id])).length, 1, 'voto fica');
  assert.equal((await q('SELECT 1 FROM eventos_xp WHERE usuario_id = $1', [c.id])).length, 1, 'razão de XP fica');
  assert.equal(Number(u.xp), 50); assert.equal(Number(u.moedas), 9);
  assert.equal((await q('SELECT 1 FROM recados WHERE autor_id = $1', [c.id])).length, 1, 'recado que ela deixou em outro perfil fica');

  // a sessão antiga morreu
  assert.equal((await s.get('/api/eu', { headers: { Cookie: c.cookie } })).status, 401);
  // auditoria: só o id e a flag, nunca o apelido antigo nem o id do Discord
  const log = await um("SELECT * FROM log_auditoria WHERE acao = 'conta.excluir' AND alvo = $1", ['usuarios:' + c.id]);
  assert.ok(log); assert.equal(Number(log.usuario_id), c.id);
  const texto = JSON.stringify(log);
  assert.ok(!texto.includes(c.apelido) && !texto.includes(c.discordId), texto);
  // nada do apelido antigo sobrou em usuarios nem nas tabelas de conteúdo
  assert.equal((await q('SELECT 1 FROM usuarios WHERE lower(apelido) = lower($1)', [c.apelido])).length, 0);
});

test('perfil público e ranking não mostram conta removida (404)', { skip }, async () => {
  const c = await conta('Some Do Ranking'), vendo = await conta('Quem Olha');
  await q('INSERT INTO eventos_xp (usuario_id, valor, motivo, ref) VALUES ($1,500,$2,$3)', [c.id, 'teste', 'rk-' + c.id]);
  const nomes = async () => (await s.get('/api/ranking?metrica=xp&limite=200', { headers: ip() })).json.itens.map((i) => i.apelido);
  assert.ok((await nomes()).includes(c.apelido), 'aparece no ranking antes');
  assert.equal((await s.get('/api/perfil/' + c.apelido, { headers: { Cookie: vendo.cookie } })).status, 200);
  assert.equal((await excluir(c, { confirmar: c.apelido })).status, 200);
  assert.ok(!(await nomes()).some((n) => n === 'removida-' + c.id || n === c.apelido), 'fora do ranking');
  assert.equal((await s.get('/api/perfil/removida-' + c.id, { headers: { Cookie: vendo.cookie } })).status, 404);
  assert.equal((await s.get('/api/perfil/' + c.apelido, { headers: { Cookie: vendo.cookie } })).status, 404);
});

test('confirmação errada ou ausente: 422 e nada muda; confirma sem diferenciar maiúsculas', { skip }, async () => {
  const c = await conta('Confirma Texto');
  for (const corpo of [{}, { confirmar: '' }, { confirmar: 'outra-pessoa' }, { confirmar: 123 }]) {
    assert.equal((await excluir(c, corpo)).status, 422, JSON.stringify(corpo));
  }
  assert.equal((await um('SELECT removida_em FROM usuarios WHERE id = $1', [c.id])).removida_em, null);
  assert.equal((await s.get('/api/eu', { headers: { Cookie: c.cookie } })).status, 200);
  assert.equal((await excluir(c, { confirmar: '  ' + c.apelido.toUpperCase() + ' ' })).status, 200);
});

test('IDOR: não existe parâmetro de conta; a exclusão só atinge a conta da própria sessão', { skip }, async () => {
  const a = await conta('Vitima Idor'), b = await conta('Atacante Idor');
  // B tenta excluir A: digitando o apelido de A (não bate com o de B) ou mandando ids/apelidos extras
  assert.equal((await excluir(b, { confirmar: a.apelido })).status, 422);
  assert.equal((await excluir(b, { confirmar: b.apelido, id: a.id, usuario_id: a.id, apelido: a.apelido })).status, 200);
  assert.equal((await um('SELECT removida_em FROM usuarios WHERE id = $1', [a.id])).removida_em, null, 'A intacta');
  assert.ok((await um('SELECT removida_em FROM usuarios WHERE id = $1', [b.id])).removida_em, 'só B foi removida');
  assert.equal((await s.get('/api/eu', { headers: { Cookie: a.cookie } })).status, 200);
  // a rota não aceita o id na URL
  assert.equal((await s.post(`/api/eu/${a.id}/excluir`, { confirmar: a.apelido }, { headers: { Cookie: a.cookie, 'X-CSRF': a.csrf, Origin: SITE } })).status, 404);
  // sem login
  assert.equal((await s.post('/api/eu/excluir', { confirmar: 'x' })).status, 401);
});

test('CSRF: sessão por cookie exige X-CSRF da própria sessão e Origin do site', { skip }, async () => {
  const c = await conta('Csrf Exclui'), outra = await conta('Csrf Outra');
  const tentar = (headers) => s.post('/api/eu/excluir', { confirmar: c.apelido }, { headers: { Cookie: c.cookie, ...headers } });
  assert.equal((await tentar({})).status, 403);
  assert.equal((await tentar({ 'X-CSRF': 'forjado', Origin: SITE })).status, 403);
  assert.equal((await tentar({ 'X-CSRF': c.csrf, Origin: 'https://evil.com' })).status, 403);
  assert.equal((await tentar({ 'X-CSRF': outra.csrf, Origin: SITE })).status, 403, 'token de outra sessão');
  assert.equal((await um('SELECT removida_em FROM usuarios WHERE id = $1', [c.id])).removida_em, null);
  assert.equal((await tentar({ 'X-CSRF': c.csrf, Origin: SITE })).status, 200);
});

test('rate limit: depois de 5 tentativas em 10 min responde 429 e a conta continua', { skip }, async () => {
  const c = await conta('Rate Limit');
  for (let i = 0; i < 5; i++) assert.equal((await excluir(c, { confirmar: 'errado' })).status, 422);
  assert.equal((await excluir(c, { confirmar: c.apelido })).status, 429);
  assert.equal((await um('SELECT removida_em FROM usuarios WHERE id = $1', [c.id])).removida_em, null);
});

test('equipe (moderador/admin) não exclui direto: 409 até um admin retirar o papel', { skip }, async () => {
  const c = await conta('Equipe Sai');
  await q("UPDATE usuarios SET papel = 'moderador' WHERE id = $1", [c.id]);
  const r = await excluir(c, { confirmar: c.apelido });
  assert.equal(r.status, 409); assert.match(r.json.erro, /papel/);
  await q("UPDATE usuarios SET papel = 'usuario' WHERE id = $1", [c.id]);
  assert.equal((await excluir(c, { confirmar: c.apelido })).status, 200);
});

test('conta já removida não exclui de novo e o apelido removida-* é reservado', { skip }, async () => {
  const c = await conta('Duas Vezes');
  const c2 = await conta('Reserva Removida');
  assert.equal((await s.patch('/api/eu', { apelido: 'removida-' + c.id }, { headers: { Cookie: c2.cookie, 'X-CSRF': c2.csrf, Origin: SITE } })).status, 422);
  assert.equal((await excluir(c, { confirmar: c.apelido })).status, 200);
  await assert.rejects(() => excluirConta({ pool: db.pool, usuario: { id: c.id }, adminToken: '' }, 'removida-' + c.id), (e) => e instanceof ErroConta && e.status === 409);
});

test('novo login com o mesmo Discord depois de excluir: cadastro limpo, sem herdar XP, cartas nem a conta antiga', { skip }, async () => {
  const c = await conta('Volta Do Zero');
  await semear(c);
  await q("INSERT INTO inventario_cartas (usuario_id, carta_id, quantidade) SELECT $1, id, 2 FROM cartas LIMIT 1", [c.id]);
  assert.equal((await excluir(c, { confirmar: c.apelido })).status, 200);
  const l = await login(perfilDe(c.discordId, 'Volta Do Zero'));
  assert.ok(l.cookie, 'consegue entrar de novo (não estava banida)');
  const eu = (await s.get('/api/eu', { headers: { Cookie: l.cookie } })).json;
  assert.notEqual(eu.usuario.id, c.id);
  assert.equal(eu.xp, 0); assert.equal(eu.moedas, 0);
  assert.equal((await q('SELECT 1 FROM inventario_cartas WHERE usuario_id = $1', [eu.usuario.id])).length, 0);
  assert.equal((await um('SELECT apelido FROM usuarios WHERE id = $1', [c.id])).apelido, 'removida-' + c.id, 'a linha antiga continua anônima');
});

test('banimento sobrevive à exclusão: só o HMAC do id do Discord é guardado e um novo login continua banido', { skip }, async () => {
  const c = await conta('Banida Que Sai');
  // banida DEPOIS da sessão aberta: a rota responde 403 (conta suspensa), então a exclusão roda direto na função (ex.: corrida)
  await q('UPDATE usuarios SET banido = true WHERE id = $1', [c.id]);
  assert.equal((await excluir(c, { confirmar: c.apelido })).status, 403, 'banida não passa pela rota');
  await excluirConta({ pool: db.pool, usuario: { id: c.id }, adminToken: '' }, c.apelido);
  const u = await um('SELECT banido, removida_em, apelido FROM usuarios WHERE id = $1', [c.id]);
  assert.equal(u.banido, true); assert.ok(u.removida_em); assert.equal(u.apelido, 'removida-' + c.id);
  const h = hashProvedor('', 'discord', c.discordId);
  assert.equal((await q('SELECT 1 FROM banimentos_provedor WHERE hash = $1', [h])).length, 1);
  const todos = JSON.stringify(await q('SELECT * FROM banimentos_provedor'));
  assert.ok(!todos.includes(c.discordId), 'o id do Discord não está em claro');
  const antes = (await um('SELECT count(*)::int n FROM usuarios')).n;
  const l = await login(perfilDe(c.discordId, 'Banida Que Sai'));
  assert.equal(l.cb.status, 302); assert.equal(l.cb.headers.get('location'), '/perfil.html?login=banido');
  assert.equal(l.cookie, null);
  assert.equal((await um('SELECT count(*)::int n FROM usuarios')).n, antes, 'não criou conta nova');
});

test('falha no meio: a transação volta atrás e nada é anonimizado pela metade', { skip }, async () => {
  const c = await conta('Rollback Total');
  const pool = { connect: async () => { const cli = await db.pool.connect(); const q0 = cli.query.bind(cli); cli.query = (sql, ...a) => (/INSERT INTO log_auditoria/.test(sql) ? Promise.reject(new Error('log fora')) : q0(sql, ...a)); return cli; } };
  const ctx = { pool, usuario: { id: c.id }, adminToken: '' };
  const orig = console.error; console.error = () => {};
  try { await assert.rejects(() => excluirConta(ctx, c.apelido)); } finally { console.error = orig; }
  const u = await um('SELECT apelido, removida_em FROM usuarios WHERE id = $1', [c.id]);
  assert.equal(u.apelido, c.apelido); assert.equal(u.removida_em, null);
  assert.equal((await q('SELECT 1 FROM contas_oauth WHERE usuario_id = $1', [c.id])).length, 1);
  assert.equal((await q('SELECT 1 FROM sessoes WHERE usuario_id = $1', [c.id])).length >= 1, true);
});

// ---- retenção: ip_hash anulado depois de 3 dias, sem apagar o registro ----
test('limparIpHash anula ip_hash com mais de 3 dias em links_sugeridos e memepedia_edicoes e mantém as linhas', { skip }, async () => {
  const meme = (await um('SELECT id FROM memes ORDER BY id LIMIT 1')).id;
  await q('DELETE FROM links_sugeridos'); await q('DELETE FROM memepedia_edicoes');
  const link = (yt, dias) => q(`INSERT INTO links_sugeridos (meme_id, yt, autor, ip_hash, criado_em) VALUES ($1,$2,'a','hash-' || $2, now() - make_interval(days => $3))`, [meme, yt, dias]);
  const mp = (campo, dias) => q(`INSERT INTO memepedia_edicoes (meme_id, campo, texto, autor, ip_hash, criado_em) VALUES ($1,$2,'texto com mais de dez letras','a','h-' || $2, now() - make_interval(days => $3))`, [meme, campo, dias]);
  await link('aaaaaaaaaa1', 10); await link('aaaaaaaaaa2', 4); await link('aaaaaaaaaa3', 2); await link('aaaaaaaaaa4', 0);
  await mp('origem', 5); await mp('porque', 1);
  const r = await limparIpHash(db.pool);
  assert.deepEqual(r, { links_sugeridos: 2, memepedia_edicoes: 1 });
  const ls = await q('SELECT yt, ip_hash FROM links_sugeridos ORDER BY yt');
  assert.equal(ls.length, 4, 'nenhuma linha apagada');
  assert.deepEqual(ls.map((x) => x.ip_hash), [null, null, 'hash-aaaaaaaaaa3', 'hash-aaaaaaaaaa4']);
  const me = await q('SELECT campo, ip_hash FROM memepedia_edicoes ORDER BY campo');
  assert.deepEqual(me.map((x) => x.ip_hash), [null, 'h-porque']);
  assert.deepEqual(await limparIpHash(db.pool), { links_sugeridos: 0, memepedia_edicoes: 0 }, 'idempotente');
});

test('limparIpHash trabalha em lotes e o agendador roda no boot e loga o total', { skip }, async () => {
  const meme = (await um('SELECT id FROM memes ORDER BY id LIMIT 1')).id;
  await q('DELETE FROM links_sugeridos'); await q('DELETE FROM memepedia_edicoes');
  await q(`INSERT INTO memepedia_edicoes (meme_id, campo, texto, autor, ip_hash, criado_em)
           SELECT $1, 'origem', 'texto com mais de dez letras', 'a', 'h' || g, now() - interval '9 days' FROM generate_series(1, 7) g`, [meme]);
  let n = 0; const pool = { query: (...a) => { n++; return db.pool.query(...a); } };
  assert.equal((await limparIpHash(pool, { lote: 3 })).memepedia_edicoes, 7);
  assert.ok(n >= 4, 'vários lotes');
  await q("UPDATE memepedia_edicoes SET ip_hash = 'x'");
  await q("UPDATE memepedia_edicoes SET criado_em = now() - interval '8 days'");
  const logs = []; const t = agendarLimpezaEventosIp(db.pool, { log: { log: (m) => logs.push(m), error: (m) => logs.push('ERRO ' + m) }, intervaloMs: 3_600_000 });
  try { await t.primeira; assert.ok(logs.some((l) => /ip_hash anulado em 7/.test(l)), logs.join('|')); } finally { clearInterval(t); }
});

// ---- contribuidores: remoção a pedido do titular ----
test('remover cadastro de contribuidor: só admin, apaga a linha e audita sem dado pessoal', { skip }, async () => {
  const ins = await um(`INSERT INTO contribuidores (nome, nick, discord, areas, horas_semana, experiencia, ferramentas)
                        VALUES ('Fulana De Tal','fulana','fulana_discord',ARRAY['Frontend'],5,'1 a 3 anos','js') RETURNING id`);
  const url = '/api/admin/contribuidores/' + ins.id;
  assert.equal((await sAdmin.del(url)).status, 401, 'sem token');
  const pessoa = await conta('Nao Admin');
  assert.equal((await sAdmin.del(url, { headers: { Cookie: pessoa.cookie, 'X-CSRF': pessoa.csrf, Origin: SITE } })).status, 401, 'usuário comum');
  assert.equal((await q('SELECT 1 FROM contribuidores WHERE id = $1', [ins.id])).length, 1);
  const r = await sAdmin.del(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
  assert.equal(r.status, 200);
  assert.equal((await q('SELECT 1 FROM contribuidores WHERE id = $1', [ins.id])).length, 0);
  const log = await um("SELECT * FROM log_auditoria WHERE acao = 'contribuidor.excluir' AND alvo = $1", ['contribuidores:' + ins.id]);
  assert.ok(log);
  assert.ok(!JSON.stringify(log).match(/Fulana|fulana/), 'sem nome nem Discord no log');
  assert.equal((await sAdmin.del(url, { headers: { Authorization: 'Bearer ' + TOKEN } })).status, 404, 'já removido');
});
