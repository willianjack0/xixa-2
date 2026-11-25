// Otimização de imagens antes de ir para o S3 (sharp/libvips): gira pelo EXIF, tira metadados (EXIF, GPS), reduz para caber
// num quadrado máximo e converte para WebP. Vale para o painel e para o MCP, então o site recebe sempre arquivos leves.
// Só aceita jpeg, png e webp ESTÁTICOS (conferidos pelos bytes). Proteção contra "bomba de pixels" (limite de pixels decodificados).
import sharp from 'sharp';
import { detectarImagem } from '../mcp/imagem.js';

export const PERFIS = {
  meme: { lado: 1600, qualidade: 80 }, // fotos e capturas dos memes
  carta: { lado: 800, qualidade: 82 } // arte das cartas do álbum
};
const MAX_PIXELS = 40_000_000; // ~ 6300 x 6300

export class ErroImagem extends Error {}

/** { buffer, ext:'webp', tipo:'image/webp', largura, altura, bytes, original:{ bytes, tipo, largura, altura } } ou lança ErroImagem (mensagem em pt-BR). */
export async function otimizarImagem(entrada, perfil = 'meme') {
  const cfg = PERFIS[perfil];
  if (!cfg) throw new Error('perfil de imagem desconhecido: ' + perfil);
  const det = detectarImagem(entrada);
  if (!det) throw new ErroImagem('o arquivo não é uma imagem jpeg, png ou webp');
  try {
    // animated: true só para ENXERGAR os quadros (sem isso o sharp conta 1 página); a conversão abaixo usa só o primeiro
    const meta = await sharp(entrada, { limitInputPixels: MAX_PIXELS, animated: true }).metadata();
    if ((meta.pages || 1) > 1) throw new ErroImagem('imagem animada não é aceita: envie uma imagem estática');
    const { data, info } = await sharp(entrada, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
      .rotate() // respeita a orientação do EXIF
      .resize({ width: cfg.lado, height: cfg.lado, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: cfg.qualidade, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: data, ext: 'webp', tipo: 'image/webp', largura: info.width, altura: info.height, bytes: data.length,
      original: { bytes: entrada.length, tipo: det.tipo, largura: meta.width ?? null, altura: meta.height ?? null }
    };
  } catch (e) {
    if (e instanceof ErroImagem) throw e;
    if (/pixel limit|exceeds/i.test(String(e.message))) throw new ErroImagem('imagem grande demais (máximo de 40 milhões de pixels)');
    throw new ErroImagem('não consegui ler a imagem: o arquivo está corrompido ou não é uma imagem válida');
  }
}
