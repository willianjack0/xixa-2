// Admin · MCP: chaves de API (criar, listar, revogar) e o llms.txt. Só SESSÃO de admin (cookie + CSRF): o token de emergência
// (ADMIN_TOKEN) não cria nem revoga chave, para não existir chave sem um dono humano identificado.
// O segredo da chave aparece uma única vez, na resposta do POST; no banco fica só o hash.
import { send, lerJson, limited } from '../lib/http.js';
import { auditar } from '../lib/auditoria.js';
import { gerarChave, estadoDaChave, ESCOPOS, VALIDADES_DIAS, MAX_ATIVAS_POR_USUARIO } from '../mcp/chaves.js';
import { gerarLlmsTxt } from '../mcp/llms.js';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Garante sessão de admin; sem ela já responde 403 e devolve false. */
function soSessao(ctx) {
  if (ctx.adminPorSessao) return true;
  send(ctx.res, 403, { erro: 'Entre como admin (login) para gerenciar chaves. O token de emergência não serve aqui.' }, NO_STORE);
  return false;
}

const publica = (c, euId) => ({
  id: Number(c.id), usuario_id: Number(c.usuario_id), dono: c.apelido, minha: Number(c.usuario_id) === Number(euId),
  nome: c.nome, prefixo: c.prefixo, escopos: c.escopos, estado: estadoDaChave(c),
  criada_em: c.criada_em, expira_em: c.expira_em, ultimo_uso_em: c.ultimo_uso_em, revogada_em: c.revogada_em
});

export default function registrar(r) {
  // lista: todas as chaves (todo admin vê quem tem chave e de quem); nunca devolve o hash nem o segredo
  r.get('/api/admin/mcp/chaves', async (ctx) => {
    if (!soSessao(ctx)) return;
    const { rows } = await ctx.pool.query(
      `SELECT k.id, k.usuario_id, u.apelido, k.nome, k.prefixo, k.escopos, k.criada_em, k.expira_em, k.ultimo_uso_em, k.revogada_em
         FROM chaves_api k JOIN usuarios u ON u.id = k.usuario_id ORDER BY k.id DESC LIMIT 200`);
    return send(ctx.res, 200, { items: rows.map((c) => publica(c, ctx.adminPorSessao.id)) }, NO_STORE);
  });

  // cria: { nome, escopos?: ['ler','escrever','publicar'], dias?: 30|90|180|365 }. Devolve o segredo UMA vez.
  r.post('/api/admin/mcp/chaves', async (ctx) => {
    if (!soSessao(ctx)) return;
    const { req, res, pool } = ctx, dono = ctx.adminPorSessao;
    const b = await lerJson(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return send(res, 400, { erro: 'json inválido' }, NO_STORE);
    const campos = {};
    const nome = typeof b.nome === 'string' ? b.nome.trim() : '';
    if (nome.length < 1 || nome.length > 60) campos.nome = 'de 1 a 60 caracteres';
    let escopos = b.escopos === undefined ? ['ler', 'escrever'] : b.escopos;
    if (!Array.isArray(escopos) || !escopos.length || escopos.some((e) => !ESCOPOS.includes(e))) campos.escopos = `lista com ${ESCOPOS.join(', ')}`;
    else escopos = ESCOPOS.filter((e) => e === 'ler' || escopos.includes(e)); // escrever/publicar sempre incluem ler; ordem fixa, sem repetição
    const dias = b.dias === undefined ? 90 : b.dias;
    if (!VALIDADES_DIAS.includes(dias)) campos.dias = `um de: ${VALIDADES_DIAS.join(', ')}`;
    if (Object.keys(campos).length) return send(res, 422, { erro: 'campos inválidos', campos }, NO_STORE);

    if (limited('mcpchave:' + dono.id, 10)) return send(res, 429, { erro: 'Muitas chaves criadas em pouco tempo. Aguarde um pouco.' }, NO_STORE); // só conta pedido válido
    const { rows: [{ n }] } = await pool.query(
      'SELECT count(*)::int AS n FROM chaves_api WHERE usuario_id = $1 AND revogada_em IS NULL AND expira_em > now()', [dono.id]);
    if (n >= MAX_ATIVAS_POR_USUARIO) return send(res, 409, { erro: `Você já tem ${MAX_ATIVAS_POR_USUARIO} chaves ativas. Revogue uma antes de criar outra.` }, NO_STORE);

    const k = gerarChave();
    const { rows: [c] } = await pool.query(
      `INSERT INTO chaves_api (usuario_id, nome, prefixo, hash, escopos, expira_em) VALUES ($1,$2,$3,$4,$5, now() + make_interval(days => $6))
       RETURNING id, usuario_id, nome, prefixo, escopos, criada_em, expira_em, ultimo_uso_em, revogada_em`,
      [dono.id, nome, k.prefixo, k.hash, escopos, dias]);
    await auditar(ctx, 'mcp.chave.criar', 'chaves_api:' + c.id, { nome, escopos, prefixo: k.prefixo, dias }); // nunca o segredo
    return send(res, 201, { ok: true, chave: k.chave, item: publica({ ...c, apelido: dono.apelido }, dono.id) }, NO_STORE);
  });

  // revoga (a minha ou a de outro admin). Não apaga a linha: fica no histórico.
  r.delete(/^\/api\/admin\/mcp\/chaves\/(\d{1,18})$/, async (ctx) => {
    if (!soSessao(ctx)) return;
    const { res, pool, params } = ctx;
    const { rows: [c] } = await pool.query(
      `UPDATE chaves_api SET revogada_em = now() WHERE id = $1 AND revogada_em IS NULL RETURNING id, usuario_id, nome, prefixo`, [params[0]]);
    if (!c) {
      const { rows: [ja] } = await pool.query('SELECT 1 FROM chaves_api WHERE id = $1', [params[0]]);
      return send(res, ja ? 409 : 404, { erro: ja ? 'Essa chave já estava revogada.' : 'Chave não encontrada.' }, NO_STORE);
    }
    await auditar(ctx, 'mcp.chave.revogar', 'chaves_api:' + c.id, { dono_id: Number(c.usuario_id), nome: c.nome, prefixo: c.prefixo });
    return send(res, 200, { ok: true }, NO_STORE);
  });

  // texto para a IA: habilidades e modo de uso (gerado do registro de ferramentas)
  r.get('/api/admin/mcp/llms.txt', async (ctx) => {
    if (!soSessao(ctx)) return;
    ctx.res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return ctx.res.end(gerarLlmsTxt({ base: ctx.auth?.origemSite || undefined })); // origem configurada no servidor, nunca de cabeçalho do cliente
  });
}
