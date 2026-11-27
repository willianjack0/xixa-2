// Pré-visualização de link POR MEME (Open Graph / Twitter Card).
// O site é estático e os robôs (WhatsApp, Discord, Facebook, X...) não rodam JS, então o link compartilhado de um meme
// aponta para esta rota: ela devolve um HTML curto só com as metatags do meme e manda o navegador para a Memepédia.
//   GET /api/og/meme/:id   (o Traefik já encaminha /api/* para a API; nada muda no nginx)
// Só meme 'publicado' (oculto/removido/inexistente = 404 sem dizer qual). Todo texto do banco passa por escape.
import { VOTE_ID } from './votos.js';

const ORIGEM_PADRAO = 'https://naosalvo.fishlab.com.br';
const CABECALHOS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; img-src 'none'; style-src 'none'",
  'Referrer-Policy': 'no-referrer'
};

export const esc = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
const resumo = (t, max) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
};
const caminhoUrl = (c) => String(c).split('/').map(encodeURIComponent).join('/');

/** HTML da prévia de um meme (já escapado). `meme` = linha do banco; `origem` = https://dominio sem barra final. */
export function htmlDoMeme(meme, origem) {
  const id = meme.id;
  const titulo = `${resumo(meme.titulo, 90)}${meme.ano ? ` (${meme.ano})` : ''} — NÃO SALVO`;
  const descricao = resumo(meme.descricao, 200) || 'Um meme do museu da internet brasileira. Veja no NÃO SALVO.';
  const img = meme.imagem ? `${origem}/${caminhoUrl(meme.imagem)}`
    : meme.youtube_id && /^[A-Za-z0-9_-]{6,20}$/.test(meme.youtube_id) ? `https://i.ytimg.com/vi/${meme.youtube_id}/hqdefault.jpg`
    : `${origem}/avatar-ns.png`;
  const alvo = `${origem}/memepedia.html#${encodeURIComponent(id)}`;
  const pagina = `${origem}/api/og/meme/${encodeURIComponent(id)}`;
  const [t, d, i, a, p] = [titulo, descricao, img, alvo, pagina].map(esc);
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${p}">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="article">
<meta property="og:site_name" content="NÃO SALVO">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${p}">
<meta property="og:image" content="${i}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${i}">
<meta http-equiv="refresh" content="0;url=${a}">
</head><body><p><a href="${a}">${t}</a></p></body></html>
`;
}

export default function registrar(r) {
  r.get(/^\/api\/og\/meme\/([^/]+)$/, async ({ res, pool, params, auth }) => {
    const naoAchou = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' }); res.end('meme não encontrado'); };
    const id = params[0];
    if (!VOTE_ID.test(id)) return naoAchou();
    const { rows } = await pool.query(
      `SELECT m.id, m.titulo, m.ano, m.descricao, m.youtube_id,
              (SELECT d.caminho FROM midias d WHERE d.meme_id = m.id AND d.tipo = 'imagem' ORDER BY d.ordem, d.id LIMIT 1) AS imagem
         FROM memes m WHERE m.id = $1 AND m.status = 'publicado'`, [id]);
    if (!rows.length) return naoAchou();
    const origem = (auth?.origemSite || ORIGEM_PADRAO).replace(/\/+$/, '');
    res.writeHead(200, CABECALHOS);
    res.end(htmlDoMeme(rows[0], origem));
  });
}
