// Analytics de navegação. Público: POST /api/nav (o site manda pageview e tempo). Admin: GET /api/admin/analytics e /api/admin/analytics/memes.
import { createHmac } from 'node:crypto';
import { send, lerJson, limited } from '../lib/http.js';
import { paginaDe, origemDe, dispositivoDe, ehRobo } from '../lib/navegacao.js';

const HOJE = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
const FILTRO = { hoje: `dia = ${HOJE}`, '7d': `dia >= ${HOJE} - 6`, '30d': `dia >= ${HOJE} - 29`, total: 'TRUE' };
const periodoDe = (q) => (Object.hasOwn(FILTRO, q) ? q : 'hoje');

export default function registrar(r) {
  r.post('/api/nav', async ({ req, res, pool, ip, adminToken }) => {
    if (limited('nav:' + ip, 400)) return send(res, 429, { erro: 'calma' });
    const b = await lerJson(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return send(res, 400, { erro: 'json inválido' });
    if (b.t !== 'pv' && b.t !== 'tempo') return send(res, 400, { erro: 'evento inválido' });
    const ua = String(req.headers['user-agent'] || '');
    if (ehRobo(ua)) return send(res, 202, { ok: true }); // robôs não entram na conta
    const pagina = paginaDe(b.p), origem = origemDe(b.r, String(req.headers.host || '').split(':')[0].toLowerCase()), disp = dispositivoDe(ua);
    if (b.t === 'pv') {
      await pool.query(
        `INSERT INTO analytics_dia (dia, pagina, origem, dispositivo, visualizacoes, sessoes) VALUES (${HOJE}, $1, $2, $3, 1, $4)
         ON CONFLICT (dia, pagina, origem, dispositivo) DO UPDATE SET visualizacoes = analytics_dia.visualizacoes + 1, sessoes = analytics_dia.sessoes + $4`,
        [pagina, origem, disp, b.n === true ? 1 : 0]);
      const vis = createHmac('sha256', adminToken || 'naosalvo').update('nav|' + ip + '|' + ua).digest('hex').slice(0, 32);
      const novo = await pool.query(`INSERT INTO analytics_visitante_dia (dia, visitante) VALUES (${HOJE}, $1) ON CONFLICT DO NOTHING`, [vis]);
      if (novo.rowCount) {
        await pool.query(`INSERT INTO analytics_visitantes (dia, visitantes) VALUES (${HOJE}, 1) ON CONFLICT (dia) DO UPDATE SET visitantes = analytics_visitantes.visitantes + 1`);
      }
      if (Math.random() < 0.02) await pool.query(`DELETE FROM analytics_visitante_dia WHERE dia < ${HOJE} - 2`).catch(() => {});
    } else {
      const s = Math.floor(Number(b.s));
      if (!Number.isFinite(s) || s < 1 || s > 300) return send(res, 400, { erro: 'tempo inválido' });
      await pool.query(
        `INSERT INTO analytics_dia (dia, pagina, origem, dispositivo, segundos) VALUES (${HOJE}, $1, $2, $3, $4)
         ON CONFLICT (dia, pagina, origem, dispositivo) DO UPDATE SET segundos = analytics_dia.segundos + $4`, [pagina, origem, disp, s]);
    }
    return send(res, 202, { ok: true });
  });

  // resumo por período + série dos últimos 30 dias + quebras (páginas, origens, dispositivos) do período pedido
  r.get('/api/admin/analytics', async ({ res, pool, url }) => {
    const per = periodoDe(url.searchParams.get('periodo'));
    const somaPeriodo = async (f) => {
      const [a, v] = await Promise.all([
        pool.query(`SELECT coalesce(sum(visualizacoes),0)::int AS visualizacoes, coalesce(sum(sessoes),0)::int AS sessoes, coalesce(sum(segundos),0)::bigint AS segundos FROM analytics_dia WHERE ${f}`),
        pool.query(`SELECT coalesce(sum(visitantes),0)::int AS visitantes FROM analytics_visitantes WHERE ${f}`)]);
      const x = a.rows[0], seg = Number(x.segundos);
      return { visualizacoes: x.visualizacoes, sessoes: x.sessoes, visitantes: v.rows[0].visitantes, segundos: seg, tempo_medio_sessao: x.sessoes ? Math.round(seg / x.sessoes) : 0 };
    };
    const quebra = async (col) => (await pool.query(
      `SELECT ${col} AS nome, sum(visualizacoes)::int AS visualizacoes, sum(sessoes)::int AS sessoes, sum(segundos)::bigint AS segundos
         FROM analytics_dia WHERE ${FILTRO[per]} GROUP BY ${col} ORDER BY sum(visualizacoes) DESC, ${col} LIMIT 15`)).rows
      .map((x) => ({ ...x, segundos: Number(x.segundos) }));
    const periodos = {};
    for (const k of Object.keys(FILTRO)) periodos[k] = await somaPeriodo(FILTRO[k]);
    const [serie, paginas, origens, dispositivos] = await Promise.all([
      pool.query(
        `SELECT d::date::text AS dia, coalesce(a.visualizacoes,0)::int AS visualizacoes, coalesce(a.sessoes,0)::int AS sessoes, coalesce(v.visitantes,0)::int AS visitantes, coalesce(a.segundos,0)::int AS segundos
           FROM generate_series(${HOJE} - 29, ${HOJE}, interval '1 day') d
           LEFT JOIN (SELECT dia, sum(visualizacoes) AS visualizacoes, sum(sessoes) AS sessoes, sum(segundos) AS segundos FROM analytics_dia GROUP BY dia) a ON a.dia = d::date
           LEFT JOIN analytics_visitantes v ON v.dia = d::date ORDER BY d`),
      quebra('pagina'), quebra('origem'), quebra('dispositivo')]);
    return send(res, 200, { periodo: per, periodos, serie: serie.rows, paginas, origens, dispositivos }, { 'Cache-Control': 'no-store' });
  });

  // memes mais vistos: ?periodo=hoje|7d|30d|total & tipo=visita|clique
  r.get('/api/admin/analytics/memes', async ({ res, pool, url }) => {
    const per = periodoDe(url.searchParams.get('periodo')), tipo = url.searchParams.get('tipo') === 'clique' ? 'clique' : 'visita';
    const { rows } = await pool.query(
      `SELECT m.id, m.titulo, m.status, sum(e.total)::int AS total
         FROM eventos_meme_dia e JOIN memes m ON m.id = e.meme_id
        WHERE e.tipo = $1 AND ${FILTRO[per].replace(/\bdia\b/g, 'e.dia')} GROUP BY m.id, m.titulo, m.status
        ORDER BY total DESC, m.titulo LIMIT 10`, [tipo]);
    return send(res, 200, { periodo: per, tipo, itens: rows }, { 'Cache-Control': 'no-store' });
  });
}
