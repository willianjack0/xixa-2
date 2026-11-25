// Login com Discord de ponta a ponta contra Postgres descartável (pulado sem TEST_DB_NAME).
// O Discord é um mock injetado (auth.fetch): nenhuma chamada de rede real.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticador } from '../auth/autenticador.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { limparExpiradas } from '../auth/sessao.js';
import { send } from '../lib/http.js';

const skip = semBanco();
const SITE = 'https://naosalvo-dev.fishlab.com.br';
const CFG = { clientId: '111', clientSecret: 'segredo-do-app', redirectUri: SITE + '/api/auth/discord/callback', guildId: null, exigirMembro: false };
let db, s, ipN = 0;

/** Discord de mentira: code -> perfil. Registra as chamadas para conferir que o segredo vai só no Basic auth. */
function discordFalso() {
  const codes = {}, membros = new Set(), chamadas = [];
  const resp = (status, corpo) => ({ ok: status < 400, status, json: async () => corpo });
  const fetchFalso = async (url, op = {}) => {
    chamadas.push({ url, op });
    if (url.endsWith('/oauth2/token')) {
      const code = new URLSearchParams(op.body).get('code');
      return codes[code] ? resp(200, { access_token: 'at-' + code, token_type: 'Bearer' }) : resp(400, { error: 'invalid_grant' });
    }
    const code = (op.headers?.Authorization || '').replace('Bearer at-', '');
    if (url.endsWith('/users/@me')) return codes[code] ? resp(200, codes[code]) : resp(401, {});
    if (url.endsWith('/users/@me/guilds')) return resp(200, membros.has(code) ? [{ id: '999' }] : [{ id: '1' }]);
    return resp(404, {});
  };
  return { codes, membros, chamadas, fetch: fetchFalso };
}
const dc = discordFalso();

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  const stub = criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' });
  s = await servidor(db.pool, {
    autenticar: criarAutenticador({ stub, cookieSecure: true }),
    auth: { discord: CFG, fetch: dc.fetch, cookieSecure: true, origemSite: SITE }
  });
});
after(async () => { if (skip) return; await s.fechar(); await db.fechar(); });

// ---- apoio ----
const q = async (sql, v) => (await db.pool.query(sql, v)).rows;
const nome_valor = (cookies, nome) => { const c = cookies.find((x) => x.startsWith(nome + '=')); return c ? c.split(';')[0] : null; };
const ip = () => ({ 'X-Forwarded-For': `10.50.${Math.floor(++ipN / 250)}.${(ipN % 250) + 1}` }); // IP novo por chamada: o rate limit é por IP

/** Faz o login inteiro (início + callback) com um perfil do Discord de mentira. */
async function login(perfil, { voltar = '/album.html', code = 'c' + Math.random().toString(36).slice(2) } = {}) {
  dc.codes[code] = perfil;
  const ini = await s.get('/api/auth/discord?voltar=' + encodeURIComponent(voltar), { headers: ip() });
  const state = new URL(ini.headers.get('location')).searchParams.get('state');
  const cb = await s.get(`/api/auth/discord/callback?code=${code}&state=${state}`, { headers: { ...ip(), Cookie: nome_valor(ini.cookies, 'ns_oauth') } });
  const sess = nome_valor(cb.cookies, 'ns_sessao');
  return { ini, cb, cookie: sess, token: sess && decodeURIComponent(sess.split('=')[1]), state };
}
const perfilDe = (id, nome = 'Fulano', avatar = undefined) => ({ id, username: nome.toLowerCase(), global_name: nome, ...(avatar !== undefined ? { avatar } : {}) });
const eu = (cookie, extra = {}) => s.get('/api/eu', { headers: { Cookie: cookie, ...extra } });
const csrfDe = async (cookie) => (await eu(cookie)).json.csrf;
let idDc = 100000;
const novoId = () => String(++idDc);

