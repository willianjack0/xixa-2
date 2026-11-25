// anexar_midia: otimiza uma imagem (reduz e converte para WebP, sem metadados) e a grava no S3 (MinIO), ligada a um meme. A imagem
// vem de uma URL pública (download com proteção contra SSRF) ou de base64. Só jpeg, png e webp estáticos (conferido pelos BYTES),
// até 5 MB de entrada, nome gerado pelo servidor. O arquivo fica em midias/<meme>-<aleatório>.webp e o site serve em /midias/<arquivo>.
import { randomBytes } from 'node:crypto';
import { auditar } from '../lib/auditoria.js';
import { ID_MEME, textoOuNulo, urlOuNula, Erro422 } from '../lib/acervo-validacao.js';
import { ErroArgumento, validarChavesConhecidas } from './ferramentas.js';
import { configDoAmbiente, criarS3 } from './s3.js';
import { baixarImagem, MAX_BYTES } from './imagem.js';
import { otimizarImagem, ErroImagem } from '../lib/imagens.js';

const MAX_MIDIAS = 20;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Fábrica com dependências injetáveis (nos testes entram um S3 e um downloader falsos). */
export function fazerAnexarMidia({ s3 = null, baixar = baixarImagem, otimizar = otimizarImagem } = {}) {
  return async function anexar_midia(pool, args = {}, ctx = {}) {
    validarChavesConhecidas(args, ['id', 'url', 'base64', 'credito_por', 'credito_url']);
    if (typeof args.id !== 'string' || !ID_MEME.test(args.id)) throw new ErroArgumento('campo "id" obrigatório: slug a-z, 0-9 e hífen, até 80 caracteres');
    const temUrl = args.url !== undefined && args.url !== null && args.url !== '';
    const temB64 = args.base64 !== undefined && args.base64 !== null && args.base64 !== '';
    if (temUrl === temB64) throw new ErroArgumento('informe exatamente um entre "url" e "base64"');

    let creditoPor = null, creditoUrl = null;
    try {
      if ('credito_por' in args) creditoPor = textoOuNulo(120)(args.credito_por);
      if ('credito_url' in args) creditoUrl = urlOuNula(args.credito_url);
    } catch (e) {
      if (e instanceof Erro422) throw new ErroArgumento('crédito inválido: ' + e.message);
      throw e;
    }

    const cliente = s3 || (() => { const cfg = configDoAmbiente(); return cfg ? criarS3(cfg) : null; })();
    if (!cliente) throw new ErroArgumento('o armazenamento de imagens não está configurado neste servidor');

    const { rows: [meme] } = await pool.query('SELECT id, status FROM memes WHERE id = $1', [args.id]);
    if (!meme) throw new ErroArgumento('meme não encontrado');
    if (meme.status === 'removido') throw new ErroArgumento('não é possível anexar mídia a meme removido');

    // bytes
    let buf;
    if (temB64) {
      if (typeof args.base64 !== 'string') throw new ErroArgumento('campo "base64" deve ser texto');
      const limpo = args.base64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
      if (limpo.length > Math.ceil(MAX_BYTES * 4 / 3) + 8 || !BASE64.test(limpo)) throw new ErroArgumento('"base64" inválido ou maior que 5 MB');
      buf = Buffer.from(limpo, 'base64');
      if (buf.length > MAX_BYTES) throw new ErroArgumento('imagem maior que 5 MB');
    } else {
      if (typeof args.url !== 'string' || args.url.length > 500) throw new ErroArgumento('campo "url" deve ser um link de até 500 caracteres');
      try { buf = await baixar(args.url.trim()); } catch (e) { throw new ErroArgumento(String(e.message || 'não consegui baixar a imagem')); }
    }
    let img;
    try { img = await otimizar(buf, 'meme'); } catch (e) { throw e instanceof ErroImagem ? new ErroArgumento(e.message) : e; }

    const nome = `${args.id}-${randomBytes(4).toString('hex')}.${img.ext}`;
    const chave = 'midias/' + nome;
    try { await cliente.put(chave, img.buffer, img.tipo); } catch { throw new ErroArgumento('não consegui gravar a imagem no armazenamento; tente de novo'); }

    // liga ao meme (trava a linha para contar e ordenar sem corrida); se falhar, desfaz o arquivo
    const cli = await pool.connect();
    let ordem;
    try {
      await cli.query('BEGIN');
      const { rows: [m] } = await cli.query('SELECT status FROM memes WHERE id = $1 FOR UPDATE', [args.id]);
      if (!m || m.status === 'removido') throw new ErroArgumento('meme não está mais disponível');
      const { rows: [{ n, prox }] } = await cli.query('SELECT count(*)::int AS n, COALESCE(max(ordem), -1) + 1 AS prox FROM midias WHERE meme_id = $1', [args.id]);
      if (n >= MAX_MIDIAS) throw new ErroArgumento(`o meme já tem ${MAX_MIDIAS} mídias`);
      ordem = Number(prox);
      await cli.query(
        `INSERT INTO midias (meme_id, tipo, caminho, origem_url, credito_por, credito_url, largura, altura, ordem) VALUES ($1,'imagem',$2,$3,$4,$5,$6,$7,$8)`,
        [args.id, chave, temUrl ? args.url.trim().slice(0, 500) : null, creditoPor, creditoUrl, img.largura ?? null, img.altura ?? null, ordem]);
      await cli.query('COMMIT');
    } catch (e) {
      await cli.query('ROLLBACK').catch(() => {});
      await cliente.remove(chave).catch(() => {}); // melhor esforço: não deixa arquivo órfão
      throw e;
    } finally { cli.release(); }

    await auditar({ ...ctx, pool }, 'meme.midia', 'memes:' + args.id, { caminho: chave, bytes: img.bytes, bytes_original: img.original.bytes, tipo: img.tipo, origem: temUrl ? 'url' : 'base64' });
    return { ok: true, midia: { caminho: chave, url_publica: '/' + chave, tipo: 'imagem', largura: img.largura ?? null, altura: img.altura ?? null, ordem, bytes: img.bytes, bytes_original: img.original.bytes } };
  };
}

