// Perfil, boas-vindas no fim do gato e catálogo de pacotes contra Postgres descartável (pulado sem TEST_DB_NAME).
// Login = stub (X-Test-User). O caso de sessão com cookie + CSRF está em auth.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';

const skip = semBanco();
const GATO = { fur: 1, pat: 0, eye: 2, acc: 3, clo: 0, bg: 4 };
const GATO2 = { fur: 9, pat: 4, eye: 4, acc: 8, clo: 7, bg: 7 };
let db, s, n = 0;
const stub = () => criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' });

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, { autenticar: stub() });
});
after(async () => { if (skip) return; await s.fechar(); await db.fechar(); });

const q = async (sql, v) => (await db.pool.query(sql, v)).rows;
const como = (u) => ({ headers: { 'X-Test-User': u } });
const GET = (c, u) => s.get(c, como(u));
const POST = (c, corpo, u) => s.post(c, corpo, como(u));
const PATCH = (c, corpo, u) => s.patch(c, corpo, como(u));
const novoUsuario = async () => { const u = 'perfil' + (++n) + 'x'; const e = await GET('/api/eu', u); return { u, id: e.json.usuario.id }; };
const boasDe = async (id) => (await q("SELECT id, usado_em FROM pacotes_estoque WHERE usuario_id = $1 AND tipo = 'boas'", [id]));
/** conta Discord de mentira para o usuário (para testar usar_foto) */
const comFoto = (id, url = 'https://cdn.discordapp.com/avatars/12345/abc123.png?size=128') =>
  q("INSERT INTO contas_oauth (usuario_id, provedor, provedor_id, avatar_url) VALUES ($1, 'discord', $2, $3)", [id, 'dc' + id + Math.random().toString(36).slice(2, 8), url]);

// ---------- GET /api/eu ----------
test('GET /api/eu de conta nova: gato provisório, sem foto, cadastro incompleto', { skip }, async () => {
  const { u } = await novoUsuario();
  const e = (await GET('/api/eu', u)).json.usuario;
  assert.equal(e.usar_foto, false); assert.equal(e.cadastro_completo, false); assert.equal(e.avatar_url, null);
  assert.equal(typeof e.apelido, 'string'); assert.equal(typeof e.id, 'number'); assert.equal(typeof e.avatar_gato, 'object');
});

// ---------- apelido ----------
test('apelido: troca, resposta com o perfil e persistência', { skip }, async () => {
  const { u } = await novoUsuario();
  const r = await PATCH('/api/eu', { apelido: 'NovoNome_' + n }, u);
  assert.equal(r.status, 200);
  assert.equal(r.json.usuario.apelido, 'NovoNome_' + n); assert.equal(r.json.pacote_boas_vindas, null);
  assert.equal(r.json.usuario.cadastro_completo, false, 'trocar apelido não completa o cadastro');
  // o stub identifica pelo apelido: depois de renomear, o mesmo usuário passa a ser chamado pelo nome novo (com sessão é pelo id)
  assert.equal((await GET('/api/eu', 'NovoNome_' + n)).json.usuario.apelido, 'NovoNome_' + n);
});

test('apelido duplicado: 409 (sem diferenciar maiúsculas); o próprio apelido em outra caixa é permitido', { skip }, async () => {
  const a = await novoUsuario(), b = await novoUsuario();
  const nome = 'Duplicado' + n;
  assert.equal((await PATCH('/api/eu', { apelido: nome }, a.u)).status, 200);
  for (const v of [nome, nome.toUpperCase(), nome.toLowerCase()]) {
    const r = await PATCH('/api/eu', { apelido: v }, b.u);
    assert.equal(r.status, 409, v); assert.equal(r.json.campo, 'apelido'); assert.match(r.json.erro, /em uso/);
  }
  assert.notEqual((await GET('/api/eu', b.u)).json.usuario.apelido, nome, 'b não mudou');
  // (stub: a partir daqui 'a' é chamado pelo apelido atual, que é `nome`)
  await q('UPDATE usuarios SET apelido_alterado_em = NULL WHERE lower(apelido) = lower($1)', [nome]);   // a janela de 24 h tem teste próprio
  assert.equal((await PATCH('/api/eu', { apelido: nome.toUpperCase() }, nome)).status, 200);   // a só muda a caixa do próprio nome
  assert.equal((await GET('/api/eu', nome.toUpperCase())).json.usuario.apelido, nome.toUpperCase());
  assert.equal((await PATCH('/api/eu', { apelido: nome.toUpperCase() }, nome.toUpperCase())).status, 200); // repetir o mesmo valor também
});

