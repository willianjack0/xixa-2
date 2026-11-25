-- Endurece o esquema public (Postgres 14 e anteriores dão CREATE no public para TODOS os papéis).
-- Sem isto, um papel de leitura consegue criar tabelas se desligar o modo somente leitura da própria sessão.
-- Rode como superusuário NO BANCO ALVO, com o papel que roda as migrações da API:
--   { echo "\set app 'naosalvo_dev'"; cat scripts/infra/endurecer-schema-public.sql; } | psql -U postgres -d naosalvo_dev -v ON_ERROR_STOP=1
-- Reversível: GRANT CREATE ON SCHEMA public TO PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CREATE, USAGE ON SCHEMA public TO :"app";
