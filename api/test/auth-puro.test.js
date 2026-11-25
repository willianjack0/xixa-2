// Login com Discord, partes que não precisam de banco (rodam no CI): open redirect, state, cookies, CSRF,
// config por arquivo, apelido, gato inicial e o começo/fim do fluxo OAuth com pool falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  caminhoSeguro, comParametro, empacotarState, desempacotarState, stateConfere, novoState, urlDeAutorizacao,
  gerarApelido, gatoInicial, lerConfigDiscord, chaveDoState, VALIDADE_STATE_S, urlDoAvatar, buscarPerfil
} from '../auth/discord.js';
import { hashToken, csrfDe, novoToken } from '../auth/sessao.js';
import { lerCookies, montarCookie, apagarCookie } from '../lib/cookies.js';
import { verificarCsrf } from '../lib/csrf.js';
import { extrairIp } from '../lib/http.js';
import { saltosDeProxy } from '../lib/config.js';
import { servidor } from './helpers.js';

const CFG = { clientId: '111', clientSecret: 'segredo-do-app', redirectUri: 'https://naosalvo-dev.fishlab.com.br/api/auth/discord/callback', guildId: null, exigirMembro: false };
const K = chaveDoState(CFG);
const poolFalso = { query: async () => { throw new Error('não deveria tocar no banco'); } };

test('open redirect: só caminhos relativos do próprio site passam', () => {
  for (const ok of ['/', '/album.html', '/album.html?x=1#topo', '/memes/2008', '/a/b/c?d=e']) assert.equal(caminhoSeguro(ok), ok, ok);
  const ruins = ['https://evil.com', 'http://evil.com/x', '//evil.com', '///evil.com', '/\\evil.com', '\\\\evil.com', '/\\/evil.com',
    // vetores do gate: o URL normaliza, mas o Location sairia como //evil.com
    '/a/..//evil.com', '/..//evil.com', '/.//evil.com', '/a//evil.com', '/a/./b', '/a/../b', '/..', '/.', '/a/..', '/%2e%2e//evil.com', '/%2E/x', '/a/%2e%2e/b',
    '%2f%2fevil.com', '/%2f%2fevil.com', '/%2F/evil.com', '/a%2f%2fevil.com', '/%252f%252fevil.com', '/a%5cevil.com', '/%5cevil.com', '/%5Cevil.com',
    '/a%0d%0aSet-Cookie:x=1', '/a%0aLocation:%20x', '/%00', '/a%09b', '/a%20b', '/a\u2028b', '/%',
    'javascript:alert(1)', 'data:text/html,x', 'evil.com', 'album.html', '', ' /album', '/a b', '/a\nb', '/a\r\nLocation: x', '/\tevil', 'HTTPS://evil.com',
    '/' + 'a'.repeat(400), null, undefined, 42, {}];
  for (const r of ruins) assert.equal(caminhoSeguro(r), '/', JSON.stringify(r));
  assert.equal(caminhoSeguro('//evil.com', '/inicio'), '/inicio');
});

test('comParametro: resultado final é revalidado e nunca vira host externo', () => {
  const lixo = ['/a/..//evil.com', '/..//evil.com', '/.//evil.com', '//evil.com', '/\\evil.com', '%2f%2fevil.com', 'https://evil.com', 'javascript:alert(1)', '/%2f%2fevil.com'];
  for (const v of lixo) {
    const out = comParametro(v, 'login', 'negado');
    assert.equal(out, '/?login=negado', v);
    assert.ok(!out.startsWith('//'));
    assert.equal(new URL(out, 'https://site.exemplo').origin, 'https://site.exemplo', v);
  }
  // entrada boa segue boa e sem normalização surpresa
  assert.equal(comParametro('/album.html?a=1#t', 'login', 'erro'), '/album.html?a=1&login=erro#t');
});

test('comParametro preserva query e hash', () => {
  assert.equal(comParametro('/album.html', 'login', 'banido'), '/album.html?login=banido');
  assert.equal(comParametro('/a?x=1#t', 'login', 'erro'), '/a?x=1&login=erro#t');
  assert.equal(comParametro('/a?login=velho', 'login', 'negado'), '/a?login=negado');
});

