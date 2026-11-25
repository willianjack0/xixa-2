// Economia no servidor contra Postgres descartável (pulado sem TEST_DB_NAME): razão, transação atômica,
// concorrência, sorteio gravado e regras vindas de tabela. Login = auth-stub (X-Test-User).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { criarRng, sortearPacote } from '../economia/sorteio.js';
import { visita } from '../economia/servico.js';

const skip = semBanco();
let db, s;
const como = (apelido) => ({ headers: { 'X-Test-User': apelido } });
const GATO_OK = { fur: 1, pat: 0, eye: 2, acc: 3, clo: 0, bg: 4 };
/** fim do cadastro: salvar o gato pela 1ª vez entrega o pacote de boas-vindas (a visita não dá mais) */
const cadastrar = (u) => s.patch('/api/eu', { avatar_gato: GATO_OK }, como(u));
const GET = (c, u) => s.get(c, como(u));
const POST = (c, corpo, u) => s.post(c, corpo, como(u));

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, { autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' }) });
});
after(async () => { if (skip) return; await s.fechar(); await db.fechar(); });

// ---- apoio ----
const q = async (sql, v) => (await db.pool.query(sql, v)).rows;
const uid = async (u) => Number((await GET('/api/carteira', u)).json.usuario.id);
/** o razão e o cache do usuário precisam bater sempre */
async function conferirRazao(apelido) {
  const [r] = await q(
    `SELECT u.xp::int AS xp, u.moedas::int AS moedas,
            COALESCE((SELECT sum(valor) FROM eventos_xp WHERE usuario_id = u.id),0)::int AS xp_razao,
            COALESCE((SELECT sum(valor) FROM movimentos_moeda WHERE usuario_id = u.id),0)::int AS moedas_razao
       FROM usuarios u WHERE lower(u.apelido) = lower($1)`, [apelido]);
  assert.equal(r.xp, r.xp_razao, `${apelido}: xp cache x razão`);
  assert.equal(r.moedas, r.moedas_razao, `${apelido}: moedas cache x razão`);
  assert.ok(r.moedas >= 0);
  return r;
}
/** crédito de teste feito do jeito certo: linha no razão + cache */
async function creditar(apelido, moedas) {
  const id = await uid(apelido);
  await q('INSERT INTO movimentos_moeda (usuario_id, valor, motivo, ref) VALUES ($1,$2,$3,$4)', [id, moedas, 'teste_credito', 'x']);
  await q('UPDATE usuarios SET moedas = moedas + $2 WHERE id = $1', [id, moedas]);
}

test('sem login: 401; header inválido: 401; ranking é público', { skip }, async () => {
  assert.equal((await s.get('/api/carteira')).status, 401);
  assert.equal((await GET('/api/carteira', 'a')).status, 401); // apelido curto demais
  assert.equal((await s.post('/api/pacotes/abrir', {})).status, 401);
  assert.equal((await s.get('/api/ranking')).status, 200);
});

test('visita: XP e pacote diário (sem boas-vindas); idempotente no mesmo dia', { skip }, async () => {
  const v1 = await POST('/api/visita', {}, 'visitante');
  assert.equal(v1.status, 200);
  assert.equal(v1.json.primeira_visita_do_dia, true); assert.equal(v1.json.xp_ganho, 10);
  assert.deepEqual(v1.json.pacotes_ganhos, ['diario']);
  const v2 = await POST('/api/visita', {}, 'visitante');
  assert.equal(v2.json.primeira_visita_do_dia, false); assert.equal(v2.json.xp_ganho, 0); assert.deepEqual(v2.json.pacotes_ganhos, []);
  const c = (await GET('/api/carteira', 'visitante')).json;
  assert.equal(c.xp, 10); assert.equal(c.moedas, 0); assert.equal(c.patente.id, 'discado');
  assert.deepEqual(c.pacotes.map((p) => [p.tipo, p.quantidade]), [['diario', 1]]);
  await conferirRazao('visitante');
});

test('visita: pacote diário acumula até 7 e o dia segue o fuso de São Paulo', { skip }, async () => {
  await GET('/api/carteira', 'acumulador');
  const id = await uid('acumulador');
  for (let d = 1; d <= 10; d++) await visita(db.pool, { id }, { agora: new Date(`2026-03-${String(d).padStart(2, '0')}T15:00:00Z`) });
  const [{ n }] = await q("SELECT count(*)::int AS n FROM pacotes_estoque WHERE usuario_id = $1 AND tipo = 'diario'", [id]);
  assert.equal(n, 7);
  // 02:00Z de 02/03 ainda é 01/03 em São Paulo (UTC-3): mesmo dia da visita já registrada
  const r = await visita(db.pool, { id }, { agora: new Date('2026-03-02T02:00:00Z') });
  assert.equal(r.dia, '2026-03-01'); assert.equal(r.primeira_visita_do_dia, false);
  const [{ x }] = await q("SELECT count(*)::int AS x FROM eventos_xp WHERE usuario_id = $1 AND motivo = 'visita_diaria'", [id]);
  assert.equal(x, 10);
  await conferirRazao('acumulador');
});

