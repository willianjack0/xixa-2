// Prévia de link por meme (GET /api/og/meme/:id): metatags do meme, escape, 404 de oculto/inexistente. Postgres descartável (pulado sem TEST_DB_NAME).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { htmlDoMeme, esc } from '../routes/og.js';

const skip = semBanco();
let db, s;
before(async () => { if (skip) return; db = await bancoDeTeste({ seed: true }); s = await servidor(db.pool); });
after(async () => { if (skip) return; await s.fechar(); await db.fechar(); });

test('esc: neutraliza aspas, <, > e &', () => {
  assert.equal(esc(`"><script>alert(1)</script>&'`), '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;&#39;');
});

test('htmlDoMeme: título, descrição, imagem do meme e redirecionamento; sem tag solta vinda do texto', () => {
  const h = htmlDoMeme({ id: 'x-1', titulo: '"><img src=x onerror=1>', ano: 2010, descricao: '<b>oi</b> '.repeat(60), youtube_id: null, imagem: 'memes/a b.jpg' }, 'https://exemplo.test');
  assert.ok(!/<img|<b>/.test(h));
  assert.match(h, /og:image" content="https:\/\/exemplo\.test\/memes\/a%20b\.jpg"/);
  assert.match(h, /http-equiv="refresh" content="0;url=https:\/\/exemplo\.test\/memepedia\.html#x-1"/);
  assert.match(h, /rel="canonical" href="https:\/\/exemplo\.test\/api\/og\/meme\/x-1"/);
  assert.match(h, /og:description" content="&lt;b&gt;oi[^"]*…"/); // cortada em ~200 caracteres, com reticências
});

test('htmlDoMeme: sem imagem usa a miniatura do YouTube; sem nada usa o avatar do site', () => {
  assert.match(htmlDoMeme({ id: 'a', titulo: 'A', ano: 2000, descricao: '', youtube_id: 'I8MC6-BuU28', imagem: null }, 'https://o.test'), /i\.ytimg\.com\/vi\/I8MC6-BuU28\//);
  assert.match(htmlDoMeme({ id: 'a', titulo: 'A', ano: 2000, descricao: '', youtube_id: null, imagem: null }, 'https://o.test'), /o\.test\/avatar-ns\.png/);
});

test('GET /api/og/meme/:id: 200 com metatags do meme e cache curto', { skip }, async () => {
  const r = await s.get('/api/og/meme/havaianas-de-pau');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(r.headers.get('cache-control'), /max-age=300/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(r.json, /og:title" content="Havaianas de Pau \(2004\)/);
  assert.match(r.json, /og:image" content="https:\/\/naosalvo\.fishlab\.com\.br\/memes\//);
  assert.match(r.json, /memepedia\.html#havaianas-de-pau/);
});

test('GET /api/og/meme/:id: inexistente, id inválido, , oculto e removido dão 404', { skip }, async () => {
  assert.equal((await s.get('/api/og/meme/nao-existe')).status, 404);
  assert.equal((await s.get('/api/og/meme/ID%20RUIM')).status, 404);
  for (const st of ['oculto', 'removido']) {
    await db.pool.query('UPDATE memes SET status = $1 WHERE id = $2', [st, 'havaianas-de-pau']);
    const r = await s.get('/api/og/meme/havaianas-de-pau');
    assert.equal(r.status, 404); assert.ok(!/Havaianas/.test(String(r.json)), `não vaza o título do meme ${st}`);
  }
  await db.pool.query("UPDATE memes SET status = 'publicado' WHERE id = 'havaianas-de-pau'");
});
