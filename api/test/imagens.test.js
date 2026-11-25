// Otimização de imagens (sharp): redução, WebP, giro pelo EXIF, metadados removidos, transparência, imagem animada,
// bomba de pixels e arquivos inválidos. Sem banco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { otimizarImagem, ErroImagem, PERFIS } from '../lib/imagens.js';

const jpegGrande = (w = 3000, h = 2000) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 80, b: 40 } } })
  .composite([{ input: { create: { width: 400, height: 300, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } } }, top: 100, left: 100 }]).jpeg({ quality: 95 }).toBuffer();
const info = (buf) => sharp(buf).metadata();

test('meme: reduz para no máximo 1600 px, converte para WebP e diminui o arquivo', async () => {
  const entrada = await jpegGrande(3000, 2000);
  const r = await otimizarImagem(entrada, 'meme');
  assert.equal(r.ext, 'webp'); assert.equal(r.tipo, 'image/webp');
  assert.equal(r.largura, 1600); assert.equal(r.altura, Math.round(2000 * 1600 / 3000));
  assert.equal(r.bytes, r.buffer.length); assert.ok(r.bytes < entrada.length, `${r.bytes} deveria ser menor que ${entrada.length}`);
  assert.deepEqual([r.original.largura, r.original.altura, r.original.tipo, r.original.bytes], [3000, 2000, 'image/jpeg', entrada.length]);
  const m = await info(r.buffer); assert.equal(m.format, 'webp'); assert.equal(m.width, 1600);
});

test('carta: limite de 800 px; imagem pequena não é ampliada', async () => {
  const c = await otimizarImagem(await jpegGrande(1200, 1800), 'carta');
  assert.equal(c.altura, 800); assert.equal(c.largura, Math.round(1200 * 800 / 1800));
  const pequena = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#123456' } }).png().toBuffer();
  const p = await otimizarImagem(pequena, 'meme');
  assert.deepEqual([p.largura, p.altura], [120, 80]);
  assert.deepEqual(Object.keys(PERFIS).sort(), ['carta', 'meme']);
});

test('EXIF: gira pela orientação e NÃO deixa metadados (EXIF/GPS) no arquivo final', async () => {
  const comExif = await sharp({ create: { width: 100, height: 50, channels: 3, background: '#abcdef' } })
    .withExif({ IFD0: { Copyright: 'segredo-do-fotografo', Artist: 'Fulano' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  assert.ok((await info(comExif)).exif, 'a entrada tem EXIF');
  const r = await otimizarImagem(comExif, 'meme');
  assert.deepEqual([r.largura, r.altura], [50, 100], 'orientação 6 vira retrato');
  const m = await info(r.buffer);
  assert.equal(m.exif, undefined); assert.equal(m.orientation, undefined);
  assert.ok(!r.buffer.toString('latin1').includes('segredo-do-fotografo'));
});

test('PNG com transparência mantém o canal alfa', async () => {
  const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.4 } } }).png().toBuffer();
  const r = await otimizarImagem(png, 'meme');
  const m = await info(r.buffer); assert.equal(m.hasAlpha, true);
  const { data } = await sharp(r.buffer).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[3] > 60 && data[3] < 200, 'alfa parcial preservado: ' + data[3]);
});

test('recusa: imagem animada, bomba de pixels, arquivo corrompido, GIF, SVG, HTML e vazio', async () => {
  const q = (c) => sharp({ create: { width: 32, height: 32, channels: 3, background: c } }).png().toBuffer();
  const animada = await sharp([await q('#ff0000'), await q('#0000ff')], { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.ok(((await sharp(animada, { animated: true }).metadata()).pages || 1) > 1, 'fixture animada');
  await assert.rejects(otimizarImagem(animada), (e) => e instanceof ErroImagem && /animada/.test(e.message));

  const bomba = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: '#808080' } }).png({ compressionLevel: 9 }).toBuffer(); // 48 milhões de pixels
  await assert.rejects(otimizarImagem(bomba), (e) => e instanceof ErroImagem && /grande demais/.test(e.message));

  const corrompida = Buffer.concat([(await sharp({ create: { width: 200, height: 200, channels: 3, background: '#fff' } }).png().toBuffer()).subarray(0, 60), Buffer.alloc(80, 7)]);
  await assert.rejects(otimizarImagem(corrompida), (e) => e instanceof ErroImagem && /corrompido|não consegui ler/.test(e.message));

  for (const ruim of [Buffer.from('GIF89a' + 'x'.repeat(40)), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), Buffer.from('<html>' + 'x'.repeat(30)), Buffer.alloc(0), Buffer.alloc(5)]) {
    await assert.rejects(otimizarImagem(ruim), (e) => e instanceof ErroImagem && /não é uma imagem jpeg, png ou webp/.test(e.message));
  }
  await assert.rejects(otimizarImagem(await jpegGrande(600, 400), 'poster'), /perfil de imagem desconhecido/);
});
