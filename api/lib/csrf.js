// CSRF para rotas autenticadas por COOKIE de sessão (o stub de teste usa header e não precisa).
// Duas travas: (1) header X-CSRF com o token ligado à sessão; (2) se o navegador mandou Origin, ele tem de ser o do site.
// O token é derivado do token da sessão (api/auth/sessao.js: csrfDe), que só o dono do cookie conhece;
// ele é entregue ao front em GET /api/eu.
import { timingSafeEqual } from 'node:crypto';

export const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

const igual = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

/** Devolve null se ok, ou a mensagem de erro (para responder 403). */
export function verificarCsrf(req, esperado, origemSite = '') {
  const origem = req.headers.origin;
  if (origem !== undefined && origemSite && origem !== origemSite) return 'origem não permitida';
  if (origem === 'null') return 'origem não permitida';
  if (!igual(req.headers['x-csrf'], esperado)) return 'token CSRF ausente ou inválido (header X-CSRF)';
  return null;
}
