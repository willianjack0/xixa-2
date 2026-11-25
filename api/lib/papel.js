// Papel do usuário (usuario < moderador < admin), lido do banco a cada chamada: nunca confie em papel vindo do cliente.
// Diferente da patente (XP): o papel dá acesso à moderação e ao admin e só muda por decisão de um admin.
import { send } from './http.js';

export const PAPEIS = ['usuario', 'moderador', 'admin'];
export const nivelDoPapel = (p) => Math.max(0, PAPEIS.indexOf(p));
export const papelAtinge = (papel, minimo) => nivelDoPapel(papel) >= nivelDoPapel(minimo);

export async function papelDoUsuario(db, usuarioId) {
  const { rows } = await db.query('SELECT papel FROM usuarios WHERE id = $1 AND NOT banido', [usuarioId]);
  return rows[0]?.papel || 'usuario';
}

/** exigePapel('moderador') → (ctx) => Promise<boolean>. Responde 403 sozinho e devolve false se o papel for menor. */
export const exigePapel = (minimo) => async (ctx) => {
  if (!PAPEIS.includes(minimo)) throw new Error(`exigePapel: papel desconhecido "${minimo}"`);
  const papel = await papelDoUsuario(ctx.pool, ctx.usuario.id);
  if (!papelAtinge(papel, minimo)) {
    send(ctx.res, 403, { erro: `exige o papel ${minimo}`, papel_atual: papel });
    return false;
  }
  ctx.papel = papel;
  return true;
};
