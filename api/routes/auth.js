// Login com Discord, sessão e perfil: GET /api/auth/discord, GET /api/auth/discord/callback, POST /api/auth/sair, GET /api/eu.
// Config em ctx.auth = { discord (lerConfigDiscord | null), fetch, cookieSecure, origemSite }.
import { send, limited, lerJson } from '../lib/http.js';
import { lerCookies, montarCookie, apagarCookie } from '../lib/cookies.js';
import { verificarCsrf } from '../lib/csrf.js';
import { patenteDoUsuario } from '../lib/patente.js';
import { papelDoUsuario } from '../lib/papel.js';
import { ErroNegocio, carteira } from '../economia/servico.js';
import { lerPerfil, atualizarPerfil } from './../auth/perfil.js';
import {
  caminhoSeguro, comParametro, novoState, empacotarState, desempacotarState, stateConfere, urlDeAutorizacao,
  trocarCodigo, buscarPerfil, ehMembro, acharOuCriarUsuario, ErroDiscord, chaveDoState, VALIDADE_STATE_S
} from '../auth/discord.js';
import { COOKIE_SESSAO, criarSessao, resolverSessao, apagarSessao } from '../auth/sessao.js';

const COOKIE_STATE = 'ns_oauth';
const PATH_STATE = '/api/auth'; // o cookie do state só viaja para as rotas de auth
const LIMITE_AUTH = 30;         // por IP, janela de 10 min

const indisponivel = (res) => send(res, 503, { erro: 'login indisponível no momento' });
const redirecionar = (res, destino, cookies = []) => {
  res.writeHead(302, { Location: destino, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(cookies.length ? { 'Set-Cookie': cookies } : {}) });
  res.end();
};

