-- 028 · Adiciona usuario_id em links_sugeridos para vincular autor autenticado e permitir recompensa.
-- Idempotente.
ALTER TABLE links_sugeridos ADD COLUMN IF NOT EXISTS usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;
