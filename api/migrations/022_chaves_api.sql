-- 022 · Chaves de API do MCP: cada admin cria as suas no painel; só o hash (SHA-256) é guardado, o segredo aparece uma vez.
-- Idempotente.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS chaves_api (
  id             BIGSERIAL PRIMARY KEY,
  usuario_id     BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 60),
  prefixo        TEXT NOT NULL CHECK (char_length(prefixo) = 8),        -- 8 primeiros caracteres do segredo (só para identificar na lista)
  hash           TEXT NOT NULL UNIQUE CHECK (hash ~ '^[0-9a-f]{64}$'),  -- sha256 hex do segredo inteiro
  escopos        TEXT[] NOT NULL DEFAULT '{ler,escrever}'
                 CHECK (cardinality(escopos) > 0 AND escopos <@ ARRAY['ler','escrever','publicar']::text[]),
  expira_em      TIMESTAMPTZ NOT NULL,
  criada_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_uso_em  TIMESTAMPTZ,
  ultimo_ip      TEXT,
  revogada_em    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS chaves_api_usuario_idx ON chaves_api (usuario_id) WHERE revogada_em IS NULL;
