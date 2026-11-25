// Log de auditoria (tabela log_auditoria, só inserção: trigger bloqueia UPDATE/DELETE/TRUNCATE).
// Quem agiu: o usuário da sessão de admin (ctx.adminPorSessao), MCP (ctx.mcp) ou token de emergência (via='token').
// Não coloque dados pessoais no detalhe: só ids e o que mudou. Falha ao gravar o log não derruba a ação já feita, mas vai para o stderr.

/** Ator de uma ação a partir do contexto da rota. */
export const atorDe = (ctx) => {
  if (ctx.mcp) return { usuario_id: ctx.mcp.usuario_id, via: 'mcp', chave_id: ctx.mcp.chave_id };
  if (ctx.adminPorSessao) return { usuario_id: ctx.adminPorSessao.id, via: 'sessao' };
  return { usuario_id: ctx.usuario?.id ?? null, via: ctx.usuario ? 'sessao' : 'token' };
};

/** auditar(ctx, 'comentario.excluir', 'comentarios:12', { motivo }) — ctx tem pool, e o ator vem de atorDe(ctx). */
export async function auditar(ctx, acao, alvo = null, detalhe = {}) {
  const ator = atorDe(ctx);
  const extra = { ...detalhe, via: ator.via };
  if (ator.chave_id !== undefined) extra.chave_id = ator.chave_id;
  try {
    await ctx.pool.query(
      'INSERT INTO log_auditoria (usuario_id, acao, alvo, detalhe) VALUES ($1, $2, $3, $4)',
      [ator.usuario_id, String(acao).slice(0, 60), alvo == null ? null : String(alvo).slice(0, 120), JSON.stringify(extra)]
    );
    return true;
  } catch (e) {
    console.error(new Date().toISOString(), 'auditar falhou:', acao, alvo, e.message);
    return false;
  }
}
