-- 012 · Foto de perfil do Discord em contas_oauth.
-- A URL é montada no servidor (https://cdn.discordapp.com/avatars/<id>/<hash>.png?size=128) a partir de id e hash
-- validados; nunca guardamos URL crua vinda do Discord nem valor vindo do cliente. NULL = sem foto.
-- Idempotente: pode rodar de novo sem erro. O executor já aplica statement_timeout; o lock_timeout curto abaixo
-- faz o ALTER desistir em vez de enfileirar a API atrás de uma transação longa.
SET LOCAL lock_timeout = '5s';

ALTER TABLE contas_oauth ADD COLUMN IF NOT EXISTS avatar_url TEXT;
