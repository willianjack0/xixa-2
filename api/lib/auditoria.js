// Log de auditoria (tabela log_auditoria, só inserção: trigger bloqueia UPDATE/DELETE/TRUNCATE).
// Quem agiu: o usuário da sessão de admin (ctx.adminPorSessao) ou, no token de emergência, usuario_id nulo com via='token'.
// Não coloque dados pessoais no detalhe: só ids e o que mudou. Falha ao gravar o log não derruba a ação já feita, mas vai para o stderr.

/** Ator de uma ação a partir do contexto da rota. */
export const atorDe = (ctx) => (ctx.adminPorSessao ? { usuario_id: ctx.adminPorSessao.id, via: 'sessao' } : { usuario_id: ctx.usuario?.id ?? null, via: ctx.usuario ? 'sessao' : 'token' });

/** auditar(ctx, 'comentario.excluir', 'comentarios:12', { motivo }) — ctx tem pool, e o ator vem de atorDe(ctx). */
export async function auditar(ctx, acao, alvo = null, detalhe = {}) {
  const { usuario_id, via } = atorDe(ctx);
  try {
    await ctx.pool.query(
      'INSERT INTO log_auditoria (usuario_id, acao, alvo, detalhe) VALUES ($1, $2, $3, $4)',
      [usuario_id, String(acao).slice(0, 60), alvo == null ? null : String(alvo).slice(0, 120), JSON.stringify({ ...detalhe, via })]
    );
    return true;
  } catch (e) {
    console.error(new Date().toISOString(), 'auditar falhou:', acao, alvo, e.message);
    return false;
  }
}