export default function registrar(r) {
  // 1) começa o login: guarda o state (anti-CSRF) e o destino num cookie e manda para o Discord
  r.get('/api/auth/discord', async ({ res, url, ip, auth }) => {
    if (limited('auth:' + ip, LIMITE_AUTH)) return send(res, 429, { erro: 'Muitas tentativas. Aguarde um pouco.' });
    if (!auth?.discord) return indisponivel(res);
    const voltar = caminhoSeguro(url.searchParams.get('voltar'));
    const state = novoState();
    return redirecionar(res, urlDeAutorizacao(auth.discord, state), [
      montarCookie(COOKIE_STATE, empacotarState(state, voltar, chaveDoState(auth.discord)), { maxAge: VALIDADE_STATE_S, path: PATH_STATE, secure: auth.cookieSecure })
    ]);
  });

  // 2) volta do Discord: confere o state, troca o code, cria/atualiza o usuário e abre a sessão
  r.get('/api/auth/discord/callback', async ({ req, res, url, pool, ip, auth }) => {
    if (limited('auth:' + ip, LIMITE_AUTH)) return send(res, 429, { erro: 'Muitas tentativas. Aguarde um pouco.' });
    if (!auth?.discord) return indisponivel(res);
    const limpaState = apagarCookie(COOKIE_STATE, { path: PATH_STATE, secure: auth.cookieSecure });

    const guardado = desempacotarState(lerCookies(req.headers.cookie)[COOKIE_STATE], chaveDoState(auth.discord));
    // o state é de uso único: some do navegador em qualquer desfecho
    if (!guardado || !stateConfere(guardado.state, url.searchParams.get('state'))) {
      return send(res, 400, { erro: 'estado de login inválido ou expirado; comece de novo' }, { 'Set-Cookie': limpaState });
    }
    const voltar = caminhoSeguro(guardado.voltar); // revalida: o cookie vem do navegador
    const para = (motivo) => redirecionar(res, comParametro(voltar, 'login', motivo), [limpaState]);

    if (url.searchParams.get('error')) return para('negado'); // usuário cancelou no Discord
    const code = url.searchParams.get('code');
    if (!code || code.length > 512) return para('erro');

    let perfil;
    try {
      const token = await trocarCodigo(auth.discord, code, auth.fetch);
      perfil = await buscarPerfil(token, auth.fetch);
      if (auth.discord.exigirMembro && !(await ehMembro(token, auth.discord.guildId, auth.fetch))) return para('nao_membro');
    } catch (e) {
      if (!(e instanceof ErroDiscord)) throw e;
      console.error(new Date().toISOString(), 'login discord falhou:', e.message); // só o motivo; nunca code/token/segredo
      return para('erro');
    }

    const usuario = await acharOuCriarUsuario(pool, perfil);
    if (usuario.banido) return para('banido'); // conta suspensa: sem sessão

    const sessao = await criarSessao(pool, { usuarioId: usuario.id, ip, userAgent: req.headers['user-agent'] });
    return redirecionar(res, caminhoSeguro(voltar), [
      limpaState,
      montarCookie(COOKIE_SESSAO, sessao.token, { maxAge: sessao.maxAge, secure: auth.cookieSecure })
    ]);
  });

  // encerra a sessão (CSRF: precisa do X-CSRF da própria sessão). Sem sessão válida: só limpa o cookie.
  r.post('/api/auth/sair', async ({ req, res, pool, ip, auth }) => {
    if (limited('auth:' + ip, LIMITE_AUTH)) return send(res, 429, { erro: 'Muitas tentativas. Aguarde um pouco.' });
    const token = lerCookies(req.headers.cookie)[COOKIE_SESSAO];
    const limpa = apagarCookie(COOKIE_SESSAO, { secure: auth?.cookieSecure !== false });
    const s = token ? await resolverSessao(pool, token) : null;
    if (s) {
      const erro = verificarCsrf(req, s.csrf, auth?.origemSite);
      if (erro) return send(res, 403, { erro });
      await apagarSessao(pool, token);
    }
    return send(res, 200, { ok: true }, { 'Set-Cookie': limpa });
  });

  // quem sou eu: perfil, patente (pelo XP, no servidor), saldo e o token CSRF desta sessão
  r.get('/api/eu', async ({ res, pool, usuario }) => {
    let atual, proxima, c, perfil, papel;
    try {
      [{ atual, proxima }, c, perfil, papel] = await Promise.all([
        patenteDoUsuario(pool, usuario.id),
        carteira(pool, usuario),
        lerPerfil(pool, usuario.id),
        papelDoUsuario(pool, usuario.id)
      ]);
    } catch (e) {
      if (e instanceof ErroNegocio) return send(res, e.status, { erro: e.message });
      throw e;
    }
    return send(res, 200, {
      usuario: perfil,
      patente: atual && { id: atual.id, nome: atual.nome, cor: atual.cor, xp_minimo: atual.xp_minimo },
      proxima_patente: proxima && { id: proxima.id, nome: proxima.nome, xp_minimo: proxima.xp_minimo, faltam: proxima.xp_minimo - c.xp },
      papel, // usuario | moderador | admin: o front só mostra Moderação/Admin a quem tem o papel (a API confere de novo)
      moedas: c.moedas, xp: c.xp,
      csrf: usuario.csrf || null // enviar em X-CSRF nas chamadas que alteram dados
    });
  }, { autenticada: true });

  // edita o perfil: apelido, gato (avatar padrão) e usar_foto. A 1ª vez que o gato é salvo completa o cadastro e dá o pacote de boas-vindas.
  r.patch('/api/eu', async ({ req, res, pool, usuario }) => {
    if (limited('perfil:' + usuario.id, 30)) return send(res, 429, { erro: 'Muitas alterações. Aguarde um pouco.' });
    const corpo = await lerJson(req);
    if (corpo === undefined) return send(res, 400, { erro: 'json inválido' });
    try {
      return send(res, 200, await atualizarPerfil(pool, usuario, corpo));
    } catch (e) {
      if (e instanceof ErroNegocio) {
        const cab = e.extra?.tente_em_segundos ? { 'Retry-After': String(e.extra.tente_em_segundos) } : {};
        return send(res, e.status, { erro: e.message, ...(e.campo ? { campo: e.campo } : {}), ...(e.extra || {}) }, cab);
      }
      throw e;
    }
  }, { autenticada: true });
}
