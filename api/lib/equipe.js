// Equipe do site (quem criou o Não Salvo), pelo ID do Discord: o apelido muda e pode ser pego por outra pessoa, o ID não.
// Tabela `equipe` (migração 019). Papel aplicado uma vez; patente fixa e edição direta são lidas a cada chamada.
import { papelDoUsuario, papelAtinge } from './papel.js';
import { auditar } from './auditoria.js';

const DA_EQUIPE = `FROM contas_oauth c JOIN equipe e ON e.discord_id = c.provedor_id
  WHERE c.provedor = 'discord' AND c.usuario_id = $1 LIMIT 1`;

/** { patente_fixa, edita_direto } de quem é da equipe; null para os demais. */
export async function equipeDoUsuario(db, usuarioId) {
  const { rows } = await db.query(`SELECT e.patente_fixa, e.edita_direto ${DA_EQUIPE}`, [usuarioId]);
  return rows[0] || null;
}

/** Aplica o papel da equipe UMA vez (no 1º login). Só sobe quem está como 'usuario'; depois, quem decide é o admin. */
export async function aplicarEquipe(db, usuarioId) {
  const { rows } = await db.query(
    `WITH ap AS (
       UPDATE equipe e SET aplicado_em = now() FROM contas_oauth c
        WHERE c.provedor = 'discord' AND c.provedor_id = e.discord_id AND c.usuario_id = $1 AND e.aplicado_em IS NULL
       RETURNING e.papel, e.discord_id)
     UPDATE usuarios u SET papel = ap.papel FROM ap WHERE u.id = $1 AND ap.papel IS NOT NULL AND u.papel = 'usuario'
     RETURNING u.id, u.papel, ap.discord_id`, [usuarioId]);
  if (rows.length) {
    await auditar({ pool: db, usuario: { id: usuarioId } }, 'usuario.papel', 'usuarios:' + usuarioId, {
      de: 'usuario',
      para: rows[0].papel,
      origem: 'equipe',
      motivo: 'papel concedido pela lista da equipe',
      discord_id: rows[0].discord_id
    });
  }
}

/** Publica sem fila (Memepédia e links): equipe com edita_direto ou admin. Moderador comum não publica direto. */
export async function podeEditarDireto(db, usuarioId) {
  const [eq, papel] = await Promise.all([equipeDoUsuario(db, usuarioId), papelDoUsuario(db, usuarioId)]);
  return !!(eq && eq.edita_direto) || papel === 'admin';
}

/** Patente com a fixa: vale a maior entre a do XP e a fixa (se existir na tabela). Próxima = a seguinte à atual. */
export function comPatenteFixa(patentes, xp, fixaId) {
  if (!patentes.length) return { atual: null, proxima: null };
  let atual = patentes.reduce((p, k) => (xp >= k.xp_minimo ? k : p), patentes[0]);
  const fixa = fixaId ? patentes.find((p) => p.id === fixaId) : null;
  if (fixa && fixa.xp_minimo > atual.xp_minimo) atual = fixa;
  const proxima = patentes.find((p) => p.xp_minimo > atual.xp_minimo) || null;
  return { atual, proxima };
}

/** Subconsulta SQL (para listas como o ranking): patente fixa do usuário `u`. */
export const PATENTE_FIXA_SQL = `(SELECT e.patente_fixa FROM contas_oauth c JOIN equipe e ON e.discord_id = c.provedor_id
  WHERE c.provedor = 'discord' AND c.usuario_id = u.id LIMIT 1) AS patente_fixa`;
