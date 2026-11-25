-- 013 · Perfil e cadastro: foto opcional, fim do cadastro e boas-vindas uma vez só.
--  usuarios.usar_foto: false = mostra o gato (avatar padrão); true só faz sentido se existir contas_oauth.avatar_url
--    (a API força false quando a foto some e só aceita true com foto).
--  usuarios.cadastro_completo_em: preenchido na PRIMEIRA vez que o avatar_gato é salvo (PATCH /api/eu); NULL = cadastro incompleto.
--  índice único parcial: no máximo 1 pacote de boas-vindas por usuário, mesmo com requisições simultâneas.
-- Idempotente. Se o índice falhar, há usuário com mais de um 'boas' no estoque (não deveria): ver docs/runbook-banco.md.
SET LOCAL lock_timeout = '5s';

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usar_foto BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cadastro_completo_em TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS pacotes_estoque_boas_uq ON pacotes_estoque (usuario_id) WHERE origem = 'boas';
