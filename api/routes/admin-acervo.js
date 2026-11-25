// Admin · acervo: memes (com mídias), cartas, coleções e eras. Tudo sob /api/admin/ (sessão de admin ou token de emergência).
// O banco é a fonte da verdade: o seed (api/seed/acervo.js) só carrega um banco vazio e não sobrescreve estas edições.
// Regras:
//  - memes não são apagados (cartas e comentários apontam para eles): saem do site com status 'oculto' ou 'removido';
//  - cartas não são apagadas (inventários apontam para elas); só criar e editar;
//  - toda mudança grava em log_auditoria com os campos alterados (de/para, valores longos cortados).
import { send, lerJson } from '../lib/http.js';
import { auditar } from '../lib/auditoria.js';
import {
  ID_MEME, ID_CARTA, RARIDADES_CARTA, RARIDADES_MEME, STATUS, TIPOS_MEME, TIPOS_MIDIA,
  Erro422, falha, texto, textoOuNulo, inteiro, inteiroOuNulo, um, dataOuNula, youtubeOuNulo,
  urlOuNula, caminhoDeMidia, ESQUEMA_MEME, OBRIGATORIOS_MEME, ESQUEMA_CARTA, ESQUEMA_COLECAO,
  ESQUEMA_ERA, lerCampos, lerMidias, corta, diff, ehoDia
} from '../lib/acervo-validacao.js';

async function emTransacao(pool, fn) {
  const cli = await pool.connect();
  try { await cli.query('BEGIN'); const r = await fn(cli); await cli.query('COMMIT'); return r; }
  catch (e) { await cli.query('ROLLBACK').catch(() => {}); throw e; }
  finally { cli.release(); }
}

/** Erros de banco que são do usuário (referência, duplicidade, regra): viram 409/422 em vez de 500. */
function erroDeBanco(res, e) {
  if (e.code === '23503') return send(res, 422, { erro: 'referência inexistente (categoria, meme ou coleção)', detalhe: e.constraint || null });
  if (e.code === '23505') return send(res, 409, { erro: 'já existe (id ou posição repetidos)', detalhe: e.constraint || null });
  if (e.code === '23514' || e.code === '22007' || e.code === '22008') return send(res, 422, { erro: 'valor fora da regra do banco', detalhe: e.constraint || null });
  throw e;
}

async function corpoJson(req, res) {
  const b = await lerJson(req);
  if (!b || typeof b !== 'object' || Array.isArray(b)) { send(res, 400, { erro: 'json inválido' }); return null; }
  return b;
}
const rejeitar = (res, { erros, desconhecidos }) => {
  if (Object.keys(erros).length || desconhecidos.length) { send(res, 422, { erro: 'campos inválidos', campos: erros, desconhecidos }); return true; }
  return false;
};

const COLUNAS_MEME = 'id, titulo, ano, data, categoria, tipo, raridade, emoji, descricao, autor, duracao, youtube_id, adicionado_em, status';
const MIDIAS_DO_MEME = `COALESCE((SELECT json_agg(json_build_object('id', d.id, 'tipo', d.tipo, 'caminho', d.caminho, 'origem_url', d.origem_url,
    'credito_por', d.credito_por, 'credito_url', d.credito_url, 'largura', d.largura, 'altura', d.altura) ORDER BY d.ordem, d.id)
  FROM midias d WHERE d.meme_id = m.id), '[]'::json) AS midias`;