test('apelido duplicado simultâneo: um ganha, o outro recebe 409', { skip }, async () => {
  const a = await novoUsuario(), b = await novoUsuario();
  const nome = 'Corrida' + n;
  const rs = await Promise.all([PATCH('/api/eu', { apelido: nome }, a.u), PATCH('/api/eu', { apelido: nome }, b.u)]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await q('SELECT count(*)::int AS n FROM usuarios WHERE lower(apelido) = lower($1)', [nome]))[0].n, 1);
});

test('tudo ou nada: apelido válido + campo inválido na mesma chamada não grava nada', { skip }, async () => {
  const { u, id } = await novoUsuario();
  const antes = (await GET('/api/eu', u)).json.usuario;
  const r = await PATCH('/api/eu', { apelido: 'NaoDeveGravar' + n, usar_foto: true }, u);   // sem foto: 422
  assert.equal(r.status, 422); assert.equal(r.json.campo, 'usar_foto');
  assert.deepEqual((await GET('/api/eu', u)).json.usuario, antes);
  assert.equal((await q('SELECT count(*)::int AS n FROM usuarios WHERE id = $1 AND apelido = $2', [id, 'NaoDeveGravar' + n]))[0].n, 0);
});

// ---------- avatar_gato ----------
test('avatar_gato inválido: 422 e nada muda (gato, cadastro e estoque)', { skip }, async () => {
  const { u, id } = await novoUsuario();
  const antes = (await GET('/api/eu', u)).json.usuario;
  for (const ruim of [{ ...GATO, fur: 10 }, { ...GATO, bg: 'x' }, { fur: 1 }, { ...GATO, extra: 1 }, 'gato']) {
    const r = await PATCH('/api/eu', { avatar_gato: ruim }, u);
    assert.equal(r.status, 422, JSON.stringify(ruim)); assert.equal(r.json.campo, 'avatar_gato');
  }
  assert.deepEqual((await GET('/api/eu', u)).json.usuario, antes);
  assert.equal((await boasDe(id)).length, 0);
});

test('1º salvar do gato: cadastro completo + 1 pacote de boas-vindas; salvar de novo não dá outro', { skip }, async () => {
  const { u, id } = await novoUsuario();
  const r1 = await PATCH('/api/eu', { avatar_gato: GATO }, u);
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.json.usuario.avatar_gato, GATO); assert.equal(r1.json.usuario.cadastro_completo, true);
  assert.equal(typeof r1.json.pacote_boas_vindas.estoque_id, 'number');
  const linhas = await boasDe(id);
  assert.equal(linhas.length, 1); assert.equal(Number(linhas[0].id), r1.json.pacote_boas_vindas.estoque_id); assert.equal(linhas[0].usado_em, null);
  assert.ok((await q('SELECT cadastro_completo_em FROM usuarios WHERE id = $1', [id]))[0].cadastro_completo_em);

  const r2 = await PATCH('/api/eu', { avatar_gato: GATO2 }, u);
  assert.equal(r2.status, 200); assert.equal(r2.json.pacote_boas_vindas, null);
  assert.deepEqual(r2.json.usuario.avatar_gato, GATO2);
  assert.equal((await boasDe(id)).length, 1);
  // o pacote aparece na carteira e abre normalmente (5 cartas, garantia Raro+)
  assert.deepEqual((await GET('/api/carteira', u)).json.pacotes.map((p) => [p.tipo, p.quantidade]), [['boas', 1]]);
  const ab = await POST('/api/pacotes/abrir', { estoque_id: r1.json.pacote_boas_vindas.estoque_id }, u);
  assert.equal(ab.status, 200); assert.equal(ab.json.cartas.length, 5); assert.equal(ab.json.tipo, 'boas');
  // depois de aberto, salvar o gato de novo continua sem dar outro
  assert.equal((await PATCH('/api/eu', { avatar_gato: GATO }, u)).json.pacote_boas_vindas, null);
  assert.equal((await boasDe(id)).length, 1);
});

