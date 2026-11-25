// anexar_midia: gravação no S3 (falso) e ligação ao meme no banco real; fonte por URL (downloader falso) ou base64; erros e
// limpeza; e de ponta a ponta pelo /mcp com um servidor S3 falso que confere o PUT assinado. Pulado sem TEST_DB_NAME.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { fazerAnexarMidia } from '../mcp/midias.js';

const skip = semBanco();
let db, s;
const q = async (sql, v = []) => (await db.pool.query(sql, v)).rows;
const como = (apelido) => ({ headers: { 'X-Test-User': apelido } });

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from('IHDR', 'latin1'), (() => { const b = Buffer.alloc(8); b.writeUInt32BE(320, 0); b.writeUInt32BE(200, 4); return b; })(), Buffer.alloc(20)]);

function s3Falso({ falhaPut = false } = {}) {
  const puts = [], removes = [];
  return { puts, removes,
    async put(chave, buf, tipo) { if (falhaPut) throw new Error('s3 put 500'); puts.push({ chave, buf, tipo }); },
    async remove(chave) { removes.push(chave); } };
}
let DONO = 0;
const ctxMcp = () => ({ pool: db.pool, mcp: { chave_id: 7, usuario_id: DONO, apelido: 'x', escopos: ['ler', 'escrever'] } });

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  DONO = Number((await q("INSERT INTO usuarios (apelido) VALUES ('dono') RETURNING id"))[0].id);
  await q("INSERT INTO memes (id, titulo, ano, categoria, raridade, status) VALUES ('meme-img', 'Meme com imagem', 2015, 'Zoeira', 'Raro', 'oculto'), ('meme-removido', 'Removido', 2015, 'Zoeira', 'Raro', 'removido')");
});
after(async () => { if (skip) return; if (s) await s.fechar(); await db.fechar(); });

test('base64: grava no S3 com tipo e nome gerado, liga ao meme com tamanho e ordem, e loga com o dono da chave e via mcp', { skip }, async () => {
  const f = s3Falso(); const anexar = fazerAnexarMidia({ s3: f });
  const r = await anexar(db.pool, { id: 'meme-img', base64: PNG.toString('base64'), credito_por: 'Fulano', credito_url: 'https://exemplo.com/fonte' }, ctxMcp());
  assert.equal(r.ok, true); assert.match(r.midia.caminho, /^midias\/meme-img-[0-9a-f]{8}\.png$/);
  assert.equal(r.midia.url_publica, '/' + r.midia.caminho); assert.equal(r.midia.largura, 320); assert.equal(r.midia.altura, 200); assert.equal(r.midia.ordem, 0);
  assert.equal(f.puts.length, 1); assert.equal(f.puts[0].chave, r.midia.caminho); assert.equal(f.puts[0].tipo, 'image/png'); assert.deepEqual(f.puts[0].buf, PNG);
  const [m] = await q("SELECT tipo, caminho, origem_url, credito_por, credito_url, largura, altura, ordem FROM midias WHERE meme_id = 'meme-img'");
  assert.deepEqual(m, { tipo: 'imagem', caminho: r.midia.caminho, origem_url: null, credito_por: 'Fulano', credito_url: 'https://exemplo.com/fonte', largura: 320, altura: 200, ordem: 0 });
  const [l] = await q("SELECT usuario_id, alvo, detalhe FROM log_auditoria WHERE acao = 'meme.midia' ORDER BY id DESC LIMIT 1");
  assert.equal(Number(l.usuario_id), DONO); assert.equal(l.alvo, 'memes:meme-img'); assert.equal(l.detalhe.via, 'mcp'); assert.equal(l.detalhe.chave_id, 7); assert.equal(l.detalhe.origem, 'base64');
  // a segunda imagem ganha a próxima ordem; data URL com quebras de linha também vale
  const r2 = await anexar(db.pool, { id: 'meme-img', base64: 'data:image/png;base64,' + PNG.toString('base64').replace(/(.{40})/g, '$1\n') }, ctxMcp());
  assert.equal(r2.midia.ordem, 1);
});

