// Envios, fila de moderação e remoções contra Postgres descartável (pulado sem TEST_DB_NAME). Login = auth-stub (X-Test-User).
// Papéis são dados direto no banco (UPDATE usuarios SET papel); patente vem do XP (UPDATE usuarios SET xp + eventos_xp).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { decidir, normalizarUrl, slugDe, youtubeId } from '../lib/envios.js';

// ---- partes puras (rodam sem banco) ----
test('normalizarUrl: formatos diferentes do mesmo vídeo do YouTube dão a mesma chave', () => {
  const k = 'yt:dQw4w9WgXcQ';
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=10', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'http://youtube.com/watch?v=dQw4w9WgXcQ#t=1']) assert.equal(normalizarUrl(u), k, u);
  assert.equal(normalizarUrl('https://www.TikTok.com/@x/video/1/?is_copy=1#a'), 'tiktok.com/@x/video/1');
  assert.equal(normalizarUrl('https://m.exemplo.com/a/b/'), 'exemplo.com/a/b');
  for (const ruim of ['', 'javascript:alert(1)', 'ftp://x.com/a', 'https://localhost/a', 'https://u:p@x.com/a', 'https://' + 'a'.repeat(600) + '.com', null, 5]) assert.equal(normalizarUrl(ruim), null, String(ruim));
  assert.equal(youtubeId('https://youtu.be/curto'), null);
});

test('slugDe: sem acento, a-z0-9-, limite de tamanho e vazio vira "meme"', () => {
  assert.equal(slugDe('Luiza que está no Canadá!!'), 'luiza-que-esta-no-canada');
  assert.equal(slugDe('  ---  '), 'meme');
  assert.equal(slugDe('😀😀'), 'meme');
  assert.ok(slugDe('a'.repeat(300)).length <= 70);
  assert.match(slugDe('Ção & Pão #1'), /^[a-z0-9-]{1,80}$/);
});

test('decidir: 2 votos iguais fecham; divididos esperam o desempate; 1 voto não fecha', () => {
  const v = (...x) => x.map((voto, i) => ({ voto, moderador_id: i + 1 }));
  assert.deepEqual(decidir(v('aprovado')), { resultado: null, por: null });
  assert.deepEqual(decidir(v('aprovado', 'aprovado')), { resultado: 'aprovado', por: 'consenso' });
  assert.deepEqual(decidir(v('aprovado', 'rejeitado')), { resultado: null, por: null });
  assert.deepEqual(decidir(v('aprovado', 'rejeitado'), { desempate: 'ajuste' }), { resultado: 'ajuste', por: 'desempate' });
  assert.deepEqual(decidir(v('aprovado', 'rejeitado', 'rejeitado')), { resultado: 'rejeitado', por: 'consenso' });
  assert.deepEqual(decidir(v('aprovado'), { desempate: 'ajuste' }), { resultado: null, por: null }, 'desempate precisa de 2+ votos');
});

// ---- com banco ----
const skip = semBanco();
let db, s;
const como = (apelido) => ({ headers: { 'X-Test-User': apelido } });
const GATO_OK = { fur: 1, pat: 0, eye: 2, acc: 3, clo: 0, bg: 4 };
const q = async (sql, v = []) => (await db.pool.query(sql, v)).rows;
const GET = (c, u) => s.get(c, como(u));
const POST = (c, corpo, u) => s.post(c, corpo, como(u));
const uid = async (apelido) => Number((await q('SELECT id FROM usuarios WHERE lower(apelido) = lower($1)', [apelido]))[0].id);

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, { autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' }) });
});
after(async () => { if (skip) return; await s.fechar(); await db.fechar(); });

