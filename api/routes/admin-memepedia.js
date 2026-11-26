// Memepédia no painel (seppzone): cobertura por meme, editor por campo, histórico, restaurar versão e fila de pendentes.
// Prefixo /api/mod/ (papel moderador ou admin, lido do banco): /api/admin/* exige papel admin antes de casar a rota.
//  - GET  /api/mod/memepedia/memes?busca=&filtro=todos|sem|incompletos|completos|pendentes&limite=&pagina=
//         lista de memes (publicado/oculto) com os campos que têm texto aprovado + resumo de cobertura
//  - GET  /api/mod/memepedia/memes/:id                      os 6 campos: texto atual, histórico (aprovadas, recusadas, pendentes)
//  - POST /api/mod/memepedia/memes/:id/campos/:campo        { texto, fonte? } publica direto (como /api/memepedia/direto)
//  - POST /api/mod/memepedia/edicoes/:id/decidir            { status: 'aprovado' | 'recusado' } só em edição pendente
//  - POST /api/mod/memepedia/edicoes/:id/restaurar          nova edição aprovada com o texto de uma versão anterior (nunca apaga histórico)
// O texto publicado de um campo é a última edição aprovada (revisado_em DESC): publicar, aprovar e restaurar só criam/atualizam linhas.
import { send, lerJson, clean, limited } from '../lib/http.js';
import { auditar } from '../lib/auditoria.js';
import { VOTE_ID } from './votos.js';
import { CAMPOS_MEMEPEDIA, decidirEdicao } from './memepedia.js';

