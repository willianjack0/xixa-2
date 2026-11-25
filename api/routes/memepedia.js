// Memepédia: textos de cada meme escritos pela comunidade (a moderação aprova antes de publicar).
import { hashIp } from '../lib/ip.js';
import { send, lerJson, clean, limited } from '../lib/http.js';
import { VOTE_ID } from './votos.js';

export const CAMPOS_MEMEPEDIA = ['origem', 'porque', 'usos', 'rede', 'hoje', 'curiosidades'];
export const EDICOES_PENDENTES_POR_IP = 5; // por meme

export default function registrar(r) {
  // texto publicado: último aprovado de cada campo (de um meme, ou de todos para a lista)
  r.get('/api/memepedia', async ({ res, url, pool }) => {
    const id = url.searchParams.get('id');
    if (id && !VOTE_ID.test(id)) return send(res, 400, { erro: 'id inválido' });
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (meme_id, campo) meme_id, campo, texto, fonte, autor, revisado_em
         FROM memepedia_edicoes WHERE status = 'aprovado' ${id ? 'AND meme_id = $1' : ''}
        ORDER BY meme_id, campo, revisado_em DESC`, id ? [id] : []);
    const out = {};
    rows.forEach((x) => { (out[x.meme_id] ||= {})[x.campo] = { texto: x.texto, fonte: x.fonte, autor: x.autor, em: x.revisado_em }; });
    return send(res, 200, out, { 'Cache-Control': 'public, max-age=120' });
  });

  r.post('/api/memepedia', async ({ req, res, pool, ip, adminToken }) => {
    if (limited('mp:' + ip, 12)) return send(res, 429, { erro: 'Muitos envios seguidos. Aguarde um pouco.' });
    const b = await lerJson(req);
    if (b === undefined) return send(res, 400, { erro: 'json inválido' });
    if (b['bot-field']) return send(res, 201, { ok: true });
    const id = String(b.id || ''), campo = String(b.campo || ''), texto = clean(b.texto, 2000), autor = clean(b.autor, 20);
    let fonte = clean(b.fonte, 300);
    if (!VOTE_ID.test(id)) return send(res, 400, { erro: 'id inválido' });
    if (!CAMPOS_MEMEPEDIA.includes(campo)) return send(res, 422, { erro: 'Campo inválido.' });
    if (texto.length < 10) return send(res, 422, { erro: 'Escreva pelo menos 10 caracteres.' });
    if (!/^[\w.\-]{3,20}$/.test(autor)) return send(res, 422, { erro: 'Nome de usuário inválido.' });
    if (fonte && !/^https?:\/\/\S+$/i.test(fonte)) fonte = '';
    const ipHash = hashIp(adminToken, ip);
    const { rows: [qt] } = await pool.query(
      "SELECT count(*)::int AS n FROM memepedia_edicoes WHERE meme_id = $1 AND ip_hash = $2 AND status = 'pendente'", [id, ipHash]);
    if (qt.n >= EDICOES_PENDENTES_POR_IP) return send(res, 429, { erro: 'Você já tem edições deste meme esperando a moderação.' });
    try {
      await pool.query('INSERT INTO memepedia_edicoes (meme_id, campo, texto, fonte, autor, ip_hash) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, campo, texto, fonte || null, autor, ipHash]);
    } catch (e) {
      if (e.code === '23503') return send(res, 404, { erro: 'meme não encontrado' });
      throw e;
    }
    return send(res, 201, { ok: true });
  });

  // moderação (o roteador exige o token de admin em /api/admin/*)
  r.get('/api/admin/memepedia', async ({ res, pool }) => {
    const { rows } = await pool.query(
      `SELECT id, meme_id, campo, texto, fonte, autor, status, criado_em, revisado_em FROM memepedia_edicoes
        ORDER BY (status = 'pendente') DESC, criado_em DESC LIMIT 500`);
    return send(res, 200, { items: rows });
  });
  r.post(/^\/api\/admin\/memepedia\/(\d+)$/, async ({ req, res, pool, params }) => {
    const b = await lerJson(req);
    const st = b && ['aprovado', 'recusado', 'pendente'].includes(b.status) ? b.status : null;
    if (!st) return send(res, 400, { erro: 'status inválido' });
    const d = await pool.query('UPDATE memepedia_edicoes SET status = $1, revisado_em = now() WHERE id = $2', [st, params[0]]);
    return send(res, d.rowCount ? 200 : 404, d.rowCount ? { ok: true } : { erro: 'não encontrado' });
  });
}
