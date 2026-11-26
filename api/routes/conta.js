// Exclusão da própria conta (LGPD): POST /api/eu/excluir { confirmar: "<seu apelido>" }.
// Anonimiza numa transação (lib/lgpd.js), encerra a sessão e limpa o cookie. Só atua na conta da própria sessão:
// não existe parâmetro de id, então não há como excluir a conta de outra pessoa (IDOR).
// Autenticada: o router já exige a sessão e, no cookie, o CSRF (X-CSRF + Origin) antes de chegar aqui.
import { send, limited, lerJson } from '../lib/http.js';
import { apagarCookie } from '../lib/cookies.js';
import { COOKIE_SESSAO } from '../auth/sessao.js';
import { excluirConta, ErroConta } from '../lib/lgpd.js';

export default function registrar(r) {
  r.post('/api/eu/excluir', async (ctx) => {
    const { req, res, usuario, auth } = ctx;
    if (limited('excluir:' + usuario.id, 5)) return send(res, 429, { erro: 'Muitas tentativas. Aguarde um pouco.' });
    const corpo = await lerJson(req);
    if (corpo === undefined || corpo === null || typeof corpo !== 'object') return send(res, 400, { erro: 'json inválido' });
    try {
      await excluirConta(ctx, corpo.confirmar);
    } catch (e) {
      if (e instanceof ErroConta) return send(res, e.status, { erro: e.message, ...(e.campo ? { campo: e.campo } : {}) });
      throw e;
    }
    return send(res, 200, { ok: true }, { 'Set-Cookie': apagarCookie(COOKIE_SESSAO, { secure: auth?.cookieSecure !== false }) });
  }, { autenticada: true });
}