test('boas-vindas UMA vez só: 10 PATCH simultâneos do gato = exatamente 1 pacote', { skip }, async () => {
  const { u, id } = await novoUsuario();
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => PATCH('/api/eu', { avatar_gato: { ...GATO, bg: i % 8 } }, u)));
  assert.ok(rs.every((r) => r.status === 200), rs.map((r) => r.status).join());
  assert.equal(rs.filter((r) => r.json.pacote_boas_vindas !== null).length, 1, 'só uma resposta entrega o pacote');
  assert.equal((await boasDe(id)).length, 1);
  assert.equal((await q('SELECT count(*)::int AS n FROM pacotes_estoque WHERE usuario_id = $1', [id]))[0].n, 1);
  assert.equal((await GET('/api/eu', u)).json.usuario.cadastro_completo, true);
});

test('boas-vindas: o índice único é a segunda barreira (inserção direta duplicada falha)', { skip }, async () => {
  const { u, id } = await novoUsuario();
  await PATCH('/api/eu', { avatar_gato: GATO }, u);
  await assert.rejects(q("INSERT INTO pacotes_estoque (usuario_id, tipo, origem) VALUES ($1, 'boas', 'boas')", [id]), /pacotes_estoque_boas_uq/);
});

test('conta antiga que já tinha ganho "boas" (pela visita antiga): completa o cadastro sem ganhar outro', { skip }, async () => {
  const { u, id } = await novoUsuario();
  await q("INSERT INTO pacotes_estoque (usuario_id, tipo, origem) VALUES ($1, 'boas', 'boas')", [id]);
  const r = await PATCH('/api/eu', { avatar_gato: GATO }, u);
  assert.equal(r.status, 200); assert.equal(r.json.pacote_boas_vindas, null); assert.equal(r.json.usuario.cadastro_completo, true);
  assert.equal((await boasDe(id)).length, 1);
});

test('trocar apelido ou usar_foto antes do gato não dá pacote nem completa o cadastro', { skip }, async () => {
  const { u, id } = await novoUsuario();
  await comFoto(id);
  assert.equal((await PATCH('/api/eu', { apelido: 'SoApelido' + n, usar_foto: true }, u)).status, 200);
  assert.equal((await boasDe(id)).length, 0);
  assert.equal((await GET('/api/eu', u)).json.usuario.cadastro_completo, false);
});

test('apelido + gato na mesma chamada: 1 pacote e apelido novo', { skip }, async () => {
  const { u, id } = await novoUsuario();
  const r = await PATCH('/api/eu', { apelido: 'Junto' + n, avatar_gato: GATO }, u);
  assert.equal(r.status, 200); assert.equal(r.json.usuario.apelido, 'Junto' + n); assert.ok(r.json.pacote_boas_vindas);
  assert.equal((await boasDe(id)).length, 1);
});