export const anexar_midia = fazerAnexarMidia();

/** Fábrica com dependências injetáveis para remover mídia de meme. */
export function fazerRemoverMidia({ s3 = null } = {}) {
  return async function remover_midia(pool, args = {}, ctx = {}) {
    validarChavesConhecidas(args, ['id', 'midia_id']);
    if (typeof args.id !== 'string' || !ID_MEME.test(args.id)) {
      throw new ErroArgumento('campo "id" obrigatório: slug a-z, 0-9 e hífen, até 80 caracteres');
    }
    if (!Number.isInteger(args.midia_id)) {
      throw new ErroArgumento('campo "midia_id" deve ser inteiro');
    }

    const { rows: [meme] } = await pool.query('SELECT id, status FROM memes WHERE id = $1', [args.id]);
    if (!meme) throw new ErroArgumento('meme não encontrado');
    if (meme.status === 'removido') throw new ErroArgumento('não é possível remover mídia de meme removido');

    const { rows: [midia] } = await pool.query('SELECT id, caminho, tipo FROM midias WHERE id = $1 AND meme_id = $2', [args.midia_id, args.id]);
    if (!midia) throw new ErroArgumento('mídia não encontrada para este meme');

    await pool.query('DELETE FROM midias WHERE id = $1 AND meme_id = $2', [args.midia_id, args.id]);

    // Se o caminho começa com 'midias/' e nenhuma outra linha de midias nem cartas.imagem usa o mesmo caminho, apaga do S3 (melhor esforço)
    if (typeof midia.caminho === 'string' && midia.caminho.startsWith('midias/')) {
      try {
        const { rows: [{ usos }] } = await pool.query(
          'SELECT (SELECT count(*) FROM midias WHERE caminho = $1) + (SELECT count(*) FROM cartas WHERE imagem = $1) AS usos',
          [midia.caminho]
        );
        if (Number(usos) === 0) {
          const cliente = s3 || (() => { const cfg = configDoAmbiente(); return cfg ? criarS3(cfg) : null; })();
          if (cliente) await cliente.remove(midia.caminho).catch(() => {});
        }
      } catch { /* melhor esforço */ }
    }

    await auditar({ ...ctx, pool }, 'meme.midia', 'memes:' + args.id, { removida: true, caminho: midia.caminho });
    return { ok: true, removida: true, midia_id: Number(args.midia_id) };
  };
}

export const remover_midia = fazerRemoverMidia();