test('comprar: valida, cobra pelo razão e guarda no estoque', { skip }, async () => {
  const u = 'comprador';
  assert.equal((await POST('/api/pacotes/comprar', { tipo: 'classico' }, u)).status, 402); // sem moedas
  await creditar(u, 500);
  assert.equal((await POST('/api/pacotes/comprar', { tipo: 'nao-existe' }, u)).status, 404);
  assert.equal((await POST('/api/pacotes/comprar', { tipo: 'diario' }, u)).status, 400);   // grátis não se compra
  assert.equal((await POST('/api/pacotes/comprar', { tipo: 'colecao' }, u)).status, 400);  // falta colecao_id
  assert.equal((await POST('/api/pacotes/comprar', { tipo: 'colecao', colecao_id: 'xx' }, u)).status, 400);
  const ok = await POST('/api/pacotes/comprar', { tipo: 'classico' }, u);
  assert.equal(ok.status, 201); assert.equal(ok.json.preco, 150); assert.equal(ok.json.carteira.moedas, 350);
  const col = await POST('/api/pacotes/comprar', { tipo: 'colecao', colecao_id: 'orkut' }, u);
  assert.equal(col.status, 201); assert.equal(col.json.carteira.moedas, 150);
  const mov = await q("SELECT valor, motivo, ref FROM movimentos_moeda WHERE usuario_id = $1 AND motivo = 'pacote_comprado' ORDER BY id", [await uid(u)]);
  assert.deepEqual(mov.map((m) => [m.valor, m.ref]), [[-150, 'classico'], [-200, 'colecao']]);
  await conferirRazao(u);
});

test('abrir: sorteio gravado e reproduzível, cartas + XP no razão, repetidas contadas', { skip }, async () => {
  const u = 'abridor';
  await POST('/api/visita', {}, u); await cadastrar(u);
  const r = await POST('/api/pacotes/abrir', { tipo: 'boas' }, u);
  assert.equal(r.status, 200);
  assert.equal(r.json.cartas.length, 5);
  assert.ok(r.json.cartas.some((c) => ['Raro', 'Relíquia', 'Lendário', 'Mítico'].includes(c.raridade)), 'boas-vindas garante Raro+');

  // pacotes_abertos guarda a semente; recalculando com as mesmas entradas dá as mesmas cartas
  const [ab] = await q('SELECT * FROM pacotes_abertos WHERE id = $1', [r.json.pacote_id]);
  assert.deepEqual(ab.cartas, r.json.cartas.map((c) => c.id));
  const todas = await q('SELECT c.id, c.raridade FROM cartas c JOIN colecoes k ON k.id = c.colecao_id ORDER BY k.ordem, c.numero');
  const [pk] = await q("SELECT chances, garantia, cartas FROM pacotes_tipo WHERE id = 'boas'");
  const refeito = sortearPacote({ cartas: todas, chances: pk.chances, garantia: pk.garantia, quantidade: pk.cartas, rng: criarRng(ab.semente) });
  assert.deepEqual(refeito.map((c) => c.id), ab.cartas);

  // inventário e XP
  const inv = await q('SELECT carta_id, quantidade FROM inventario_cartas WHERE usuario_id = $1', [await uid(u)]);
  assert.equal(inv.reduce((n, i) => n + i.quantidade, 0), 5);
  const regras = (await q("SELECT valor FROM regras_economia WHERE chave = 'xp_ganho'"))[0].valor;
  const novasXp = r.json.cartas.filter((c) => c.nova).reduce((s2, c) => s2 + regras.carta_nova[c.raridade], 0);
  assert.equal(r.json.xp_ganho, regras.pacote + novasXp);
  assert.equal(r.json.carteira.xp, 10 + r.json.xp_ganho); // 10 da visita
  assert.equal(r.json.novas, new Set(r.json.cartas.map((c) => c.id)).size);

  // o mesmo pacote não abre duas vezes; estoque vazio = 404
  assert.equal((await POST('/api/pacotes/abrir', { tipo: 'boas' }, u)).status, 404);
  const est = await q("SELECT usado_em, aberto_id FROM pacotes_estoque WHERE usuario_id = $1 AND tipo = 'boas'", [await uid(u)]);
  assert.ok(est[0].usado_em && Number(est[0].aberto_id) === r.json.pacote_id);
  assert.equal((await POST('/api/pacotes/abrir', {}, u)).status, 400);
  assert.equal((await POST('/api/pacotes/abrir', { estoque_id: 999999 }, u)).status, 404);
  await conferirRazao(u);
});