test('state: empacota/desempacota, confere em tempo constante e recusa diferente/vazio', () => {
  const s = novoState();
  assert.ok(s.length >= 20); assert.notEqual(s, novoState());
  const v = empacotarState(s, '/album.html?a=1', K);
  assert.deepEqual(desempacotarState(v, K), { state: s, voltar: '/album.html?a=1' });
  assert.equal(desempacotarState('sem-ponto', K), null); assert.equal(desempacotarState('', K), null); assert.equal(desempacotarState(undefined, K), null);
  assert.ok(stateConfere(s, s));
  assert.ok(!stateConfere(s, s + 'x')); assert.ok(!stateConfere(s, 'outro')); assert.ok(!stateConfere('', '')); assert.ok(!stateConfere(s, null));
});

test('state assinado: adulteração, outra chave, expiração (10 min) e relógio no futuro são recusados', () => {
  const agora = Date.UTC(2026, 10, 19, 12, 0, 0);
  const v = empacotarState('abc', '/album.html', K, agora);
  assert.deepEqual(desempacotarState(v, K, agora + 5_000), { state: 'abc', voltar: '/album.html' });
  assert.ok(desempacotarState(v, K, agora + VALIDADE_STATE_S * 1000));                 // no limite ainda vale
  assert.equal(desempacotarState(v, K, agora + (VALIDADE_STATE_S + 1) * 1000), null);   // 10 min + 1 s: expirado
  assert.equal(desempacotarState(v, K, agora - 120_000), null);                         // emitido "no futuro"
  assert.equal(desempacotarState(v, chaveDoState({ clientSecret: 'outro-segredo' }), agora), null); // outra chave
  const [st, b64, ts, mac] = v.split('.');
  const evil = Buffer.from('https://evil.com').toString('base64url');
  assert.equal(desempacotarState([st, evil, ts, mac].join('.'), K, agora), null);       // trocou o destino
  assert.equal(desempacotarState(['outro-state', b64, ts, mac].join('.'), K, agora), null);
  assert.equal(desempacotarState([st, b64, String(Number(ts) + 3600), mac].join('.'), K, agora), null); // estendeu a validade
  assert.equal(desempacotarState([st, b64, ts, mac.slice(0, -2) + 'AA'].join('.'), K, agora), null);
  assert.equal(desempacotarState([st, b64, ts].join('.'), K, agora), null);             // sem assinatura
  assert.equal(desempacotarState(v + '.x', K, agora), null);
});

test('state sem assinatura válida no cookie = callback recusa (400) sem chamar o Discord', async () => {
  let chamadas = 0;
  const s = await servidor(poolFalso, { auth: { discord: CFG, fetch: async () => { chamadas++; throw new Error('sem rede'); } } });
  const agora = Date.now();
  const velho = encodeURIComponent(empacotarState('st', '/', K, agora - (VALIDADE_STATE_S + 5) * 1000));   // expirado
  const forjado = encodeURIComponent(empacotarState('st', '/', chaveDoState({ clientSecret: 'x' }), agora)); // outra chave
  const semMac = encodeURIComponent('st.' + Buffer.from('/').toString('base64url') + '.' + Math.floor(agora / 1000));
  let n = 0;
  for (const ck of [velho, forjado, semMac]) {
    const r = await s.get('/api/auth/discord/callback?code=c&state=st', { headers: { 'X-Forwarded-For': `10.9.6.${++n}`, Cookie: 'ns_oauth=' + ck } });
    assert.equal(r.status, 400); assert.match(r.json.erro, /estado de login inválido/);
  }
  assert.equal(chamadas, 0);
  await s.fechar();
});

test('URL de autorização: sem prompt (primeiro login do usuário pede consentimento normalmente)', () => {
  const u = new URL(urlDeAutorizacao(CFG, 'ST'));
  assert.equal(u.searchParams.has('prompt'), false);
  assert.ok(!u.search.includes('prompt'));
});

test('URL de autorização: scope identify, state e redirect_uri; guilds só quando exige membro', () => {
  const u = new URL(urlDeAutorizacao(CFG, 'ST'));
  assert.equal(u.origin + u.pathname, 'https://discord.com/oauth2/authorize');
  assert.equal(u.searchParams.get('scope'), 'identify'); assert.equal(u.searchParams.get('state'), 'ST');
  assert.equal(u.searchParams.get('client_id'), '111'); assert.equal(u.searchParams.get('redirect_uri'), CFG.redirectUri);
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.ok(!u.search.includes('segredo-do-app'));
  assert.equal(new URL(urlDeAutorizacao({ ...CFG, guildId: '9', exigirMembro: true }, 'S')).searchParams.get('scope'), 'identify guilds');
});

