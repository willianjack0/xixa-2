// Admin · usuários: listar, mudar papel e banir/desbanir. Tudo sob /api/admin/ (sessão de admin ou token de emergência).
// Regras:
//  - ninguém muda o próprio papel nem se bane (o token de emergência não tem "si mesmo", então pode tudo);
//  - admin de sessão não mexe em outro admin (só o token de emergência rebaixa ou bane um admin): evita guerra de admins;
//  - toda mudança grava em log_auditoria; banir também apaga as sessões da pessoa (cai na hora).
import { send, lerJson } from '../lib/http.js';
import { auditar } from '../lib/auditoria.js';
import { PAPEIS } from '../lib/papel.js';

const ID = /^\d{1,18}$/;
const CAMPOS = 'id, apelido, papel, xp, moedas, banido, criado_em, ultimo_acesso';
const escaparLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

export default function registrar(r) {
  // lista com filtros: busca (apelido contém), papel, banido=1|0; cursor antes=<id>; limite até 200
  r.get('/api/admin/usuarios', async ({ res, pool, url }) => {
    const q = url.searchParams;
    const limite = Math.min(Math.max(parseInt(q.get('limite'), 10) || 50, 1), 200);
    const onde = [], val = [];
    const add = (cond, v) => { val.push(v); onde.push(cond.replace('?', '$' + val.length)); };
    if (/^[A-Za-z0-9_.\-]{1,20}$/.test(q.get('busca') || '')) add("lower(apelido) LIKE lower(?) ESCAPE '\\'", '%' + escaparLike(q.get('busca')) + '%');
    if (PAPEIS.includes(q.get('papel'))) add('papel = ?', q.get('papel'));
    if (q.get('banido') === '1' || q.get('banido') === '0') add('banido = ?', q.get('banido') === '1');
    if (ID.test(q.get('antes') || '')) add('id < ?', q.get('antes'));
    val.push(limite + 1);
    const { rows } = await pool.query(
      `SELECT ${CAMPOS} FROM usuarios ${onde.length ? 'WHERE ' + onde.join(' AND ') : ''} ORDER BY id DESC LIMIT $${val.length}`, val);
    const mais = rows.length > limite;
    const items = mais ? rows.slice(0, limite) : rows;
    return send(res, 200, { items, proximo: mais ? items[items.length - 1].id : null });
  });

  // alvo da ação: existe? é o próprio? é admin e quem age é admin de sessão? Devolve a linha ou já responde o erro.
  async function alvoDaAcao(ctx, id) {
    const { res, pool, adminPorSessao } = ctx;
    if (!ID.test(id)) { send(res, 400, { erro: 'id inválido' }); return null; }
    const { rows: [u] } = await pool.query(`SELECT ${CAMPOS} FROM usuarios WHERE id = $1`, [id]);
    if (!u) { send(res, 404, { erro: 'usuário não encontrado' }); return null; }
    if (adminPorSessao && Number(adminPorSessao.id) === Number(u.id)) { send(res, 403, { erro: 'você não pode alterar a própria conta aqui' }); return null; }
    if (adminPorSessao && u.papel === 'admin') { send(res, 403, { erro: 'só o token de emergência altera outro admin' }); return null; }
    return u;
  }

  // muda o papel: { papel: 'usuario' | 'moderador' | 'admin' }
  r.post(/^\/api\/admin\/usuarios\/(\d+)\/papel$/, async (ctx) => {
    const { req, res, pool, params } = ctx;
    const b = await lerJson(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return send(res, 400, { erro: 'json inválido' });
    if (!PAPEIS.includes(b.papel)) return send(res, 400, { erro: 'papel inválido', validos: PAPEIS });
    const u = await alvoDaAcao(ctx, params[0]);
    if (!u) return;
    if (u.papel === b.papel) return send(res, 200, { ok: true, sem_mudanca: true, usuario: u });
    const { rows: [novo] } = await pool.query(`UPDATE usuarios SET papel = $2 WHERE id = $1 RETURNING ${CAMPOS}`, [u.id, b.papel]);
    await auditar(ctx, 'usuario.papel', 'usuarios:' + u.id, { de: u.papel, para: b.papel });
    return send(res, 200, { ok: true, usuario: novo });
  });

  // bane ou desbane: { banido: true|false, motivo?: string (até 200) }. Banir apaga as sessões da pessoa.
  r.post(/^\/api\/admin\/usuarios\/(\d+)\/banir$/, async (ctx) => {
    const { req, res, pool, params } = ctx;
    const b = await lerJson(req);
    if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.banido !== 'boolean') return send(res, 400, { erro: 'envie { banido: true | false }' });
    const motivo = typeof b.motivo === 'string' ? b.motivo.trim().slice(0, 200) : '';
    const u = await alvoDaAcao(ctx, params[0]);
    if (!u) return;
    if (u.banido === b.banido) return send(res, 200, { ok: true, sem_mudanca: true, usuario: u });
    const { rows: [novo] } = await pool.query(`UPDATE usuarios SET banido = $2 WHERE id = $1 RETURNING ${CAMPOS}`, [u.id, b.banido]);
    if (b.banido) await pool.query('DELETE FROM sessoes WHERE usuario_id = $1', [u.id]);
    await auditar(ctx, b.banido ? 'usuario.banir' : 'usuario.desbanir', 'usuarios:' + u.id, motivo ? { motivo } : {});
    return send(res, 200, { ok: true, usuario: novo });
  });
}
