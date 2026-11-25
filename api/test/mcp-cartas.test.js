// MCP · cartas: buscar_cartas e editar_carta (nome, raridade, meme, imagem por URL/base64, remover imagem). Banco real descartável
// (pulado sem TEST_DB_NAME); S3 e downloader falsos. O log grava o dono da chave e via mcp.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { bancoDeTeste, semBanco } from './helpers.js';
import { buscar_cartas, fazerEditarCarta } from '../mcp/cartas.js';
import { ErroArgumento } from '../mcp/ferramentas.js';

const skip = semBanco();
let db, DONO;
const q = async (sql, v = []) => (await db.pool.query(sql, v)).rows;
const PNG = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#336699' } }).png().toBuffer();
const ehWebp = (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
const s3Falso = ({ falhaPut = false } = {}) => { const puts = [], removes = []; return { puts, removes,
  async put(chave, buf, tipo) { if (falhaPut) throw new Error('s3 put 500'); puts.push({ chave, buf, tipo }); },
  async remove(chave) { removes.push(chave); } }; };
const ctx = () => ({ pool: db.pool, mcp: { chave_id: 9, usuario_id: DONO, apelido: 'dono', escopos: ['ler', 'escrever'] } });
const rejeita = (p, re) => assert.rejects(p, (e) => e instanceof ErroArgumento && re.test(e.message));

before(async () => { if (skip) return; db = await bancoDeTeste({ seed: true }); DONO = Number((await q("INSERT INTO usuarios (apelido) VALUES ('dono') RETURNING id"))[0].id); });
after(async () => { if (skip) return; await db.fechar(); });

test('buscar_cartas: por nome, por coleção, sem imagem, limite e total; validações', { skip }, async () => {
  const r = await buscar_cartas(db.pool, { busca: 'msn', colecao_id: 'plataformas' });
  assert.ok(r.itens.length >= 1); const msn = r.itens.find((x) => x.id === 'plataformas-2');
  assert.deepEqual([msn.colecao_id, msn.numero, msn.nome, msn.raridade, msn.imagem], ['plataformas', 3, 'MSN', 'Lendário', null]);
  assert.equal(msn.colecao_nome, 'Plataformas Raiz');
  const todas = await buscar_cartas(db.pool, { colecao_id: 'plataformas', limite: 3 });
  assert.equal(todas.itens.length, 3); assert.ok(todas.total > 3); assert.deepEqual(todas.itens.map((x) => x.numero), [1, 2, 3]);
  await q("UPDATE cartas SET imagem = 'midias/carta-aabbccddeeff.webp' WHERE id = 'plataformas-2'");
  const sem = await buscar_cartas(db.pool, { colecao_id: 'plataformas', sem_imagem: true, limite: 50 });
  assert.ok(!sem.itens.some((x) => x.id === 'plataformas-2'));
  assert.equal((await buscar_cartas(db.pool, { busca: '100%_%' })).total, 0, 'curingas escapados');
  await rejeita(buscar_cartas(db.pool, { limite: 99 }), /limite/);
  await rejeita(buscar_cartas(db.pool, { busca: 'x'.repeat(61) }), /busca/);
  await rejeita(buscar_cartas(db.pool, { colecao_id: 'A B' }), /colecao_id/);
  await rejeita(buscar_cartas(db.pool, { qualquer: 1 }), /desconhecido|não aceito|campo/i);
  await q("UPDATE cartas SET imagem = NULL WHERE id = 'plataformas-2'");
});

test('editar_carta com imagem_url: otimiza para WebP 800 px, grava no S3, atualiza a carta e loga com via mcp', { skip }, async () => {
  const f = s3Falso(); const editar = fazerEditarCarta({ s3: f, baixar: async (u) => { assert.equal(u, 'https://exemplo.com/msn.png'); return PNG; } });
  const r = await editar(db.pool, { id: 'plataformas-2', imagem_url: 'https://exemplo.com/msn.png' }, ctx());
  assert.equal(r.ok, true); assert.match(r.carta.imagem, /^midias\/carta-[0-9a-f]{12}\.webp$/);
  assert.equal(r.imagem.url_publica, '/' + r.carta.imagem); assert.deepEqual([r.imagem.largura, r.imagem.altura], [800, 600]);
  assert.equal(f.puts.length, 1); assert.equal(f.puts[0].chave, r.carta.imagem); assert.equal(f.puts[0].tipo, 'image/webp'); assert.ok(ehWebp(f.puts[0].buf));
  assert.equal((await q("SELECT imagem FROM cartas WHERE id = 'plataformas-2'"))[0].imagem, r.carta.imagem);
  const [l] = await q("SELECT usuario_id, detalhe FROM log_auditoria WHERE acao = 'carta.editar' AND alvo = 'cartas:plataformas-2' ORDER BY id DESC LIMIT 1");
  assert.equal(Number(l.usuario_id), DONO); assert.equal(l.detalhe.origem, 'url'); assert.ok(l.detalhe.campos.imagem); assert.equal(l.detalhe.bytes_original, PNG.length);
  const [api] = await q("SELECT 1 FROM log_auditoria WHERE acao = 'carta.editar' AND detalhe::text LIKE '%mcp%' LIMIT 1");
  assert.ok(api, 'log marca a origem mcp');
});

test('editar_carta: trocar a imagem apaga a antiga do S3 (se ninguém mais usa); outras edições juntas; remover_imagem', { skip }, async () => {
  const antiga = (await q("SELECT imagem FROM cartas WHERE id = 'plataformas-2'"))[0].imagem;
  const f = s3Falso(); const editar = fazerEditarCarta({ s3: f, baixar: async () => PNG });
  const r = await editar(db.pool, { id: 'plataformas-2', imagem_base64: PNG.toString('base64'), nome: 'MSN Messenger', raridade: 'Mítico', emoji: '💬' }, ctx());
  assert.equal(r.carta.nome, 'MSN Messenger'); assert.equal(r.carta.raridade, 'Mítico'); assert.notEqual(r.carta.imagem, antiga);
  assert.deepEqual(f.removes, [antiga], 'imagem antiga apagada do S3');
  const outra = fazerEditarCarta({ s3: s3Falso() }); // remover: sem S3 necessário para o banco, mas apaga o arquivo
  const f2 = s3Falso(); const rem = await fazerEditarCarta({ s3: f2 })(db.pool, { id: 'plataformas-2', remover_imagem: true }, ctx());
  assert.equal(rem.carta.imagem, null); assert.deepEqual(f2.removes, [r.carta.imagem]);
  assert.equal((await q("SELECT imagem FROM cartas WHERE id = 'plataformas-2'"))[0].imagem, null);
  void outra;
});

test('editar_carta: imagem em uso por outra carta não é apagada do S3', { skip }, async () => {
  const f = s3Falso(); const editar = fazerEditarCarta({ s3: f });
  await q("UPDATE cartas SET imagem = 'midias/carta-111111111111.webp' WHERE id IN ('plataformas-2', 'plataformas-3')");
  await editar(db.pool, { id: 'plataformas-2', remover_imagem: true }, ctx());
  assert.deepEqual(f.removes, [], 'plataformas-3 ainda usa o arquivo');
  await q("UPDATE cartas SET imagem = NULL WHERE id = 'plataformas-3'");
});

test('editar_carta: meme ligado, validações, S3 fora do ar não altera nada e sem armazenamento configurado avisa', { skip }, async () => {
  const f = s3Falso(); const editar = fazerEditarCarta({ s3: f, baixar: async () => PNG });
  const meme = (await q('SELECT id FROM memes ORDER BY id LIMIT 1'))[0].id;
  assert.equal((await editar(db.pool, { id: 'plataformas-4', meme_id: meme }, ctx())).carta.meme_id, meme);
  assert.equal((await editar(db.pool, { id: 'plataformas-4', meme_id: '' }, ctx())).carta.meme_id, null, 'vazio desliga');
  await rejeita(editar(db.pool, { id: 'plataformas-4', meme_id: 'nao-existe-esse' }, ctx()), /meme_id/);
  await rejeita(editar(db.pool, { id: 'plataformas-999' }, ctx()), /nada para alterar/);
  await rejeita(editar(db.pool, { id: 'plataformas-999', nome: 'x' }, ctx()), /não encontrada/);
  await rejeita(editar(db.pool, { id: 'Plata Formas', nome: 'x' }, ctx()), /"id"/);
  await rejeita(editar(db.pool, { id: 'plataformas-4', raridade: 'Épico' }, ctx()), /raridade/);
  await rejeita(editar(db.pool, { id: 'plataformas-4', nome: '' }, ctx()), /nome/);
  await rejeita(editar(db.pool, { id: 'plataformas-4', imagem_url: 'https://x.com/a.png', imagem_base64: 'AAAA' }, ctx()), /só um/);
  await rejeita(editar(db.pool, { id: 'plataformas-4', imagem_url: 'https://x.com/a.png', remover_imagem: true }, ctx()), /só um/);
  await rejeita(editar(db.pool, { id: 'plataformas-4', imagem: 'midias/x.webp' }, ctx()), /imagem|desconhecido|campo/i);
  await rejeita(editar(db.pool, { id: 'plataformas-4', imagem_base64: '%%%' }, ctx()), /base64/);
  await rejeita(editar(db.pool, { id: 'plataformas-4', imagem_base64: Buffer.from('<html>nao sou imagem, sou texto longo o bastante</html>').toString('base64') }, ctx()), /imagem/i);
  const antes = (await q("SELECT nome, imagem FROM cartas WHERE id = 'plataformas-4'"))[0];
  await rejeita(fazerEditarCarta({ s3: s3Falso({ falhaPut: true }), baixar: async () => PNG })(db.pool, { id: 'plataformas-4', nome: 'Mudou?', imagem_url: 'https://x.com/a.png' }, ctx()), /armazenamento/);
  assert.deepEqual((await q("SELECT nome, imagem FROM cartas WHERE id = 'plataformas-4'"))[0], antes, 'falha no S3 não altera a carta');
  const salvo = { ...process.env }; for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_ACCESS_KEY_FILE', 'S3_SECRET_KEY_FILE']) delete process.env[k];
  try { await rejeita(fazerEditarCarta({ baixar: async () => PNG })(db.pool, { id: 'plataformas-4', imagem_url: 'https://x.com/a.png' }, ctx()), /não está configurado/); } finally { Object.assign(process.env, salvo); }
  const dl = fazerEditarCarta({ s3: s3Falso(), baixar: async () => { throw new Error('endereço não permitido'); } });
  await rejeita(dl(db.pool, { id: 'plataformas-4', imagem_url: 'http://10.0.0.1/a.png' }, ctx()), /não permitido/);
});