export const TEXTO_MIN = 10;
export const TEXTO_MAX = 2000;
export const FONTE_MAX = 300;
const FILTROS = ['todos', 'sem', 'incompletos', 'completos', 'pendentes'];
const HIST_MAX = 300; // edições devolvidas por meme (as mais novas)
const escaparLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
const aInt = (v, padrao, min, max) => {
  if (v === null || v === undefined || v === '') return padrao;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** { texto, fonte } validados (mesmos limites de /api/memepedia/direto) ou { erro }. A fonte inválida é recusada, não descartada. */
export function lerTextoEFonte(b) {
  if (typeof b.texto !== 'string') return { erro: 'texto obrigatório' };
  if (b.texto.trim().length > TEXTO_MAX) return { erro: `o texto passa de ${TEXTO_MAX} caracteres` };
  const texto = clean(b.texto, TEXTO_MAX);
  if (texto.length < TEXTO_MIN) return { erro: `Escreva pelo menos ${TEXTO_MIN} caracteres.` };
  let fonte = null;
  if (b.fonte !== undefined && b.fonte !== null && b.fonte !== '') {
    if (typeof b.fonte !== 'string') return { erro: 'fonte deve ser um link http ou https' };
    fonte = clean(b.fonte, FONTE_MAX + 1);
    if (fonte.length > FONTE_MAX || !/^https?:\/\/\S+$/i.test(fonte)) return { erro: `a fonte deve ser um link http ou https de até ${FONTE_MAX} caracteres` };
  }
  return { texto, fonte };
}

export default function registrar(r) {
  // ---------- lista com cobertura ----------
  r.get('/api/mod/memepedia/memes', async ({ res, url, pool }) => {
    const q = url.searchParams;
    const busca = (q.get('busca') || '').trim();
    if (busca.length > 60) return send(res, 400, { erro: 'busca com até 60 caracteres' });
    const filtro = q.get('filtro') || 'todos';
    if (!FILTROS.includes(filtro)) return send(res, 400, { erro: 'filtro inválido' });
    const limite = aInt(q.get('limite'), 30, 1, 100), pagina = aInt(q.get('pagina'), 1, 1, 10000);
    if (limite === null || pagina === null) return send(res, 400, { erro: 'limite (1 a 100) ou pagina inválidos' });

    const base = `WITH cov AS (
        SELECT meme_id, count(DISTINCT campo)::int AS n, array_agg(DISTINCT campo) AS campos
          FROM memepedia_edicoes WHERE status = 'aprovado' GROUP BY meme_id),
      pend AS (SELECT meme_id, count(*)::int AS n FROM memepedia_edicoes WHERE status = 'pendente' GROUP BY meme_id),
      lista AS (
        SELECT m.id, m.titulo, m.ano, m.categoria, m.status, COALESCE(cov.n, 0) AS preenchidos,
               COALESCE(cov.campos, ARRAY[]::text[]) AS campos, COALESCE(pend.n, 0) AS pendentes
          FROM memes m LEFT JOIN cov ON cov.meme_id = m.id LEFT JOIN pend ON pend.meme_id = m.id
         WHERE m.status <> 'removido')`;
    const onde = [], val = [];
    if (busca) { val.push('%' + escaparLike(busca) + '%'); onde.push(`(lower(titulo) LIKE lower($${val.length}) ESCAPE '\\' OR id LIKE lower($${val.length}) ESCAPE '\\')`); }
    if (filtro === 'sem') onde.push('preenchidos = 0');
    else if (filtro === 'incompletos') onde.push(`preenchidos > 0 AND preenchidos < ${CAMPOS_MEMEPEDIA.length}`);
    else if (filtro === 'completos') onde.push(`preenchidos = ${CAMPOS_MEMEPEDIA.length}`);
    else if (filtro === 'pendentes') onde.push('pendentes > 0');
    const where = onde.length ? 'WHERE ' + onde.join(' AND ') : '';
    const [{ rows: itens }, { rows: [{ total }] }, { rows: [resumo] }] = await Promise.all([
      pool.query(`${base} SELECT * FROM lista ${where} ORDER BY ano, titulo, id LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`, val),
      pool.query(`${base} SELECT count(*)::int AS total FROM lista ${where}`, val),
      pool.query(`${base} SELECT count(*)::int AS memes,
                    count(*) FILTER (WHERE preenchidos = 0)::int AS sem_nenhum,
                    count(*) FILTER (WHERE preenchidos > 0 AND preenchidos < ${CAMPOS_MEMEPEDIA.length})::int AS incompletos,
                    count(*) FILTER (WHERE preenchidos = ${CAMPOS_MEMEPEDIA.length})::int AS completos,
                    COALESCE(sum(preenchidos), 0)::int AS campos_preenchidos,
                    COALESCE(sum(pendentes), 0)::int AS pendentes FROM lista`)
    ]);
    return send(res, 200, {
      total, pagina, limite, campos: CAMPOS_MEMEPEDIA,
      resumo: { ...resumo, campos_total: resumo.memes * CAMPOS_MEMEPEDIA.length },
      itens
    });
  }, { papel: 'moderador' });

  // ---------- um meme: campos, texto atual e histórico ----------
  r.get(/^\/api\/mod\/memepedia\/memes\/([a-z0-9-]{1,80})$/, async ({ res, pool, params }) => {
    const { rows: [meme] } = await pool.query('SELECT id, titulo, ano, categoria, status FROM memes WHERE id = $1', [params[0]]);
    if (!meme) return send(res, 404, { erro: 'meme não encontrado' });
    const { rows } = await pool.query(
      `SELECT id, campo, texto, fonte, autor, status, criado_em, revisado_em FROM memepedia_edicoes
        WHERE meme_id = $1 ORDER BY criado_em DESC, id DESC LIMIT ${HIST_MAX}`, [meme.id]);
    const campos = CAMPOS_MEMEPEDIA.map((campo) => {
      const hist = rows.filter((e) => e.campo === campo).map((e) => ({ ...e, id: Number(e.id) }));
      // atual = aprovada mais recente por revisado_em (empate: maior id), igual ao GET /api/memepedia
      const aprovadas = hist.filter((e) => e.status === 'aprovado');
      const atual = aprovadas.reduce((a, e) => (!a || new Date(e.revisado_em) > new Date(a.revisado_em) || (+new Date(e.revisado_em) === +new Date(a.revisado_em) && e.id > a.id) ? e : a), null);
      return { campo, atual_id: atual ? atual.id : null, atual, pendentes: hist.filter((e) => e.status === 'pendente').length, historico: hist };
    });
    return send(res, 200, { meme, limites: { texto_min: TEXTO_MIN, texto_max: TEXTO_MAX, fonte_max: FONTE_MAX }, campos });
  }, { papel: 'moderador' });

  // ---------- publicar direto ----------
  r.post(/^\/api\/mod\/memepedia\/memes\/([a-z0-9-]{1,80})\/campos\/(origem|porque|usos|rede|hoje|curiosidades)$/, async (ctx) => {
    const { req, res, pool, params, usuario } = ctx;
    if (limited('mpa:' + usuario.id, 60)) return send(res, 429, { erro: 'Muitas ações seguidas. Aguarde um pouco.' });
    const b = await lerJson(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return send(res, 400, { erro: 'json inválido' });
    const [id, campo] = params;
    if (!VOTE_ID.test(id)) return send(res, 400, { erro: 'id inválido' });
    const v = lerTextoEFonte(b);
    if (v.erro) return send(res, 422, { erro: v.erro });
    const { rows: [meme] } = await pool.query("SELECT id FROM memes WHERE id = $1 AND status <> 'removido'", [id]);
    if (!meme) return send(res, 404, { erro: 'meme não encontrado' });
    const { rows: [atual] } = await pool.query(
      "SELECT texto, fonte FROM memepedia_edicoes WHERE meme_id = $1 AND campo = $2 AND status = 'aprovado' ORDER BY revisado_em DESC, id DESC LIMIT 1", [id, campo]);
    if (atual && atual.texto === v.texto && (atual.fonte || null) === v.fonte) return send(res, 200, { ok: true, sem_mudanca: true });
    const { rows: [u] } = await pool.query('SELECT apelido FROM usuarios WHERE id = $1', [usuario.id]);
    const { rows: [nova] } = await pool.query(
      "INSERT INTO memepedia_edicoes (meme_id, campo, texto, fonte, autor, status, revisado_em) VALUES ($1,$2,$3,$4,$5,'aprovado',now()) RETURNING id",
      [id, campo, v.texto, v.fonte, u.apelido]);
    await auditar(ctx, 'memepedia.direto', 'memes:' + id, { campo, fonte: v.fonte, edicao_id: Number(nova.id), origem: 'painel' });
    return send(res, 201, { ok: true, publicado: true, edicao_id: Number(nova.id) });
  }, { papel: 'moderador' });

  // ---------- aprovar / recusar pendente (mesma lógica de /api/admin/memepedia/:id, restrita a pendentes) ----------
  r.post(/^\/api\/mod\/memepedia\/edicoes\/(\d{1,18})\/decidir$/, async (ctx) => {
    const { req, res, params } = ctx;
    const b = await lerJson(req);
    const st = b && ['aprovado', 'recusado'].includes(b.status) ? b.status : null;
    if (!st) return send(res, 400, { erro: 'status inválido (aprovado ou recusado)' });
    const out = await decidirEdicao(ctx, params[0], st, { somentePendente: true });
    return send(res, out.status, out.corpo);
  }, { papel: 'moderador' });

  // ---------- restaurar uma versão anterior ----------
  r.post(/^\/api\/mod\/memepedia\/edicoes\/(\d{1,18})\/restaurar$/, async (ctx) => {
    const { res, pool, params, usuario } = ctx;
    if (limited('mpa:' + usuario.id, 60)) return send(res, 429, { erro: 'Muitas ações seguidas. Aguarde um pouco.' });
    const { rows: [orig] } = await pool.query('SELECT id, meme_id, campo, texto, fonte, autor, status FROM memepedia_edicoes WHERE id = $1', [params[0]]);
    if (!orig) return send(res, 404, { erro: 'edição não encontrada' });
    if (orig.status === 'pendente') return send(res, 409, { erro: 'essa edição está pendente: aprove ou recuse em vez de restaurar' });
    const { rows: [meme] } = await pool.query("SELECT id FROM memes WHERE id = $1 AND status <> 'removido'", [orig.meme_id]);
    if (!meme) return send(res, 404, { erro: 'meme não encontrado' });
    const { rows: [atual] } = await pool.query(
      "SELECT id, texto, fonte FROM memepedia_edicoes WHERE meme_id = $1 AND campo = $2 AND status = 'aprovado' ORDER BY revisado_em DESC, id DESC LIMIT 1", [orig.meme_id, orig.campo]);
    if (atual && (Number(atual.id) === Number(orig.id) || (atual.texto === orig.texto && (atual.fonte || null) === (orig.fonte || null)))) {
      return send(res, 409, { erro: 'essa já é a versão publicada' });
    }
    // o crédito do texto fica com quem escreveu; quem restaurou fica no log de auditoria
    const { rows: [nova] } = await pool.query(
      "INSERT INTO memepedia_edicoes (meme_id, campo, texto, fonte, autor, status, revisado_em) VALUES ($1,$2,$3,$4,$5,'aprovado',now()) RETURNING id",
      [orig.meme_id, orig.campo, orig.texto, orig.fonte, orig.autor]);
    await auditar(ctx, 'memepedia.restaurar', 'memes:' + orig.meme_id, { campo: orig.campo, restaurado_de: Number(orig.id), edicao_id: Number(nova.id), substituiu: atual ? Number(atual.id) : null });
    return send(res, 201, { ok: true, edicao_id: Number(nova.id), restaurado_de: Number(orig.id) });
  }, { papel: 'moderador' });
}
