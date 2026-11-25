-- 023 · Imagem da carta: arte enviada pelo painel (otimizada para WebP e guardada no S3), no formato midias/<arquivo>.
-- O nome é sempre gerado pelo servidor; o CHECK impede caminho fora do prefixo midias/. Idempotente.
SET LOCAL lock_timeout = '5s';

ALTER TABLE cartas ADD COLUMN IF NOT EXISTS imagem TEXT
  CHECK (imagem IS NULL OR (imagem ~ '^midias/[A-Za-z0-9._-]{1,120}$' AND imagem NOT LIKE '%..%'));