test('cookies: HttpOnly, SameSite=Lax e Secure por padrão; apagar zera o Max-Age', () => {
  const c = montarCookie('ns_sessao', 'abc', { maxAge: 100 });
  assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Lax/); assert.match(c, /; Secure/); assert.match(c, /Path=\//); assert.match(c, /Max-Age=100/);
  assert.ok(!/; Secure/.test(montarCookie('x', 'y', { secure: false })));
  assert.match(apagarCookie('ns_sessao'), /Max-Age=0/);
  assert.deepEqual(lerCookies('a=1; ns_sessao=tok%20en; b=3; a=2'), { a: '1', ns_sessao: 'tok en', b: '3' });
  assert.deepEqual(lerCookies(undefined), {});
});

test('sessão: hash sha256 do token, CSRF derivado e diferente do token e do hash', () => {
  const t = novoToken();
  assert.ok(t.length >= 40); assert.notEqual(t, novoToken());
  assert.equal(hashToken(t), createHash('sha256').update(t).digest('hex'));
  assert.notEqual(hashToken(t), t);
  assert.equal(csrfDe(t), csrfDe(t)); assert.notEqual(csrfDe(t), csrfDe(novoToken()));
  assert.notEqual(csrfDe(t), t); assert.notEqual(csrfDe(t), hashToken(t));
});

test('CSRF: exige X-CSRF da sessão e, se houver Origin, que seja o do site', () => {
  const t = csrfDe('token'), site = 'https://naosalvo.example';
  const req = (headers) => ({ headers });
  assert.equal(verificarCsrf(req({ 'x-csrf': t }), t, site), null);
  assert.equal(verificarCsrf(req({ 'x-csrf': t, origin: site }), t, site), null);
  assert.match(verificarCsrf(req({}), t, site), /CSRF/);
  assert.match(verificarCsrf(req({ 'x-csrf': 'errado' }), t, site), /CSRF/);
  assert.match(verificarCsrf(req({ 'x-csrf': t, origin: 'https://evil.com' }), t, site), /origem/);
  assert.match(verificarCsrf(req({ 'x-csrf': t, origin: 'null' }), t, site), /origem/);
  assert.match(verificarCsrf(req({ 'x-csrf': '' }), '', site), /CSRF/); // esperado vazio nunca autoriza
});

test('apelido: derivado do nome, válido (3 a 20), sufixo numérico para colisão', () => {
  assert.equal(gerarApelido('Zé Fulano'), 'Ze_Fulano');
  assert.equal(gerarApelido('  João!!  '), 'Joao');
  assert.equal(gerarApelido('a'), 'agato'); assert.equal(gerarApelido('😀😀'), 'gato');
  assert.equal(gerarApelido('x'.repeat(40)).length, 20);
  assert.equal(gerarApelido('Fulano', 0), 'Fulano'); assert.equal(gerarApelido('Fulano', 1), 'Fulano2'); assert.equal(gerarApelido('Fulano', 2), 'Fulano3');
  assert.ok(gerarApelido('x'.repeat(40), 5).length <= 20);
  for (const n of ['Zé', '日本語', 'a.b-c_d', '!!!', 'A'.repeat(30)]) for (let i = 0; i < 4; i++) assert.match(gerarApelido(n, i), /^[A-Za-z0-9_.\-]{3,20}$/, n);
});

test('gato inicial: determinístico e dentro das faixas do criador de gato', () => {
  const g = gatoInicial('123456789012345678');
  assert.deepEqual(g, gatoInicial('123456789012345678'));
  assert.ok(g.fur < 10 && g.pat < 5 && g.eye < 5 && g.acc < 9 && g.clo < 7 && g.bg < 8);
  assert.notDeepEqual(gatoInicial('1'.repeat(18)), gatoInicial('2'.repeat(18)));
});