// ---------- visita sem boas-vindas ----------
test('POST /api/visita não dá mais boas-vindas, nem na 1ª visita; segue com XP e pacote diário', { skip }, async () => {
  const { u, id } = await novoUsuario();
  const v1 = await POST('/api/visita', {}, u);
  assert.equal(v1.status, 200); assert.equal(v1.json.xp_ganho, 10); assert.deepEqual(v1.json.pacotes_ganhos, ['diario']);
  assert.equal((await boasDe(id)).length, 0);
  assert.deepEqual((await GET('/api/carteira', u)).json.pacotes.map((p) => p.tipo), ['diario']);
  // depois do gato o pacote vem; novas visitas continuam sem dar outro
  assert.ok((await PATCH('/api/eu', { avatar_gato: GATO }, u)).json.pacote_boas_vindas);
  const v2 = await POST('/api/visita', {}, u);
  assert.deepEqual(v2.json.pacotes_ganhos, []); assert.equal(v2.json.primeira_visita_do_dia, false);
  assert.equal((await boasDe(id)).length, 1);
});

// ---------- usar_foto ----------
test('usar_foto sem avatar_url: 422 e continua false; com foto liga e desliga', { skip }, async () => {
  const { u, id } = await novoUsuario();
  const r = await PATCH('/api/eu', { usar_foto: true }, u);
  assert.equal(r.status, 422); assert.equal(r.json.campo, 'usar_foto'); assert.match(r.json.erro, /foto/);
  assert.equal((await q('SELECT usar_foto FROM usuarios WHERE id = $1', [id]))[0].usar_foto, false);
  assert.equal((await PATCH('/api/eu', { usar_foto: false }, u)).status, 200);                // desligar sempre pode

  await comFoto(id, 'https://cdn.discordapp.com/avatars/777/hash999.png?size=128');
  const on = await PATCH('/api/eu', { usar_foto: true }, u);
  assert.equal(on.status, 200); assert.equal(on.json.usuario.usar_foto, true);
  assert.equal(on.json.usuario.avatar_url, 'https://cdn.discordapp.com/avatars/777/hash999.png?size=128');
  assert.equal((await GET('/api/eu', u)).json.usuario.usar_foto, true);
  const off = await PATCH('/api/eu', { usar_foto: false }, u);
  assert.equal(off.json.usuario.usar_foto, false); assert.ok(off.json.usuario.avatar_url, 'a foto continua disponível');
});

test('usar_foto efetivo: se a foto some do Discord, /api/eu devolve false sozinho', { skip }, async () => {
  const { u, id } = await novoUsuario();
  await comFoto(id);
  await PATCH('/api/eu', { usar_foto: true }, u);
  assert.equal((await GET('/api/eu', u)).json.usuario.usar_foto, true);
  await q("UPDATE contas_oauth SET avatar_url = NULL WHERE usuario_id = $1", [id]);          // próximo login trouxe avatar null
  const e = (await GET('/api/eu', u)).json.usuario;
  assert.equal(e.avatar_url, null); assert.equal(e.usar_foto, false);
});

test('avatar_url nunca é aceito do cliente', { skip }, async () => {
  const { u, id } = await novoUsuario();
  await comFoto(id);
  const antes = (await q('SELECT avatar_url FROM contas_oauth WHERE usuario_id = $1', [id]))[0].avatar_url;
  assert.equal((await PATCH('/api/eu', { avatar_url: 'https://evil.com/x.png' }, u)).status, 400);
  assert.equal((await PATCH('/api/eu', { usar_foto: true, avatar_url: 'https://evil.com/x.png' }, u)).status, 400);
  assert.equal((await q('SELECT avatar_url FROM contas_oauth WHERE usuario_id = $1', [id]))[0].avatar_url, antes);
});