test('login completo: cria usuário, conta OAuth e sessão; volta para a página de origem', { skip }, async () => {
  const id = novoId();
  const r = await login(perfilDe(id, 'Zé Fulano'), { voltar: '/album.html?aba=2' });
  assert.equal(r.ini.status, 302);
  // primeiro login de quem nunca autorizou o app: o Discord precisa poder mostrar a tela de consentimento (sem prompt=none)
  assert.equal(new URL(r.ini.headers.get('location')).searchParams.has('prompt'), false);
  assert.equal((await q("SELECT count(*)::int AS n FROM contas_oauth WHERE provedor_id = $1", [id]))[0].n, 1);
  assert.equal(r.cb.status, 302); assert.equal(r.cb.headers.get('location'), '/album.html?aba=2');
  // cookie de sessão: httpOnly, Secure, SameSite=Lax; state de uso único apagado
  const bruto = r.cb.cookies.find((c) => c.startsWith('ns_sessao='));
  assert.match(bruto, /HttpOnly/); assert.match(bruto, /; Secure/); assert.match(bruto, /SameSite=Lax/); assert.match(bruto, /Max-Age=2592000/);
  assert.ok(r.cb.cookies.find((c) => c.startsWith('ns_oauth=')).includes('Max-Age=0'));
  // usuário e conta
  const [u] = await q("SELECT u.id, u.apelido, u.avatar_gato, u.xp, u.moedas, c.nome_exibicao FROM contas_oauth c JOIN usuarios u ON u.id = c.usuario_id WHERE c.provedor = 'discord' AND c.provedor_id = $1", [id]);
  assert.equal(u.apelido, 'Ze_Fulano'); assert.equal(u.nome_exibicao, 'Zé Fulano');
  assert.deepEqual(Object.keys(u.avatar_gato).sort(), ['acc', 'bg', 'clo', 'eye', 'fur', 'pat']);
  assert.equal(Number(u.xp), 0); assert.equal(Number(u.moedas), 0);
});

test('o banco guarda só o HASH da sessão: o token do cookie não aparece em lugar nenhum', { skip }, async () => {
  const r = await login(perfilDe(novoId(), 'Hash Teste'));
  const [linha] = await q('SELECT * FROM sessoes WHERE id = $1', [createHash('sha256').update(r.token).digest('hex')]);
  assert.ok(linha, 'sessão encontrada pelo sha256 do token');
  assert.notEqual(linha.id, r.token); assert.match(linha.id, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(linha).includes(r.token));
  assert.equal((await q('SELECT count(*)::int AS n FROM sessoes WHERE id = $1', [r.token]))[0].n, 0); // o token cru não é um id
  assert.ok(linha.expira_em > new Date(Date.now() + 29 * 86_400_000));
});

test('segundo login da mesma conta Discord reaproveita o usuário e atualiza o nome de exibição', { skip }, async () => {
  const id = novoId();
  const a = await login(perfilDe(id, 'Nome Antigo'));
  const b = await login(perfilDe(id, 'Nome Novo'));
  assert.notEqual(a.token, b.token);
  const us = await q("SELECT c.usuario_id, c.nome_exibicao FROM contas_oauth c WHERE c.provedor_id = $1", [id]);
  assert.equal(us.length, 1); assert.equal(us[0].nome_exibicao, 'Nome Novo');
  assert.equal((await eu(a.cookie)).json.usuario.id, (await eu(b.cookie)).json.usuario.id);
});

test('apelido já usado ganha sufixo; dois logins simultâneos da mesma conta não duplicam', { skip }, async () => {
  const a = await login(perfilDe(novoId(), 'Colisao'));
  const b = await login(perfilDe(novoId(), 'Colisao'));
  const c = await login(perfilDe(novoId(), 'colisao')); // maiúsculas não escapam do índice único
  const nomes = [a, b, c].map(async (x) => (await eu(x.cookie)).json.usuario.apelido);
  assert.deepEqual((await Promise.all(nomes)).sort(), ['Colisao', 'Colisao2', 'colisao3'].sort());
  const igual = novoId();
  dc.codes.p1 = perfilDe(igual, 'Simultaneo'); dc.codes.p2 = perfilDe(igual, 'Simultaneo');
  const [x, y] = await Promise.all(['p1', 'p2'].map(async (code) => {
    const ini = await s.get('/api/auth/discord', { headers: ip() });
    const st = new URL(ini.headers.get('location')).searchParams.get('state');
    return s.get(`/api/auth/discord/callback?code=${code}&state=${st}`, { headers: { ...ip(), Cookie: nome_valor(ini.cookies, 'ns_oauth') } });
  }));
  assert.equal(x.status, 302); assert.equal(y.status, 302);
  assert.equal((await q("SELECT count(*)::int AS n FROM contas_oauth WHERE provedor_id = $1", [igual]))[0].n, 1);
});