test('config do Discord: segredos só por arquivo, redirect por env, https obrigatório, incompleto = null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ns-discord-'));
  const f = (nome, v) => { const p = join(dir, nome); writeFileSync(p, v + '\n'); return p; };
  const env = {
    DISCORD_CLIENT_ID_FILE: f('id', '111'), DISCORD_CLIENT_SECRET_FILE: f('secret', 'xyz'), DISCORD_GUILD_ID_FILE: f('guild', '999'),
    DISCORD_REDIRECT_URI: CFG.redirectUri
  };
  assert.deepEqual(lerConfigDiscord(env), { clientId: '111', clientSecret: 'xyz', redirectUri: CFG.redirectUri, guildId: '999', exigirMembro: false });
  assert.equal(lerConfigDiscord({ ...env, DISCORD_EXIGIR_MEMBRO: '1' }).exigirMembro, true);
  const semGuild = { ...env }; delete semGuild.DISCORD_GUILD_ID_FILE;
  assert.equal(lerConfigDiscord(semGuild).guildId, null);
  assert.equal(lerConfigDiscord({ ...semGuild, DISCORD_EXIGIR_MEMBRO: '1' }).exigirMembro, false); // sem guild não há como exigir
  // client secret por VARIÁVEL: ignorado fora de dev/test, aceito em dev/test
  const porVariavel = { DISCORD_CLIENT_ID_FILE: env.DISCORD_CLIENT_ID_FILE, DISCORD_CLIENT_SECRET: 'segredo-em-variavel', DISCORD_REDIRECT_URI: CFG.redirectUri };
  const silencio = console.warn; const avisos = []; console.warn = (m) => avisos.push(String(m));
  try {
    assert.equal(lerConfigDiscord({ ...porVariavel, DB_NAME: 'naosalvo' }), null);
    assert.equal(lerConfigDiscord({ ...porVariavel, DB_NAME: 'naosalvo_dev', NODE_ENV: 'production' }), null);
    assert.equal(lerConfigDiscord({ ...porVariavel }), null); // DB_NAME ausente = trata como produção
    assert.ok(avisos.length >= 3 && avisos.every((m) => /DISCORD_CLIENT_SECRET_FILE/.test(m) && !m.includes('segredo-em-variavel')), 'avisa sem imprimir o valor');
  } finally { console.warn = silencio; }
  assert.equal(lerConfigDiscord({ ...porVariavel, DB_NAME: 'naosalvo_dev' }).clientSecret, 'segredo-em-variavel');
  assert.equal(lerConfigDiscord({ ...porVariavel, DB_NAME: 'naosalvo', DISCORD_CLIENT_SECRET_FILE: env.DISCORD_CLIENT_SECRET_FILE }).clientSecret, 'xyz'); // *_FILE vale em qualquer ambiente
  assert.equal(lerConfigDiscord({}), null);
  assert.equal(lerConfigDiscord({ ...env, DISCORD_REDIRECT_URI: '' }), null);
  assert.equal(lerConfigDiscord({ ...env, DISCORD_REDIRECT_URI: 'http://naosalvo.example/cb' }), null); // http fora de localhost
  assert.ok(lerConfigDiscord({ ...env, DISCORD_REDIRECT_URI: 'http://localhost:3000/cb' }));
  assert.throws(() => lerConfigDiscord({ ...env, DISCORD_CLIENT_SECRET_FILE: join(dir, 'nao-existe') }), /ENOENT/); // arquivo configurado e ausente = falha na subida
});

// ---- rotas com pool falso (nenhuma toca no banco) ----
const lerCookie = (cookies, nome) => cookies.find((c) => c.startsWith(nome + '='));

test('GET /api/auth/discord: 302 para o Discord com state, e o MESMO state no cookie httpOnly', async () => {
  const s = await servidor(poolFalso, { auth: { discord: CFG } });
  const r = await s.get('/api/auth/discord?voltar=/album.html', { headers: { 'X-Forwarded-For': '10.9.0.1' } });
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get('location'));
  assert.equal(loc.origin, 'https://discord.com'); assert.equal(loc.searchParams.get('scope'), 'identify');
  const ck = lerCookie(r.cookies, 'ns_oauth');
  assert.match(ck, /HttpOnly/); assert.match(ck, /SameSite=Lax/); assert.match(ck, /Secure/); assert.match(ck, /Path=\/api\/auth/);
  const guardado = desempacotarState(decodeURIComponent(ck.split(';')[0].split('=')[1]), K);
  assert.equal(guardado.state, loc.searchParams.get('state')); assert.equal(guardado.voltar, '/album.html');
  await s.fechar();
});