/** cria o usuário (1º acesso), dá XP pelo razão e o papel; devolve o id */
async function pessoa(apelido, { xp = 0, papel = 'usuario' } = {}) {
  await GET('/api/eu', apelido);
  const id = await uid(apelido);
  if (xp) { await q("INSERT INTO eventos_xp (usuario_id, valor, motivo, ref) VALUES ($1,$2,'teste',$3)", [id, xp, 'seed:' + apelido]); await q('UPDATE usuarios SET xp = xp + $2 WHERE id = $1', [id, xp]); }
  if (papel !== 'usuario') await q('UPDATE usuarios SET papel = $2 WHERE id = $1', [id, papel]);
  return id;
}
const envio = (extra = {}) => ({ url: 'https://www.youtube.com/watch?v=ZZZZZZZZZZ1', titulo: 'Meme Enviado', ano: 2012, categoria: 'Zoeira', descricao: 'contexto', ...extra });
const xpDe = async (id) => Number((await q('SELECT xp, moedas FROM usuarios WHERE id = $1', [id]))[0].xp);
const moedasDe = async (id) => Number((await q('SELECT moedas FROM usuarios WHERE id = $1', [id]))[0].moedas);
const log = async (acao) => q('SELECT usuario_id, alvo, detalhe FROM log_auditoria WHERE acao = $1 ORDER BY id', [acao]);

test('enviar: exige login e patente Banda larga; validação campo a campo', { skip }, async () => {
  await pessoa('novato'); await pessoa('autor1', { xp: 200 });
  assert.equal((await s.post('/api/envios', envio())).status, 401);
  const r0 = await POST('/api/envios', envio(), 'novato');
  assert.equal(r0.status, 403); assert.equal(r0.json.patente_atual, 'Discado');
  const r1 = await POST('/api/envios', { url: 'javascript:alert(1)', titulo: 'x', ano: 1800, categoria: '' }, 'autor1');
  assert.equal(r1.status, 422); assert.deepEqual(Object.keys(r1.json.campos).sort(), ['ano', 'categoria', 'titulo', 'url']);
  assert.equal((await POST('/api/envios', envio({ categoria: 'Inexistente' }), 'autor1')).status, 422, 'FK da categoria');
  assert.equal((await q('SELECT count(*)::int AS n FROM envios'))[0].n, 0, 'nada gravado quando inválido');
});

test('enviar: grava como aberto, aparece em /meus e barra duplicado (mesmo vídeo em outro formato de link)', { skip }, async () => {
  const r = await POST('/api/envios', envio(), 'autor1');
  assert.equal(r.status, 201, JSON.stringify(r.json)); assert.equal(r.json.envio.status, 'aberto');
  const meus = await GET('/api/envios/meus', 'autor1');
  assert.equal(meus.json.itens.length, 1); assert.equal(meus.json.itens[0].titulo, 'Meme Enviado');
  assert.equal((await GET('/api/envios/meus', 'novato')).json.itens.length, 0);
  const dup = await POST('/api/envios', envio({ url: 'https://youtu.be/ZZZZZZZZZZ1', titulo: 'Outro nome' }), 'autor1');
  assert.equal(dup.status, 409); assert.equal(dup.json.duplicado_de.envio, r.json.envio.id);
  const noAcervo = await POST('/api/envios', envio({ url: 'https://www.youtube.com/watch?v=I8MC6-BuU28' }), 'autor1');
  assert.equal(noAcervo.status, 409); assert.equal(noAcervo.json.duplicado_de.meme, 'havaianas-de-pau');
});

test('enviar: no máximo 5 abertos por pessoa', { skip }, async () => {
  await pessoa('spammer', { xp: 200 });
  for (let i = 0; i < 5; i++) assert.equal((await POST('/api/envios', envio({ url: `https://exemplo.com/v/${i}`, titulo: 'Spam ' + i }), 'spammer')).status, 201);
  const r = await POST('/api/envios', envio({ url: 'https://exemplo.com/v/6', titulo: 'Spam 6' }), 'spammer');
  assert.equal(r.status, 429);
});