test('abrir: pacote de outro usuário não abre', { skip }, async () => {
  await POST('/api/visita', {}, 'dono-do-pacote');
  const { json } = await GET('/api/carteira', 'dono-do-pacote');
  assert.ok(json.pacotes.length);
  const [e] = await q("SELECT id FROM pacotes_estoque WHERE usuario_id = $1 AND tipo = 'diario'", [await uid('dono-do-pacote')]);
  assert.equal((await POST('/api/pacotes/abrir', { estoque_id: Number(e.id) }, 'ladrao-de-pacote')).status, 404);
});

test('concorrência: 6 compras com saldo para 1 = exatamente 1 sucesso, saldo nunca negativo', { skip }, async () => {
  const u = 'concorrente';
  await GET('/api/carteira', u);
  await creditar(u, 150);
  const rs = await Promise.all(Array.from({ length: 6 }, () => POST('/api/pacotes/comprar', { tipo: 'classico' }, u)));
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 402, 402, 402, 402, 402]);
  const razao = await conferirRazao(u);
  assert.equal(razao.moedas, 0);
});

test('concorrência: o mesmo pacote aberto 5 vezes ao mesmo tempo abre uma só', { skip }, async () => {
  const u = 'corrida';
  await POST('/api/visita', {}, u); await cadastrar(u);
  const [e] = await q("SELECT id FROM pacotes_estoque WHERE usuario_id = $1 AND tipo = 'boas'", [await uid(u)]);
  const rs = await Promise.all(Array.from({ length: 5 }, () => POST('/api/pacotes/abrir', { estoque_id: Number(e.id) }, u)));
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 404, 404, 404, 404]);
  const [{ n }] = await q('SELECT count(*)::int AS n FROM pacotes_abertos WHERE usuario_id = $1', [await uid(u)]);
  assert.equal(n, 1);
  const inv = await q('SELECT COALESCE(sum(quantidade),0)::int AS t FROM inventario_cartas WHERE usuario_id = $1', [await uid(u)]);
  assert.equal(inv[0].t, 5);
  await conferirRazao(u);
});

test('atomicidade: falha no meio da abertura desfaz TUDO (estoque, sorteio, cartas, razão, cache)', { skip }, async () => {
  const u = 'atomico';
  await POST('/api/visita', {}, u); await cadastrar(u);
  const id = await uid(u);
  const antes = await conferirRazao(u);
  // sabotagem: o XP de carta nova explode, depois do pacote e das cartas já terem sido gravados na transação
  await q(`CREATE FUNCTION falha_carta_nova() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
             IF NEW.motivo = 'carta_nova' THEN RAISE EXCEPTION 'sabotagem de teste'; END IF; RETURN NEW; END $$`);
  await q('CREATE TRIGGER sabotagem BEFORE INSERT ON eventos_xp FOR EACH ROW EXECUTE FUNCTION falha_carta_nova()');
  const r = await POST('/api/pacotes/abrir', { tipo: 'boas' }, u);
  assert.equal(r.status, 500);
  await q('DROP TRIGGER sabotagem ON eventos_xp');

  assert.equal((await q('SELECT count(*)::int AS n FROM pacotes_abertos WHERE usuario_id = $1', [id]))[0].n, 0);
  assert.equal((await q('SELECT count(*)::int AS n FROM inventario_cartas WHERE usuario_id = $1', [id]))[0].n, 0);
  assert.equal((await q("SELECT count(*)::int AS n FROM pacotes_estoque WHERE usuario_id = $1 AND tipo = 'boas' AND usado_em IS NULL", [id]))[0].n, 1);
  const depois = await conferirRazao(u);
  assert.deepEqual(depois, antes); // nenhum XP/moeda do pacote ficou no razão nem no cache

  // sem a sabotagem o mesmo pacote abre normalmente
  assert.equal((await POST('/api/pacotes/abrir', { tipo: 'boas' }, u)).status, 200);
  await conferirRazao(u);
});