test('GET /api/auth/discord: voltar externo vira "/" (open redirect) e nunca vai ao Discord', async () => {
  const s = await servidor(poolFalso, { auth: { discord: CFG } });
  for (const v of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)']) {
    const r = await s.get('/api/auth/discord?voltar=' + encodeURIComponent(v), { headers: { 'X-Forwarded-For': '10.9.0.2' } });
    const ck = lerCookie(r.cookies, 'ns_oauth');
    assert.equal(desempacotarState(decodeURIComponent(ck.split(';')[0].split('=')[1]), K).voltar, '/', v);
    assert.ok(!r.headers.get('location').includes('evil'));
  }
  await s.fechar();
});

test('callback: state ausente, divergente ou sem cookie = 400, sem tocar no banco nem chamar o Discord', async () => {
  let chamadas = 0;
  const s = await servidor(poolFalso, { auth: { discord: CFG, fetch: async () => { chamadas++; throw new Error('sem rede'); } } });
  const h = (ip, extra = {}) => ({ headers: { 'X-Forwarded-For': ip, ...extra } });
  const cookieDoState = encodeURIComponent(empacotarState('estado-certo', '/', K));
  assert.equal((await s.get('/api/auth/discord/callback?code=c&state=x', h('10.9.1.1'))).status, 400);                                  // sem cookie
  assert.equal((await s.get('/api/auth/discord/callback?code=c', h('10.9.1.2', { Cookie: 'ns_oauth=' + cookieDoState }))).status, 400); // sem state
  const r = await s.get('/api/auth/discord/callback?code=c&state=outro', h('10.9.1.3', { Cookie: 'ns_oauth=' + cookieDoState }));
  assert.equal(r.status, 400); assert.match(r.json.erro, /estado de login inválido/);
  assert.ok(lerCookie(r.cookies, 'ns_oauth')?.includes('Max-Age=0'), 'state descartado');
  assert.ok(!r.cookies.some((c) => c.startsWith('ns_sessao=')), 'nenhuma sessão aberta');
  assert.equal(chamadas, 0);
  await s.fechar();
});

test('callback: usuário cancelou no Discord = volta para a página com ?login=negado', async () => {
  const s = await servidor(poolFalso, { auth: { discord: CFG } });
  const ck = encodeURIComponent(empacotarState('ok-state', '/album.html', K));
  const r = await s.get('/api/auth/discord/callback?error=access_denied&state=ok-state', { headers: { 'X-Forwarded-For': '10.9.2.1', Cookie: 'ns_oauth=' + ck } });
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/album.html?login=negado');
  await s.fechar();
});

test('callback: cookie adulterado com vetores de open redirect NUNCA gera Location fora do site', async () => {
  const s = await servidor(poolFalso, { auth: { discord: CFG } });
  let n = 0;
  for (const v of ['/a/..//evil.com', '/..//evil.com', '/.//evil.com', '//evil.com', '/\\evil.com', '%2f%2fevil.com', 'https://evil.com', 'javascript:alert(1)']) {
    const ck = encodeURIComponent(empacotarState('st', v, K));
    const r = await s.get('/api/auth/discord/callback?error=access_denied&state=st', { headers: { 'X-Forwarded-For': `10.9.5.${++n}`, Cookie: 'ns_oauth=' + ck } });
    const loc = r.headers.get('location');
    assert.equal(loc, '/?login=negado', v);
    assert.equal(new URL(loc, 'https://site.exemplo').origin, 'https://site.exemplo', v);
  }
  await s.fechar();
});

test('callback: cookie adulterado com destino externo é revalidado (volta para "/")', async () => {
  const s = await servidor(poolFalso, { auth: { discord: CFG } });
  const ck = encodeURIComponent(empacotarState('st', 'https://evil.com/phish', K));
  const r = await s.get('/api/auth/discord/callback?error=access_denied&state=st', { headers: { 'X-Forwarded-For': '10.9.2.2', Cookie: 'ns_oauth=' + ck } });
  assert.equal(r.headers.get('location'), '/?login=negado');
  await s.fechar();
});

