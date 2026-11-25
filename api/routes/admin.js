// Rotas /api/admin/*: o roteador já exigiu o token de admin antes de chegar aqui.
// (O token fixo é "chave de emergência" e sai quando o login por patente entrar.)
import { send, lerJson } from '../lib/http.js';
import { auditar } from '../lib/auditoria.js';

const csvCell = (v) => {
  let s = Array.isArray(v) ? v.join('; ') : v instanceof Date ? v.toISOString() : String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita injeção de fórmula em planilhas
  return '"' + s.replace(/"/g, '""') + '"';
};

export default function registrar(r) {
  r.get('/api/admin/contribuidores', async ({ res, pool }) => {
    const { rows } = await pool.query('SELECT * FROM contribuidores ORDER BY criado_em DESC LIMIT 5000');
    return send(res, 200, { items: rows });
  });

  r.get('/api/admin/contribuidores.csv', async ({ res, pool }) => {
    const { rows } = await pool.query('SELECT * FROM contribuidores ORDER BY criado_em DESC');
    const cols = ['id', 'nome', 'nick', 'discord', 'areas', 'area_outros', 'horas_semana', 'experiencia', 'ferramentas', 'mensagem', 'criado_em'];
    const csv = '﻿' + [cols.join(','), ...rows.map((x) => cols.map((c) => csvCell(x[c])).join(','))].join('\r\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="contribuidores.csv"',
      'Cache-Control': 'no-store'
    });
    return res.end(csv);
  });

  r.delete(/^\/api\/admin\/feedback\/(\d+)$/, async (ctx) => {
    const { res, pool, params } = ctx;
    const d = await pool.query('DELETE FROM feedback WHERE id = $1', [params[0]]);
    if (d.rowCount) await auditar(ctx, 'feedback.excluir', 'feedback:' + params[0]);
    return send(res, d.rowCount ? 200 : 404, { ok: !!d.rowCount });
  });

  r.get('/api/admin/comentarios', async ({ res, pool }) => {
    const { rows } = await pool.query('SELECT * FROM comentarios ORDER BY criado_em DESC LIMIT 1000');
    return send(res, 200, { items: rows });
  });

  r.delete(/^\/api\/admin\/comentarios\/(\d+)$/, async (ctx) => {
    const { res, pool, params } = ctx;
    const d = await pool.query('DELETE FROM comentarios WHERE id = $1', [params[0]]);
    if (d.rowCount) await auditar(ctx, 'comentario.excluir', 'comentarios:' + params[0]);
    return send(res, d.rowCount ? 200 : 404, { ok: !!d.rowCount });
  });

  r.get('/api/admin/links', async ({ res, pool }) => {
    const { rows } = await pool.query(
      `SELECT id, meme_id, yt, autor, status, criado_em, revisado_em FROM links_sugeridos
        ORDER BY (status = 'pendente') DESC, criado_em DESC LIMIT 1000`);
    return send(res, 200, { items: rows });
  });

  r.post(/^\/api\/admin\/links\/(\d+)$/, async (ctx) => {
    const { req, res, pool, params } = ctx;
    const b = await lerJson(req);
    if (b === undefined) return send(res, 400, { erro: 'json inválido' });
    const st = b.status === 'aprovado' ? 'aprovado' : b.status === 'recusado' ? 'recusado' : null;
    if (!st) return send(res, 400, { erro: 'status inválido' });
    const d = await pool.query('UPDATE links_sugeridos SET status = $1, revisado_em = now() WHERE id = $2', [st, params[0]]);
    if (d.rowCount) await auditar(ctx, 'link.' + (st === 'aprovado' ? 'aprovar' : 'recusar'), 'links_sugeridos:' + params[0]);
    return send(res, d.rowCount ? 200 : 404, { ok: !!d.rowCount });
  });

  r.get('/api/admin/feedback', async ({ res, pool }) => {
    const { rows } = await pool.query('SELECT * FROM feedback ORDER BY criado_em DESC LIMIT 1000');
    return send(res, 200, { items: rows });
  });

  r.delete(/^\/api\/admin\/contribuidores\/(\d+)$/, async (ctx) => {
    const { res, pool, params } = ctx;
    const d = await pool.query('DELETE FROM contribuidores WHERE id = $1', [params[0]]);
    if (d.rowCount) await auditar(ctx, 'contribuidor.excluir', 'contribuidores:' + params[0]);
    return send(res, d.rowCount ? 200 : 404, { ok: !!d.rowCount });
  });

  // log de auditoria (somente leitura). Filtros: acao, usuario_id; paginação por cursor: antes=<id> (mais antigos que ele).
  r.get('/api/admin/log', async ({ res, pool, url }) => {
    const q = url.searchParams;
    const limite = Math.min(Math.max(parseInt(q.get('limite'), 10) || 50, 1), 200);
    const onde = [], val = [];
    const add = (cond, v) => { val.push(v); onde.push(cond.replace('?', '$' + val.length)); };
    if (/^[a-z_.]{1,60}$/.test(q.get('acao') || '')) add('l.acao = ?', q.get('acao'));
    if (/^\d{1,18}$/.test(q.get('usuario_id') || '')) add('l.usuario_id = ?', q.get('usuario_id'));
    if (/^\d{1,18}$/.test(q.get('antes') || '')) add('l.id < ?', q.get('antes'));
    val.push(limite + 1);
    const { rows } = await pool.query(
      `SELECT l.id, l.usuario_id, u.apelido, l.acao, l.alvo, l.detalhe, l.criado_em
         FROM log_auditoria l LEFT JOIN usuarios u ON u.id = l.usuario_id
        ${onde.length ? 'WHERE ' + onde.join(' AND ') : ''}
        ORDER BY l.id DESC LIMIT $${val.length}`, val);
    const mais = rows.length > limite;
    const items = mais ? rows.slice(0, limite) : rows;
    return send(res, 200, { items, proximo: mais ? items[items.length - 1].id : null });
  });

}