test('url: usa o downloader (que já faz a proteção contra SSRF), guarda a origem e repassa o erro dele em português', { skip }, async () => {
  const f = s3Falso();
  const chamadas = [];
  const anexar = fazerAnexarMidia({ s3: f, baixar: async (u) => { chamadas.push(u); if (u.includes('interno')) throw new Error('o endereço da imagem aponta para a rede interna (não permitido)'); return PNG; } });
  const r = await anexar(db.pool, { id: 'meme-img', url: ' https://exemplo.com/a.png ' }, ctxMcp());
  assert.deepEqual(chamadas, ['https://exemplo.com/a.png']);
  assert.equal((await q('SELECT origem_url FROM midias WHERE caminho = $1', [r.midia.caminho]))[0].origem_url, 'https://exemplo.com/a.png');
  await assert.rejects(anexar(db.pool, { id: 'meme-img', url: 'http://interno/x.png' }, ctxMcp()), /rede interna/);
  assert.equal(f.puts.length, 1, 'nada gravado quando o download é recusado');
});

test('validação: exatamente uma fonte, base64 inválido ou grande, não-imagem (svg, html, gif), campo desconhecido, crédito inválido', { skip }, async () => {
  const f = s3Falso(); const anexar = fazerAnexarMidia({ s3: f });
  const c = ctxMcp();
  await assert.rejects(anexar(db.pool, { id: 'meme-img' }, c), /exatamente um/);
  await assert.rejects(anexar(db.pool, { id: 'meme-img', url: 'https://x.com/a.png', base64: 'AAAA' }, c), /exatamente um/);
  await assert.rejects(anexar(db.pool, { id: 'MAIÚSCULA', base64: 'AAAA' }, c), /campo "id"/);
  await assert.rejects(anexar(db.pool, { id: 'meme-img', base64: 'não é base64!' }, c), /inválido/);
  await assert.rejects(anexar(db.pool, { id: 'meme-img', base64: 'A'.repeat(7_000_000) }, c), /inválido ou maior/);
  for (const ruim of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' + ' '.repeat(10)), Buffer.from('<html><body>oi</body></html>' + ' '.repeat(10)), Buffer.from('GIF89a' + 'x'.repeat(30))]) {
    await assert.rejects(anexar(db.pool, { id: 'meme-img', base64: ruim.toString('base64') }, c), /não é uma imagem jpeg, png ou webp/);
  }
  await assert.rejects(anexar(db.pool, { id: 'meme-img', base64: PNG.toString('base64'), extra: 1 }, c), /campo desconhecido: extra/);
  await assert.rejects(anexar(db.pool, { id: 'meme-img', base64: PNG.toString('base64'), credito_url: 'javascript:alert(1)' }, c), /crédito inválido/);
  await assert.rejects(anexar(db.pool, { id: 'meme-img', base64: PNG.toString('base64'), credito_por: 'x'.repeat(121) }, c), /crédito inválido/);
  assert.equal(f.puts.length, 0, 'nenhuma validação gravou arquivo');
});

test('meme inexistente ou removido recusa sem gravar; S3 fora do ar não deixa linha no banco', { skip }, async () => {
  const f = s3Falso(); const anexar = fazerAnexarMidia({ s3: f });
  await assert.rejects(anexar(db.pool, { id: 'nao-existe', base64: PNG.toString('base64') }, ctxMcp()), /meme não encontrado/);
  await assert.rejects(anexar(db.pool, { id: 'meme-removido', base64: PNG.toString('base64') }, ctxMcp()), /meme removido/);
  assert.equal(f.puts.length, 0);
  const antes = (await q("SELECT count(*)::int AS n FROM midias WHERE meme_id = 'meme-img'"))[0].n;
  const caido = fazerAnexarMidia({ s3: s3Falso({ falhaPut: true }) });
  await assert.rejects(caido(db.pool, { id: 'meme-img', base64: PNG.toString('base64') }, ctxMcp()), /não consegui gravar a imagem/);
  assert.equal((await q("SELECT count(*)::int AS n FROM midias WHERE meme_id = 'meme-img'"))[0].n, antes, 'sem linha órfã no banco');
});

test('limite de 20 mídias por meme; ao estourar, o arquivo recém-enviado ao S3 é apagado (sem órfão)', { skip }, async () => {
  await q("INSERT INTO memes (id, titulo, ano, categoria, raridade, status) VALUES ('meme-cheio', 'Cheio', 2015, 'Zoeira', 'Raro', 'oculto')");
  for (let i = 0; i < 20; i++) await q("INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ('meme-cheio', 'imagem', $1, $2)", ['midias/cheio-' + i + '.png', i]);
  const f = s3Falso(); const anexar = fazerAnexarMidia({ s3: f });
  await assert.rejects(anexar(db.pool, { id: 'meme-cheio', base64: PNG.toString('base64') }, ctxMcp()), /já tem 20 mídias/);
  assert.equal(f.puts.length, 1); assert.deepEqual(f.removes, [f.puts[0].chave], 'o arquivo enviado foi removido');
  assert.equal((await q("SELECT count(*)::int AS n FROM midias WHERE meme_id = 'meme-cheio'"))[0].n, 20);
});

