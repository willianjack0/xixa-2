-- 017 · Papéis: usuario < moderador < admin. Independente da patente (que vem do XP): o papel é dado por quem administra.
-- O primeiro admin é definido aqui pelo apelido, UMA vez, só se a conta já existir (migração roda uma vez: renomear depois
-- não tira nem passa o papel, e quem criar o apelido depois não herda nada). Idempotente.
SET LOCAL lock_timeout = '5s';

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS papel TEXT NOT NULL DEFAULT 'usuario';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_papel_chk') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_papel_chk CHECK (papel IN ('usuario', 'moderador', 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS usuarios_papel_idx ON usuarios (papel) WHERE papel <> 'usuario';

UPDATE usuarios SET papel = 'admin' WHERE lower(apelido) = 'yorkshiremaconhadoa' AND papel = 'usuario';
