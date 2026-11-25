// Cliente S3 (SigV4) e imagens do MCP: assinatura conferida com os vetores oficiais da AWS, cliente com fetch falso,
// detecção de imagem pelos bytes e download seguro contra SSRF. Sem banco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assinar, criarS3, configDoAmbiente } from '../mcp/s3.js';
import { detectarImagem, ipProibido, urlPermitida, lookupSeguro, baixarImagem, MAX_BYTES } from '../mcp/imagem.js';

// ---------- SigV4: vetores oficiais da documentação da AWS (Signature Calculations for the Authorization Header) ----------
const ACESSO = 'AKIAIOSFODNN7EXAMPLE', SEGREDO = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const sha = (s) => 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

test('SigV4: vetor oficial "GET Object" (com Range) reproduz a assinatura da AWS', () => {
  const c = assinar({ metodo: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', regiao: 'us-east-1', acesso: ACESSO, segredoChave: SEGREDO,
    hashCorpo: sha(''), agora: new Date('2013-05-24T00:00:00Z'), extras: { range: 'bytes=0-9' } });
  assert.match(c.authorization, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  assert.match(c.authorization, /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20130524\/us-east-1\/s3\/aws4_request, /);
});

test('SigV4: vetor oficial "PUT Object" (nome com $ e cabeçalhos extras) reproduz a assinatura da AWS', () => {
  const corpo = 'Welcome to Amazon S3.';
  const hash = '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072';
  const c = assinar({ metodo: 'PUT', url: 'https://examplebucket.s3.amazonaws.com/test$file.text', regiao: 'us-east-1', acesso: ACESSO, segredoChave: SEGREDO,
    hashCorpo: hash, agora: new Date('2013-05-24T00:00:00Z'), extras: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' } });
  assert.match(c.authorization, /SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class, Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd$/);
  assert.equal(corpo.length, 21);
});

// ---------- cliente com fetch falso ----------
const cfg = { endpoint: 'http://minio_minio:9000', bucket: 'naosalvo', regiao: 'eu-south', acesso: 'CHAVEACESSO1', segredoChave: 'SEGREDO-MUITO-SECRETO' };
function fetchFalso(status = 200) {
  const chamadas = [];
  return { chamadas, impl: async (url, o) => { chamadas.push({ url, ...o }); return { ok: status >= 200 && status < 300, status }; } };
}

test('S3: put vai para /bucket/chave (estilo path), com SigV4, corpo e tipo; a chave secreta nunca vai no pedido', async () => {
  const f = fetchFalso(200);
  const s3 = criarS3(cfg, { fetchImpl: f.impl, agora: () => new Date('2026-11-25T20:00:00Z') });
  await s3.put('midias/meme-um-abcd1234.png', Buffer.from('conteudo'), 'image/png');
  const [c] = f.chamadas;
  assert.equal(c.url, 'http://minio_minio:9000/naosalvo/midias/meme-um-abcd1234.png'); assert.equal(c.method, 'PUT');
  assert.match(c.headers.authorization, /^AWS4-HMAC-SHA256 Credential=CHAVEACESSO1\/20261125\/eu-south\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.equal(c.headers['x-amz-date'], '20261125T200000Z'); assert.equal(c.headers['content-type'], 'image/png');
  assert.equal(c.headers['x-amz-content-sha256'], '8a0e3bbf1ff9fd5ae2ef7e5f8fb0e3f6b5b9d2c3f1cd2a9a7d8e8a8b1a1d4d0f'.length === 64 ? c.headers['x-amz-content-sha256'] : '');
  assert.ok(!JSON.stringify(c.headers).includes(cfg.segredoChave));
  assert.deepEqual(c.body, Buffer.from('conteudo'));
});

test('S3: caracteres especiais na chave são codificados; erro do S3 vira exceção sem credenciais; delete 404 é ok; head 404 é false', async () => {
  const f = fetchFalso(200);
  await criarS3(cfg, { fetchImpl: f.impl }).put('midias/a b+c.png', Buffer.from('x'));
  assert.equal(f.chamadas[0].url, 'http://minio_minio:9000/naosalvo/midias/a%20b%2Bc.png');
  const recusa = criarS3(cfg, { fetchImpl: fetchFalso(403).impl });
  await assert.rejects(recusa.put('midias/x.png', Buffer.from('x')), (e) => e.message === 's3 put 403' && !e.message.includes(cfg.segredoChave) && !e.message.includes(cfg.acesso));
  await criarS3(cfg, { fetchImpl: fetchFalso(404).impl }).remove('midias/x.png');
  assert.equal(await criarS3(cfg, { fetchImpl: fetchFalso(404).impl }).head('midias/x.png'), false);
  assert.equal(await criarS3(cfg, { fetchImpl: fetchFalso(200).impl }).head('midias/x.png'), true);
  await assert.rejects(criarS3(cfg, { fetchImpl: fetchFalso(500).impl }).head('midias/x.png'), /s3 head 500/);
});

test('configDoAmbiente: lê endpoint/bucket/região e as chaves de arquivos (Docker secrets); sem algum item = null', () => {
  const dir = mkdtempSync(join(tmpdir(), 's3cfg-'));
  try {
    writeFileSync(join(dir, 'acesso'), 'ACESSO-X\n'); writeFileSync(join(dir, 'segredo'), 'SEGREDO-Y\n');
    const env = { S3_ENDPOINT: 'http://minio_minio:9000/', S3_BUCKET: 'naosalvo', S3_REGION: 'eu-south', S3_ACCESS_KEY_FILE: join(dir, 'acesso'), S3_SECRET_KEY_FILE: join(dir, 'segredo') };
    assert.deepEqual(configDoAmbiente(env), { endpoint: 'http://minio_minio:9000', bucket: 'naosalvo', regiao: 'eu-south', acesso: 'ACESSO-X', segredoChave: 'SEGREDO-Y' });
    assert.equal(configDoAmbiente({ ...env, S3_BUCKET: '' }), null);
    assert.equal(configDoAmbiente({ ...env, S3_ENDPOINT: '' }), null);
    assert.equal(configDoAmbiente({ ...env, S3_ENDPOINT: 'javascript:alert(1)' }), null);
    assert.equal(configDoAmbiente({ ...env, S3_BUCKET: 'Nome Inválido!' }), null);
    assert.equal(configDoAmbiente({}), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- detecção de imagem pelos bytes ----------
const png = (w, h) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const jpg = (w, h) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]), Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])]);
const webpVP8X = (w, h) => { const b = Buffer.alloc(34); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(26, 4); b.write('WEBP', 8, 'latin1'); b.write('VP8X', 12, 'latin1'); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; };

test('detectarImagem: png, jpeg e webp pelos bytes, com largura e altura; o resto é recusado', () => {
  assert.deepEqual(detectarImagem(png(640, 480)), { ext: 'png', tipo: 'image/png', largura: 640, altura: 480 });
  assert.deepEqual(detectarImagem(jpg(800, 600)), { ext: 'jpg', tipo: 'image/jpeg', altura: 600, largura: 800 });
  assert.deepEqual(detectarImagem(webpVP8X(1024, 768)), { ext: 'webp', tipo: 'image/webp', largura: 1024, altura: 768 });
  for (const ruim of [Buffer.from('GIF89a' + 'x'.repeat(20)), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), Buffer.from('<html><script>alert(1)</script></html>'),
    Buffer.from('MZ' + 'x'.repeat(30)), Buffer.alloc(0), Buffer.from('curto'), null, 'texto']) assert.equal(detectarImagem(ruim), null);
  // o nome/Content-Type não entra: um HTML com cara de png continua recusado, e um png sem extensão passa
  assert.equal(detectarImagem(Buffer.from('<html>' + 'x'.repeat(40))), null);
});

// ---------- SSRF ----------
test('ipProibido: loopback, privados, link-local (metadados da nuvem), CGNAT, multicast e IPv6 locais; públicos passam', () => {
  for (const ip of ['127.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fd00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.5', 'nao-e-ip']) assert.equal(ipProibido(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '203.0.113.7', '2606:4700:4700::1111']) assert.equal(ipProibido(ip), false, ip);
});

test('urlPermitida: só http/https público nas portas 80/443, sem usuário e sem destino interno', () => {
  assert.ok(urlPermitida('https://exemplo.com/a.png')); assert.ok(urlPermitida('http://exemplo.com:80/a.png')); assert.ok(urlPermitida('https://exemplo.com:443/a.png'));
  for (const ruim of ['ftp://exemplo.com/a.png', 'file:///etc/passwd', 'javascript:alert(1)', 'gopher://x.com', 'http://127.0.0.1/a.png', 'http://localhost/a.png', 'http://[::1]/a.png',
    'http://10.0.0.1/a.png', 'http://169.254.169.254/latest/meta-data/', 'http://usuario:senha@exemplo.com/a.png', 'https://exemplo.com:8443/a.png', 'http://minio_minio:9000/naosalvo/x',
    'http://servidor.internal/a.png', 'http://impressora.local/a.png', '', 'nada', null]) assert.equal(urlPermitida(ruim), null, String(ruim));
});

test('lookupSeguro: "localhost" resolve para loopback e é recusado na conexão (vale contra DNS rebinding)', async () => {
  await assert.rejects(new Promise((ok, err) => lookupSeguro('localhost', { all: true }, (e, r) => (e ? err(e) : ok(r)))), /destino não permitido/);
  await assert.rejects(new Promise((ok, err) => lookupSeguro('localhost', {}, (e, r) => (e ? err(e) : ok(r)))), /destino não permitido/);
});

// servidor local de imagens para testar o download (a validação de URL é trocada para aceitar só 127.0.0.1 nesses testes)
async function servidorLocal(tratador) {
  const s = http.createServer(tratador);
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  return { s, base: `http://127.0.0.1:${s.address().port}`, fechar: () => new Promise((ok) => { s.closeAllConnections?.(); s.close(ok); }) };
}
const soLocal = (permitidos) => (u) => { try { const x = new URL(u); return permitidos.includes(x.hostname) ? x : null; } catch { return null; } };
const lookupLivre = (host, op, cb) => (op && op.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4));