test('usuário banido: sem sessão e volta com ?login=banido', { skip }, async () => {
  const id = novoId();
  await login(perfilDe(id, 'Vai Ser Banido'));
  await q("UPDATE usuarios SET banido = true WHERE id = (SELECT usuario_id FROM contas_oauth WHERE provedor_id = $1)", [id]);
  const antes = (await q('SELECT count(*)::int AS n FROM sessoes'))[0].n;
  const r = await login(perfilDe(id, 'Vai Ser Banido'));
  assert.equal(r.cb.status, 302); assert.equal(r.cb.headers.get('location'), '/album.html?login=banido');
  assert.equal(r.cookie, null);
  assert.equal((await q('SELECT count(*)::int AS n FROM sessoes'))[0].n, antes);
});

test('banido DEPOIS de logar: a sessão que já existia passa a dar 403', { skip }, async () => {
  const id = novoId();
  const r = await login(perfilDe(id, 'Banido Depois'));
  assert.equal((await eu(r.cookie)).status, 200);
  await q("UPDATE usuarios SET banido = true WHERE id = (SELECT usuario_id FROM contas_oauth WHERE provedor_id = $1)", [id]);
  assert.equal((await eu(r.cookie)).status, 403);
});

test('state inválido recusa; code rejeitado pelo Discord volta com ?login=erro e não cria nada', { skip }, async () => {
  const ini = await s.get('/api/auth/discord', { headers: ip() });
  const ck = nome_valor(ini.cookies, 'ns_oauth');
  const ruim = await s.get('/api/auth/discord/callback?code=qualquer&state=forjado', { headers: { ...ip(), Cookie: ck } });
  assert.equal(ruim.status, 400); assert.equal(nome_valor(ruim.cookies, 'ns_sessao'), null);

  const antes = (await q('SELECT count(*)::int AS n FROM usuarios'))[0].n;
  const st = new URL(ini.headers.get('location')).searchParams.get('state');
  const r = await s.get(`/api/auth/discord/callback?code=codigo-invalido&state=${st}`, { headers: { ...ip(), Cookie: ck } });
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/?login=erro');
  assert.equal(nome_valor(r.cookies, 'ns_sessao'), null);
  assert.equal((await q('SELECT count(*)::int AS n FROM usuarios'))[0].n, antes);
});

test('o segredo do app só vai no Authorization Basic da troca do code; nunca na URL nem no corpo', { skip }, async () => {
  await login(perfilDe(novoId(), 'Segredo'));
  const troca = dc.chamadas.filter((c) => c.url.endsWith('/oauth2/token')).at(-1);
  assert.equal(troca.op.headers.Authorization, 'Basic ' + Buffer.from('111:segredo-do-app').toString('base64'));
  assert.ok(!troca.url.includes('segredo-do-app')); assert.ok(!String(troca.op.body).includes('segredo-do-app'));
  assert.ok(!dc.chamadas.some((c) => c.url.includes('segredo-do-app')));
});

test('open redirect: destino externo no início OU no cookie adulterado volta para "/"', { skip }, async () => {
  for (const ruim of ['https://evil.com', '//evil.com/x', '/\\evil.com', '/a/..//evil.com', '/..//evil.com', '/.//evil.com', '%2f%2fevil.com']) {
    const r = await login(perfilDe(novoId(), 'Redirect'), { voltar: ruim });
    assert.equal(r.cb.headers.get('location'), '/', ruim);
  }
});