test('sem configuração do Discord: 503 nas rotas de login e o resto da API segue', async () => {
  const s = await servidor({ query: async () => ({ rows: [] }) }, { auth: { discord: null } });
  assert.equal((await s.get('/api/auth/discord', { headers: { 'X-Forwarded-For': '10.9.3.1' } })).status, 503);
  assert.equal((await s.get('/api/auth/discord/callback?code=1&state=2', { headers: { 'X-Forwarded-For': '10.9.3.2' } })).status, 503);
  assert.equal((await s.get('/api/health')).status, 200);
  await s.fechar();
});

test('rotas de login têm rate limit por IP (429 depois de 30)', async () => {
  const s = await servidor(poolFalso, { auth: { discord: CFG } });
  const h = { headers: { 'X-Forwarded-For': '10.9.4.4' } };
  let ultimo;
  for (let i = 0; i < 31; i++) ultimo = await s.get('/api/auth/discord', h);
  assert.equal(ultimo.status, 429);
  assert.equal((await s.get('/api/auth/discord', { headers: { 'X-Forwarded-For': '10.9.4.5' } })).status, 302); // outro IP não é afetado
  await s.fechar();
});

test('/api/eu e rotas protegidas sem login: 401', async () => {
  const s = await servidor(poolFalso, { autenticar: async () => null });
  assert.equal((await s.get('/api/eu')).status, 401);
  assert.equal((await s.post('/api/pacotes/abrir', {})).status, 401);
  await s.fechar();
});

// ---- IP do cliente atrás de Cloudflare -> Traefik -> API (TRUSTED_PROXY_HOPS) ----
const reqIp = (xff, socket = '172.18.0.5') => ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: socket } });

test('extrairIp (2 saltos): o IP do cliente é o penúltimo item; o que está à esquerda é ignorado', () => {
  // cadeia real: o Cloudflare acrescenta o cliente, o Traefik acrescenta a borda do Cloudflare
  assert.equal(extrairIp(reqIp('203.0.113.7, 172.70.1.1'), 2), '203.0.113.7');                       // 2 itens
  assert.equal(extrairIp(reqIp('6.6.6.6, 203.0.113.7, 172.70.1.1'), 2), '203.0.113.7');              // 3 itens: o forjado (6.6.6.6) fica à esquerda
  assert.equal(extrairIp(reqIp('1.1.1.1, 2.2.2.2, 6.6.6.6, 203.0.113.7, 172.70.1.1'), 2), '203.0.113.7'); // vários forjados
  assert.equal(extrairIp(reqIp('2001:db8::7, 2a06:98c0::1'), 2), '2001:db8::7');                      // IPv6
});

test('extrairIp: cadeia mais curta que o esperado usa o último; sem cabeçalho usa o socket', () => {
  assert.equal(extrairIp(reqIp('203.0.113.7'), 2), '203.0.113.7');                 // 1 item (sem Cloudflare na frente)
  assert.equal(extrairIp(reqIp(undefined), 2), '172.18.0.5');                      // sem XFF
  assert.equal(extrairIp(reqIp(''), 2), '172.18.0.5');
  assert.equal(extrairIp(reqIp(' , ,'), 2), '172.18.0.5');
  assert.equal(extrairIp(reqIp(undefined, '::ffff:172.18.0.5'), 2), '172.18.0.5'); // IPv4 mapeado
});

test('extrairIp: item que não parece IP cai no socket; saltos configuráveis; 0 ignora o cabeçalho', () => {
  assert.equal(extrairIp(reqIp('<script>, 172.70.1.1'), 2), '172.18.0.5');
  assert.equal(extrairIp(reqIp('x'.repeat(100) + ', 172.70.1.1'), 2), '172.18.0.5');
  assert.equal(extrairIp(reqIp('6.6.6.6, 203.0.113.7, 172.70.1.1'), 1), '172.70.1.1'); // 1 salto: o último
  assert.equal(extrairIp(reqIp('6.6.6.6, 9.9.9.9, 203.0.113.7, 172.70.1.1'), 3), '9.9.9.9');
  assert.equal(extrairIp(reqIp('6.6.6.6, 203.0.113.7'), 0), '172.18.0.5');
  assert.equal(extrairIp(reqIp('6.6.6.6, 203.0.113.7')), '6.6.6.6'); // padrão 2: com 2 itens o primeiro é o cliente
});

