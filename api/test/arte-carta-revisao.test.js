// Envio de arte de carta, revisão do Farol: concorrência (sem deadlock), custo antes das checagens baratas, TOCTOU, aprovar sem
// recodificar, cancelar o próprio envio e limpeza de pendentes. Postgres descartável (pulado sem TEST_DB_NAME) + S3 falso em memória.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import sharp from 'sharp';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { MAX_POR_DIA, tx } from '../routes/arte-carta.js';
import { criarSemaforo } from '../lib/semaforo.js';
import { limparArtesPendentes } from '../lib/limpeza-arte.js';

const skip = semBanco();
let db, s, falso;
const objetos = new Map();
const q = async (sql, v = []) => (await db.pool.query(sql, v)).rows;
const como = (u) => ({ headers: { 'X-Test-User': u } });
const chave = (url) => decodeURIComponent(url.replace(/^\/[^/]+\//, ''));

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
async function pessoa(papel = 'usuario') {
  const u = `rev${++n}x`;
  const e = await s.get('/api/eu', como(u));
  if (papel !== 'usuario') await q('UPDATE usuarios SET papel = $2 WHERE id = $1', [e.json.usuario.id, papel]);
  return { u, id: e.json.usuario.id };
}
const jpeg = (w = 500, h = 500) => sharp({ create: { width: w, height: h, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 50 } } }).jpeg({ quality: 90 }).toBuffer();
const enviar = (u, carta, corpo, tipo = 'image/jpeg') =>
  fetch(`${s.base}/api/arte/envios?carta=${encodeURIComponent(carta)}`, { method: 'POST', headers: { ...como(u).headers, 'Content-Type': tipo }, body: corpo });
let proxima = 0;
/** uma carta sem arte e SEM envio nenhum (cada teste pega a sua, para os testes em paralelo não se misturarem) */
const cartaLivre = async () => (await q('SELECT c.id FROM cartas c WHERE c.imagem IS NULL AND NOT EXISTS (SELECT 1 FROM envios_arte_carta e WHERE e.carta_id = c.id) ORDER BY c.id OFFSET $1 LIMIT 1', [proxima++ % 5]))[0].id;
const midiasNoS3 = () => [...objetos.keys()].filter((k) => k.startsWith('midias/carta-'));
const comEnvios = async (qtd) => {
  const c = await cartaLivre(); const ids = [];
  for (let i = 0; i < qtd; i++) { const p = await pessoa(); const r = await enviar(p.u, c, await jpeg()); assert.equal(r.status, 201); ids.push((await r.json()).id); }
  return { c, ids };
};

test('semáforo: nunca passa do máximo simultâneo, libera mesmo com erro e respeita a fila', async () => {
  const sem = criarSemaforo(2); let ativos = 0, pico = 0;
  const tarefa = (falha) => sem.rodar(async () => { ativos++; pico = Math.max(pico, ativos); await new Promise((ok) => setTimeout(ok, 15)); ativos--; if (falha) throw new Error('x'); return 1; });
  const rs = await Promise.allSettled([tarefa(), tarefa(true), tarefa(), tarefa(), tarefa(true), tarefa()]);
  assert.equal(pico, 2); assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 4);
  assert.equal(sem.ativos, 0); assert.equal(sem.espera, 0);
  assert.throws(() => criarSemaforo(0));
});

test('tx: deadlock (40P01) e falha de serialização viram 409 "tente de novo"; outros erros passam', async () => {
  const fake = (code) => ({ connect: async () => ({ query: async (sql) => { if (/^(BEGIN|ROLLBACK)/.test(sql)) return {}; throw Object.assign(new Error('x'), { code }); }, release() {} }) });
  for (const code of ['40P01', '40001']) await assert.rejects(tx(fake(code), (c) => c.query('SELECT 1')), (e) => e.status === 409 && /tente de novo/.test(e.message));
  await assert.rejects(tx(fake('23505'), (c) => c.query('SELECT 1')), (e) => e.code === '23505' && e.status === undefined);
});