test('coleção completa: +moedas e +XP uma única vez', { skip }, async () => {
  const u = 'colecionador';
  await q("INSERT INTO colecoes (id, nome, ordem) VALUES ('mini', 'Mini', 99)");
  await q("INSERT INTO cartas (id, colecao_id, numero, nome, raridade) VALUES ('mini-0', 'mini', 1, 'Única', 'Comum')");
  await GET('/api/carteira', u);
  await creditar(u, 400);
  const regras = Object.fromEntries((await q('SELECT chave, valor FROM regras_economia')).map((x) => [x.chave, x.valor]));
  const c1 = await POST('/api/pacotes/comprar', { tipo: 'colecao', colecao_id: 'mini' }, u);
  const c2 = await POST('/api/pacotes/comprar', { tipo: 'colecao', colecao_id: 'mini' }, u);
  assert.equal(c1.status, 201); assert.equal(c2.status, 201);

  const a1 = await POST('/api/pacotes/abrir', { estoque_id: c1.json.estoque_id }, u);
  assert.equal(a1.status, 200);
  assert.ok(a1.json.cartas.every((c) => c.id === 'mini-0'));
  assert.deepEqual(a1.json.colecoes_completas, ['mini']);
  assert.equal(a1.json.moedas_ganhas, regras.recompensa_moedas.colecao_completa);
  assert.equal(a1.json.xp_ganho, regras.xp_ganho.pacote + regras.xp_ganho.carta_nova.Comum + regras.xp_ganho.colecao_completa);
  assert.equal(a1.json.novas, 1); // 4 repetidas dentro do mesmo pacote

  const a2 = await POST('/api/pacotes/abrir', { estoque_id: c2.json.estoque_id }, u);
  assert.deepEqual(a2.json.colecoes_completas, []);
  assert.equal(a2.json.moedas_ganhas, 0);
  assert.equal(a2.json.xp_ganho, regras.xp_ganho.pacote); // nem carta nova, nem bônus de novo
  await conferirRazao(u);
});

test('reciclar: repetidas viram moeda pelo valor da tabela de regras; fica 1 de cada', { skip }, async () => {
  const u = 'reciclador';
  const id = await uid(u);
  const [c1, c2] = await q("SELECT id, raridade FROM cartas WHERE raridade IN ('Comum','Raro') ORDER BY raridade, id LIMIT 2");
  await q('INSERT INTO inventario_cartas (usuario_id, carta_id, quantidade) VALUES ($1,$2,4),($1,$3,2)', [id, c1.id, c2.id]);
  const valor = (await q("SELECT valor FROM regras_economia WHERE chave = 'valor_repetida'"))[0].valor;
  assert.equal((await POST('/api/album/reciclar', {}, u)).status, 400);
  assert.equal((await POST('/api/album/reciclar', { carta_id: 'nao-tem' }, u)).status, 409);

  const um = await POST('/api/album/reciclar', { carta_id: c1.id }, u);
  assert.equal(um.status, 200); assert.equal(um.json.convertidas, 3); assert.equal(um.json.moedas_ganhas, 3 * valor[c1.raridade]);
  assert.equal((await q('SELECT quantidade FROM inventario_cartas WHERE usuario_id = $1 AND carta_id = $2', [id, c1.id]))[0].quantidade, 1);
  assert.equal((await POST('/api/album/reciclar', { carta_id: c1.id }, u)).status, 409); // nada mais a converter

  // o valor vem da tabela: dobrando a regra, dobra o pagamento
  await q(`UPDATE regras_economia SET valor = (SELECT jsonb_object_agg(k, (v::int * 2)) FROM jsonb_each_text(valor) AS t(k, v)) WHERE chave = 'valor_repetida'`);
  const todas = await POST('/api/album/reciclar', { todas: true }, u);
  assert.equal(todas.json.moedas_ganhas, 1 * valor[c2.raridade] * 2);
  const mov = await q("SELECT motivo FROM movimentos_moeda WHERE usuario_id = $1 AND motivo = 'carta_reciclada'", [id]);
  assert.equal(mov.length, 2);
  await q(`UPDATE regras_economia SET valor = (SELECT jsonb_object_agg(k, (v::int / 2)) FROM jsonb_each_text(valor) AS t(k, v)) WHERE chave = 'valor_repetida'`);
  await conferirRazao(u);
});