test('TRUSTED_PROXY_HOPS: padrão 2; aceita 0 a 10; inválido volta ao padrão', () => {
  assert.equal(saltosDeProxy({}), 2);
  assert.equal(saltosDeProxy({ TRUSTED_PROXY_HOPS: '0' }), 0);
  assert.equal(saltosDeProxy({ TRUSTED_PROXY_HOPS: '1' }), 1);
  assert.equal(saltosDeProxy({ TRUSTED_PROXY_HOPS: '3' }), 3);
  assert.equal(saltosDeProxy({ TRUSTED_PROXY_HOPS: '99' }), 10);
  for (const ruim of ['', 'abc', '-1', '1.5', ' ']) assert.equal(saltosDeProxy({ TRUSTED_PROXY_HOPS: ruim }), 2, ruim);
});

test('rate limit não é burlável com X-Forwarded-For forjado à esquerda', async () => {
  const s = await servidor(poolFalso, { auth: { discord: CFG } });
  let ultimo;
  for (let i = 0; i < 31; i++) {
    // o cliente real é sempre 203.0.113.99; ele muda só o item forjado do início da cadeia
    ultimo = await s.get('/api/auth/discord', { headers: { 'X-Forwarded-For': `6.6.6.${i}, 203.0.113.99, 172.70.1.1` } });
  }
  assert.equal(ultimo.status, 429);
  const outro = await s.get('/api/auth/discord', { headers: { 'X-Forwarded-For': '6.6.6.1, 203.0.113.100, 172.70.1.1' } });
  assert.equal(outro.status, 302); // outro cliente real não é afetado
  await s.fechar();
});

// ---- foto de perfil ----
test('urlDoAvatar: monta a URL do CDN no servidor, sempre png e tamanho 128', () => {
  assert.equal(urlDoAvatar('123456789012345678', 'abcdef0123456789abcdef0123456789'), 'https://cdn.discordapp.com/avatars/123456789012345678/abcdef0123456789abcdef0123456789.png?size=128');
  // avatar animado (a_): continua png, nunca gif
  assert.equal(urlDoAvatar('12345', 'a_0123abcd'), 'https://cdn.discordapp.com/avatars/12345/a_0123abcd.png?size=128');
});

test('urlDoAvatar: sem avatar, hash ou id fora do formato = null (nada vindo do Discord vira URL)', () => {
  const id = '123456789012345678';
  for (const h of [null, undefined, '', 42, {}, [], 'ABCDEF', 'ab cd', 'ab/../cd', 'ab?x=1', 'ab#x', 'abc.png', 'http://evil.com/x', 'g', 'ab\ncd', 'a'.repeat(65), '../../x'])
    assert.equal(urlDoAvatar(id, h), null, JSON.stringify(h));
  for (const i of ['', '1234', '1'.repeat(26), '12a45', '123/456', null, 12345678, '12345 ', '../123456'])
    assert.equal(urlDoAvatar(i, 'abc123'), null, JSON.stringify(i));
});

test('buscarPerfil: avatar_url vem de id+hash validados; campo avatar_url/banner crus do Discord são ignorados', async () => {
  const resp = (corpo) => async () => ({ ok: true, status: 200, json: async () => corpo });
  const bom = await buscarPerfil('tok', resp({ id: '123456789012345', username: 'zeca', global_name: 'Zeca', avatar: 'abc123', avatar_url: 'https://evil.com/x.png', banner: 'zzz' }));
  assert.equal(bom.avatar_url, 'https://cdn.discordapp.com/avatars/123456789012345/abc123.png?size=128');
  assert.deepEqual(Object.keys(bom).sort(), ['avatar_url', 'global_name', 'id', 'username']);
  assert.equal((await buscarPerfil('tok', resp({ id: '123456789012345', username: 'z', avatar: null }))).avatar_url, null);       // sem foto
  assert.equal((await buscarPerfil('tok', resp({ id: '123456789012345', username: 'z' }))).avatar_url, null);                      // campo ausente
  assert.equal((await buscarPerfil('tok', resp({ id: '123456789012345', username: 'z', avatar: 'HASH/../ruim' }))).avatar_url, null); // hash inválido
  assert.equal((await buscarPerfil('tok', resp({ id: '123456789012345', username: 'z', avatar: 'https://evil.com/a.png' }))).avatar_url, null);
});
