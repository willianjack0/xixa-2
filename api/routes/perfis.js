// Perfil público e recados: GET /api/perfil/:apelido, GET|POST /api/perfil/:apelido/recados, DELETE /api/recados/:id.
// Publicações (figurinha compartilhada do álbum): POST /api/publicacoes, DELETE /api/publicacoes/:id.
// Tudo exige login (o site inteiro é fechado). Escrita com CSRF (router). Recado: 10 por usuário a cada 10 min.
import { send, lerJson, limited } from '../lib/http.js';
import { ErroNegocio } from '../economia/servico.js';
import { perfilPublico, listarRecados, criarRecado, apagarRecado, publicarFigurinha, apagarPublicacao } from '../perfil/publico.js';

const A = { autenticada: true };
const PERFIL = /^\/api\/perfil\/([^/]{1,60})$/;
const RECADOS = /^\/api\/perfil\/([^/]{1,60})\/recados$/;
const UM_RECADO = /^\/api\/recados\/([^/]{1,30})$/;
export const LIMITE_RECADOS_10MIN = 10;
export const LIMITE_PUBLICACOES_10MIN = 20;
const PUBLICACAO = /^\/api\/publicacoes\/([^/]{1,30})$/;

const ouErro = async (res, fn) => {
  try { return await fn(); } catch (e) {
    if (e instanceof ErroNegocio) return send(res, e.status, { erro: e.message });
    throw e;
  }
};
const dec = (s) => { try { return decodeURIComponent(s); } catch { return ''; } };

export default function registrar(r) {
  r.get(PERFIL, ({ res, pool, params, usuario }) => ouErro(res, async () =>
    send(res, 200, await perfilPublico(pool, dec(params[0]), usuario))), A);

  r.get(RECADOS, ({ res, pool, params, usuario }) => ouErro(res, async () =>
    send(res, 200, await listarRecados(pool, dec(params[0]), usuario))), A);

  r.post(RECADOS, ({ req, res, pool, params, usuario }) => ouErro(res, async () => {
    if (limited('recado:' + usuario.id, LIMITE_RECADOS_10MIN)) return send(res, 429, { erro: 'Muitos recados seguidos. Aguarde um pouco.' });
    const b = await lerJson(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return send(res, 400, { erro: 'json inválido' });
    return send(res, 201, await criarRecado(pool, dec(params[0]), usuario, b.texto));
  }), A);

  r.delete(UM_RECADO, ({ res, pool, params, usuario }) => ouErro(res, async () =>
    send(res, 200, await apagarRecado(pool, dec(params[0]), usuario))), A);

  r.post('/api/publicacoes', ({ req, res, pool, usuario }) => ouErro(res, async () => {
    if (limited('pub:' + usuario.id, LIMITE_PUBLICACOES_10MIN)) return send(res, 429, { erro: 'Muitas publicações seguidas. Aguarde um pouco.' });
    const b = await lerJson(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return send(res, 400, { erro: 'json inválido' });
    return send(res, 201, await publicarFigurinha(pool, usuario, b.carta_id, b.legenda));
  }), A);

  r.delete(PUBLICACAO, ({ res, pool, params, usuario }) => ouErro(res, async () =>
    send(res, 200, await apagarPublicacao(pool, dec(params[0]), usuario))), A);
}