async function gravarMidias(cli, memeId, midias) {
  await cli.query('DELETE FROM midias WHERE meme_id = $1', [memeId]);
  for (const [i, m] of midias.entries()) {
    await cli.query(
      'INSERT INTO midias (meme_id, tipo, caminho, origem_url, credito_por, credito_url, largura, altura, ordem) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [memeId, m.tipo, m.caminho, m.origem_url, m.credito_por, m.credito_url, m.largura, m.altura, i]);
  }
}

export default function registrar(r) {
  // ---------- memes ----------
  // lista (inclui ocultos e removidos): busca (título contém), ano, categoria, status, cursor antes=<ordem> não existe: usa offset simples
  r.get('/api/admin/memes', async ({ res, pool, url }) => {
    const q = url.searchParams;
    const limite = Math.min(Math.max(parseInt(q.get('limite'), 10) || 50, 1), 200), offset = Math.min(Math.max(parseInt(q.get('offset'), 10) || 0, 0), 100000);
    const onde = [], val = [];
    const add = (cond, v) => { val.push(v); onde.push(cond.replace('?', '$' + val.length)); };
    const busca = (q.get('busca') || '').trim();
    if (busca && busca.length <= 60) add("lower(m.titulo) LIKE lower(?) ESCAPE '\\'", '%' + busca.replace(/[\\%_]/g, (c) => '\\' + c) + '%');
    if (/^\d{4}$/.test(q.get('ano') || '')) add('m.ano = ?', Number(q.get('ano')));
    if ((q.get('categoria') || '').length && q.get('categoria').length <= 40) add('m.categoria = ?', q.get('categoria'));
    if (STATUS.includes(q.get('status'))) add('m.status = ?', q.get('status'));
    const where = onde.length ? 'WHERE ' + onde.join(' AND ') : '';
    const [{ rows }, { rows: [{ total }] }] = await Promise.all([
      pool.query(`SELECT ${COLUNAS_MEME.split(', ').map((c) => 'm.' + c).join(', ')} FROM memes m ${where} ORDER BY m.ano, m.data NULLS LAST, m.id LIMIT ${limite} OFFSET ${offset}`, val),
      pool.query(`SELECT count(*)::int AS total FROM memes m ${where}`, val)
    ]);
    return send(res, 200, { total, itens: rows });
  });

  r.get(/^\/api\/admin\/memes\/([a-z0-9-]{1,80})$/, async ({ res, pool, params }) => {
    const { rows: [m] } = await pool.query(`SELECT ${COLUNAS_MEME.split(', ').map((c) => 'm.' + c).join(', ')}, ${MIDIAS_DO_MEME} FROM memes m WHERE m.id = $1`, [params[0]]);
    return m ? send(res, 200, m) : send(res, 404, { erro: 'meme não encontrado' });
  });

  // cria: { id, titulo, ano, categoria, raridade, ...opcionais, midias?: [...] }
  r.post('/api/admin/memes', async (ctx) => {
    const { req, res, pool } = ctx;
    const b = await corpoJson(req, res); if (!b) return;
    if (!ID_MEME.test(String(b.id || ''))) return send(res, 422, { erro: 'campos inválidos', campos: { id: 'slug a-z, 0-9 e hífen, até 80' }, desconhecidos: [] });
    const { id, midias: midiasBrutas, ...resto } = b;
    const lido = lerCampos(resto, ESQUEMA_MEME, OBRIGATORIOS_MEME);
    if (rejeitar(res, lido)) return;
    let midias = [];
    if (midiasBrutas !== undefined) { const m = lerMidias(midiasBrutas); if (m.erro) return send(res, 422, { erro: m.erro }); midias = m.midias; }
    const d = { tipo: 'video', status: 'publicado', ...lido.dados };
    try {
      const novo = await emTransacao(pool, async (cli) => {
        const { rows: [m] } = await cli.query(
          `INSERT INTO memes (id, titulo, ano, data, categoria, tipo, raridade, emoji, descricao, autor, duracao, youtube_id, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${COLUNAS_MEME}`,
          [id, d.titulo, d.ano, d.data ?? null, d.categoria, d.tipo, d.raridade, d.emoji ?? null, d.descricao ?? null, d.autor ?? null, d.duracao ?? null, d.youtube_id ?? null, d.status]);
        await gravarMidias(cli, id, midias);
        return m;
      });
      await auditar(ctx, 'meme.criar', 'memes:' + id, { titulo: corta(d.titulo), midias: midias.length });
      return send(res, 201, { ok: true, meme: novo });
    } catch (e) { return erroDeBanco(res, e); }
  });

  // edita parcialmente: qualquer campo do meme (inclusive status) e, se vier `midias`, substitui a lista inteira
  r.patch(/^\/api\/admin\/memes\/([a-z0-9-]{1,80})$/, async (ctx) => {
    const { req, res, pool, params } = ctx;
    const b = await corpoJson(req, res); if (!b) return;
    const { midias: midiasBrutas, ...resto } = b;
    const lido = lerCampos(resto, ESQUEMA_MEME);
    if (rejeitar(res, lido)) return;
    let midias = null;
    if (midiasBrutas !== undefined) { const m = lerMidias(midiasBrutas); if (m.erro) return send(res, 422, { erro: m.erro }); midias = m.midias; }
    if (!Object.keys(lido.dados).length && midias === null) return send(res, 400, { erro: 'nada para alterar' });
    try {
      const resultado = await emTransacao(pool, async (cli) => {
        const { rows: [antes] } = await cli.query('SELECT * FROM memes WHERE id = $1 FOR UPDATE', [params[0]]);
        if (!antes) return null;
        antes.data = ehoDia(antes.data);
        const campos = Object.keys(lido.dados);
        let novo = antes;
        if (campos.length) {
          const sets = campos.map((c, i) => `${c} = $${i + 2}`).join(', '); // nomes vêm do esquema fixo, nunca do corpo
          ({ rows: [novo] } = await cli.query(`UPDATE memes SET ${sets} WHERE id = $1 RETURNING ${COLUNAS_MEME}`, [params[0], ...campos.map((c) => lido.dados[c])]));
        }
        if (midias !== null) await gravarMidias(cli, params[0], midias);
        return { antes, novo };
      });
      if (!resultado) return send(res, 404, { erro: 'meme não encontrado' });
      const mudou = diff(resultado.antes, lido.dados);
      if (Object.keys(mudou).length || midias !== null) await auditar(ctx, 'meme.editar', 'memes:' + params[0], { campos: mudou, ...(midias !== null ? { midias: midias.length } : {}) });
      return send(res, 200, { ok: true, meme: resultado.novo });
    } catch (e) { return erroDeBanco(res, e); }
  });

  // ---------- cartas ----------
  r.get('/api/admin/cartas', async ({ res, pool, url }) => {
    const col = url.searchParams.get('colecao');
    const { rows } = await pool.query(
      `SELECT id, colecao_id, numero, nome, emoji, raridade, meme_id FROM cartas ${col && ID_CARTA.test(col) ? 'WHERE colecao_id = $1' : ''} ORDER BY colecao_id, numero`,
      col && ID_CARTA.test(col) ? [col] : []);
    return send(res, 200, { itens: rows });
  });

  // cria a próxima carta da coleção: { colecao_id, nome, raridade, emoji?, meme_id? } (numero = último + 1; id = "<colecao>-<numero-1>")
  r.post('/api/admin/cartas', async (ctx) => {
    const { req, res, pool } = ctx;
    const b = await corpoJson(req, res); if (!b) return;
    const { colecao_id: colecao, ...resto } = b;
    if (!ID_CARTA.test(String(colecao || ''))) return send(res, 422, { erro: 'campos inválidos', campos: { colecao_id: 'obrigatório' }, desconhecidos: [] });
    const lido = lerCampos(resto, ESQUEMA_CARTA, ['nome', 'raridade']);
    if (rejeitar(res, lido)) return;
    const d = lido.dados;
    try {
      const nova = await emTransacao(pool, async (cli) => {
        const { rows: [c] } = await cli.query('SELECT id FROM colecoes WHERE id = $1 FOR UPDATE', [colecao]);
        if (!c) return null;
        const { rows: [{ prox }] } = await cli.query('SELECT COALESCE(max(numero), 0) + 1 AS prox FROM cartas WHERE colecao_id = $1', [colecao]);
        const { rows: [x] } = await cli.query(
          'INSERT INTO cartas (id, colecao_id, numero, nome, emoji, raridade, meme_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, colecao_id, numero, nome, emoji, raridade, meme_id',
          [`${colecao}-${prox - 1}`, colecao, prox, d.nome, d.emoji ?? null, d.raridade, d.meme_id ?? null]);
        return x;
      });
      if (!nova) return send(res, 404, { erro: 'coleção não encontrada' });
      await auditar(ctx, 'carta.criar', 'cartas:' + nova.id, { nome: corta(nova.nome), raridade: nova.raridade });
      return send(res, 201, { ok: true, carta: nova });
    } catch (e) { return erroDeBanco(res, e); }
  });

  r.patch(/^\/api\/admin\/cartas\/([a-z0-9-]{1,100})$/, async (ctx) => {
    const { req, res, pool, params } = ctx;
    const b = await corpoJson(req, res); if (!b) return;
    const lido = lerCampos(b, ESQUEMA_CARTA);
    if (rejeitar(res, lido)) return;
    const campos = Object.keys(lido.dados);
    if (!campos.length) return send(res, 400, { erro: 'nada para alterar' });
    try {
      const out = await emTransacao(pool, async (cli) => {
        const { rows: [antes] } = await cli.query('SELECT * FROM cartas WHERE id = $1 FOR UPDATE', [params[0]]);
        if (!antes) return null;
        const sets = campos.map((c, i) => `${c} = $${i + 2}`).join(', ');
        const { rows: [novo] } = await cli.query(`UPDATE cartas SET ${sets} WHERE id = $1 RETURNING id, colecao_id, numero, nome, emoji, raridade, meme_id`, [params[0], ...campos.map((c) => lido.dados[c])]);
        return { antes, novo };
      });
      if (!out) return send(res, 404, { erro: 'carta não encontrada' });
      const mudou = diff(out.antes, lido.dados);
      if (Object.keys(mudou).length) await auditar(ctx, 'carta.editar', 'cartas:' + params[0], { campos: mudou });
      return send(res, 200, { ok: true, carta: out.novo });
    } catch (e) { return erroDeBanco(res, e); }
  });

  // ---------- coleções ----------
  r.get('/api/admin/colecoes', async ({ res, pool }) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.nome, c.icone, c.cor, c.cores_fundo, c.sobre, c.ordem, count(x.id)::int AS cartas
         FROM colecoes c LEFT JOIN cartas x ON x.colecao_id = c.id GROUP BY c.id ORDER BY c.ordem, c.id`);
    return send(res, 200, { itens: rows });
  });

  r.patch(/^\/api\/admin\/colecoes\/([a-z0-9-]{1,100})$/, async (ctx) => {
    const { req, res, pool, params } = ctx;
    const b = await corpoJson(req, res); if (!b) return;
    const lido = lerCampos(b, ESQUEMA_COLECAO);
    if (rejeitar(res, lido)) return;
    const campos = Object.keys(lido.dados);
    if (!campos.length) return send(res, 400, { erro: 'nada para alterar' });
    const { rows: [antes] } = await pool.query('SELECT * FROM colecoes WHERE id = $1', [params[0]]);
    if (!antes) return send(res, 404, { erro: 'coleção não encontrada' });
    const sets = campos.map((c, i) => `${c} = $${i + 2}`).join(', ');
    const { rows: [nova] } = await pool.query(`UPDATE colecoes SET ${sets} WHERE id = $1 RETURNING id, nome, icone, cor, cores_fundo, sobre, ordem`, [params[0], ...campos.map((c) => lido.dados[c])]);
    const mudou = diff({ ...antes, cores_fundo: (antes.cores_fundo || []).join(',') }, { ...lido.dados, ...(lido.dados.cores_fundo ? { cores_fundo: lido.dados.cores_fundo.join(',') } : {}) });
    if (Object.keys(mudou).length) await auditar(ctx, 'colecao.editar', 'colecoes:' + params[0], { campos: mudou });
    return send(res, 200, { ok: true, colecao: nova });
  });

  // ---------- eras ----------
  r.patch(/^\/api\/admin\/eras\/(\d{4})$/, async (ctx) => {
    const { req, res, pool, params } = ctx;
    const b = await corpoJson(req, res); if (!b) return;
    const lido = lerCampos(b, ESQUEMA_ERA);
    if (rejeitar(res, lido)) return;
    const campos = Object.keys(lido.dados);
    if (!campos.length) return send(res, 400, { erro: 'nada para alterar' });
    const { rows: [antes] } = await pool.query('SELECT * FROM eras WHERE ano = $1', [Number(params[0])]);
    if (!antes) return send(res, 404, { erro: 'era não encontrada' });
    const sets = campos.map((c, i) => `${c} = $${i + 2}`).join(', ');
    const { rows: [nova] } = await pool.query(`UPDATE eras SET ${sets} WHERE ano = $1 RETURNING ano, ano_fim, rotulo, lema, texto`, [Number(params[0]), ...campos.map((c) => lido.dados[c])]);
    const mudou = diff(antes, lido.dados);
    if (Object.keys(mudou).length) await auditar(ctx, 'era.editar', 'eras:' + params[0], { campos: mudou });
    return send(res, 200, { ok: true, era: nova });
  });
}
