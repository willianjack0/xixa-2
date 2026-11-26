// Envio de arte de carta pela comunidade + moderação, contra Postgres descartável (pulado sem TEST_DB_NAME).
// Login = auth-stub (X-Test-User). O S3 é um servidor HTTP falso que guarda os objetos em memória (PUT/GET/DELETE).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import sharp from 'sharp';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { MAX_POR_DIA } from '../routes/arte-carta.js';

const skip = semBanco();
let db, s, falso;
const objetos = new Map(); // chave "pendentes/x.webp" -> Buffer
const q = async (sql, v = []) => (await db.pool.query(sql, v)).rows;
const como = (u) => ({ headers: { 'X-Test-User': u } });
const chave = (url) => decodeURIComponent(url.replace(/^\/[^/]+\//, '')); // /bucket/chave -> chave

before(async () => {
  if (skip) return;
  falso = http.createServer((req, res) => {
    const partes = []; req.on('data', (c) => partes.push(c));
    req.on('end', () => {
      const k = chave(req.url.split('?')[0]);
      if (req.method === 'PUT') { objetos.set(k, Buffer.concat(partes)); res.writeHead(200); return res.end(); }
      if (req.method === 'DELETE') { objetos.delete(k); res.writeHead(204); return res.end(); }
      if (req.method === 'GET') { const o = objetos.get(k); if (!o) { res.writeHead(404); return res.end(); } res.writeHead(200); return res.end(o); }
      res.writeHead(405); res.end();
    });
  });
  await new Promise((ok) => falso.listen(0, '127.0.0.1', ok));
  Object.assign(process.env, { S3_ENDPOINT: `http://127.0.0.1:${falso.address().port}`, S3_BUCKET: 'naosalvo', S3_REGION: 'eu-south', S3_ACCESS_KEY: 'ACESSOTESTE', S3_SECRET_KEY: 'SEGREDOTESTE' });
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, { autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' }), auth: { origemSite: 'https://naosalvo.teste' } });
});
after(async () => {
  if (skip) return;
  for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) delete process.env[k];
  await s.fechar(); await db.fechar(); await new Promise((ok) => { falso.closeAllConnections?.(); falso.close(ok); });
});

let n = 0;
/** cria o usuário (1º acesso) com o papel dado; devolve o apelido de teste */
async function pessoa(papel = 'usuario') {
  const u = `arte${++n}x`;
  const e = await s.get('/api/eu', como(u));
  if (papel !== 'usuario') await q('UPDATE usuarios SET papel = $2 WHERE id = $1', [e.json.usuario.id, papel]);
  return { u, id: e.json.usuario.id };
}
const jpeg = (w = 600, h = 800) => sharp({ create: { width: w, height: h, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 50 } } }).jpeg({ quality: 90 }).toBuffer();
const png = (w = 600, h = 800) => sharp({ create: { width: w, height: h, channels: 3, background: '#a33' } }).png().toBuffer();
const enviar = (u, carta, corpo, tipo = 'image/jpeg') =>
  fetch(`${s.base}/api/arte/envios?carta=${encodeURIComponent(carta)}`, { method: 'POST', headers: { ...(u ? como(u).headers : {}), 'Content-Type': tipo }, body: corpo });
const cartaLivre = async () => (await q('SELECT id FROM cartas WHERE imagem IS NULL ORDER BY random() LIMIT 1'))[0].id;
const lista = async (u, qs = '') => (await s.get('/api/arte/cartas' + qs, como(u))).json;
/** a carta (se ainda estiver sem arte) na lista da coleção dela, percorrendo as páginas */
async function naLista(u, c) {
  const col = (await q('SELECT colecao_id FROM cartas WHERE id = $1', [c]))[0].colecao_id;
  for (let pagina = 1; pagina < 40; pagina++) {
    const r = await lista(u, `?limite=50&pagina=${pagina}&colecao_id=${col}`);
    const achou = r.itens.find((x) => x.id === c);
    if (achou) return achou;
    if (r.itens.length < 50) return null;
  }
  return null;
}
const pendentesNoS3 = () => [...objetos.keys()].filter((k) => k.startsWith('pendentes/'));

test('migração 030: tabela, índice único parcial e CHECK do arquivo (só pendentes/)', { skip }, async () => {
  const idx = await q("SELECT indexname FROM pg_indexes WHERE tablename = 'envios_arte_carta'");
  for (const i of ['envios_arte_pendente_uq', 'envios_arte_fila_idx', 'envios_arte_carta_idx', 'envios_arte_usuario_idx']) assert.ok(idx.some((x) => x.indexname === i), i);
  const { id } = await pessoa();
  const c = await cartaLivre();
  for (const ruim of ['midias/x.webp', 'pendentes/../x.webp', 'pendentes/a/b.webp', 'x.webp'])
    await assert.rejects(q("INSERT INTO envios_arte_carta (carta_id, usuario_id, arquivo) VALUES ($1,$2,$3)", [c, id, ruim]), /violates check constraint/, ruim);
});

test('login obrigatório: sem sessão 401 na lista, no envio, em /meus e na moderação', { skip }, async () => {
  assert.equal((await s.get('/api/arte/cartas')).status, 401);
  assert.equal((await s.get('/api/arte/meus')).status, 401);
  assert.equal((await enviar(null, 'x-1', await jpeg())).status, 401);
  assert.equal((await s.get('/api/mod/arte/envios')).status, 401);
  assert.equal(pendentesNoS3().length, 0);
});

test('lista: só cartas sem imagem; busca, coleção e paginação; nome com HTML sai como texto (cliente escapa)', { skip }, async () => {
  const { u } = await pessoa();
  const todas = await lista(u, '?limite=50');
  assert.ok(todas.total > 0 && todas.itens.length > 0 && todas.colecoes.length > 0);
  const comImg = (await q('SELECT id FROM cartas LIMIT 1'))[0].id;
  await q("UPDATE cartas SET imagem = 'midias/carta-teste1.webp' WHERE id = $1", [comImg]);
  try {
    const dep = await lista(u, '?limite=50');
    assert.equal(dep.total, todas.total - 1);
    assert.ok(!dep.itens.some((c) => c.id === comImg));
  } finally { await q('UPDATE cartas SET imagem = NULL WHERE id = $1', [comImg]); }
  const um = todas.itens[0];
  const porNome = await lista(u, '?busca=' + encodeURIComponent(um.nome.slice(0, 4)));
  assert.ok(porNome.itens.some((c) => c.id === um.id));
  assert.equal((await lista(u, '?busca=' + encodeURIComponent('%'))).total, 0, '% não vira curinga');
  assert.equal((await lista(u, '?colecao_id=' + um.colecao_id + '&limite=50')).itens.every((c) => c.colecao_id === um.colecao_id), true);
  const p1 = await lista(u, '?limite=2&pagina=1'), p2 = await lista(u, '?limite=2&pagina=2');
  assert.equal(p1.itens.length, 2); assert.notEqual(p1.itens[0].id, p2.itens[0].id);
  for (const ruim of ['?limite=0', '?limite=51', '?pagina=0', '?colecao_id=A/B', '?busca=' + 'a'.repeat(61)])
    assert.equal((await s.get('/api/arte/cartas' + ruim, como(u))).status, 400, ruim);
  await q("UPDATE cartas SET nome = $2 WHERE id = $1", [um.id, '<img src=x onerror=alert(1)>']);
  try { assert.equal((await lista(u, '?limite=50')).itens.find((c) => c.id === um.id).nome, '<img src=x onerror=alert(1)>'); }
  finally { await q('UPDATE cartas SET nome = $2 WHERE id = $1', [um.id, um.nome]); }
});

test('envio ok: 201, arquivo em pendentes/ (webp, nome do servidor), carta continua na lista com contagem de pendentes', { skip }, async () => {
  const { u, id } = await pessoa();
  const c = await cartaLivre();
  const antes = pendentesNoS3().length;
  const r = await enviar(u, c, await jpeg());
  assert.equal(r.status, 201); const j = await r.json(); assert.equal(j.status, 'pendente');
  const [e] = await q('SELECT * FROM envios_arte_carta WHERE id = $1', [j.id]);
  assert.equal(e.carta_id, c); assert.equal(Number(e.usuario_id), id); assert.equal(e.status, 'pendente');
  assert.match(e.arquivo, /^pendentes\/arte-[a-f0-9]{24}\.webp$/);
  assert.equal(pendentesNoS3().length, antes + 1);
  const meta = await sharp(objetos.get(e.arquivo)).metadata();
  assert.equal(meta.format, 'webp'); assert.ok(meta.width <= 800 && meta.height <= 800);
  assert.equal((await q('SELECT imagem FROM cartas WHERE id = $1', [c]))[0].imagem, null, 'só a aprovação grava a imagem');
  const item = await naLista(u, c);
  assert.ok(item, 'carta segue na lista'); assert.equal(item.pendentes, 1); assert.equal(item.meu_pendente, true);
  const meus = (await s.get('/api/arte/meus', como(u))).json.itens;
  assert.equal(meus.length, 1); assert.equal(meus[0].status, 'pendente');
});

test('vários envios pendentes por carta (usuários diferentes); mesmo usuário na mesma carta = 409 e nada vai ao S3', { skip }, async () => {
  const a = await pessoa(), b = await pessoa();
  const c = await cartaLivre();
  assert.equal((await enviar(a.u, c, await png())).status, 201);
  assert.equal((await enviar(b.u, c, await jpeg())).status, 201);
  const antes = pendentesNoS3().length;
  const r = await enviar(a.u, c, await jpeg()); assert.equal(r.status, 409);
  assert.equal(pendentesNoS3().length, antes, 'rejeitado não deixa arquivo órfão');
  assert.equal((await q("SELECT count(*)::int AS n FROM envios_arte_carta WHERE carta_id = $1 AND status = 'pendente'", [c]))[0].n, 2);
});

test('validação do arquivo: não-imagem, SVG, GIF, animada, corrompida, pequena, proporção, grande, vazia, carta inválida', { skip }, async () => {
  const { u } = await pessoa();
  const c = await cartaLivre();
  const antes = pendentesNoS3().length;
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><script>alert(1)</script></svg>');
  assert.equal((await enviar(u, c, svg, 'image/svg+xml')).status, 415);
  assert.equal((await enviar(u, c, Buffer.from('GIF89a' + 'x'.repeat(100)), 'image/gif')).status, 415);
  assert.equal((await enviar(u, c, Buffer.from('x'), 'text/html')).status, 415);
  // tipo declarado mente: SVG com Content-Type image/png não passa (bytes)
  assert.equal((await enviar(u, c, svg, 'image/png')).status, 422);
  // HTML disfarçado de jpeg
  assert.equal((await enviar(u, c, Buffer.from('<html><script>alert(1)</script></html>'.padEnd(64, ' ')), 'image/jpeg')).status, 422);
  // cabeçalho png válido, corpo corrompido
  const quebrada = Buffer.concat([(await png(500, 500)).subarray(0, 60), Buffer.alloc(80, 7)]);
  assert.equal((await enviar(u, c, quebrada, 'image/png')).status, 422);
  // animada
  const quadro = (cor) => sharp({ create: { width: 500, height: 500, channels: 3, background: cor } }).png().toBuffer();
  const anim = await sharp([await quadro('#ff0000'), await quadro('#0000ff')], { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  const ra = await enviar(u, c, anim, 'image/webp'); assert.equal(ra.status, 422); assert.match((await ra.json()).erro, /animada/);
  const peq = await enviar(u, c, await jpeg(300, 300)); assert.equal(peq.status, 422); assert.match((await peq.json()).erro, /pequena demais/);
  assert.equal((await enviar(u, c, await jpeg(2400, 600))).status, 422, 'tira larga');
  assert.equal((await enviar(u, c, Buffer.alloc(0))).status, 400);
  // o servidor responde 413 sem ler o corpo e fecha a conexão: o cliente pode ver o 413 ou um reset (as duas coisas recusam)
  const grande = await enviar(u, c, Buffer.alloc(5 * 1024 * 1024 + 10, 1)).then((x) => x.status, () => 413); assert.equal(grande, 413);
  assert.equal((await enviar(u, '../etc/passwd', await jpeg())).status, 400);
  assert.equal((await enviar(u, 'a'.repeat(101), await jpeg())).status, 400);
  assert.equal((await enviar(u, 'carta-que-nao-existe-9', await jpeg())).status, 404);
  assert.equal(pendentesNoS3().length, antes, 'nada inválido foi para o S3');
  assert.equal((await q('SELECT count(*)::int AS n FROM envios_arte_carta WHERE carta_id = $1', [c]))[0].n, 0);
});

test('carta que já tem arte aprovada não recebe envio (409)', { skip }, async () => {
  const { u } = await pessoa();
  const c = await cartaLivre();
  await q("UPDATE cartas SET imagem = 'midias/carta-ja1.webp' WHERE id = $1", [c]);
  try { assert.equal((await enviar(u, c, await jpeg())).status, 409); } finally { await q('UPDATE cartas SET imagem = NULL WHERE id = $1', [c]); }
});

test('limite diário por usuário (429) conta qualquer situação', { skip }, async () => {
  const { u, id } = await pessoa();
  const cartas = await q('SELECT id FROM cartas WHERE imagem IS NULL ORDER BY id LIMIT $1', [MAX_POR_DIA + 1]);
  assert.ok(cartas.length > MAX_POR_DIA);
  const img = await jpeg(500, 500);
  for (let i = 0; i < MAX_POR_DIA; i++) await q("INSERT INTO envios_arte_carta (carta_id, usuario_id, arquivo, status) VALUES ($1,$2,$3,'rejeitado')", [cartas[i].id, id, `pendentes/arte-${String(i).padStart(24, '0')}.webp`]);
  const r = await enviar(u, cartas[MAX_POR_DIA].id, img); assert.equal(r.status, 429); assert.match((await r.json()).erro, /por dia/);
  await q("UPDATE envios_arte_carta SET criado_em = now() - interval '25 hours' WHERE usuario_id = $1", [id]);
  assert.equal((await enviar(u, cartas[MAX_POR_DIA].id, img)).status, 201, 'passou 24 h');
});

test('moderação: usuário comum 403; lista de pendentes; arquivo só para moderador e com cabeçalhos seguros', { skip }, async () => {
  const dono = await pessoa(), comum = await pessoa(), mod = await pessoa('moderador');
  const c = await cartaLivre();
  const { id } = await (await enviar(dono.u, c, await jpeg())).json();
  assert.equal((await s.get('/api/mod/arte/envios', como(comum.u))).status, 403);
  assert.equal((await s.get(`/api/mod/arte/envios/${id}/arquivo`, como(comum.u))).status, 403);
  assert.equal((await s.post(`/api/mod/arte/envios/${id}/aprovar`, {}, como(comum.u))).status, 403);
  assert.equal((await s.post(`/api/mod/arte/envios/${id}/rejeitar`, { motivo: 'nao gostei' }, como(comum.u))).status, 403);
  const l = (await s.get('/api/mod/arte/envios', como(mod.u))).json;
  const item = l.itens.find((x) => x.id === id);
  assert.ok(item); assert.equal(item.autor, dono.u); assert.equal(item.carta_id, c); assert.equal(item.status, 'pendente');
  assert.equal((await s.get('/api/mod/arte/envios?status=xx', como(mod.u))).status, 400);
  const f = await fetch(`${s.base}/api/mod/arte/envios/${id}/arquivo`, { headers: como(mod.u).headers });
  assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'image/webp'); assert.equal(f.headers.get('x-content-type-options'), 'nosniff');
  assert.match(f.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal((await fetch(`${s.base}/api/mod/arte/envios/999999999/arquivo`, { headers: como(mod.u).headers })).status, 404);
});

test('aprovar: grava cartas.imagem em midias/carta-*.webp, tira a carta da lista, audita, apaga o pendente e rejeita as outras', { skip }, async () => {
  const a = await pessoa(), b = await pessoa(), mod = await pessoa('moderador');
  const c = await cartaLivre();
  const ea = (await (await enviar(a.u, c, await jpeg())).json()).id, eb = (await (await enviar(b.u, c, await png())).json()).id;
  const arqA = (await q('SELECT arquivo FROM envios_arte_carta WHERE id = $1', [ea]))[0].arquivo;
  const arqB = (await q('SELECT arquivo FROM envios_arte_carta WHERE id = $1', [eb]))[0].arquivo;
  const r = await s.post(`/api/mod/arte/envios/${ea}/aprovar`, {}, como(mod.u));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.match(r.json.imagem, /^midias\/carta-[a-f0-9]{12}\.webp$/); assert.equal(r.json.outros_rejeitados, 1);
  assert.equal((await q('SELECT imagem FROM cartas WHERE id = $1', [c]))[0].imagem, r.json.imagem);
  assert.ok(objetos.has(r.json.imagem), 'imagem final no S3');
  assert.equal((await sharp(objetos.get(r.json.imagem)).metadata()).format, 'webp');
  assert.ok(!objetos.has(arqA) && !objetos.has(arqB), 'pendentes apagados');
  const [x] = await q('SELECT status, decidido_por, decidido_em FROM envios_arte_carta WHERE id = $1', [ea]);
  assert.equal(x.status, 'aprovado'); assert.equal(Number(x.decidido_por), mod.id); assert.ok(x.decidido_em);
  const [y] = await q('SELECT status, motivo FROM envios_arte_carta WHERE id = $1', [eb]);
  assert.equal(y.status, 'rejeitado'); assert.match(y.motivo, /outra arte/);
  assert.equal(await naLista(a.u, c), null, 'saiu da lista');
  const log = await q("SELECT acao, alvo, usuario_id, detalhe FROM log_auditoria WHERE acao = 'carta.arte_aprovar' AND alvo = $1", ['cartas:' + c]);
  assert.equal(log.length, 1); assert.equal(Number(log[0].usuario_id), mod.id); assert.equal(log[0].detalhe.envio_id, ea);
  assert.equal((await s.post(`/api/mod/arte/envios/${ea}/aprovar`, {}, como(mod.u))).status, 409, 'já decidido');
  assert.equal((await s.post(`/api/mod/arte/envios/${eb}/aprovar`, {}, como(mod.u))).status, 409);
  assert.equal((await enviar(a.u, c, await jpeg())).status, 409, 'carta com arte não recebe mais envio');
});

test('rejeitar: exige motivo, guarda o motivo, mantém a carta na lista, apaga o arquivo, audita; permite reenviar', { skip }, async () => {
  const a = await pessoa(), mod = await pessoa('moderador');
  const c = await cartaLivre();
  const e = (await (await enviar(a.u, c, await jpeg())).json()).id;
  const arq = (await q('SELECT arquivo FROM envios_arte_carta WHERE id = $1', [e]))[0].arquivo;
  for (const ruim of [{}, { motivo: '' }, { motivo: 'ab' }, { motivo: 'x'.repeat(301) }, { motivo: 5 }])
    assert.equal((await s.post(`/api/mod/arte/envios/${e}/rejeitar`, ruim, como(mod.u))).status, 422, JSON.stringify(ruim));
  const r = await s.post(`/api/mod/arte/envios/${e}/rejeitar`, { motivo: 'Fora da margem segura' }, como(mod.u));
  assert.equal(r.status, 200);
  const [x] = await q('SELECT status, motivo, decidido_por FROM envios_arte_carta WHERE id = $1', [e]);
  assert.equal(x.status, 'rejeitado'); assert.equal(x.motivo, 'Fora da margem segura'); assert.equal(Number(x.decidido_por), mod.id);
  assert.equal((await q('SELECT imagem FROM cartas WHERE id = $1', [c]))[0].imagem, null);
  assert.ok(await naLista(a.u, c), 'carta segue disponível');
  assert.ok(!objetos.has(arq));
  assert.equal((await q("SELECT count(*)::int AS n FROM log_auditoria WHERE acao = 'carta.arte_rejeitar' AND alvo = $1", ['cartas:' + c]))[0].n, 1);
  const meus = (await s.get('/api/arte/meus', como(a.u))).json.itens.find((i) => i.id === e);
  assert.equal(meus.status, 'rejeitado'); assert.equal(meus.motivo, 'Fora da margem segura');
  assert.equal((await s.post(`/api/mod/arte/envios/${e}/rejeitar`, { motivo: 'de novo' }, como(mod.u))).status, 409);
  assert.equal((await enviar(a.u, c, await jpeg())).status, 201, 'depois de rejeitada, pode reenviar');
});

test('moderador não decide o próprio envio; admin pode', { skip }, async () => {
  const mod = await pessoa('moderador'), adm = await pessoa('admin');
  const c1 = await cartaLivre();
  const e1 = (await (await enviar(mod.u, c1, await jpeg())).json()).id;
  assert.equal((await s.post(`/api/mod/arte/envios/${e1}/aprovar`, {}, como(mod.u))).status, 403);
  assert.equal((await s.post(`/api/mod/arte/envios/${e1}/rejeitar`, { motivo: 'tentando' }, como(mod.u))).status, 403);
  const outra = await pessoa('moderador');
  assert.equal((await s.post(`/api/mod/arte/envios/${e1}/aprovar`, {}, como(outra.u))).status, 200);
  const c2 = (await q('SELECT id FROM cartas WHERE imagem IS NULL ORDER BY random() LIMIT 1'))[0].id;
  const e2 = (await (await enviar(adm.u, c2, await jpeg())).json()).id;
  assert.equal((await s.post(`/api/mod/arte/envios/${e2}/rejeitar`, { motivo: 'admin decide' }, como(adm.u))).status, 200);
});

test('aprovar com arquivo sumido do S3: 409, nada muda e a carta segue sem imagem', { skip }, async () => {
  const a = await pessoa(), mod = await pessoa('moderador');
  const c = await cartaLivre();
  const e = (await (await enviar(a.u, c, await jpeg())).json()).id;
  objetos.delete((await q('SELECT arquivo FROM envios_arte_carta WHERE id = $1', [e]))[0].arquivo);
  const midiasAntes = [...objetos.keys()].filter((k) => k.startsWith('midias/')).length;
  assert.equal((await s.post(`/api/mod/arte/envios/${e}/aprovar`, {}, como(mod.u))).status, 409);
  assert.equal((await q('SELECT imagem FROM cartas WHERE id = $1', [c]))[0].imagem, null);
  assert.equal((await q('SELECT status FROM envios_arte_carta WHERE id = $1', [e]))[0].status, 'pendente');
  assert.equal([...objetos.keys()].filter((k) => k.startsWith('midias/')).length, midiasAntes);
});

test('CSRF: com cookie de sessão, o envio exige X-CSRF e Origin do site (stub dispensa)', { skip }, async () => {
  // as rotas são `autenticada: true` como /api/eu: o roteador já aplica verificarCsrf a quem usa cookie (coberto em auth.test.js).
  const rotas = s.router.rotas.filter((x) => /arte/.test(String(x.caminho)));
  assert.ok(rotas.length >= 7);
  for (const rt of rotas) assert.ok(rt.autenticada || rt.papel, String(rt.caminho));
});
