// Painel: upload de imagem (otimizada e enviada ao S3), carta com imagem e meme, e a regra "vídeo só por link externo".
// Banco real descartável (pulado sem TEST_DB_NAME). O S3 é um servidor HTTP falso que confere o PUT assinado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import sharp from 'sharp';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';

const skip = semBanco();
let db, s, falso;
const recebidos = [];
const q = async (sql, v = []) => (await db.pool.query(sql, v)).rows;
const T = { Authorization: 'Bearer segredo' };
const como = (u) => ({ headers: { 'X-Test-User': u } });

before(async () => {
  if (skip) return;
  falso = http.createServer((req, res) => {
    const partes = []; req.on('data', (c) => partes.push(c));
    req.on('end', () => { recebidos.push({ metodo: req.method, url: req.url, headers: req.headers, corpo: Buffer.concat(partes) }); res.writeHead(globalThis.__s3status || 200); res.end(); });
  });
  await new Promise((ok) => falso.listen(0, '127.0.0.1', ok));
  Object.assign(process.env, { S3_ENDPOINT: `http://127.0.0.1:${falso.address().port}`, S3_BUCKET: 'naosalvo', S3_REGION: 'eu-south', S3_ACCESS_KEY: 'ACESSOTESTE', S3_SECRET_KEY: 'SEGREDOTESTE' });
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, { autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' }), adminToken: 'segredo', auth: { origemSite: 'https://naosalvo.teste' } });
});
after(async () => {
  if (skip) return;
  for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) delete process.env[k];
  await s.fechar(); await db.fechar(); await new Promise((ok) => { falso.closeAllConnections?.(); falso.close(ok); });
});

const upload = (corpo, { tipo = 'image/png', perfil = 'meme', headers = T } = {}) =>
  fetch(`${s.base}/api/admin/uploads/imagem?perfil=${perfil}`, { method: 'POST', headers: { ...headers, 'Content-Type': tipo }, body: corpo });
const jpeg = (w, h) => sharp({ create: { width: w, height: h, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 50 } } }).jpeg({ quality: 92 }).toBuffer();

test('upload: sem login 401, usuário comum 401, perfil inválido 400, tipo que não é imagem 415 (inclui vídeo), vazio 400', { skip }, async () => {
  const img = await jpeg(200, 100);
  assert.equal((await upload(img, { headers: {} })).status, 401);
  await s.get('/api/eu', como('comum'));
  assert.equal((await upload(img, { headers: como('comum').headers })).status, 401);
  assert.equal((await upload(img, { perfil: 'poster' })).status, 400);
  for (const tipo of ['video/mp4', 'video/webm', 'text/html', 'image/gif', 'image/svg+xml', 'application/octet-stream']) {
    const r = await upload(Buffer.from('xxxx'), { tipo }); assert.equal(r.status, 415, tipo);
    assert.match((await r.json()).erro, /imagem jpeg, png ou webp/);
  }
  assert.equal((await upload(Buffer.alloc(0))).status, 400);
  assert.equal(recebidos.length, 0, 'nada foi para o S3');
});