test('fila: só moderador/admin; não mostra o próprio envio nem os votos dos outros (voto cego)', { skip }, async () => {
  await pessoa('mod1', { xp: 200, papel: 'moderador' }); await pessoa('mod2', { xp: 200, papel: 'moderador' }); await pessoa('chefe', { xp: 200, papel: 'admin' });
  assert.equal((await s.get('/api/mod/fila')).status, 401);
  assert.equal((await GET('/api/mod/fila', 'autor1')).status, 403, 'usuário comum');
  const f = await GET('/api/mod/fila', 'mod1');
  assert.equal(f.status, 200);
  const e = f.json.itens.find((x) => x.titulo === 'Meme Enviado');
  assert.ok(e); assert.equal(e.autor, 'autor1'); assert.equal(e.votos, 0); assert.equal(e.meu_voto, null);
  assert.ok(!(await GET('/api/mod/fila', 'autor1')).json?.itens, 'autor sem papel não acessa');
  const idE = e.id;
  assert.equal((await POST(`/api/mod/fila/${idE}/voto`, { voto: 'aprovado' }, 'autor1')).status, 403);
  // moderador que é autor não vê o próprio envio na fila e não pode votar nele
  await q("UPDATE usuarios SET papel = 'moderador' WHERE lower(apelido) = 'autor1'");
  assert.ok(!(await GET('/api/mod/fila', 'autor1')).json.itens.some((x) => x.id === idE), 'o próprio envio não aparece');
  assert.equal((await POST(`/api/mod/fila/${idE}/voto`, { voto: 'aprovado' }, 'autor1')).status, 403, 'não vota no próprio envio');
  await q("UPDATE usuarios SET papel = 'usuario' WHERE lower(apelido) = 'autor1'");
});

test('ranking público marca só quem tem papel moderador (admin e usuário comum não)', { skip }, async () => {
  for (const metrica of ['xp']) {
    const r = (await s.get('/api/ranking?metrica=' + metrica + '&limite=100')).json.itens;
    const por = Object.fromEntries(r.map((x) => [x.apelido.toLowerCase(), x.moderador]));
    assert.equal(por.mod1, true); assert.equal(por.mod2, true);
    assert.equal(por.chefe, false, 'admin não ganha insígnia de moderador');
    assert.equal(por.autor1, false);
    assert.ok(r.every((x) => typeof x.moderador === 'boolean'));
    assert.ok(!r.some((x) => 'papel' in x), 'o papel em si não vai para o público');
  }
  // métrica por cartas também traz o campo
  const c = await s.get('/api/ranking?metrica=cartas');
  assert.equal(c.status, 200); assert.ok((c.json.itens || []).every((x) => typeof x.moderador === 'boolean'));
});

test('voto: valida corpo e id; 1 voto não fecha, mostra só a contagem; trocar o voto atualiza', { skip }, async () => {
  const idE = (await q("SELECT id FROM envios WHERE titulo = 'Meme Enviado'"))[0].id;
  assert.equal((await POST(`/api/mod/fila/${idE}/voto`, { voto: 'talvez' }, 'mod1')).status, 400);
  assert.equal((await POST(`/api/mod/fila/${idE}/voto`, { voto: 'aprovado', motivo: 'x'.repeat(301) }, 'mod1')).status, 422);
  assert.equal((await POST('/api/mod/fila/999999/voto', { voto: 'aprovado' }, 'mod1')).status, 404);
  const r1 = await POST(`/api/mod/fila/${idE}/voto`, { voto: 'rejeitado', motivo: 'sem contexto' }, 'mod1');
  assert.equal(r1.status, 200); assert.equal(r1.json.decidido, null); assert.equal(r1.json.votos, 1);
  await POST(`/api/mod/fila/${idE}/voto`, { voto: 'ajuste' }, 'mod1'); // troca
  assert.equal((await q('SELECT count(*)::int AS n FROM votos_moderacao WHERE envio_id = $1', [idE]))[0].n, 1);
  assert.equal((await q('SELECT voto FROM votos_moderacao WHERE envio_id = $1', [idE]))[0].voto, 'ajuste');
  const f = (await GET('/api/mod/fila', 'mod2')).json.itens.find((x) => x.id === idE);
  assert.equal(f.votos, 1); assert.equal(f.meu_voto, null, 'o voto do outro não vaza');
  assert.ok(!JSON.stringify(f).includes('ajuste'));
  assert.equal((await q("SELECT status FROM envios WHERE id = $1", [idE]))[0].status, 'aberto');
});

