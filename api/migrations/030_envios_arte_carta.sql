-- 030 · Envio de arte de carta pela comunidade (página temporária enviar-arte.html).
-- Cada envio guarda o arquivo PENDENTE em pendentes/<nome gerado pelo servidor> (prefixo que o nginx NÃO expõe).
-- Só a aprovação de um moderador copia para midias/ e grava cartas.imagem. Vários envios pendentes por carta são
-- permitidos, mas só 1 pendente por (carta, usuário). Idempotente.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS envios_arte_carta (
  id          BIGSERIAL PRIMARY KEY,
  carta_id    TEXT NOT NULL REFERENCES cartas(id) ON UPDATE CASCADE ON DELETE CASCADE,
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  arquivo     TEXT NOT NULL CHECK (arquivo ~ '^pendentes/[A-Za-z0-9._-]{1,120}$' AND arquivo NOT LIKE '%..%'),
  status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  motivo      TEXT CHECK (motivo IS NULL OR char_length(motivo) <= 300),
  largura     INTEGER,
  altura      INTEGER,
  bytes       INTEGER,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decidido_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  decidido_em TIMESTAMPTZ
);

-- 1 pendente por carta e usuário (reenviar só depois de decidido)
CREATE UNIQUE INDEX IF NOT EXISTS envios_arte_pendente_uq ON envios_arte_carta (carta_id, usuario_id) WHERE status = 'pendente';
-- fila de moderação (pendentes mais antigos primeiro) e contagem de pendentes por carta
CREATE INDEX IF NOT EXISTS envios_arte_fila_idx ON envios_arte_carta (status, criado_em);
CREATE INDEX IF NOT EXISTS envios_arte_carta_idx ON envios_arte_carta (carta_id, status);
-- limite diário por usuário
CREATE INDEX IF NOT EXISTS envios_arte_usuario_idx ON envios_arte_carta (usuario_id, criado_em DESC);
