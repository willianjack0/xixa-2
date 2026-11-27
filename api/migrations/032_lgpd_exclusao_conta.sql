-- 032 · LGPD: exclusão de conta pelo próprio usuário (anonimização) e retenção do ip_hash.
-- Só ADICIONA (compatível com a versão anterior da API rodando durante o deploy). Idempotente.
--  usuarios.removida_em: preenchida quando a pessoa exclui a conta. A linha FICA (o conteúdo público, o razão de XP/moedas e a
--    auditoria apontam para o id), mas sem nenhum dado pessoal: apelido vira 'removida-<id>', sem vínculo Discord, sem sessão.
--    NULL = conta normal. Conta removida não aparece no ranking nem no perfil público e não tem como entrar de novo.
--  banimentos_provedor: se a conta estava BANIDA ao ser excluída, guardamos só o HMAC do id do provedor (não dá para voltar ao
--    Discord ID a partir dele sem a chave do servidor) para que um novo cadastro com a mesma conta do Discord continue banido.
--  índices parciais para a limpeza do ip_hash (anula depois de 3 dias, sem apagar a linha).
SET LOCAL lock_timeout = '5s';

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS removida_em TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS usuarios_removida_idx ON usuarios (removida_em) WHERE removida_em IS NOT NULL;

CREATE TABLE IF NOT EXISTS banimentos_provedor (
  hash       TEXT PRIMARY KEY CHECK (hash ~ '^[0-9a-f]{64}$'),
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE banimentos_provedor IS 'HMAC-SHA256(chave do servidor, provedor:id) de contas banidas que foram excluídas. Sem dado pessoal em claro.';

CREATE INDEX IF NOT EXISTS links_sugeridos_ip_idx ON links_sugeridos (criado_em) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS memepedia_ip_idx ON memepedia_edicoes (criado_em) WHERE ip_hash IS NOT NULL;
