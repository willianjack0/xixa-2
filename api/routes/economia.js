// Economia (carteira, álbum, pacotes, reciclagem, visita) + ranking público.
// Rotas com { autenticada: true } exigem usuário: hoje vem do auth-stub (X-Test-User, só com AUTH_STUB=1);
// o login Discord vai fornecer o mesmo `ctx.usuario` e estas rotas não mudam.
import { send, lerJson, limited } from '../lib/http.js';
import { ErroNegocio, carteira, album, visita, comprarPacote, abrirPacote, reciclar, ranking, tiposDePacote } from '../economia/servico.js';

const A = { autenticada: true };
const LIMITE_ESCRITAS = 60; // por usuário, janela de 10 min (além do limite da transação, que já é serial por usuário)

// converte erro de negócio em resposta; o resto sobe para o 500 do roteador
const ouErro = async (res, fn) => {
  try { return await fn(); } catch (e) {
    if (e instanceof ErroNegocio) return send(res, e.status, { erro: e.message });
    throw e;
  }
};

export default function registrar(r) {
  r.get('/api/carteira', ({ res, pool, usuario }) => ouErro(res, async () => send(res, 200, await carteira(pool, usuario))), A);
  r.get('/api/pacotes/tipos', ({ res, pool }) => ouErro(res, async () => send(res, 200, { itens: await tiposDePacote(pool) })), A);
  r.get('/api/album', ({ res, pool, usuario }) => ouErro(res, async () => send(res, 200, await album(pool, usuario))), A);

  r.post('/api/visita', ({ res, pool, usuario }) => ouErro(res, async () => {
    if (limited('eco:' + usuario.id, LIMITE_ESCRITAS)) return send(res, 429, { erro: 'Muitas ações. Aguarde um pouco.' });
    return send(res, 200, await visita(pool, usuario));
  }), A);

  r.post('/api/pacotes/comprar', ({ req, res, pool, usuario }) => ouErro(res, async () => {
    if (limited('eco:' + usuario.id, LIMITE_ESCRITAS)) return send(res, 429, { erro: 'Muitas ações. Aguarde um pouco.' });
    const b = await lerJson(req);
    if (!b || typeof b !== 'object') return send(res, 400, { erro: 'json inválido' });
    return send(res, 201, await comprarPacote(pool, usuario, { tipo: b.tipo, colecao_id: b.colecao_id }));
  }), A);

  r.post('/api/pacotes/abrir', ({ req, res, pool, usuario }) => ouErro(res, async () => {
    if (limited('eco:' + usuario.id, LIMITE_ESCRITAS)) return send(res, 429, { erro: 'Muitas ações. Aguarde um pouco.' });
    const b = await lerJson(req);
    if (!b || typeof b !== 'object') return send(res, 400, { erro: 'json inválido' });
    return send(res, 200, await abrirPacote(pool, usuario, { estoque_id: b.estoque_id ?? null, tipo: b.tipo ?? null, colecao_id: b.colecao_id ?? null }));
  }), A);

  r.post('/api/album/reciclar', ({ req, res, pool, usuario }) => ouErro(res, async () => {
    if (limited('eco:' + usuario.id, LIMITE_ESCRITAS)) return send(res, 429, { erro: 'Muitas ações. Aguarde um pouco.' });
    const b = await lerJson(req);
    if (!b || typeof b !== 'object') return send(res, 400, { erro: 'json inválido' });
    return send(res, 200, await reciclar(pool, usuario, { carta_id: b.carta_id ?? null, todas: b.todas === true }));
  }), A);

  // público: ranking calculado dos eventos reais (xp) ou do inventário (cartas)
  r.get('/api/ranking', ({ res, url, pool }) => ouErro(res, async () => {
    const metrica = url.searchParams.get('metrica') || 'xp';
    if (!['xp', 'cartas'].includes(metrica)) return send(res, 400, { erro: 'metrica inválida (xp ou cartas)' });
    const limite = Number.parseInt(url.searchParams.get('limite') || '50', 10) || 50;
    return send(res, 200, { metrica, itens: await ranking(pool, { metrica, limite }) }, { 'Cache-Control': 'public, max-age=30' });
  }));
}