test('concorrência: aprovar x aprovar na mesma carta = 1 aprovado, os outros 409, nenhum 500 e uma só imagem nova', { skip }, async () => {
  for (let rodada = 0; rodada < 4; rodada++) {
    const { c, ids } = await comEnvios(3); const mod = await pessoa('moderador');
    const antes = midiasNoS3().length;
    const rs = await Promise.all(ids.map((id) => s.post(`/api/mod/arte/envios/${id}/aprovar`, {}, como(mod.u))));
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409, 409], JSON.stringify(rs.map((r) => r.json)));
    assert.deepEqual((await q('SELECT status FROM envios_arte_carta WHERE carta_id = $1', [c])).map((r) => r.status).sort(), ['aprovado', 'rejeitado', 'rejeitado']);
    assert.equal(midiasNoS3().length, antes + 1, 'quem perdeu não deixa objeto órfão em midias/');
    assert.match((await q('SELECT imagem FROM cartas WHERE id = $1', [c]))[0].imagem, /^midias\/carta-/);
  }
});

test('concorrência: aprovar, rejeitar e cancelar misturados não dão deadlock (nenhum 500) e o estado final é coerente', { skip }, async () => {
  for (let rodada = 0; rodada < 4; rodada++) {
    const c = await cartaLivre(); const ps = [await pessoa(), await pessoa(), await pessoa()], mod = await pessoa('moderador'), mod2 = await pessoa('moderador');
    const ids = []; for (const p of ps) ids.push((await (await enviar(p.u, c, await jpeg())).json()).id);
    const rs = await Promise.all([
      s.post(`/api/mod/arte/envios/${ids[0]}/aprovar`, {}, como(mod.u)),
      s.post(`/api/mod/arte/envios/${ids[1]}/rejeitar`, { motivo: 'não serve' }, como(mod2.u)),
      s.del(`/api/arte/envios/${ids[2]}`, como(ps[2].u)),
      s.post(`/api/mod/arte/envios/${ids[1]}/aprovar`, {}, como(mod2.u)),
      s.post(`/api/mod/arte/envios/${ids[0]}/rejeitar`, { motivo: 'não serve' }, como(mod.u))
    ]);
    assert.ok(rs.every((r) => r.status < 500), JSON.stringify(rs.map((r) => [r.status, r.json])));
    const [{ n: pend }] = await q("SELECT count(*)::int AS n FROM envios_arte_carta WHERE carta_id = $1 AND status = 'pendente'", [c]);
    const [{ n: aprov }] = await q("SELECT count(*)::int AS n FROM envios_arte_carta WHERE carta_id = $1 AND status = 'aprovado'", [c]);
    const img = (await q('SELECT imagem FROM cartas WHERE id = $1', [c]))[0].imagem;
    assert.equal(aprov, img ? 1 : 0, 'imagem da carta ⇔ exatamente 1 aprovado');
    if (img) assert.equal(pend, 0, 'carta com arte não fica com pendentes');
  }
});

test('concorrência: envio novo x aprovação — nunca sobra pendente em carta que já tem arte', { skip }, async () => {
  for (let rodada = 0; rodada < 4; rodada++) {
    const { c, ids } = await comEnvios(1); const mod = await pessoa('moderador'), novo = await pessoa(); const img = await jpeg();
    const [ap, up] = await Promise.all([s.post(`/api/mod/arte/envios/${ids[0]}/aprovar`, {}, como(mod.u)), enviar(novo.u, c, img)]);
    assert.equal(ap.status, 200); assert.ok([201, 409].includes(up.status), 'envio: ' + up.status);
    assert.equal((await q("SELECT count(*)::int AS n FROM envios_arte_carta WHERE carta_id = $1 AND status = 'pendente'", [c]))[0].n, 0);
  }
});