test('exigir membro do servidor (opcional): não membro = ?login=nao_membro, membro entra', { skip }, async () => {
  const sm = await servidor(db.pool, {
    autenticar: criarAutenticador({ cookieSecure: true }),
    auth: { discord: { ...CFG, guildId: '999', exigirMembro: true }, fetch: dc.fetch, cookieSecure: true, origemSite: SITE }
  });
  const tentar = async (id, membro) => {
    const code = 'm' + id; dc.codes[code] = perfilDe(id, 'Membro' + id); if (membro) dc.membros.add(code);
    const ini = await sm.get('/api/auth/discord', { headers: ip() });
    assert.match(new URL(ini.headers.get('location')).searchParams.get('scope'), /guilds/);
    const st = new URL(ini.headers.get('location')).searchParams.get('state');
    return sm.get(`/api/auth/discord/callback?code=${code}&state=${st}`, { headers: { ...ip(), Cookie: nome_valor(ini.cookies, 'ns_oauth') } });
  };
  const fora = await tentar(novoId(), false);
  assert.equal(fora.headers.get('location'), '/?login=nao_membro'); assert.equal(nome_valor(fora.cookies, 'ns_sessao'), null);
  const dentro = await tentar(novoId(), true);
  assert.equal(dentro.headers.get('location'), '/'); assert.ok(nome_valor(dentro.cookies, 'ns_sessao'));
  await sm.fechar();
});

// ---- sessão: /api/eu, expiração, renovação, limpeza ----
test('GET /api/eu: usuário, patente calculada do XP, saldo e token CSRF; sem login 401', { skip }, async () => {
  assert.equal((await s.get('/api/eu')).status, 401);
  const r = await login(perfilDe(novoId(), 'Eu Mesmo'));
  const e = await eu(r.cookie);
  assert.equal(e.status, 200);
  assert.equal(e.json.usuario.apelido, 'Eu_Mesmo'); assert.ok(e.json.usuario.avatar_gato.fur !== undefined);
  assert.equal(e.json.patente.id, 'discado'); assert.equal(e.json.proxima_patente.id, 'banda_larga'); assert.equal(e.json.proxima_patente.faltam, 150);
  assert.equal(e.json.moedas, 0); assert.equal(e.json.xp, 0);
  assert.match(e.json.csrf, /^[A-Za-z0-9_-]{40,}$/);
  // a patente vem do XP no servidor: 160 de XP no razão = Banda larga
  await q("INSERT INTO eventos_xp (usuario_id, valor, motivo, ref) VALUES ($1, 160, 'teste', 'x')", [e.json.usuario.id]);
  assert.equal((await eu(r.cookie)).json.patente.id, 'banda_larga');
});

test('sessão expirada ou apagada: 401', { skip }, async () => {
  const r = await login(perfilDe(novoId(), 'Vai Expirar'));
  assert.equal((await eu(r.cookie)).status, 200);
  await q("UPDATE sessoes SET expira_em = now() - interval '1 minute' WHERE id = $1", [createHash('sha256').update(r.token).digest('hex')]);
  assert.equal((await eu(r.cookie)).status, 401);
  assert.equal((await eu('ns_sessao=token-que-nao-existe')).status, 401);
  assert.equal((await eu('ns_sessao=' + 'x'.repeat(500))).status, 401);
});

test('renovação deslizante: uso empurra a expiração e reemite o cookie; nunca passa de 90 dias', { skip }, async () => {
  const r = await login(perfilDe(novoId(), 'Renova'));
  const h = createHash('sha256').update(r.token).digest('hex');
  await q("UPDATE sessoes SET expira_em = now() + interval '3 days' WHERE id = $1", [h]);
  const e = await eu(r.cookie);
  assert.equal(e.status, 200);
  const novo = e.cookies.find((c) => c.startsWith('ns_sessao='));
  assert.ok(novo && /Max-Age=\d+/.test(novo) && /HttpOnly/.test(novo), 'cookie reemitido');
  assert.ok((await q('SELECT expira_em FROM sessoes WHERE id = $1', [h]))[0].expira_em > new Date(Date.now() + 29 * 86_400_000));
  // sessão criada há 85 dias: a renovação é limitada a 90 dias desde a criação (sobram ~5 dias, não 30)
  await q("UPDATE sessoes SET criada_em = now() - interval '85 days', expira_em = now() + interval '2 hours' WHERE id = $1", [h]);
  assert.equal((await eu(r.cookie)).status, 200);
  const [l] = await q("SELECT expira_em <= criada_em + interval '90 days' + interval '1 second' AS no_teto, expira_em > now() + interval '4 days' AS renovou FROM sessoes WHERE id = $1", [h]);
  assert.equal(l.no_teto, true); assert.equal(l.renovou, true);
});

