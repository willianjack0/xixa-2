// Sobe.Desce: ranking real dos memes mais visitados (abriu) e mais clicados (deu play), hoje ou desde sempre.
import { hashIp } from '../lib/ip.js';
import { send, lerJson, limited } from '../lib/http.js';
import { VOTE_ID } from './votos.js';

const TIPOS = { visitados: 'visita', clicados: 'clique' };
const HOJE = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

export default function registrar(r) {
  // conta 1 visita/clique por meme, IP e dia (repetir no mesmo dia não infla o ranking)
  r.post('/api/eventos', async ({ req, res, pool, ip, adminToken }) => {
    if (limited('ev:' + ip, 300)) return send(res, 429, { erro: 'calma' });
    const b = await lerJson(req);
    if (b === undefined) return send(res, 400, { erro: 'json inválido' });
    const id = String(b.id || ''), tipo = String(b.tipo || '');
    if (!VOTE_ID.test(id) || !['visita', 'clique'].includes(tipo)) return send(res, 400, { erro: 'evento inválido' });
    const ipHash = hashIp(adminToken, ip);
    try {
      const novo = await pool.query(
        `INSERT INTO eventos_meme_ip (meme_id, tipo, dia, ip_hash) VALUES ($1,$2,${HOJE},$3) ON CONFLICT DO NOTHING`, [id, tipo, ipHash]);
      if (novo.rowCount) {
        await pool.query(
          `INSERT INTO eventos_meme_dia (meme_id, tipo, dia, total) VALUES ($1,$2,${HOJE},1)
           ON CONFLICT (meme_id, tipo, dia) DO UPDATE SET total = eventos_meme_dia.total + 1`, [id, tipo]);
      }
    } catch (e) {
      if (e.code === '23503') return send(res, 404, { erro: 'meme não encontrado' });
      throw e;
    }
    return send(res, 202, { ok: true });
  });

  // ?tipo=visitados|clicados & periodo=hoje|sempre
  // hoje: sobe = mais acessados hoje (com a variação contra ontem); desce = os que mais caíram contra ontem
  // sempre: sobe = mais acessados de todos os tempos; desce = os menos acessados (que precisam de carinho)
  r.get('/api/sobedesce', async ({ res, url, pool }) => {
    const tipo = TIPOS[url.searchParams.get('tipo')] || 'visita';
    const periodo = url.searchParams.get('periodo') === 'sempre' ? 'sempre' : 'hoje';
    let sobe, desce;
    if (periodo === 'hoje') {
      const { rows } = await pool.query(
        `SELECT m.id, coalesce(h.total,0)::int AS hoje, coalesce(o.total,0)::int AS ontem
           FROM memes m
           LEFT JOIN eventos_meme_dia h ON h.meme_id = m.id AND h.tipo = $1 AND h.dia = ${HOJE}
           LEFT JOIN eventos_meme_dia o ON o.meme_id = m.id AND o.tipo = $1 AND o.dia = ${HOJE} - 1
          WHERE m.status = 'publicado' AND (h.total > 0 OR o.total > 0)`, [tipo]);
      sobe = [...rows].filter((x) => x.hoje > 0).sort((a, b) => b.hoje - a.hoje || (b.hoje - b.ontem) - (a.hoje - a.ontem)).slice(0, 5);
      desce = [...rows].filter((x) => x.ontem > x.hoje).sort((a, b) => (b.ontem - b.hoje) - (a.ontem - a.hoje)).slice(0, 5);
    } else {
      const { rows } = await pool.query(
        `SELECT m.id, coalesce(sum(e.total),0)::int AS total
           FROM memes m LEFT JOIN eventos_meme_dia e ON e.meme_id = m.id AND e.tipo = $1
          WHERE m.status = 'publicado' GROUP BY m.id`, [tipo]);
      sobe = [...rows].filter((x) => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);
      desce = [...rows].sort((a, b) => a.total - b.total || a.id.localeCompare(b.id)).slice(0, 5);
    }
    return send(res, 200, { tipo, periodo, sobe, desce }, { 'Cache-Control': 'public, max-age=60' });
  });
}
