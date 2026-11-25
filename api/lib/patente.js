// Patente calculada no servidor a partir do XP do razão (eventos_xp) e da tabela `patentes`.
// Nunca confie em patente vinda do cliente.
import { send } from './http.js';
import { equipeDoUsuario, comPatenteFixa } from './equipe.js';

export const patenteDeXp = (patentes, xp) => patentes.reduce((p, k) => (xp >= k.xp_minimo ? k : p), patentes[0]);

export async function listarPatentes(db) {
  return (await db.query('SELECT id, nome, xp_minimo, cor, permissoes FROM patentes ORDER BY xp_minimo')).rows;
}

export async function xpDoUsuario(db, usuarioId) {
  const { rows } = await db.query('SELECT COALESCE(sum(valor),0)::bigint AS xp FROM eventos_xp WHERE usuario_id = $1', [usuarioId]);
  return Number(rows[0].xp);
}

/** { xp, atual, proxima } ; atual = null se a tabela patentes estiver vazia (seed não rodou). */
export async function patenteDoUsuario(db, usuarioId) {
  const [patentes, xp, eq] = await Promise.all([listarPatentes(db), xpDoUsuario(db, usuarioId), equipeDoUsuario(db, usuarioId)]);
  if (!patentes.length) return { xp, atual: null, proxima: null, patentes };
  // equipe do site pode ter patente fixa (selo): vale a maior entre a do XP e a fixa
  const { atual, proxima } = comPatenteFixa(patentes, xp, eq && eq.patente_fixa);
  return { xp, atual, proxima, patentes };
}

const norm = (s) => String(s).trim().toLowerCase();

/**
 * Middleware de rota: exigePatente('moderador') → (ctx) => Promise<boolean>.
 * Responde 403 sozinho e devolve false se a patente do usuário (pelo XP) for menor que a pedida.
 * Aceita o id ('banda_larga') ou o nome ('Banda larga') da patente. Patente inexistente = erro de programação (500).
 */
export const exigePatente = (nome) => async (ctx) => {
  const { patentes, atual } = await patenteDoUsuario(ctx.pool, ctx.usuario.id);
  if (!patentes.length) {
    console.error(new Date().toISOString(), 'exigePatente: tabela patentes vazia (rode o seed)');
    send(ctx.res, 503, { erro: 'serviço indisponível, tente mais tarde' });
    return false;
  }
  const pedida = patentes.find((p) => norm(p.id) === norm(nome) || norm(p.nome) === norm(nome));
  if (!pedida) throw new Error(`exigePatente: patente desconhecida "${nome}"`);
  if (atual.xp_minimo < pedida.xp_minimo) { // patente fixa da equipe conta (comPatenteFixa)
    send(ctx.res, 403, { erro: `exige a patente ${pedida.nome}`, patente_atual: atual.nome });
    return false;
  }
  ctx.patente = atual;
  return true;
};