test('upload de meme: otimiza para WebP até 1600 px, grava no S3 com PUT assinado e devolve o caminho; log com o admin', { skip }, async () => {
  await s.get('/api/eu', como('admU')); await q("UPDATE usuarios SET papel = 'admin' WHERE lower(apelido) = 'admu'");
  const original = await jpeg(3000, 2000);
  const r = await upload(original, { tipo: 'image/jpeg', headers: como('admU').headers });
  assert.equal(r.status, 201); const j = await r.json();
  assert.match(j.caminho, /^midias\/meme-[0-9a-f]{12}\.webp$/); assert.equal(j.url_publica, '/' + j.caminho);
  assert.deepEqual([j.largura, j.altura], [1600, 1067]); assert.equal(j.bytes_original, original.length); assert.ok(j.bytes < j.bytes_original);
  const p = recebidos.at(-1);
  assert.equal(p.metodo, 'PUT'); assert.equal(p.url, '/naosalvo/' + j.caminho); assert.equal(p.headers['content-type'], 'image/webp');
  assert.equal(p.corpo.subarray(8, 12).toString('latin1'), 'WEBP'); assert.equal(p.corpo.length, j.bytes);
  assert.match(p.headers.authorization, /^AWS4-HMAC-SHA256 Credential=ACESSOTESTE\/\d{8}\/eu-south\/s3\/aws4_request, .*Signature=[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(p.headers).includes('SEGREDOTESTE'));
  const [l] = await q("SELECT usuario_id, alvo, detalhe FROM log_auditoria WHERE acao = 'midia.upload' ORDER BY id DESC LIMIT 1");
  assert.equal(l.alvo, j.caminho); assert.equal(l.detalhe.via, 'sessao'); assert.equal(l.detalhe.perfil, 'meme'); assert.ok(l.usuario_id);
});

test('upload de carta: limite de 800 px; token de emergência também pode; PNG com transparência vira WebP', { skip }, async () => {
  const png = await sharp({ create: { width: 1000, height: 1500, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 0.5 } } }).png().toBuffer();
  const r = await upload(png, { perfil: 'carta' }); assert.equal(r.status, 201);
  const j = await r.json(); assert.match(j.caminho, /^midias\/carta-[0-9a-f]{12}\.webp$/); assert.deepEqual([j.largura, j.altura], [533, 800]);
  assert.equal((await sharp(recebidos.at(-1).corpo).metadata()).hasAlpha, true);
});