test('limparExpiradas remove só as expiradas; a 11ª sessão do usuário derruba a mais antiga', { skip }, async () => {
  const id = novoId();
  const a = await login(perfilDe(id, 'Muitas Sessoes'));
  const ha = createHash('sha256').update(a.token).digest('hex');
  await q("UPDATE sessoes SET criada_em = now() - interval '1 hour' WHERE id = $1", [ha]);
  for (let i = 0; i < 10; i++) await login(perfilDe(id, 'Muitas Sessoes'));
  assert.equal((await q('SELECT count(*)::int AS n FROM sessoes WHERE id = $1', [ha]))[0].n, 0, 'a mais antiga caiu');
  const uid = (await q("SELECT usuario_id FROM contas_oauth WHERE provedor_id = $1", [id]))[0].usuario_id;
  assert.equal((await q('SELECT count(*)::int AS n FROM sessoes WHERE usuario_id = $1', [uid]))[0].n, 10);

  await q("UPDATE sessoes SET expira_em = now() - interval '1 day' WHERE usuario_id = $1 AND id IN (SELECT id FROM sessoes WHERE usuario_id = $1 LIMIT 3)", [uid]);
  const expiradas = (await q('SELECT count(*)::int AS n FROM sessoes WHERE expira_em <= now()'))[0].n; // inclui as de outros testes
  assert.ok(expiradas >= 3);
  assert.equal(await limparExpiradas(db.pool), expiradas);
  assert.equal((await q('SELECT count(*)::int AS n FROM sessoes WHERE expira_em <= now()'))[0].n, 0);
  assert.equal((await q('SELECT count(*)::int AS n FROM sessoes WHERE usuario_id = $1', [uid]))[0].n, 7);
});

// ---- CSRF ----
test('CSRF: rota que altera dados com cookie exige X-CSRF da sessão e Origin do site', { skip }, async () => {
  const r = await login(perfilDe(novoId(), 'Csrf Teste'));
  const csrf = await csrfDe(r.cookie);
  const postar = (headers) => s.post('/api/visita', {}, { headers: { Cookie: r.cookie, ...headers } });
  assert.equal((await postar({})).status, 403);                                                  // sem token
  assert.equal((await postar({ 'X-CSRF': 'forjado' })).status, 403);                             // token errado
  assert.equal((await postar({ 'X-CSRF': csrf, Origin: 'https://evil.com' })).status, 403);      // origem de outro site
  assert.equal((await postar({ 'X-CSRF': csrf, Origin: 'null' })).status, 403);
  const outro = await login(perfilDe(novoId(), 'Outro Csrf'));
  assert.equal((await postar({ 'X-CSRF': await csrfDe(outro.cookie) })).status, 403);            // token de OUTRA sessão
  const ok = await postar({ 'X-CSRF': csrf, Origin: SITE });
  assert.equal(ok.status, 200); assert.equal(ok.json.primeira_visita_do_dia, true);
  assert.equal((await postar({ 'X-CSRF': csrf })).status, 200);                                  // sem Origin (cliente não-navegador) + token certo
  assert.equal((await eu(r.cookie)).status, 200);                                                // GET não exige CSRF
});

