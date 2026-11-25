// Sessões: cookie httpOnly com um token aleatório; no banco (tabela sessoes) fica só o HASH do token.
// Quem copiar o banco não consegue usar as sessões. O token de CSRF é derivado do token da sessão.
import { createHash, randomBytes } from 'node:crypto';

export const COOKIE_SESSAO = 'ns_sessao';
const DIA = 86_400_000;
export const VIDA_DA_SESSAO = 30 * DIA;   // expira 30 dias depois do último uso renovado
export const LIMITE_ABSOLUTO = 90 * DIA;  // nenhuma sessão passa de 90 dias desde a criação, por mais que renove
const MAX_SESSOES_POR_USUARIO = 10;       // a mais antiga cai quando entra a 11ª

export const novoToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
export const csrfDe = (token) => createHash('sha256').update('csrf:' + token).digest('base64url');

export async function criarSessao(pool, { usuarioId, ip = null, userAgent = null, agora = new Date() }) {
  const token = novoToken();
  const expiraEm = new Date(agora.getTime() + VIDA_DA_SESSAO);
  await pool.query(
    'INSERT INTO sessoes (id, usuario_id, criada_em, expira_em, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6)',
    [hashToken(token), usuarioId, agora, expiraEm, ip && String(ip).slice(0, 64), userAgent && String(userAgent).slice(0, 255)]);
  await pool.query(
    `DELETE FROM sessoes WHERE usuario_id = $1 AND id NOT IN
       (SELECT id FROM sessoes WHERE usuario_id = $1 ORDER BY criada_em DESC, id LIMIT ${MAX_SESSOES_POR_USUARIO})`, [usuarioId]);
  return { token, expiraEm, maxAge: VIDA_DA_SESSAO / 1000 };
}

/**
 * Resolve o token do cookie em { usuario, csrf, renovada?, maxAge? } ou null (inexistente ou expirada).
 * Renovação deslizante: se passou mais de 1 dia desde a última renovação, empurra a expiração (até o limite absoluto).
 */
export async function resolverSessao(pool, token, agora = new Date()) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const { rows } = await pool.query(
    `SELECT s.criada_em, s.expira_em, u.id, u.apelido, u.banido
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.id = $1 AND s.expira_em > $2`, [hashToken(token), agora]);
  if (!rows.length) return null;
  const s = rows[0];
  const novaExpiracao = new Date(Math.min(agora.getTime() + VIDA_DA_SESSAO, new Date(s.criada_em).getTime() + LIMITE_ABSOLUTO));
  let renovada = false;
  if (novaExpiracao.getTime() - new Date(s.expira_em).getTime() > DIA) {
    await pool.query('UPDATE sessoes SET expira_em = $2 WHERE id = $1', [hashToken(token), novaExpiracao]);
    renovada = true;
  }
  return {
    usuario: { id: Number(s.id), apelido: s.apelido, banido: s.banido },
    csrf: csrfDe(token),
    renovada,
    maxAge: renovada ? Math.floor((novaExpiracao.getTime() - agora.getTime()) / 1000) : null
  };
}

export async function apagarSessao(pool, token) {
  if (!token) return 0;
  return (await pool.query('DELETE FROM sessoes WHERE id = $1', [hashToken(token)])).rowCount;
}

/** Limpeza das expiradas (roda na subida e a cada hora; a leitura já ignora expiradas). */
export async function limparExpiradas(pool, agora = new Date()) {
  return (await pool.query('DELETE FROM sessoes WHERE expira_em <= $1', [agora])).rowCount;
}
