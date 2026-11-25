// Links do YouTube sugeridos pela comunidade para vídeos sem original (moderador aprova no admin).
import { hashIp } from '../lib/ip.js';
import { send, lerJson, clean, limited } from '../lib/http.js';
import { VOTE_ID } from './votos.js';

export const LINKS_PENDENTES_POR_IP = 3;    // sugestões pendentes por meme e IP
export const LINKS_PENDENTES_POR_MEME = 20; // teto de pendentes por meme

// IP nunca vai puro para o banco: HMAC com o segredo do admin (sem segredo, cai num sal fixo)

export default function registrar(r) {
  r.get('/api/links/aprovados', async ({ res, pool }) => {
    const { rows } = await pool.query(
      "SELECT DISTINCT ON (meme_id) meme_id, yt FROM links_sugeridos WHERE status = 'aprovado' ORDER BY meme_id, revisado_em DESC");
    const out = {}; rows.forEach((x) => { out[x.meme_id] = x.yt; });
    return send(res, 200, out, { 'Cache-Control': 'public, max-age=120' });
  });

  r.post('/api/links', async ({ req, res, pool, ip, adminToken }) => {
    if (limited('l:' + ip, 10)) return send(res, 429, { erro: 'Muitos envios seguidos. Aguarde um pouco.' });
    const b = await lerJson(req);
    if (b === undefined) return send(res, 400, { erro: 'json inválido' });
    if (b['bot-field']) return send(res, 201, { ok: true });
    const id = String(b.id || ''), yt = String(b.yt || ''), autor = clean(b.autor, 20);
    if (!VOTE_ID.test(id)) return send(res, 400, { erro: 'id inválido' });
    if (!/^[\w-]{11}$/.test(yt)) return send(res, 422, { erro: 'Link do YouTube inválido.' });
    if (!/^[\w.\-]{3,20}$/.test(autor)) return send(res, 422, { erro: 'Nome de usuário inválido.' });
    // anti-spam de pendentes: poucos por meme+IP e um teto por meme (o aprovado/recusado não conta)
    const ipHash = hashIp(adminToken, ip);
    const { rows: [qt] } = await pool.query(
      `SELECT count(*) FILTER (WHERE ip_hash = $2)::int AS do_ip, count(*)::int AS do_meme
         FROM links_sugeridos WHERE meme_id = $1 AND status = 'pendente'`, [id, ipHash]);
    if (qt.do_ip >= LINKS_PENDENTES_POR_IP) return send(res, 429, { erro: 'Você já tem sugestões pendentes para este vídeo. Aguarde a análise.' });
    if (qt.do_meme >= LINKS_PENDENTES_POR_MEME) return send(res, 429, { erro: 'Este vídeo já tem muitas sugestões em análise. Tente mais tarde.' });
    let ins;
    try {
      ins = await pool.query(
        'INSERT INTO links_sugeridos (meme_id, yt, autor, ip_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (meme_id, yt) DO NOTHING RETURNING id', [id, yt, autor, ipHash]);
    } catch (e) {
      if (e.code === '23503') return send(res, 404, { erro: 'meme não encontrado' }); // FK: meme_id inexistente
      throw e;
    }
    return send(res, ins.rowCount ? 201 : 200, { ok: true, repetido: !ins.rowCount });
  });
}
