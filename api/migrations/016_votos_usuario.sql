-- 016 · Voto por usuário: cada pessoa tem UM voto por meme (curtir/não curtir e estrelas).
-- Antes o voto era anônimo e lembrado só no navegador: limpando o navegador (ou trocando de aparelho) dava para
-- curtir de novo, e as curtidas subiam sozinhas com o passar dos dias. Agora o servidor guarda o voto da pessoa
-- (trocar o voto atualiza a mesma linha). votos_legado fica congelado como base: as curtidas antigas não somem.
-- Idempotente.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS votos_usuario (
  usuario_id    BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  meme_id       TEXT NOT NULL CHECK (meme_id ~ '^[a-z0-9-]{1,80}$'),
  voto          SMALLINT NOT NULL DEFAULT 0 CHECK (voto IN (-1, 0, 1)),
  estrelas      SMALLINT NOT NULL DEFAULT 0 CHECK (estrelas BETWEEN 0 AND 5),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, meme_id)
);
CREATE INDEX IF NOT EXISTS votos_usuario_meme_idx ON votos_usuario (meme_id);
