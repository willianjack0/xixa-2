-- 019 · Equipe: quem criou o site, identificado pelo ID do Discord (o ID não muda; o apelido muda e pode ser pego por outra pessoa).
--  papel: aplicado UMA vez por pessoa (aplicado_em), na migração para quem já tem conta ou no primeiro login.
--         Só sobe quem está como 'usuario' (não rebaixa admin) e, depois de aplicado, quem manda é o admin (pode mudar à vontade).
--  patente_fixa: patente mostrada mesmo sem o XP (selo). Vale a maior entre a do XP e a fixa. Não dá XP nem moedas.
--  edita_direto: textos da Memepédia e links de vídeo entram publicados, sem passar pela fila. Não dá XP (por enquanto).
-- Idempotente.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS equipe (
  discord_id    TEXT PRIMARY KEY CHECK (discord_id ~ '^[0-9]{15,21}$'),
  nome          TEXT NOT NULL,
  papel         TEXT CHECK (papel IN ('moderador', 'admin')),
  patente_fixa  TEXT,
  edita_direto  BOOLEAN NOT NULL DEFAULT false,
  aplicado_em   TIMESTAMPTZ
);

INSERT INTO equipe (discord_id, nome, papel, patente_fixa, edita_direto) VALUES
  ('426581750995615754', 'Be Rampelotto', 'moderador', NULL, false),
  ('227198444190695424', 'SePPZAO', 'moderador', NULL, false),
  ('813396956722102332', 'yorkshiremaconhadoa', NULL, NULL, true),
  ('429830033641570307', 'Subversivo', NULL, NULL, true),
  ('255084717907378187', 'CidCidoso', NULL, 'lenda', false)
ON CONFLICT (discord_id) DO NOTHING;

-- quem já tem conta recebe o papel agora (uma vez)
WITH ap AS (
  UPDATE equipe e SET aplicado_em = now()
    FROM contas_oauth c
   WHERE c.provedor = 'discord' AND c.provedor_id = e.discord_id AND e.aplicado_em IS NULL
  RETURNING c.usuario_id, e.papel
)
UPDATE usuarios u SET papel = ap.papel FROM ap WHERE u.id = ap.usuario_id AND ap.papel IS NOT NULL AND u.papel = 'usuario';