test('envio: as regras baratas respondem ANTES de converter a imagem (arquivo inválido não mascara 409/429)', { skip }, async () => {
  const { u, id } = await pessoa(); const c = await cartaLivre();
  await q("UPDATE cartas SET imagem = 'midias/carta-ja2.webp' WHERE id = $1", [c]);
  try { assert.equal((await enviar(u, c, Buffer.from('lixo que nem é imagem'.padEnd(64, 'x')))).status, 409, 'carta com arte: 409 antes de olhar o arquivo'); }
  finally { await q('UPDATE cartas SET imagem = NULL WHERE id = $1', [c]); }
  const cartas = await q('SELECT id FROM cartas WHERE imagem IS NULL ORDER BY id DESC LIMIT $1', [MAX_POR_DIA + 1]);
  for (let i = 0; i < MAX_POR_DIA; i++) await q("INSERT INTO envios_arte_carta (carta_id, usuario_id, arquivo, status) VALUES ($1,$2,$3,'rejeitado')", [cartas[i].id, id, `pendentes/arte-${String(i + 500).padStart(24, '0')}.webp`]);
  assert.equal((await enviar(u, cartas[MAX_POR_DIA].id, Buffer.from('lixo'.padEnd(64, 'x')))).status, 429);
});

test('imagem acima de 16 Mpx é recusada (bomba de pixels); abaixo disso passa', { skip }, async () => {
  const { u } = await pessoa(); const c = await cartaLivre();
  const grande = await sharp({ create: { width: 4100, height: 4100, channels: 3, background: '#888' } }).png({ compressionLevel: 9 }).toBuffer(); // 16,8 Mpx
  const r = await enviar(u, c, grande, 'image/png'); assert.equal(r.status, 422); assert.match((await r.json()).erro, /grande demais \(máximo de 16 milhões/);
  const ok = await sharp({ create: { width: 3900, height: 3900, channels: 3, background: '#888' } }).png({ compressionLevel: 9 }).toBuffer(); // 15,2 Mpx
  assert.equal((await enviar(u, c, ok, 'image/png')).status, 201);
});

test('aprovar não recodifica (mesmos bytes do pendente) e, se o banco falhar, o objeto novo em midias/ é apagado', { skip }, async () => {
  const { ids } = await comEnvios(1); const mod = await pessoa('moderador');
  const arq = (await q('SELECT arquivo FROM envios_arte_carta WHERE id = $1', [ids[0]]))[0].arquivo;
  const pend = Buffer.from(objetos.get(arq));
  await q("CREATE FUNCTION arte_falha() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'falha de teste'; END $f$");
  await q('CREATE TRIGGER arte_falha_t BEFORE UPDATE OF imagem ON cartas FOR EACH ROW EXECUTE FUNCTION arte_falha()');
  const antes = midiasNoS3().length;
  try {
    assert.equal((await s.post(`/api/mod/arte/envios/${ids[0]}/aprovar`, {}, como(mod.u))).status, 500);
    assert.equal(midiasNoS3().length, antes, 'objeto novo apagado');
    assert.equal((await q('SELECT status FROM envios_arte_carta WHERE id = $1', [ids[0]]))[0].status, 'pendente');
    assert.ok(objetos.has(arq), 'pendente intacto para tentar de novo');
  } finally { await q('DROP TRIGGER arte_falha_t ON cartas'); await q('DROP FUNCTION arte_falha()'); }
  const ok = await s.post(`/api/mod/arte/envios/${ids[0]}/aprovar`, {}, como(mod.u)); assert.equal(ok.status, 200);
  assert.ok(Buffer.from(objetos.get(ok.json.imagem)).equals(pend), 'mesmos bytes, sem recodificar');
});

test('cancelar o próprio envio: dono e pendente; apaga o arquivo; outra pessoa 404; decidido 409; sem login 401; pode reenviar', { skip }, async () => {
  const a = await pessoa(), b = await pessoa(), mod = await pessoa('moderador'); const c = await cartaLivre();
  const id = (await (await enviar(a.u, c, await jpeg())).json()).id;
  const arq = (await q('SELECT arquivo FROM envios_arte_carta WHERE id = $1', [id]))[0].arquivo;
  assert.equal((await s.del(`/api/arte/envios/${id}`)).status, 401);
  assert.equal((await s.del(`/api/arte/envios/${id}`, como(b.u))).status, 404, 'envio de outra pessoa não é revelado');
  assert.equal((await q('SELECT count(*)::int AS n FROM envios_arte_carta WHERE id = $1', [id]))[0].n, 1);
  assert.equal((await s.del(`/api/arte/envios/${id}`, como(a.u))).status, 200);
  assert.equal((await q('SELECT count(*)::int AS n FROM envios_arte_carta WHERE id = $1', [id]))[0].n, 0);
  assert.ok(!objetos.has(arq), 'arquivo apagado do S3');
  assert.equal((await s.del(`/api/arte/envios/${id}`, como(a.u))).status, 404);
  assert.equal((await s.del('/api/arte/envios/abc', como(a.u))).status, 404);
  assert.equal((await enviar(a.u, c, await jpeg())).status, 201, 'cancelou, pode reenviar');
  const id2 = (await q('SELECT id FROM envios_arte_carta WHERE carta_id = $1 AND usuario_id = $2', [c, a.id]))[0].id;
  assert.equal((await s.post(`/api/mod/arte/envios/${id2}/rejeitar`, { motivo: 'não serve' }, como(mod.u))).status, 200);
  assert.equal((await s.del(`/api/arte/envios/${id2}`, como(a.u))).status, 409, 'já decidido não cancela');
});

test('admin pode aprovar o próprio envio (por desenho; moderador não pode, coberto em arte-carta.test.js)', { skip }, async () => {
  const adm = await pessoa('admin'); const c = await cartaLivre();
  const id = (await (await enviar(adm.u, c, await jpeg())).json()).id;
  assert.equal((await s.post(`/api/mod/arte/envios/${id}/aprovar`, {}, como(adm.u))).status, 200);
});

test('limpeza: pendente com mais de 30 dias expira e perde o arquivo; órfão antigo some; recente e vivo ficam', { skip }, async () => {
  const velho = await pessoa(), vivo = await pessoa();
  const c1 = await cartaLivre(); const c2 = await cartaLivre();
  const iv = (await (await enviar(velho.u, c1, await jpeg())).json()).id, iw = (await (await enviar(vivo.u, c2, await jpeg())).json()).id;
  const arqV = (await q('SELECT arquivo FROM envios_arte_carta WHERE id = $1', [iv]))[0].arquivo, arqW = (await q('SELECT arquivo FROM envios_arte_carta WHERE id = $1', [iw]))[0].arquivo;
  await q("UPDATE envios_arte_carta SET criado_em = now() - interval '31 days' WHERE id = $1", [iv]);
  const removidos = [], hora = 3_600_000, agora = Date.now();
  const orfaoVelho = 'pendentes/arte-' + 'a'.repeat(24) + '.webp', orfaoNovo = 'pendentes/arte-' + 'b'.repeat(24) + '.webp';
  const s3falso = {
    list: async () => [
      { chave: arqW, tamanho: 1, modificado: new Date(agora - 48 * hora) }, // pendente no banco: fica mesmo velho
      { chave: orfaoVelho, tamanho: 1, modificado: new Date(agora - 48 * hora) },
      { chave: orfaoNovo, tamanho: 1, modificado: new Date(agora - 1 * hora) }, // pode ser upload em andamento
      { chave: 'pendentes/qualquer-coisa.txt', tamanho: 1, modificado: new Date(agora - 99 * hora) } // fora do padrão: nunca mexe
    ],
    remove: async (k) => { removidos.push(k); }
  };
  const r = await limparArtesPendentes(db.pool, s3falso, { agora });
  assert.ok(r.expirados >= 1); assert.equal(r.orfaos, 1);
  assert.ok(removidos.includes(arqV), 'arquivo do expirado removido'); assert.ok(removidos.includes(orfaoVelho));
  assert.ok(!removidos.includes(arqW) && !removidos.includes(orfaoNovo) && !removidos.includes('pendentes/qualquer-coisa.txt'));
  const [x] = await q('SELECT status, motivo FROM envios_arte_carta WHERE id = $1', [iv]);
  assert.equal(x.status, 'rejeitado'); assert.match(x.motivo, /expirou/);
  assert.equal((await q('SELECT status FROM envios_arte_carta WHERE id = $1', [iw]))[0].status, 'pendente');
  assert.equal((await enviar(velho.u, c1, await jpeg())).status, 201, 'liberou a carta para reenviar');
  assert.equal((await limparArtesPendentes(db.pool, null, { agora })).orfaos, 0, 'sem S3 configurado só expira no banco');
});