// ---------- ranking ----------
test('ranking devolve avatar_gato sempre e avatar_url só quando usar_foto', { skip }, async () => {
  const { u, id } = await novoUsuario();
  await comFoto(id, 'https://cdn.discordapp.com/avatars/42/rankhash.png?size=128');
  await PATCH('/api/eu', { avatar_gato: GATO2 }, u);
  await q("INSERT INTO eventos_xp (usuario_id, valor, motivo, ref) VALUES ($1, 999999, 'teste', 'rk')", [id]);
  const pega = async (m) => (await s.get(`/api/ranking?metrica=${m}&limite=100`)).json.itens.find((i) => i.apelido === (apelidoDe[id]));
  const apelidoDe = { [id]: (await GET('/api/eu', u)).json.usuario.apelido };

  let xp = await pega('xp');
  assert.ok(xp, 'aparece no ranking de xp'); assert.deepEqual(xp.avatar_gato, GATO2); assert.equal(xp.avatar_url, null);
  assert.ok(!JSON.stringify(xp).includes('cdn.discordapp'), 'a foto não vaza sem usar_foto');

  await PATCH('/api/eu', { usar_foto: true }, u);
  xp = await pega('xp');
  assert.equal(xp.avatar_url, 'https://cdn.discordapp.com/avatars/42/rankhash.png?size=128'); assert.deepEqual(xp.avatar_gato, GATO2);

  // ranking de cartas: abre o pacote de boas-vindas para ter cartas
  const est = (await boasDe(id))[0];
  await POST('/api/pacotes/abrir', { estoque_id: Number(est.id) }, u);
  const cartas = await pega('cartas');
  assert.ok(cartas); assert.equal(cartas.avatar_url, 'https://cdn.discordapp.com/avatars/42/rankhash.png?size=128');
  await PATCH('/api/eu', { usar_foto: false }, u);
  assert.equal((await pega('cartas')).avatar_url, null);
  assert.equal((await pega('xp')).avatar_url, null);
});

// ---------- catálogo de pacotes ----------
test('GET /api/pacotes/tipos: catálogo da loja com chances, garantia, escopo, gratis e comprar', { skip }, async () => {
  const { u } = await novoUsuario();
  assert.equal((await s.get('/api/pacotes/tipos')).status, 401);
  const r = await GET('/api/pacotes/tipos', u);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.itens.map((t) => t.id), ['diario', 'boas', 'classico', 'colecao', 'ouro']);
  const por = Object.fromEntries(r.json.itens.map((t) => [t.id, t]));
  for (const t of r.json.itens) {
    assert.deepEqual(Object.keys(t).sort(), ['cartas', 'chances', 'comprar', 'descricao', 'escopo', 'garantia', 'gradiente', 'gratis', 'icone', 'id', 'nome', 'preco']);
    assert.deepEqual(Object.keys(t.chances), ['Comum', 'Relevante', 'Raro', 'Relíquia', 'Lendário', 'Mítico']);
    assert.equal(Object.values(t.chances).reduce((a, b) => a + b, 0), 100, t.id);
    assert.equal(t.cartas, 5); assert.equal(t.gratis, t.preco === 0); assert.equal(t.comprar, t.preco > 0);
  }
  assert.equal(por.diario.gratis, true); assert.equal(por.diario.comprar, false);
  assert.equal(por.boas.gratis, true); assert.equal(por.boas.comprar, false); assert.equal(por.boas.garantia, 'Raro');
  assert.equal(por.classico.preco, 150); assert.equal(por.classico.comprar, true); assert.equal(por.classico.garantia, null);
  assert.equal(por.classico.escopo, 'todas'); assert.equal(por.colecao.escopo, 'colecao'); assert.equal(por.colecao.preco, 200);
  assert.equal(por.ouro.chances.Comum, 0); assert.equal(por.ouro.garantia, 'Relíquia'); assert.equal(por.ouro.preco, 450);
  assert.deepEqual(por.classico.chances, { Comum: 44, Relevante: 26, Raro: 15, 'Relíquia': 9, 'Lendário': 5, 'Mítico': 1 });
});

test('GET /api/pacotes/tipos: tipo inativo some; sem tipos cadastrados = 503 genérico', { skip }, async () => {
  const { u } = await novoUsuario();
  await q("UPDATE pacotes_tipo SET ativo = false WHERE id = 'ouro'");
  assert.ok(!(await GET('/api/pacotes/tipos', u)).json.itens.some((t) => t.id === 'ouro'));
  await q("UPDATE pacotes_tipo SET ativo = true WHERE id = 'ouro'");

  const vazio = await bancoDeTeste({ seed: false });
  const sv = await servidor(vazio.pool, { autenticar: stub() });
  try {
    const r = await sv.get('/api/pacotes/tipos', como('sem-seed-tipos'));
    assert.equal(r.status, 503); assert.deepEqual(r.json, { erro: 'serviço indisponível, tente mais tarde' });
  } finally { await sv.fechar(); await vazio.fechar(); }
});

