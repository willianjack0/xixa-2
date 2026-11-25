-- 014 · Limite de troca de apelido: usuarios.apelido_alterado_em guarda a última troca (PATCH /api/eu).
-- NULL = nunca trocou: a primeira troca é livre; depois, no mínimo 24 h entre trocas. Salvar o gato não conta.
-- Sem backfill de propósito (todo mundo começa com a primeira troca livre). Idempotente.
SET LOCAL lock_timeout = '5s';

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS apelido_alterado_em TIMESTAMPTZ;