test('o stub (X-Test-User) segue valendo em dev/teste e não exige CSRF; sem o stub o header é ignorado', { skip }, async () => {
  assert.equal((await s.post('/api/visita', {}, { headers: { 'X-Test-User': 'usuario-stub' } })).status, 200);
  const semStub = await servidor(db.pool, { autenticar: criarAutenticador({ stub: null }), auth: { discord: CFG, origemSite: SITE } });
  assert.equal((await semStub.post('/api/visita', {}, { headers: { 'X-Test-User': 'usuario-stub' } })).status, 401);
  await semStub.fechar();
});

test('POST /api/auth/sair: exige CSRF, apaga a sessão no banco e limpa o cookie', { skip }, async () => {
  const r = await login(perfilDe(novoId(), 'Vai Sair'));
  const h = createHash('sha256').update(r.token).digest('hex');
  const csrf = await csrfDe(r.cookie);
  assert.equal((await s.post('/api/auth/sair', {}, { headers: { Cookie: r.cookie, ...ip() } })).status, 403);
  assert.equal((await s.post('/api/auth/sair', {}, { headers: { Cookie: r.cookie, 'X-CSRF': csrf, Origin: 'https://evil.com', ...ip() } })).status, 403);
  assert.equal((await q('SELECT count(*)::int AS n FROM sessoes WHERE id = $1', [h]))[0].n, 1, 'ainda logado');
  const ok = await s.post('/api/auth/sair', {}, { headers: { Cookie: r.cookie, 'X-CSRF': csrf, Origin: SITE, ...ip() } });
  assert.equal(ok.status, 200); assert.ok(ok.cookies.find((c) => c.startsWith('ns_sessao=')).includes('Max-Age=0'));
  assert.equal((await q('SELECT count(*)::int AS n FROM sessoes WHERE id = $1', [h]))[0].n, 0);
  assert.equal((await eu(r.cookie)).status, 401);
  const sem = await s.post('/api/auth/sair', {}, { headers: ip() }); // sem sessão: só limpa o cookie
  assert.equal(sem.status, 200);
});

// ---- patente ----
test('exigePatente: 401 sem login, 403 abaixo da patente, 200 com XP suficiente (calculado no servidor)', { skip }, async () => {
  s.router.get('/api/teste/moderacao', ({ res, patente }) => send(res, 200, { ok: true, patente: patente.id }), { patente: 'moderador' });
  s.router.get('/api/teste/por-nome', ({ res }) => send(res, 200, { ok: true }), { patente: 'Banda larga' });
  s.router.get('/api/teste/inexistente', ({ res }) => send(res, 200, { ok: true }), { patente: 'rei-do-mundo' });

  assert.equal((await s.get('/api/teste/moderacao')).status, 401);
  const r = await login(perfilDe(novoId(), 'Quase Mod'));
  const negado = await s.get('/api/teste/moderacao', { headers: { Cookie: r.cookie } });
  assert.equal(negado.status, 403); assert.match(negado.json.erro, /Moderador/); assert.equal(negado.json.patente_atual, 'Discado');

  const uid = (await eu(r.cookie)).json.usuario.id;
  await q("INSERT INTO eventos_xp (usuario_id, valor, motivo, ref) VALUES ($1, 1499, 'teste', 'a')", [uid]);
  assert.equal((await s.get('/api/teste/moderacao', { headers: { Cookie: r.cookie } })).status, 403);   // 1499 < 1500
  await q("INSERT INTO eventos_xp (usuario_id, valor, motivo, ref) VALUES ($1, 1, 'teste', 'b')", [uid]);
  const ok = await s.get('/api/teste/moderacao', { headers: { Cookie: r.cookie } });
  assert.equal(ok.status, 200); assert.equal(ok.json.patente, 'moderador');
  assert.equal((await s.get('/api/teste/por-nome', { headers: { Cookie: r.cookie } })).status, 200);   // aceita o nome da patente
  assert.equal((await s.get('/api/teste/inexistente', { headers: { Cookie: r.cookie } })).status, 500); // patente que não existe = bug, não "liberado"
});