test('aprovar por consenso: cria o meme Clássico, paga autor (XP e moedas) e quem votou alinhado, tudo no razão e no log', { skip }, async () => {
  const idE = (await q("SELECT id FROM envios WHERE titulo = 'Meme Enviado'"))[0].id;
  const [autor, m1, m2] = [await uid('autor1'), await uid('mod1'), await uid('mod2')];
  const xp0 = [await xpDe(autor), await xpDe(m1), await xpDe(m2)], moedas0 = await moedasDe(autor);
  await POST(`/api/mod/fila/${idE}/voto`, { voto: 'aprovado' }, 'mod1'); // troca de ajuste para aprovado
  const r = await POST(`/api/mod/fila/${idE}/voto`, { voto: 'aprovado' }, 'mod2');
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.decidido, 'aprovado'); assert.equal(r.json.por, 'consenso');
  assert.equal(r.json.meme_id, 'meme-enviado');
  const [m] = await q("SELECT titulo, ano, categoria, raridade, status, youtube_id, autor, descricao FROM memes WHERE id = 'meme-enviado'");
  assert.deepEqual(m, { titulo: 'Meme Enviado', ano: 2012, categoria: 'Zoeira', raridade: 'Clássico', status: 'publicado', youtube_id: 'ZZZZZZZZZZ1', autor: 'autor1', descricao: 'contexto' });
  assert.equal((await s.get('/api/memes/meme-enviado')).status, 200, 'aparece no site');
  const [e] = await q('SELECT status, meme_id, decidido_em FROM envios WHERE id = $1', [idE]);
  assert.equal(e.status, 'aprovado'); assert.equal(e.meme_id, 'meme-enviado'); assert.ok(e.decidido_em);
  const regras = Object.fromEntries((await q('SELECT chave, valor FROM regras_economia')).map((x) => [x.chave, x.valor]));
  assert.equal(await xpDe(autor), xp0[0] + regras.xp_ganho.envio_aprovado);
  assert.equal(await moedasDe(autor), moedas0 + regras.recompensa_moedas.envio_aprovado);
  assert.equal(await xpDe(m1), xp0[1] + 3); assert.equal(await xpDe(m2), xp0[2] + 3);
  for (const id of [autor, m1, m2]) { // cache == razão
    const [x] = await q('SELECT u.xp::int AS xp, u.moedas::int AS mo, COALESCE((SELECT sum(valor) FROM eventos_xp WHERE usuario_id = u.id),0)::int AS xr, COALESCE((SELECT sum(valor) FROM movimentos_moeda WHERE usuario_id = u.id),0)::int AS mr FROM usuarios u WHERE u.id = $1', [id]);
    assert.equal(x.xp, x.xr); assert.equal(x.mo, x.mr);
  }
  assert.equal((await log('envio.decidir')).at(-1).detalhe.meme, 'meme-enviado');
  assert.ok((await log('envio.votar')).length >= 3);
  // já decidido: novo voto 409 e sem pagar de novo
  assert.equal((await POST(`/api/mod/fila/${idE}/voto`, { voto: 'rejeitado' }, 'chefe')).status, 409);
  assert.equal(await xpDe(autor), xp0[0] + regras.xp_ganho.envio_aprovado);
  assert.equal((await GET('/api/envios/meus', 'autor1')).json.itens[0].status, 'aprovado');
});

