// Chaves de API do MCP. Formato: "ns_mcp_" + 43 caracteres base64url (32 bytes aleatórios). No banco só o hash.
// A chave vale enquanto: não foi revogada, não expirou e o dono continua admin e não banido (conferido a CADA chamada).
import { randomBytes, createHash } from 'node:crypto';

export const ESCOPOS = ['ler', 'escrever', 'publicar'];
export const VALIDADES_DIAS = [30, 90, 180, 365];
export const MAX_ATIVAS_POR_USUARIO = 5;
const PREFIXO_CHAVE = 'ns_mcp_';
const FORMATO = /^ns_mcp_[A-Za-z0-9_-]{43}$/;
const UM_MINUTO = 60_000;

export const hashDe = (chave) => createHash('sha256').update(chave).digest('hex');

/** { chave, prefixo, hash }: o segredo só existe aqui; quem chama mostra uma vez e esquece. */
export function gerarChave() {
  const chave = PREFIXO_CHAVE + randomBytes(32).toString('base64url');
  return { chave, prefixo: chave.slice(PREFIXO_CHAVE.length, PREFIXO_CHAVE.length + 8), hash: hashDe(chave) };
}

/** Extrai a chave de "Authorization: Bearer ns_mcp_..." ou devolve null se faltar ou for de outro formato. */
export function chaveDoCabecalho(req) {
  const h = String(req.headers.authorization || '');
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m && FORMATO.test(m[1]) ? m[1] : null;
}

export const estadoDaChave = (c, agora = new Date()) =>
  c.revogada_em ? 'revogada' : new Date(c.expira_em) <= agora ? 'expirada' : 'ativa';

/**
 * Confere a chave e devolve { chave_id, usuario_id, apelido, escopos } ou null (qualquer motivo: formato, desconhecida,
 * revogada, expirada, dono banido ou que deixou de ser admin; a resposta é a mesma para não dar pista).
 * Registra o último uso (no máximo 1 gravação por minuto por chave).
 */
export async function verificarChave(db, chave, { ip = null, agora = new Date() } = {}) {
  if (typeof chave !== 'string' || !FORMATO.test(chave)) return null;
  const { rows: [c] } = await db.query(
    `SELECT k.id, k.usuario_id, k.escopos, k.expira_em, k.revogada_em, k.ultimo_uso_em, u.apelido, u.papel, u.banido
       FROM chaves_api k JOIN usuarios u ON u.id = k.usuario_id WHERE k.hash = $1`, [hashDe(chave)]);
  if (!c || estadoDaChave(c, agora) !== 'ativa' || c.banido || c.papel !== 'admin') return null;
  if (!c.ultimo_uso_em || agora - new Date(c.ultimo_uso_em) > UM_MINUTO) {
    await db.query('UPDATE chaves_api SET ultimo_uso_em = $2, ultimo_ip = $3 WHERE id = $1', [c.id, agora, ip ? String(ip).slice(0, 64) : null]);
  }
  return { chave_id: Number(c.id), usuario_id: Number(c.usuario_id), apelido: c.apelido, escopos: c.escopos };
}
