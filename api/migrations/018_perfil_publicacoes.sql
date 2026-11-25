-- 018 · Perfil: só redes antigas e famosas no Brasil (+ TikTok) e publicações no perfil.
--  Saem os visuais 'kwai' e 'bluesky'. Quem usava passa para o mais parecido: kwai → tiktok, bluesky → twitter.
--  publicacoes: figurinha que a pessoa compartilhou do álbum, mostrada no perfil como uma publicação dela.
--    Uma por figurinha e pessoa (compartilhar de novo só sobe a publicação para o topo). Só o dono apaga.
-- Idempotente.
SET LOCAL lock_timeout = '5s';

UPDATE usuarios SET perfil_layout = 'tiktok' WHERE perfil_layout = 'kwai';
UPDATE usuarios SET perfil_layout = 'twitter' WHERE perfil_layout = 'bluesky';
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_layout_ck;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_layout_ck CHECK (perfil_layout IN ('homepage', 'icq', 'orkut', 'fotolog', 'msn', 'twitter', 'facebook', 'ask', 'whatsapp', 'vine', 'snapchat', 'instagram', 'tiktok'));

CREATE TABLE IF NOT EXISTS publicacoes (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  carta_id    TEXT NOT NULL REFERENCES cartas(id) ON UPDATE CASCADE ON DELETE CASCADE,
  legenda     TEXT CHECK (legenda IS NULL OR char_length(legenda) BETWEEN 1 AND 140),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, carta_id)
);
CREATE INDEX IF NOT EXISTS publicacoes_usuario_idx ON publicacoes (usuario_id, criado_em DESC);