test('exigePatente com POST também passa pelo CSRF antes da patente', { skip }, async () => {
  s.router.post('/api/teste/mod-post', ({ res }) => send(res, 200, { ok: true }), { patente: 'discado' });
  const r = await login(perfilDe(novoId(), 'Post Patente'));
  assert.equal((await s.post('/api/teste/mod-post', {}, { headers: { Cookie: r.cookie } })).status, 403);
  assert.equal((await s.post('/api/teste/mod-post', {}, { headers: { Cookie: r.cookie, 'X-CSRF': await csrfDe(r.cookie) } })).status, 200);
});

test('economia com a sessão do login: carteira e visita funcionam (o stub não é necessário)', { skip }, async () => {
  const r = await login(perfilDe(novoId(), 'Economia Real'));
  const csrf = await csrfDe(r.cookie);
  const v = await s.post('/api/visita', {}, { headers: { Cookie: r.cookie, 'X-CSRF': csrf } });
  assert.equal(v.status, 200); assert.equal(v.json.xp_ganho, 10);
  const c = await s.get('/api/carteira', { headers: { Cookie: r.cookie } });
  assert.equal(c.json.xp, 10); assert.equal(c.json.usuario.apelido, 'Economia_Real');
  assert.equal((await eu(r.cookie)).json.xp, 10);
});

// ---- foto de perfil ----
const avatarDoBanco = async (id) => (await q("SELECT avatar_url FROM contas_oauth WHERE provedor = 'discord' AND provedor_id = $1", [id]))[0].avatar_url;

test('foto de perfil: login com avatar grava a URL montada no servidor e /api/eu devolve', { skip }, async () => {
  const id = novoId();
  const r = await login(perfilDe(id, 'Com Foto', 'abc123def456'));
  const esperada = `https://cdn.discordapp.com/avatars/${id}/abc123def456.png?size=128`;
  assert.equal(await avatarDoBanco(id), esperada);
  assert.equal((await eu(r.cookie)).json.usuario.avatar_url, esperada);
});

test('foto de perfil: sem avatar (null ou campo ausente) = null no banco e em /api/eu; nunca avatar padrão', { skip }, async () => {
  for (const av of [null, undefined]) {
    const id = novoId();
    const r = await login(perfilDe(id, 'Sem Foto', av));
    assert.equal(await avatarDoBanco(id), null);
    const e = (await eu(r.cookie)).json;
    assert.equal(e.usuario.avatar_url, null);
    assert.ok(e.usuario.avatar_gato.fur !== undefined, 'o gato continua lá');
  }
});

test('foto de perfil: hash inválido ou malicioso vira null (nada de URL crua do Discord)', { skip }, async () => {
  for (const ruim of ['../../x', 'ABC', 'a b', 'https://evil.com/a.png', 'x'.repeat(70)]) {
    const id = novoId();
    const r = await login(perfilDe(id, 'Hash Ruim', ruim));
    assert.equal(r.cb.status, 302);
    assert.ok(r.cookie, 'o login em si funciona');
    assert.equal(await avatarDoBanco(id), null, ruim);
    assert.equal((await eu(r.cookie)).json.usuario.avatar_url, null);
  }
});

test('foto de perfil: trocou a foto no Discord, o próximo login atualiza; removeu a foto, volta a null', { skip }, async () => {
  const id = novoId();
  const a = await login(perfilDe(id, 'Troca Foto', 'aaaa1111'));
  assert.match((await eu(a.cookie)).json.usuario.avatar_url, /\/aaaa1111\.png\?size=128$/);
  const b = await login(perfilDe(id, 'Troca Foto', 'bbbb2222'));
  assert.match((await eu(b.cookie)).json.usuario.avatar_url, /\/bbbb2222\.png\?size=128$/);
  assert.equal((await q("SELECT count(*)::int AS n FROM contas_oauth WHERE provedor_id = $1", [id]))[0].n, 1);
  const c = await login(perfilDe(id, 'Troca Foto', null));
  assert.equal((await eu(c.cookie)).json.usuario.avatar_url, null);
});