test('sem configuração de S3 a ferramenta responde que o armazenamento não está configurado', { skip }, async () => {
  const antes = { ...process.env };
  for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_ACCESS_KEY_FILE', 'S3_SECRET_KEY_FILE']) delete process.env[k];
  try { await assert.rejects(fazerAnexarMidia()(db.pool, { id: 'meme-img', base64: PNG.toString('base64') }, ctxMcp()), /armazenamento de imagens não está configurado/); }
  finally { Object.assign(process.env, antes); }
});

// ---- de ponta a ponta pelo /mcp, com um S3 falso que confere o PUT assinado ----
test('pelo /mcp: chave com escopo escrever anexa a imagem; o S3 recebe PUT assinado (SigV4) no caminho certo; chave só ler não pode', { skip }, async () => {
  const recebidos = [];
  const falso = http.createServer((req, res) => {
    const partes = []; req.on('data', (c) => partes.push(c)); req.on('end', () => { recebidos.push({ metodo: req.method, url: req.url, headers: req.headers, corpo: Buffer.concat(partes) }); res.writeHead(200); res.end(); });
  });
  await new Promise((ok) => falso.listen(0, '127.0.0.1', ok));
  Object.assign(process.env, { S3_ENDPOINT: `http://127.0.0.1:${falso.address().port}`, S3_BUCKET: 'naosalvo', S3_REGION: 'eu-south', S3_ACCESS_KEY: 'ACESSOTESTE', S3_SECRET_KEY: 'SEGREDOTESTE' });
  s = await servidor(db.pool, { autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' }), adminToken: 'segredo', auth: { origemSite: 'https://naosalvo.teste' } });
  try {
    await s.get('/api/eu', como('admMidia'));
    await q("UPDATE usuarios SET papel = 'admin' WHERE lower(apelido) = 'admmidia'");
    const chaveDe = async (escopos) => { const x = await s.post('/api/admin/mcp/chaves', { nome: 'k', escopos }, como('admMidia')); assert.equal(x.status, 201, 'criar chave: ' + x.status + ' ' + JSON.stringify(x.json)); return x.json.chave; };
    const chamar = (chave, args) => s.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'anexar_midia', arguments: args } }, { headers: { Authorization: 'Bearer ' + chave } });

    const soLer = await chamar(await chaveDe(['ler']), { id: 'meme-img', base64: PNG.toString('base64') });
    assert.ok(soLer.json.result, 'resposta: ' + soLer.status + ' ' + JSON.stringify(soLer.json));
    assert.equal(soLer.json.result.isError, true); assert.match(soLer.json.result.content[0].text, /falta o escopo escrever/); assert.equal(recebidos.length, 0);

    const r = await chamar(await chaveDe(['ler', 'escrever']), { id: 'meme-img', base64: PNG.toString('base64') });
    assert.equal(r.json.result.isError, false, JSON.stringify(r.json));
    const dados = JSON.parse(r.json.result.content[0].text);
    assert.match(dados.midia.caminho, /^midias\/meme-img-[0-9a-f]{8}\.png$/);
    assert.equal(recebidos.length, 1);
    const p = recebidos[0];
    assert.equal(p.metodo, 'PUT'); assert.equal(p.url, '/naosalvo/' + dados.midia.caminho); assert.deepEqual(p.corpo, PNG);
    assert.match(p.headers.authorization, /^AWS4-HMAC-SHA256 Credential=ACESSOTESTE\/\d{8}\/eu-south\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    assert.equal(p.headers['content-type'], 'image/png');
    assert.ok(!JSON.stringify(p.headers).includes('SEGREDOTESTE'), 'a chave secreta não vai no pedido');
    assert.ok(!JSON.stringify(r.json).includes('SEGREDOTESTE'));
    // a mídia aparece na API pública do acervo só quando o meme estiver publicado; no admin já aparece
    const admin = await s.get('/api/admin/memes/meme-img', { headers: { Authorization: 'Bearer segredo' } });
    assert.ok(admin.json.midias.some((m) => m.caminho === dados.midia.caminho));
  } finally {
    for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) delete process.env[k];
    await new Promise((ok) => { falso.closeAllConnections?.(); falso.close(ok); });
  }
});
