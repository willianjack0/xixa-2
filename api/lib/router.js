// Roteador mínimo: cada módulo em routes/ registra suas rotas; aqui só casa método + caminho.
// Caminho pode ser string exata ou RegExp (grupos de captura viram ctx.params).
// Rotas em /api/admin/ exigem o token de admin ANTES de casar (qualquer caminho sob /api/admin/ sem token = 401).
import { send, ehAdmin, ipDe } from './http.js';
import { verificarCsrf, METODOS_SEGUROS } from './csrf.js';
import { exigePatente } from './patente.js';
import { exigePapel, papelDoUsuario, papelAtinge } from './papel.js';

// Opções de rota: { autenticada: true } exige usuário (sessão do login Discord; stub só em dev/teste);
//                   { patente: 'moderador' } além disso exige essa patente ou maior (calculada do XP, no servidor).
//                   { papel: 'moderador' | 'admin' } exige esse papel (coluna usuarios.papel, lida do banco a cada chamada).
// /api/admin/*: vale o token de emergência OU sessão de um usuário com papel admin.
// Sessão por cookie + método que altera dados => CSRF obrigatório (header X-CSRF + Origin). Ver lib/csrf.js.
export function criarRouter({ pool, adminToken = '', autenticar = null, extras = {} }) {
  const rotas = [];
  const add = (metodo, caminho, tratador, opcoes = {}) => rotas.push({ metodo, caminho, tratador, ...opcoes });
  const r = {
    get: (c, t, o) => add('GET', c, t, o),
    post: (c, t, o) => add('POST', c, t, o),
    patch: (c, t, o) => add('PATCH', c, t, o),
    delete: (c, t, o) => add('DELETE', c, t, o),
    rotas
  };

  r.tratar = async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const ip = ipDe(req);
    try {
      let adminPorSessao = null;
      if (url.pathname.startsWith('/api/admin/') && !ehAdmin(req, adminToken)) {
        // sem o token: aceita sessão de admin (cookie + CSRF nos métodos que alteram dados)
        const u = autenticar && !req.headers.authorization ? await autenticar(req, pool) : null;
        const ok = u && !u.banido && papelAtinge(await papelDoUsuario(pool, u.id), 'admin')
          && !(u.via === 'sessao' && !METODOS_SEGUROS.has(req.method) && verificarCsrf(req, u.csrf, extras.auth?.origemSite));
        if (!ok) return send(res, 401, { error: 'Token inválido.' }, { 'WWW-Authenticate': 'Bearer' });
        adminPorSessao = u;
      }
      for (const rota of rotas) {
        if (rota.metodo !== req.method) continue;
        let params = [];
        if (typeof rota.caminho === 'string') { if (rota.caminho !== url.pathname) continue; }
        else { const m = rota.caminho.exec(url.pathname); if (!m) continue; params = m.slice(1); }
        const ctx = { req, res, url, ip, params, pool, adminToken, adminPorSessao, ...extras };
        if (rota.autenticada || rota.patente || rota.papel) {
          const usuario = autenticar ? await autenticar(req, pool) : null;
          if (!usuario) return send(res, 401, { erro: 'login necessário' });
          if (usuario.banido) return send(res, 403, { erro: 'conta suspensa' });
          if (usuario.setCookie) res.setHeader('Set-Cookie', usuario.setCookie); // sessão renovada
          if (usuario.via === 'sessao' && !METODOS_SEGUROS.has(req.method)) {
            const erro = verificarCsrf(req, usuario.csrf, extras.auth?.origemSite);
            if (erro) return send(res, 403, { erro });
          }
          ctx.usuario = usuario;
          if (rota.patente && !(await exigePatente(rota.patente)(ctx))) return; // já respondeu 403
          if (rota.papel && !(await exigePapel(rota.papel)(ctx))) return; // já respondeu 403
        }
        return await rota.tratador(ctx);
      }
      return send(res, 404, { error: 'Não encontrado.' });
    } catch (e) {
      console.error(new Date().toISOString(), e.message);
      return send(res, 500, { error: 'Erro interno.' });
    }
  };
  return r;
}