test('foto de perfil: nenhum parâmetro do cliente altera avatar_url', { skip }, async () => {
  const id = novoId();
  const r = await login(perfilDe(id, 'Sem Injecao', 'cccc3333'));
  const antes = await avatarDoBanco(id);
  const csrf = await csrfDe(r.cookie);
  await s.post('/api/visita', { avatar_url: 'https://evil.com/x.png' }, { headers: { Cookie: r.cookie, 'X-CSRF': csrf } });
  await s.get('/api/eu?avatar_url=https://evil.com/x.png', { headers: { Cookie: r.cookie } });
  await s.get('/api/auth/discord?avatar_url=https://evil.com/x.png&voltar=/', { headers: ip() });
  assert.equal(await avatarDoBanco(id), antes);
  assert.equal((await eu(r.cookie, { 'X-Avatar-Url': 'https://evil.com/x.png' })).json.usuario.avatar_url, antes);
});

test('usuário do stub (sem conta Discord): avatar_url null', { skip }, async () => {
  const stubUser = await s.get('/api/eu', { headers: { 'X-Test-User': 'stub-sem-foto' } });
  assert.equal(stubUser.status, 200); assert.equal(stubUser.json.usuario.avatar_url, null);
});

// ---- PATCH /api/eu com sessão: CSRF ----
test('PATCH /api/eu com cookie de sessão exige X-CSRF e Origin do site; o apelido novo vale pela sessão (id)', { skip }, async () => {
  const r = await login(perfilDe(novoId(), 'Perfil Csrf'));
  const csrf = await csrfDe(r.cookie);
  const patch = (corpo, headers) => s.patch('/api/eu', corpo, { headers: { Cookie: r.cookie, ...headers } });
  assert.equal((await patch({ apelido: 'SemCsrf' }, {})).status, 403);
  assert.equal((await patch({ apelido: 'SemCsrf' }, { 'X-CSRF': 'forjado' })).status, 403);
  assert.equal((await patch({ apelido: 'SemCsrf' }, { 'X-CSRF': csrf, Origin: 'https://evil.com' })).status, 403);
  assert.equal((await eu(r.cookie)).json.usuario.apelido, 'Perfil_Csrf', 'nada mudou');
  const ok = await patch({ apelido: 'ComCsrf' + ipN, avatar_gato: { fur: 1, pat: 0, eye: 2, acc: 3, clo: 0, bg: 4 } }, { 'X-CSRF': csrf, Origin: SITE });
  assert.equal(ok.status, 200); assert.equal(ok.json.usuario.apelido, 'ComCsrf' + ipN); assert.ok(ok.json.pacote_boas_vindas);
  assert.equal((await eu(r.cookie)).json.usuario.apelido, 'ComCsrf' + ipN, 'a sessão segue o usuário pelo id, mesmo com apelido novo');
});

// ---- apelido: reservado no 1º login e limite de troca com sessão ----
test('1º login com nome reservado do Discord ganha apelido com _gato (nunca admin, admin2...)', { skip }, async () => {
  const r1 = await login(perfilDe(novoId(), 'Admin'));
  assert.equal((await eu(r1.cookie)).json.usuario.apelido, 'Admin_gato');
  const r2 = await login(perfilDe(novoId(), 'admin'));      // colide (sem diferenciar caixa): _gato2, que continua não reservado
  assert.equal((await eu(r2.cookie)).json.usuario.apelido, 'admin_gato2');
  const r3 = await login(perfilDe(novoId(), 'Moderação'));
  assert.equal((await eu(r3.cookie)).json.usuario.apelido, 'Moderacao_gato');
});

test('troca de apelido com sessão: 5 PATCH simultâneos = 1 sucesso e 4 x 429', { skip }, async () => {
  const r = await login(perfilDe(novoId(), 'Troca Simultanea'));
  const csrf = await csrfDe(r.cookie);
  const rs = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    s.patch('/api/eu', { apelido: `Simult${ipN}_${i}` }, { headers: { Cookie: r.cookie, 'X-CSRF': csrf, Origin: SITE } })));
  assert.deepEqual(rs.map((x) => x.status).sort(), [200, 429, 429, 429, 429]);
  const certo = rs.find((x) => x.status === 200);
  assert.equal((await eu(r.cookie)).json.usuario.apelido, certo.json.usuario.apelido);
});