test('sem seed (pacote "boas" não cadastrado): salvar o gato dá 503 e NÃO completa o cadastro', { skip }, async () => {
  const vazio = await bancoDeTeste({ seed: false });
  const sv = await servidor(vazio.pool, { autenticar: stub() });
  try {
    const h = como('sem-seed-gato');
    assert.equal((await sv.get('/api/eu', h)).status === 503 || true, true); // cria o usuário (o /api/eu pode ser 503 sem patentes)
    const r = await sv.patch('/api/eu', { avatar_gato: GATO }, h);
    assert.equal(r.status, 503); assert.deepEqual(r.json, { erro: 'serviço indisponível, tente mais tarde' });
    const [u] = (await vazio.pool.query("SELECT avatar_gato, cadastro_completo_em FROM usuarios WHERE apelido = 'sem-seed-gato'")).rows;
    assert.equal(u.cadastro_completo_em, null); assert.notDeepEqual(u.avatar_gato, GATO, 'o gato também não foi gravado');
    // só apelido continua funcionando
    assert.equal((await sv.patch('/api/eu', { apelido: 'sem_seed_ok' }, h)).status, 200);
  } finally { await sv.fechar(); await vazio.fechar(); }
});

test('usuário banido não altera o perfil (403)', { skip }, async () => {
  const { u, id } = await novoUsuario();
  await q('UPDATE usuarios SET banido = true WHERE id = $1', [id]);
  assert.equal((await PATCH('/api/eu', { apelido: 'Banido' + n }, u)).status, 403);
});

// ---------- reservados e limite de troca de apelido ----------
const alteradoEm = async (id) => (await q('SELECT apelido_alterado_em FROM usuarios WHERE id = $1', [id]))[0].apelido_alterado_em;

test('apelido reservado: 422 com banco real e nada muda', { skip }, async () => {
  const { u, id } = await novoUsuario();
  for (const ruim of ['admin', 'Admin_2', 'a.d.m.i.n', 'Nao_Salvo', 'XET', 'root99', 'Moderador', 'oficial']) {
    const r = await PATCH('/api/eu', { apelido: ruim }, u);
    assert.equal(r.status, 422, ruim); assert.equal(r.json.campo, 'apelido');
  }
  assert.equal((await GET('/api/eu', u)).json.usuario.apelido, u);
  assert.equal(await alteradoEm(id), null, 'recusa não gasta a janela');
});

test('apelido: 1ª troca livre, 2ª logo em seguida = 429 {erro, tente_em_segundos} + Retry-After; nada muda', { skip }, async () => {
  const { u, id } = await novoUsuario();
  assert.equal(await alteradoEm(id), null);
  const p1 = await PATCH('/api/eu', { apelido: 'Primeira' + n }, u);
  assert.equal(p1.status, 200); assert.ok(await alteradoEm(id), 'registrou a troca');

  const nome1 = 'Primeira' + n;
  const p2 = await PATCH('/api/eu', { apelido: 'Segunda' + n }, nome1);
  assert.equal(p2.status, 429); assert.equal(p2.json.campo, 'apelido'); assert.match(p2.json.erro, /tente de novo/);
  assert.ok(Number.isInteger(p2.json.tente_em_segundos) && p2.json.tente_em_segundos > 86300 && p2.json.tente_em_segundos <= 86400, String(p2.json.tente_em_segundos));
  assert.equal(p2.headers.get('retry-after'), String(p2.json.tente_em_segundos));
  assert.equal((await GET('/api/eu', nome1)).json.usuario.apelido, nome1, 'apelido não mudou');
});

