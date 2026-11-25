// Autenticador ÚNICO das rotas autenticadas (router: opção { autenticada: true }).
// 1) cookie de sessão (login Discord)  2) stub de teste (X-Test-User), só se o auth-stub estiver ligado pela allowlist.
// Devolve { id, apelido, banido, via: 'sessao' | 'stub', csrf?, setCookie? } ou null.
import { lerCookies, montarCookie } from '../lib/cookies.js';
import { COOKIE_SESSAO, resolverSessao } from './sessao.js';

export function criarAutenticador({ stub = null, cookieSecure = true, agora = () => new Date() } = {}) {
  return async function autenticar(req, pool) {
    const token = lerCookies(req.headers.cookie)[COOKIE_SESSAO];
    if (token) {
      const s = await resolverSessao(pool, token, agora());
      if (s) {
        return {
          ...s.usuario, via: 'sessao', csrf: s.csrf,
          setCookie: s.renovada ? montarCookie(COOKIE_SESSAO, token, { maxAge: s.maxAge, secure: cookieSecure }) : undefined
        };
      }
    }
    if (stub) {
      const u = await stub(req, pool);
      if (u) return { ...u, via: 'stub' };
    }
    return null;
  };
}