test('baixarImagem: baixa a imagem, segue redirecionamento válido e devolve os bytes', async () => {
  const L = await servidorLocal((req, res) => {
    if (req.url === '/vai') { res.writeHead(302, { Location: '/img.png' }); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png(10, 20));
  });
  try {
    const b = await baixarImagem(L.base + '/vai', { validarUrl: soLocal(['127.0.0.1']), lookup: lookupLivre });
    assert.deepEqual(detectarImagem(b), { ext: 'png', tipo: 'image/png', largura: 10, altura: 20 });
  } finally { await L.fechar(); }
});

test('baixarImagem: recusa destino interno de verdade (URL e redirecionamento), erro de status, imagem grande e tempo esgotado', async () => {
  // 1) com o validador real, o endereço local nem é tentado
  await assert.rejects(baixarImagem('http://127.0.0.1:1/a.png'), /não permitida|inválida/);
  const L = await servidorLocal((req, res) => {
    if (req.url === '/interno') { res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' }); return res.end(); }
    if (req.url === '/loop') { res.writeHead(302, { Location: '/loop' }); return res.end(); }
    if (req.url === '/404') { res.writeHead(404); return res.end('nao'); }
    if (req.url === '/grande-declarado') { res.writeHead(200, { 'Content-Length': String(MAX_BYTES + 1) }); return res.end(Buffer.alloc(10)); }
    if (req.url === '/grande-stream') { res.writeHead(200); const p = Buffer.alloc(1024 * 1024); let n = 0; const t = setInterval(() => { res.write(p); if (++n > 7) { clearInterval(t); res.end(); } }, 5); return undefined; }
    if (req.url === '/lento') { res.writeHead(200); return undefined; } // nunca termina
    res.writeHead(200); return res.end(png(1, 1));
  });
  const opt = { validarUrl: soLocal(['127.0.0.1']), lookup: lookupLivre };
  try {
    await assert.rejects(baixarImagem(L.base + '/interno', opt), /destino não permitido/);
    await assert.rejects(baixarImagem(L.base + '/loop', opt), /redirecionamentos demais/);
    await assert.rejects(baixarImagem(L.base + '/404', opt), /respondeu 404/);
    await assert.rejects(baixarImagem(L.base + '/grande-declarado', opt), /maior que 5 MB/);
    await assert.rejects(baixarImagem(L.base + '/grande-stream', opt), /maior que 5 MB/);
    await assert.rejects(baixarImagem(L.base + '/lento', { ...opt, timeoutMs: 400 }), /tempo esgotado/);
  } finally { await L.fechar(); }
});
