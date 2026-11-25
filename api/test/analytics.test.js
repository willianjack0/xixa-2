// Analytics de navegação: classificação, contagem sem dados pessoais e consultas do painel. Banco real descartável.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bancoDeTeste, servidor, semBanco } from './helpers.js';
import { paginaDe, origemDe, dispositivoDe, ehRobo } from '../lib/navegacao.js';

test('classificação: página, origem, dispositivo e robô', () => {
  assert.equal(paginaDe('/'), 'home'); assert.equal(paginaDe('/index.html'), 'home'); assert.equal(paginaDe('/album.html?x=1'), 'album');
  assert.equal(paginaDe('/contribuir/'), 'contribuir'); assert.equal(paginaDe('/linha-do-tempo.html#2010'), 'linha-do-tempo');
  assert.equal(paginaDe('/qualquer/coisa'), 'outras'); assert.equal(paginaDe('/seppzone/'), 'outras');
  assert.equal(origemDe(''), 'direto'); assert.equal(origemDe('naosalvo.fishlab.com.br', 'naosalvo.fishlab.com.br'), 'direto');
  assert.equal(origemDe('www.google.com.br'), 'google'); assert.equal(origemDe('l.instagram.com'), 'instagram'); assert.equal(origemDe('t.co'), 'x');
  assert.equal(origemDe('blog.exemplo.com'), 'outros'); assert.equal(origemDe('<script>'), 'direto');
  assert.equal(dispositivoDe('Mozilla/5.0 (iPhone; CPU iPhone OS 17) Mobile'), 'celular'); assert.equal(dispositivoDe('Mozilla/5.0 (iPad)'), 'tablet');
  assert.equal(dispositivoDe('Mozilla/5.0 (Windows NT 10.0) Chrome'), 'desktop');
  assert.equal(ehRobo('Googlebot/2.1'), true); assert.equal(ehRobo(''), true); assert.equal(ehRobo('Mozilla/5.0 (Windows NT 10.0) Chrome/120'), false);
});

const skip = semBanco();
let db, api;
before(async () => { if (skip) return; db = await bancoDeTeste({ seed: true }); api = await servidor(db.pool, { adminToken: 'segredo' }); });
after(async () => { if (skip) return; await api.fechar(); await db.fechar(); });
const UA_CEL = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17) AppleWebKit Mobile Safari';
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120 Safari/537';
const de = (n, ua) => ({ headers: { 'X-Forwarded-For': '10.1.0.' + n, 'User-Agent': ua } });
const T = { headers: { Authorization: 'Bearer segredo' } };

test('POST /api/nav: conta visualização, sessão nova, visitante único por dia, origem e dispositivo; robô e lixo não contam', { skip }, async () => {
  assert.equal((await api.post('/api/nav', { t: 'pv', p: '/index.html', r: 'www.google.com', n: true }, de(1, UA_CEL))).status, 202);
  await api.post('/api/nav', { t: 'pv', p: '/album.html', r: 'www.google.com', n: false }, de(1, UA_CEL)); // mesma pessoa, outra página
  await api.post('/api/nav', { t: 'pv', p: '/', r: '', n: true }, de(2, UA_PC));
  await api.post('/api/nav', { t: 'pv', p: '/seppzone/', r: '', n: true }, de(2, 'Googlebot/2.1')); // robô
  await api.post('/api/nav', { t: 'tempo', p: '/index.html', r: 'www.google.com', s: 40 }, de(1, UA_CEL));
  await api.post('/api/nav', { t: 'tempo', p: '/', r: '', s: 20 }, de(2, UA_PC));
  assert.equal((await api.post('/api/nav', { t: 'tempo', p: '/', s: 99999 }, de(2, UA_PC))).status, 400);
  assert.equal((await api.post('/api/nav', { t: 'tempo', p: '/', s: 'x' }, de(2, UA_PC))).status, 400);
  assert.equal((await api.post('/api/nav', { t: 'outro' }, de(2, UA_PC))).status, 400);
  const j = (await api.get('/api/admin/analytics?periodo=hoje', T)).json;
  assert.deepEqual(j.periodos.hoje, { visualizacoes: 3, sessoes: 2, visitantes: 2, segundos: 60, tempo_medio_sessao: 30 });
  assert.deepEqual(j.origens.map((x) => x.nome).sort(), ['direto', 'google']);
  assert.equal(j.origens.find((x) => x.nome === 'google').visualizacoes, 2);
  assert.deepEqual(j.dispositivos.map((x) => [x.nome, x.visualizacoes]).sort(), [['celular', 2], ['desktop', 1]]);
  assert.deepEqual(j.paginas.map((x) => [x.nome, x.visualizacoes]).sort(), [['album', 1], ['home', 2]]);
  assert.equal(j.serie.length, 30); assert.equal(j.serie.at(-1).visualizacoes, 3); assert.equal(j.serie.at(-1).visitantes, 2); assert.equal(j.serie[0].visualizacoes, 0);
  assert.equal(j.periodos['7d'].visualizacoes, 3); assert.equal(j.periodos.total.visualizacoes, 3);
});