test('GET /api/album e /api/carteira: formato', { skip }, async () => {
  const u = 'albumista';
  await POST('/api/visita', {}, u); await cadastrar(u);
  await POST('/api/pacotes/abrir', { tipo: 'boas' }, u);
  const a = (await GET('/api/album', u)).json;
  assert.ok(a.colecoes.length >= 8);
  assert.equal(a.total, a.colecoes.reduce((n, k) => n + k.total, 0));
  assert.ok(a.tenho >= 1 && a.tenho <= 5);
  const k = a.colecoes[0];
  assert.ok(k.id && k.nome && Array.isArray(k.cartas) && k.cartas[0].numero === 1 && 'quantidade' in k.cartas[0]);
  const c = (await GET('/api/carteira', u)).json;
  assert.equal(c.cartas.quantidade_total, 5); assert.equal(c.cartas.distintas, a.tenho);
  assert.equal(c.cartas.total_no_album, a.total); assert.ok(c.proxima_patente.faltam > 0);
});

test('ranking: xp pelo razão e cartas pelo inventário; métrica inválida = 400', { skip }, async () => {
  const xp = (await s.get('/api/ranking?metrica=xp')).json;
  assert.equal(xp.metrica, 'xp'); assert.ok(xp.itens.length >= 3);
  const valores = xp.itens.map((i) => i.valor); assert.deepEqual(valores, [...valores].sort((a, b) => b - a));
  assert.deepEqual(xp.itens.map((i) => i.posicao), xp.itens.map((_, i) => i + 1));
  assert.ok(xp.itens[0].patente);
  const topo = xp.itens[0];
  const meu = (await q('SELECT COALESCE(sum(e.valor),0)::int AS t FROM eventos_xp e JOIN usuarios u ON u.id = e.usuario_id WHERE u.apelido = $1', [topo.apelido]))[0].t;
  assert.equal(topo.valor, meu);
  const cartas = (await s.get('/api/ranking?metrica=cartas&limite=3')).json;
  assert.ok(cartas.itens.length > 0 && cartas.itens.length <= 3);
  assert.equal((await s.get('/api/ranking?metrica=envios')).status, 400);
});

test('ranking ignora banidos; usuário banido não opera (403)', { skip }, async () => {
  await POST('/api/visita', {}, 'banido-1');
  await q("UPDATE usuarios SET banido = true WHERE apelido = 'banido-1'");
  assert.equal((await GET('/api/carteira', 'banido-1')).status, 403);
  const r = (await s.get('/api/ranking?metrica=xp&limite=100')).json;
  assert.ok(!r.itens.some((i) => i.apelido === 'banido-1'));
});

test('sem seed: abrir pacote responde 503 claro e não grava nada', { skip }, async () => {
  const vazio = await bancoDeTeste({ seed: false }); // migrações, mas sem acervo
  const sv = await servidor(vazio.pool, { autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' }) });
  try {
    const h = como('sem-seed');
    assert.equal((await sv.post('/api/visita', {}, h)).status, 200);                  // visita funciona; sem pacotes cadastrados
    assert.equal((await sv.post('/api/pacotes/abrir', { tipo: 'boas' }, h)).status, 404);
    // pacote cadastrado e no estoque, mas sem nenhuma carta no acervo
    await vazio.pool.query("INSERT INTO pacotes_tipo (id, nome, chances) VALUES ('boas', 'Boas', '{\"Comum\":1}')");
    await vazio.pool.query("INSERT INTO pacotes_estoque (usuario_id, tipo, origem) SELECT id, 'boas', 'boas' FROM usuarios");
    const r = await sv.post('/api/pacotes/abrir', { tipo: 'boas' }, h);
    assert.equal(r.status, 503); assert.equal(r.json.erro, 'serviço indisponível, tente mais tarde');
    assert.ok(!/seed|acervo|regras|tabela/i.test(JSON.stringify(r.json)), 'detalhe interno vazou para o cliente');
    assert.equal((await vazio.pool.query('SELECT count(*)::int AS n FROM pacotes_abertos')).rows[0].n, 0);
    assert.equal((await vazio.pool.query('SELECT count(*)::int AS n FROM pacotes_estoque WHERE usado_em IS NULL')).rows[0].n, 1);
    // regras apagadas: também 503, não 500
    await vazio.pool.query('DELETE FROM regras_economia');
    const c = await sv.get('/api/carteira', h);
    assert.equal(c.status, 503); assert.equal(c.json.erro, 'serviço indisponível, tente mais tarde');
  } finally { await sv.fechar(); await vazio.fechar(); }
});

test('todo saldo e XP do banco batem com o razão (varredura geral)', { skip }, async () => {
  const ruins = await q(
    `SELECT u.apelido FROM usuarios u
      WHERE u.xp <> COALESCE((SELECT sum(valor) FROM eventos_xp WHERE usuario_id = u.id),0)
         OR u.moedas <> COALESCE((SELECT sum(valor) FROM movimentos_moeda WHERE usuario_id = u.id),0)`);
  assert.deepEqual(ruins, []);
});
