// Votos: curtir/não curtir (2010+) e estrelas (2004–2009).
// Um voto por usuário e por meme (votos_usuario, migração 016). O total mostrado = base antiga congelada
// (votos_legado, do tempo do voto anônimo: não some) + votos dos usuários. Votar exige login.
import { send, lerJson, limited } from '../lib/http.js';

export const VOTE_ID = /^[a-z0-9-]{1,80}$/;
const A = { autenticada: true };
const clampV = (v) => (v === 1 || v === -1 ? v : 0);
const clampS = (s) => Math.max(0, Math.min(5, Math.round(+s || 0)));
const emptyVote = () => ({ up: 0, down: 0, sum: 0, n: 0 });
const idsDe = (url) => [...new Set((url.searchParams.get('ids') || '').split(',').filter((i) => VOTE_ID.test(i)))].slice(0, 60);

/** Totais por meme: legado (congelado) + votos dos usuários. */
export async function totaisDe(db, ids) {
  const out = {};
  ids.forEach((i) => { out[i] = emptyVote(); });
  if (!ids.length) return out;
  const [{ rows: leg }, { rows: us }] = await Promise.all([
    db.query('SELECT id, up, down, sum, n FROM votos_legado WHERE id = ANY($1)', [ids]),
    db.query(`SELECT meme_id AS id, count(*) FILTER (WHERE voto = 1)::int AS up, count(*) FILTER (WHERE voto = -1)::int AS down,
                     COALESCE(sum(estrelas), 0)::int AS sum, count(*) FILTER (WHERE estrelas > 0)::int AS n
                FROM votos_usuario WHERE meme_id = ANY($1) GROUP BY meme_id`, [ids])
  ]);
  for (const x of [...leg, ...us]) {
    const o = out[x.id]; if (!o) continue;
    o.up += Number(x.up); o.down += Number(x.down); o.sum += Number(x.sum); o.n += Number(x.n);
  }
  return out;
}

export default function registrar(r) {
  // público: totais
  r.get('/api/votos', async ({ res, url, pool }) => send(res, 200, await totaisDe(pool, idsDe(url))));

  // o voto da própria pessoa (para marcar o botão de curtir e as estrelas)
  r.get('/api/votos/meus', async ({ res, url, pool, usuario }) => {
    const ids = idsDe(url), out = {};
    ids.forEach((i) => { out[i] = { v: 0, s: 0 }; });
    if (ids.length) {
      const { rows } = await pool.query('SELECT meme_id, voto, estrelas FROM votos_usuario WHERE usuario_id = $1 AND meme_id = ANY($2)', [usuario.id, ids]);
      rows.forEach((x) => { out[x.meme_id] = { v: x.voto, s: x.estrelas }; });
    }
    return send(res, 200, out);
  }, A);

  // votar: { id, v } (curtir 1 / não curtir -1 / tirar 0) e/ou { id, s } (estrelas 0–5). Valor absoluto: repetir não soma.
  // Compatível com o formato antigo { from, to } / { starFrom, starTo } (vale o "to").
  r.post('/api/votos', async ({ req, res, pool, usuario }) => {
    if (limited('v:' + usuario.id, 120)) return send(res, 429, { erro: 'Muitas ações. Aguarde um pouco.' });
    const b = await lerJson(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return send(res, 400, { erro: 'json inválido' });
    if (!VOTE_ID.test(String(b.id || ''))) return send(res, 400, { erro: 'id inválido' });
    const temV = 'v' in b || 'to' in b, temS = 's' in b || 'starTo' in b;
    if (!temV && !temS) return send(res, 400, { erro: 'envie v (-1, 0 ou 1) e/ou s (0 a 5)' });
    const v = temV ? clampV('v' in b ? b.v : b.to) : null, s = temS ? clampS('s' in b ? b.s : b.starTo) : null;
    const { rows: [m] } = await pool.query(
      `INSERT INTO votos_usuario (usuario_id, meme_id, voto, estrelas) VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 0))
       ON CONFLICT (usuario_id, meme_id) DO UPDATE SET voto = COALESCE($3, votos_usuario.voto), estrelas = COALESCE($4, votos_usuario.estrelas), atualizado_em = now()
       RETURNING voto, estrelas`, [usuario.id, b.id, v, s]);
    const t = (await totaisDe(pool, [b.id]))[b.id];
    return send(res, 200, { ...t, meu: { v: m.voto, s: m.estrelas } });
  }, A);
}