test('upload: arquivo corrompido, animado e fingindo ser imagem 422; Content-Length acima de 10 MB 413; S3 fora do ar 502; S3 não configurado 503', { skip }, async () => {
  const antes = recebidos.length;
  const png = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#fff' } }).png().toBuffer();
  const corrompida = Buffer.concat([png.subarray(0, 60), Buffer.alloc(80, 7)]);
  assert.equal((await upload(corrompida)).status, 422);
  const q1 = (c) => sharp({ create: { width: 32, height: 32, channels: 3, background: c } }).png().toBuffer();
  const animada = await sharp([await q1('#f00'), await q1('#00f')], { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  const ra = await upload(animada, { tipo: 'image/webp' }); assert.equal(ra.status, 422); assert.match((await ra.json()).erro, /animada/);
  const html = await upload(Buffer.from('<html><script>alert(1)</script></html>' + ' '.repeat(40)), { tipo: 'image/png' });
  assert.equal(html.status, 422); assert.match((await html.json()).erro, /não é uma imagem/);
  const grande = await fetch(`${s.base}/api/admin/uploads/imagem`, { method: 'POST', headers: { ...T, 'Content-Type': 'image/png', 'Content-Length': String(11 * 1024 * 1024) }, body: 'x' }).catch((e) => ({ status: 413, erroRede: e }));
  assert.ok(grande.status === 413 || grande.erroRede, 'recusa o corpo grande');
  assert.equal(recebidos.length, antes, 'nada foi gravado');
  globalThis.__s3status = 500; const r502 = await upload(png); delete globalThis.__s3status;
  assert.equal(r502.status, 502); assert.match((await r502.json()).erro, /não consegui gravar/);
  const salvo = process.env.S3_ENDPOINT; delete process.env.S3_ENDPOINT;
  try { const r503 = await upload(png); assert.equal(r503.status, 503); } finally { process.env.S3_ENDPOINT = salvo; }
});

// ---------- cartas com imagem e meme; vídeo só por link ----------
test('cartas: lista traz o título do meme e a imagem; criar e editar com imagem do site e meme; caminho fora de midias/ é recusado', { skip }, async () => {
  const col = (await s.get('/api/admin/colecoes', { headers: T })).json.itens[0];
  const nova = await s.post('/api/admin/cartas', { colecao_id: col.id, nome: 'Carta com arte', raridade: 'Raro', meme_id: 'havaianas-de-pau', imagem: 'midias/carta-aabbccddeeff.webp' }, { headers: T });
  assert.equal(nova.status, 201, JSON.stringify(nova.json)); assert.equal(nova.json.carta.imagem, 'midias/carta-aabbccddeeff.webp');
  const lista = (await s.get('/api/admin/cartas?colecao=' + col.id, { headers: T })).json.itens;
  const c = lista.find((x) => x.id === nova.json.carta.id);
  assert.equal(c.meme_titulo, 'Havaianas de Pau'); assert.equal(c.imagem, 'midias/carta-aabbccddeeff.webp');
  assert.ok(lista.some((x) => x.imagem === null), 'cartas sem arte seguem com imagem nula');
  const edit = await s.patch('/api/admin/cartas/' + c.id, { imagem: 'midias/carta-112233445566.webp' }, { headers: T });
  assert.equal(edit.status, 200); assert.equal(edit.json.carta.imagem, 'midias/carta-112233445566.webp');
  assert.equal((await s.patch('/api/admin/cartas/' + c.id, { imagem: null }, { headers: T })).json.carta.imagem, null, 'dá para tirar a imagem');
  for (const ruim of ['memes/foto.jpg', '/etc/passwd', 'midias/../segredo.png', 'midias/a/b.png', 'https://x.com/a.png', 'midias/' + 'a'.repeat(130) + '.png']) {
    assert.equal((await s.patch('/api/admin/cartas/' + c.id, { imagem: ruim }, { headers: T })).status, 422, ruim);
  }
  const log = await q("SELECT detalhe FROM log_auditoria WHERE acao = 'carta.editar' ORDER BY id DESC LIMIT 1");
  assert.ok(log[0].detalhe.campos.imagem);
});

test('vídeo só por link externo: arquivo de vídeo novo é recusado (criar e editar), o que já existia pode ficar; link do YouTube vira o id', { skip }, async () => {
  const base = { id: 'meme-video-teste', titulo: 'Meme de vídeo', ano: 2015, categoria: 'Zoeira', raridade: 'Raro' };
  const r1 = await s.post('/api/admin/memes', { ...base, midias: [{ tipo: 'video_arquivo', caminho: 'memes/video.mp4' }] }, { headers: T });
  assert.equal(r1.status, 422); assert.match(r1.json.erro, /vídeo só por link externo/);
  assert.equal((await q("SELECT count(*)::int AS n FROM memes WHERE id = 'meme-video-teste'"))[0].n, 0, 'nada gravado');
  // link do YouTube em qualquer formato vira o id de 11 caracteres
  const r2 = await s.post('/api/admin/memes', { ...base, youtube_id: 'https://youtu.be/dQw4w9WgXcQ?t=3', midias: [{ tipo: 'imagem', caminho: 'midias/meme-aabbccddeeff.webp' }] }, { headers: T });
  assert.equal(r2.status, 201, JSON.stringify(r2.json)); assert.equal(r2.json.meme.youtube_id, 'dQw4w9WgXcQ');
  assert.equal((await s.patch('/api/admin/memes/meme-video-teste', { youtube_id: 'https://www.youtube.com/watch?v=I8MC6-BuU28' }, { headers: T })).json.meme.youtube_id, 'I8MC6-BuU28');
  assert.equal((await s.patch('/api/admin/memes/meme-video-teste', { youtube_id: 'https://vimeo.com/123' }, { headers: T })).status, 422);
  assert.equal((await s.patch('/api/admin/memes/meme-video-teste', { youtube_id: 'curto' }, { headers: T })).status, 422);
  // editar: vídeo-arquivo NOVO recusado; o legado que já está no meme pode ser mantido
  const novo = await s.patch('/api/admin/memes/meme-video-teste', { midias: [{ tipo: 'imagem', caminho: 'midias/meme-aabbccddeeff.webp' }, { tipo: 'video_arquivo', caminho: 'memes/novo.mp4' }] }, { headers: T });
  assert.equal(novo.status, 422);
  await q("INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ('meme-video-teste', 'video_arquivo', 'memes/legado.mp4', 5)");
  const mantem = await s.patch('/api/admin/memes/meme-video-teste', { midias: [{ tipo: 'imagem', caminho: 'midias/meme-aabbccddeeff.webp' }, { tipo: 'video_arquivo', caminho: 'memes/legado.mp4' }] }, { headers: T });
  assert.equal(mantem.status, 200, JSON.stringify(mantem.json));
});