test('rejeitar por consenso: guarda o motivo, não cria meme e não paga ninguém', { skip }, async () => {
  const [autor] = [await uid('spammer')], xp0 = await xpDe(autor);
  const idE = (await q("SELECT id FROM envios WHERE titulo = 'Spam 0'"))[0].id;
  await POST(`/api/mod/fila/${idE}/voto`, { voto: 'rejeitado', motivo: 'sem contexto' }, 'mod1');
  const r = await POST(`/api/mod/fila/${idE}/voto`, { voto: 'rejeitado' }, 'mod2');
  assert.equal(r.json.decidido, 'rejeitado');
  const [e] = await q('SELECT status, motivo, meme_id FROM envios WHERE id = $1', [idE]);
  assert.deepEqual(e, { status: 'rejeitado', motivo: 'sem contexto', meme_id: null });
  assert.equal(await xpDe(autor), xp0);
  assert.equal((await q("SELECT count(*)::int AS n FROM memes WHERE titulo = 'Spam 0'"))[0].n, 0);
  assert.equal((await GET('/api/envios/meus', 'spammer')).json.itens.find((x) => x.id === idE).motivo, 'sem contexto');
});

test('votos divididos esperam o desempate do admin; admin votando antes não decide sozinho', { skip }, async () => {
  const idE = (await q("SELECT id FROM envios WHERE titulo = 'Spam 1'"))[0].id;
  const r0 = await POST(`/api/mod/fila/${idE}/voto`, { voto: 'duplicado' }, 'chefe'); // admin primeiro: é só 1 voto
  assert.equal(r0.json.decidido, null);
  const r1 = await POST(`/api/mod/fila/${idE}/voto`, { voto: 'rejeitado' }, 'mod1'); // 2 votos divididos
  assert.equal(r1.json.decidido, null, 'dividido espera');
  assert.equal((await q('SELECT status FROM envios WHERE id = $1', [idE]))[0].status, 'aberto');
  // um 3º moderador comum desempatando para um dos lados fecha por consenso
  await pessoa('mod3', { xp: 200, papel: 'moderador' });
  const r2 = await POST(`/api/mod/fila/${idE}/voto`, { voto: 'rejeitado' }, 'mod3');
  assert.equal(r2.json.decidido, 'rejeitado'); assert.equal(r2.json.por, 'consenso');
  // caso do desempate de verdade: 2 divididos e o admin entra depois com uma 3ª opção
  const idF = (await q("SELECT id FROM envios WHERE titulo = 'Spam 2'"))[0].id;
  await POST(`/api/mod/fila/${idF}/voto`, { voto: 'aprovado' }, 'mod1');
  await POST(`/api/mod/fila/${idF}/voto`, { voto: 'rejeitado' }, 'mod2');
  const r3 = await POST(`/api/mod/fila/${idF}/voto`, { voto: 'ajuste', motivo: 'faltou o ano certo' }, 'chefe');
  assert.equal(r3.json.decidido, 'ajuste'); assert.equal(r3.json.por, 'desempate');
  const [e] = await q('SELECT status, motivo FROM envios WHERE id = $1', [idF]);
  assert.deepEqual(e, { status: 'ajuste', motivo: 'faltou o ano certo' });
  assert.equal((await log('envio.decidir')).at(-1).detalhe.por, 'desempate');
});

test('transação: se a aprovação não pode ser concluída, o voto também não fica gravado', { skip }, async () => {
  await q("INSERT INTO envios (usuario_id, titulo, ano, categoria, url, url_normalizada) VALUES ($1,'Sem ano',NULL,NULL,'https://exemplo.com/sa','exemplo.com/sa')", [await uid('autor1')]);
  const idE = (await q("SELECT id FROM envios WHERE titulo = 'Sem ano'"))[0].id;
  await POST(`/api/mod/fila/${idE}/voto`, { voto: 'aprovado' }, 'mod1');
  const r = await POST(`/api/mod/fila/${idE}/voto`, { voto: 'aprovado' }, 'mod2');
  assert.equal(r.status, 409);
  assert.equal((await q('SELECT count(*)::int AS n FROM votos_moderacao WHERE envio_id = $1', [idE]))[0].n, 1, 'o voto que fecharia foi desfeito');
  assert.equal((await q('SELECT status FROM envios WHERE id = $1', [idE]))[0].status, 'aberto');
  assert.equal((await q("SELECT count(*)::int AS n FROM memes WHERE titulo = 'Sem ano'"))[0].n, 0);
});