test('nada de dado pessoal: o IP não aparece em nenhuma tabela e o visitante é hash', { skip }, async () => {
  const { rows } = await db.pool.query('SELECT visitante FROM analytics_visitante_dia');
  assert.equal(rows.length, 2); for (const x of rows) assert.match(x.visitante, /^[0-9a-f]{32}$/);
  const todo = JSON.stringify((await db.pool.query('SELECT * FROM analytics_dia')).rows) + JSON.stringify(rows);
  assert.ok(!todo.includes('10.1.0.'));
});

test('períodos: ontem entra em 7d/30d/total mas não em hoje; dado antigo só em total', { skip }, async () => {
  const hoje = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
  await db.pool.query(`INSERT INTO analytics_dia (dia,pagina,origem,dispositivo,visualizacoes,sessoes,segundos) VALUES (${hoje}-1,'home','direto','desktop',10,5,500),(${hoje}-20,'home','direto','desktop',100,50,5000),(${hoje}-90,'home','direto','desktop',1000,500,50000)`);
  await db.pool.query(`INSERT INTO analytics_visitantes (dia,visitantes) VALUES (${hoje}-1,4),(${hoje}-20,40),(${hoje}-90,400)`);
  const p = (await api.get('/api/admin/analytics', T)).json.periodos;
  assert.equal(p.hoje.visualizacoes, 3); assert.equal(p['7d'].visualizacoes, 13); assert.equal(p['30d'].visualizacoes, 113); assert.equal(p.total.visualizacoes, 1113);
  assert.equal(p['7d'].visitantes, 6); assert.equal(p.total.visitantes, 446); assert.equal(p['30d'].tempo_medio_sessao, Math.round(5560 / 57));
  assert.equal((await api.get('/api/admin/analytics?periodo=lixo', T)).json.periodo, 'hoje');
  const serie = (await api.get('/api/admin/analytics', T)).json.serie;
  assert.equal(serie.at(-2).visualizacoes, 10);
});

test('memes mais vistos por período (visitas e cliques), com título e status', { skip }, async () => {
  const hoje = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
  await db.pool.query(`INSERT INTO eventos_meme_dia (meme_id,tipo,dia,total) VALUES
    ('para-nossa-alegria','visita',${hoje},5),('calma-calabreso','visita',${hoje},2),('calma-calabreso','visita',${hoje}-3,10),
    ('tapa-na-pantera','visita',${hoje}-20,50),('tapa-na-pantera','visita',${hoje}-100,500),('calma-calabreso','clique',${hoje},7)`);
  const ids = async (q) => (await api.get('/api/admin/analytics/memes?' + q, T)).json.itens.map((x) => [x.id, x.total]);
  assert.deepEqual(await ids('periodo=hoje&tipo=visita'), [['para-nossa-alegria', 5], ['calma-calabreso', 2]]);
  assert.deepEqual(await ids('periodo=7d&tipo=visita'), [['calma-calabreso', 12], ['para-nossa-alegria', 5]]);
  assert.deepEqual((await ids('periodo=30d&tipo=visita')).map((x) => x[0]), ['tapa-na-pantera', 'calma-calabreso', 'para-nossa-alegria']);
  assert.equal((await ids('periodo=total&tipo=visita'))[0][1], 550);
  assert.deepEqual(await ids('periodo=hoje&tipo=clique'), [['calma-calabreso', 7]]);
  const um = (await api.get('/api/admin/analytics/memes?periodo=hoje', T)).json.itens[0];
  assert.equal(um.status, 'publicado'); assert.ok(um.titulo);
});

test('só admin lê as estatísticas', { skip }, async () => {
  assert.equal((await api.get('/api/admin/analytics')).status, 401);
  assert.equal((await api.get('/api/admin/analytics/memes')).status, 401);
});
