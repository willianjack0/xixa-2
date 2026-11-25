// Leitura do acervo (público): memes, eras, categorias. Só memes com status 'publicado'.
// Cache curto: o acervo muda raramente (aprovação de envio/edição) e o site pode tolerar ~1 min.
import { send, lerJson, limited, ipDe } from '../lib/http.js';
import { VOTE_ID } from './votos.js';

const CACHE = { 'Cache-Control': 'public, max-age=60' };
const NO_STORE = { 'Cache-Control': 'no-store' };
const LIMITE_MAX = 500;

const COLUNAS = `m.id, m.titulo, m.ano, m.data, m.categoria, m.tipo, m.raridade, m.emoji, m.descricao, m.autor,
  m.duracao, m.youtube_id, m.adicionado_em,
  COALESCE((SELECT json_agg(json_build_object('tipo', d.tipo, 'caminho', d.caminho, 'origem_url', d.origem_url,
      'credito_por', d.credito_por, 'credito_url', d.credito_url, 'largura', d.largura, 'altura', d.altura) ORDER BY d.ordem, d.id)
    FROM midias d WHERE d.meme_id = m.id), '[]'::json) AS midias`;

const inteiro = (v, padrao, min, max) => {
  if (v === null || v === '') return padrao;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : padrao;
};

export default function registrar(r) {
  // confere quais dos ids informados pelo cliente estão fora do ar (oculto ou removido)
  r.post('/api/memes/fora-do-ar', async ({ req, res, pool }) => {
    const ip = ipDe(req);
    if (limited('fda:' + ip, 150)) {
      return send(res, 429, { erro: 'Muitas consultas. Aguarde um momento.' }, NO_STORE);
    }
    const b = await lerJson(req);
    if (!b || typeof b !== 'object' || Array.isArray(b) || !Array.isArray(b.ids)) {
      return send(res, 400, { erro: 'corpo deve conter { ids: string[] }' }, NO_STORE);
    }
    if (b.ids.length > 600) {
      return send(res, 400, { erro: 'limite de até 600 ids por consulta' }, NO_STORE);
    }
    for (const id of b.ids) {
      if (typeof id !== 'string' || !VOTE_ID.test(id)) {
        return send(res, 422, { erro: `id inválido: ${id}` }, NO_STORE);
      }
    }
    const unicos = [...new Set(b.ids)];
    if (!unicos.length) return send(res, 200, { ids: [] }, NO_STORE);

    const { rows } = await pool.query(
      `SELECT id FROM memes WHERE id = ANY($1) AND status IN ('oculto', 'removido')`,
      [unicos]
    );
    return send(res, 200, { ids: rows.map((x) => x.id) }, NO_STORE);
  });

  // filtros: ?ano=2008 ?categoria=Vídeos ?raridade=Mítico ?limite=100 ?offset=0
  r.get('/api/memes', async ({ res, url, pool }) => {
    const q = url.searchParams;
    const onde = ["m.status = 'publicado'"], val = [];
    const ano = q.get('ano'); if (ano) { val.push(inteiro(ano, 0, 0, 9999)); onde.push(`m.ano = $${val.length}`); }
    const cat = q.get('categoria'); if (cat) { val.push(cat.slice(0, 40)); onde.push(`m.categoria = $${val.length}`); }
    const rar = q.get('raridade'); if (rar) { val.push(rar.slice(0, 20)); onde.push(`m.raridade = $${val.length}`); }
    const limite = inteiro(q.get('limite'), LIMITE_MAX, 1, LIMITE_MAX), offset = inteiro(q.get('offset'), 0, 0, 1_000_000);
    const where = onde.join(' AND ');
    const [{ rows }, { rows: [{ total }] }] = await Promise.all([
      pool.query(`SELECT ${COLUNAS} FROM memes m WHERE ${where} ORDER BY m.ano, m.data NULLS LAST, m.id LIMIT ${limite} OFFSET ${offset}`, val),
      pool.query(`SELECT count(*)::int AS total FROM memes m WHERE ${where}`, val)
    ]);
    return send(res, 200, { total, itens: rows }, CACHE);
  });

  r.get(/^\/api\/memes\/([^/]+)$/, async ({ res, pool, params }) => {
    const id = params[0];
    if (!VOTE_ID.test(id)) return send(res, 400, { erro: 'id inválido' });
    const { rows } = await pool.query(`SELECT ${COLUNAS} FROM memes m WHERE m.id = $1 AND m.status = 'publicado'`, [id]);
    if (!rows.length) return send(res, 404, { erro: 'meme não encontrado' });
    return send(res, 200, rows[0], CACHE);
  });

  // cartas do álbum como estão no banco (edições do painel: nome, emoji, raridade, meme e imagem; carta nova entra no fim da coleção)
  r.get('/api/cartas', async ({ res, pool }) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.colecao_id, c.numero, c.nome, c.emoji, c.raridade, c.meme_id, c.imagem
         FROM cartas c JOIN colecoes k ON k.id = c.colecao_id ORDER BY k.ordem, c.numero`);
    return send(res, 200, { itens: rows }, CACHE);
  });

  r.get('/api/eras', async ({ res, pool }) => {
    const { rows } = await pool.query('SELECT ano, ano_fim, rotulo, lema, texto FROM eras ORDER BY ano');
    return send(res, 200, { itens: rows }, CACHE);
  });

  r.get('/api/categorias', async ({ res, pool }) => {
    const { rows } = await pool.query(
      `SELECT c.nome, c.icone, c.emoji, count(m.id)::int AS total
         FROM categorias c LEFT JOIN memes m ON m.categoria = c.nome AND m.status = 'publicado'
        GROUP BY c.nome, c.icone, c.emoji, c.ordem ORDER BY c.ordem`);
    return send(res, 200, { itens: rows }, CACHE);
  });
}
