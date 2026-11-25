// Admin · upload de imagem: o painel envia o arquivo (corpo binário), o servidor otimiza (WebP, até 1600 px para memes e 800 px
// para cartas, sem metadados) e grava no S3 (MinIO), devolvendo o caminho midias/<arquivo>.webp para o formulário usar.
// Só imagem (jpeg, png, webp estáticos, conferidos pelos bytes). Vídeo NÃO se envia: é sempre link externo (YouTube).
// POST /api/admin/uploads/imagem?perfil=meme|carta   Content-Type: image/jpeg | image/png | image/webp   (sessão de admin + CSRF)
import { randomBytes } from 'node:crypto';
import { send, limited, readBodyBuffer } from '../lib/http.js';
import { auditar } from '../lib/auditoria.js';
import { otimizarImagem, ErroImagem, PERFIS } from '../lib/imagens.js';
import { configDoAmbiente, criarS3 } from '../mcp/s3.js';

export const MAX_UPLOAD = 10 * 1024 * 1024; // entrada; depois de otimizada costuma ficar abaixo de 500 KB
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function registrar(r, { s3 = null } = {}) {
  r.post('/api/admin/uploads/imagem', async (ctx) => {
    const { req, res, url } = ctx;
    const perfil = url.searchParams.get('perfil') || 'meme';
    if (!PERFIS[perfil]) return send(res, 400, { erro: 'perfil inválido (meme ou carta)' });
    const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!TIPOS.has(tipo)) return send(res, 415, { erro: 'envie uma imagem jpeg, png ou webp (vídeo não pode ser enviado: use o link do YouTube)' });
    const declarado = Number(req.headers['content-length'] || 0);
    if (declarado > MAX_UPLOAD) return send(res, 413, { erro: 'imagem maior que 10 MB' }, { Connection: 'close' });
    const cliente = s3 || (() => { const cfg = configDoAmbiente(); return cfg ? criarS3(cfg) : null; })();
    if (!cliente) return send(res, 503, { erro: 'o armazenamento de imagens não está configurado neste servidor' });
    const quem = ctx.adminPorSessao ? 'u' + ctx.adminPorSessao.id : 'token';
    if (limited('upimg:' + quem, 60)) return send(res, 429, { erro: 'Muitos envios de imagem seguidos. Aguarde um pouco.' });

    let buf;
    try { buf = await readBodyBuffer(req, MAX_UPLOAD); } catch (e) {
      return send(res, e.message === 'too-large' ? 413 : 400, { erro: e.message === 'too-large' ? 'imagem maior que 10 MB' : 'não consegui ler o arquivo enviado' });
    }
    if (!buf.length) return send(res, 400, { erro: 'arquivo vazio' });
    let img;
    try { img = await otimizarImagem(buf, perfil); } catch (e) {
      if (e instanceof ErroImagem) return send(res, 422, { erro: e.message });
      throw e;
    }
    const caminho = `midias/${perfil}-${randomBytes(6).toString('hex')}.${img.ext}`;
    try { await cliente.put(caminho, img.buffer, img.tipo); } catch {
      return send(res, 502, { erro: 'não consegui gravar a imagem no armazenamento; tente de novo' });
    }
    await auditar(ctx, 'midia.upload', caminho, { perfil, bytes: img.bytes, bytes_original: img.original.bytes, largura: img.largura, altura: img.altura });
    return send(res, 201, { ok: true, caminho, url_publica: '/' + caminho, largura: img.largura, altura: img.altura, bytes: img.bytes, bytes_original: img.original.bytes });
  });
}
