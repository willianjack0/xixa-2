-- 010 · Memepédia: a comunidade sugere o texto de cada meme e a moderação aprova.
-- O texto publicado é o último aprovado por meme e campo.

CREATE TABLE memepedia_edicoes (
  id          BIGSERIAL PRIMARY KEY,
  meme_id     TEXT NOT NULL REFERENCES memes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  campo       TEXT NOT NULL CHECK (campo IN ('origem', 'porque', 'usos', 'rede', 'hoje', 'curiosidades')),
  texto       TEXT NOT NULL CHECK (length(texto) BETWEEN 10 AND 2000),
  fonte       TEXT,                           -- link de onde a pessoa tirou a informação (opcional)
  autor       TEXT NOT NULL,
  ip_hash     TEXT,
  status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado')),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisado_em TIMESTAMPTZ
);
CREATE INDEX memepedia_fila_idx ON memepedia_edicoes (status, criado_em DESC);
CREATE INDEX memepedia_pub_idx ON memepedia_edicoes (meme_id, campo, revisado_em DESC) WHERE status = 'aprovado';
CREATE INDEX memepedia_spam_idx ON memepedia_edicoes (meme_id, ip_hash) WHERE status = 'pendente';
