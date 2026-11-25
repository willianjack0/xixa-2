-- 011 · Índice por dia em eventos_meme_ip, para a limpeza periódica (api/lib/limpeza.js) achar as linhas
-- antigas sem varrer a tabela (a PK começa por meme_id). O executor já aplica lock_timeout/statement_timeout.
-- Tabela só tem dados de poucos dias depois da primeira limpeza, então o CREATE INDEX comum é rápido.

CREATE INDEX IF NOT EXISTS eventos_meme_ip_dia_idx ON eventos_meme_ip (dia);