test('janela de 24 h: 23h59 ainda bloqueia (com o tempo que falta), 24h+ libera e reinicia a janela', { skip }, async () => {
  const { u, id } = await novoUsuario();
  await PATCH('/api/eu', { apelido: 'Janela' + n }, u);
  let atual = 'Janela' + n;
  await q("UPDATE usuarios SET apelido_alterado_em = now() - interval '23 hours 59 minutes' WHERE id = $1", [id]);
  const quase = await PATCH('/api/eu', { apelido: 'JanelaB' + n }, atual);
  assert.equal(quase.status, 429); assert.ok(quase.json.tente_em_segundos > 0 && quase.json.tente_em_segundos <= 61, String(quase.json.tente_em_segundos));
  await q("UPDATE usuarios SET apelido_alterado_em = now() - interval '24 hours 1 minute' WHERE id = $1", [id]);
  const ok = await PATCH('/api/eu', { apelido: 'JanelaB' + n }, atual); atual = 'JanelaB' + n;
  assert.equal(ok.status, 200); assert.equal(ok.json.usuario.apelido, atual);
  assert.equal((await PATCH('/api/eu', { apelido: 'JanelaC' + n }, atual)).status, 429, 'a janela recomeçou');
});

test('429 do apelido é tudo ou nada: o gato e o pacote de boas-vindas do mesmo PATCH também não passam', { skip }, async () => {
  const { u, id } = await novoUsuario();
  await PATCH('/api/eu', { apelido: 'Tudo' + n }, u);
  const nome = 'Tudo' + n;
  const r = await PATCH('/api/eu', { apelido: 'Nada' + n, avatar_gato: GATO }, nome);
  assert.equal(r.status, 429);
  const e = (await GET('/api/eu', nome)).json.usuario;
  assert.equal(e.cadastro_completo, false); assert.notDeepEqual(e.avatar_gato, GATO);
  assert.equal((await boasDe(id)).length, 0);
  // sem mexer no apelido o gato passa (e a janela do apelido segue fechada)
  const g = await PATCH('/api/eu', { avatar_gato: GATO }, nome);
  assert.equal(g.status, 200); assert.ok(g.json.pacote_boas_vindas);
});

test('salvar o gato e usar_foto não contam como troca; mesmo apelido não gasta a janela', { skip }, async () => {
  const { u, id } = await novoUsuario();
  await comFoto(id);
  assert.equal((await PATCH('/api/eu', { avatar_gato: GATO, usar_foto: true }, u)).status, 200);
  assert.equal(await alteradoEm(id), null, 'criação do gato não conta');
  assert.equal((await PATCH('/api/eu', { avatar_gato: GATO2 }, u)).status, 200);
  assert.equal((await PATCH('/api/eu', { apelido: u }, u)).status, 200);                        // mesmo valor: nada a fazer
  assert.equal(await alteradoEm(id), null, 'mesmo valor não conta');
  const p = await PATCH('/api/eu', { apelido: 'Livre' + n }, u);                                 // a 1ª troca de verdade ainda é livre
  assert.equal(p.status, 200); assert.ok(await alteradoEm(id));
});

test('só a caixa do apelido também conta como troca (e é limitada)', { skip }, async () => {
  const { u } = await novoUsuario();
  assert.equal((await PATCH('/api/eu', { apelido: u.toUpperCase() }, u)).status, 200);
  assert.equal((await PATCH('/api/eu', { apelido: u.toLowerCase() }, u.toUpperCase())).status, 429);
});

test('apelido ocupado (409) não gasta a janela do usuário', { skip }, async () => {
  const a = await novoUsuario(), b = await novoUsuario();
  await PATCH('/api/eu', { apelido: 'Ocupado' + n }, a.u);
  assert.equal((await PATCH('/api/eu', { apelido: 'Ocupado' + n }, b.u)).status, 409);
  assert.equal(await alteradoEm(b.id), null);
  assert.equal((await PATCH('/api/eu', { apelido: 'Livre2_' + n }, b.u)).status, 200);          // ainda tem a 1ª troca
});
