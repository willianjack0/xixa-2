// Links do YouTube sugeridos pela comunidade para vídeos sem original (moderador aprova no admin).
import { hashIp } from '../lib/ip.js';
import { send, lerJson, clean, limited } from '../lib/http.js';
import { VOTE_ID } from './votos.js';
import { podeEditarDireto } from '../lib/equipe.js';
import { auditar } from '../lib/auditoria.js';

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

  r.post('/api/links', async ({ req, res, pool, ip, adminToken, usuario }) => {
    if (limited('l:' + ip, 10)) return send(res, 429, { erro: 'Muitos envios seguidos. Aguarde um pouco.' });
    const b = await lerJson(req);
    if (b === undefined || b === null || typeof b !== 'object' || Array.isArray(b)) return send(res, 400, { erro: 'json inválido' });
    if (b['bot-field']) return send(res, 201, { ok: true });
    if ('autor' in b && b.autor !== undefined) return send(res, 422, { erro: 'O autor é definido pela conta logada e não deve ser enviado.' });
    const id = String(b.id || ''), yt = String(b.yt || '');
    if (!VOTE_ID.test(id)) return send(res, 400, { erro: 'id inválido' });
    if (!/^[\w-]{11}$/.test(yt)) return send(res, 422, { erro: 'Link do YouTube inválido.' });

    const { rows: uRows } = await pool.query('SELECT apelido FROM usuarios WHERE id = $1', [usuario.id]);
    if (!uRows.length || !uRows[0].apelido) return send(res, 401, { erro: 'usuário não encontrado' });
    const autor = uRows[0].apelido;

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
        'INSERT INTO links_sugeridos (meme_id, yt, autor, usuario_id, ip_hash) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (meme_id, yt) DO NOTHING RETURNING id', [id, yt, autor, usuario.id, ipHash]);
    } catch (e) {
      if (e.code === '23503') return send(res, 404, { erro: 'meme não encontrado' }); // FK: meme_id inexistente
      throw e;
    }
    return send(res, ins.rowCount ? 201 : 200, { ok: true, repetido: !ins.rowCount });
  }, { autenticada: true });

  // equipe (edita_direto) ou admin: adiciona ou troca o link do vídeo, publicado na hora (vale o aprovado mais recente). Não dá XP.
  r.post('/api/links/direto', async (ctx) => {
    const { req, res, pool, usuario } = ctx;
    if (!(await podeEditarDireto(pool, usuario.id))) return send(res, 403, { erro: 'Só a equipe publica direto. Use o envio normal.' });
    if (limited('ld:' + usuario.id, 60)) return send(res, 429, { erro: 'Muitos envios seguidos. Aguarde um pouco.' });
    const b = await lerJson(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return send(res, 400, { erro: 'json inválido' });
    const id = String(b.id || ''), yt = String(b.yt || '');
    if (!VOTE_ID.test(id)) return send(res, 400, { erro: 'id inválido' });
    if (!/^[\w-]{11}$/.test(yt)) return send(res, 422, { erro: 'Link do YouTube inválido.' });
    const { rows: [u] } = await pool.query('SELECT apelido FROM usuarios WHERE id = $1', [usuario.id]);
    try {
      await pool.query(
        `INSERT INTO links_sugeridos (meme_id, yt, autor, status, revisado_em) VALUES ($1,$2,$3,'aprovado',now())
         ON CONFLICT (meme_id, yt) DO UPDATE SET status = 'aprovado', revisado_em = now()`, [id, yt, u.apelido]);
      await auditar(ctx, 'link.direto', 'memes:' + id, { yt });
    } catch (e) {
      if (e.code === '23503') return send(res, 404, { erro: 'meme não encontrado' });
      throw e;
    }
    return send(res, 201, { ok: true, publicado: true });
  }, { autenticada: true });
}