test('mesmo título gera ids de meme diferentes (sufixo -2)', { skip }, async () => {
  await pessoa('autor2', { xp: 200 });
  const r = await POST('/api/envios', envio({ url: 'https://exemplo.com/outro', titulo: 'Meme Enviado' }), 'autor2');
  assert.equal(r.status, 201);
  await POST(`/api/mod/fila/${r.json.envio.id}/voto`, { voto: 'aprovado' }, 'mod1');
  const d = await POST(`/api/mod/fila/${r.json.envio.id}/voto`, { voto: 'aprovado' }, 'mod2');
  assert.equal(d.json.meme_id, 'meme-enviado-2');
  assert.equal((await q("SELECT youtube_id FROM memes WHERE id = 'meme-enviado-2'"))[0].youtube_id, null, 'link que não é do YouTube não ganha youtube_id');
});

test('remoções: pedido público com prazo de 72 h, validação, fila só para moderador e decisão', { skip }, async () => {
  const ok = await s.post('/api/remocoes', { solicitante: 'Dono do vídeo', motivo: 'Este vídeo é meu e não autorizei.', contato: 'dono@exemplo.com', meme_id: 'meme-enviado' });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  const horas = (new Date(ok.json.prazo_em) - Date.now()) / 3600000;
  assert.ok(horas > 71 && horas <= 72.01, 'prazo ~72 h: ' + horas);
  const ruim = await s.post('/api/remocoes', { solicitante: 'x', motivo: 'curto', meme_id: 'NÃO VÁLIDO' });
  assert.equal(ruim.status, 422); assert.deepEqual(Object.keys(ruim.json.campos).sort(), ['meme_id', 'motivo', 'solicitante']);
  assert.equal((await s.post('/api/remocoes', { solicitante: 'Fulano', motivo: 'um motivo bem longo aqui', meme_id: 'nao-existe' })).status, 422);
  assert.equal((await s.get('/api/mod/remocoes')).status, 401);
  assert.equal((await GET('/api/mod/remocoes', 'autor2')).status, 403);
  const lista = await GET('/api/mod/remocoes', 'mod1');
  assert.equal(lista.status, 200); assert.equal(lista.json.itens[0].status, 'aberta'); assert.equal(lista.json.itens[0].meme_titulo, 'Meme Enviado'); assert.equal(lista.json.itens[0].atrasada, false);
  const id = ok.json.id;
  assert.equal((await POST(`/api/mod/remocoes/${id}`, { decisao: 'talvez' }, 'mod1')).status, 400);
  const dec = await POST(`/api/mod/remocoes/${id}`, { decisao: 'atendida' }, 'mod1');
  assert.equal(dec.status, 200); assert.equal(dec.json.meme_removido, true);
  assert.equal((await q("SELECT status FROM memes WHERE id = 'meme-enviado'"))[0].status, 'removido');
  assert.equal((await s.get('/api/memes/meme-enviado')).status, 404, 'saiu do site');
  assert.equal((await POST(`/api/mod/remocoes/${id}`, { decisao: 'negada' }, 'mod1')).status, 409, 'já respondido');
  assert.equal((await log('remocao.atender')).at(-1).detalhe.meme, 'meme-enviado');
  // negada não mexe no meme
  const neg = await s.post('/api/remocoes', { solicitante: 'Alguém', motivo: 'quero que saia daqui por favor', meme_id: 'havaianas-de-pau' });
  await POST(`/api/mod/remocoes/${neg.json.id}`, { decisao: 'negada' }, 'mod1');
  assert.equal((await q("SELECT status FROM memes WHERE id = 'havaianas-de-pau'"))[0].status, 'publicado');
  // atrasada: prazo vencido e ainda aberta
  const velha = await s.post('/api/remocoes', { solicitante: 'Alguém', motivo: 'pedido que ficou parado aqui' });
  await q("UPDATE remocoes SET prazo_em = now() - interval '1 hour' WHERE id = $1", [velha.json.id]);
  assert.equal((await GET('/api/mod/remocoes', 'mod1')).json.itens.find((x) => x.id === velha.json.id).atrasada, true);
});
