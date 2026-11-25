-- 015 · Perfil público: layout escolhido pelo dono, carta favorita e recados de quem visita.
--  usuarios.perfil_layout: visual do perfil (lista fechada, as mesmas redes da linha do tempo; padrão Orkut).
--  usuarios.carta_favorita: carta em destaque. Só é mostrada enquanto o dono ainda tiver a carta (o servidor confere na leitura).
--  recados: mensagens curtas deixadas no perfil (scrap no Orkut, livro de visitas no Fotolog etc.). Mesma tabela para todos os layouts.
--    Apagar = o dono do perfil ou o autor (DELETE remove a linha).
-- Idempotente.
SET LOCAL lock_timeout = '5s';

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil_layout TEXT NOT NULL DEFAULT 'orkut';
DO $$ BEGIN
  ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_layout_ck CHECK (perfil_layout IN ('homepage', 'icq', 'orkut', 'fotolog', 'msn', 'twitter', 'facebook', 'ask', 'whatsapp', 'vine', 'snapchat', 'instagram', 'tiktok', 'kwai', 'bluesky'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS carta_favorita TEXT REFERENCES cartas(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS recados (
  id         BIGSERIAL PRIMARY KEY,
  dono_id    BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  autor_id   BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  texto      TEXT NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 300),
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (dono_id <> autor_id)
);
CREATE INDEX IF NOT EXISTS recados_dono_idx ON recados (dono_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS recados_autor_idx ON recados (autor_id, criado_em DESC);
