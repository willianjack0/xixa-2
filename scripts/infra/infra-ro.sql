-- Papel de LEITURA para a equipe de infra revisar e otimizar o banco (pgAdmin). Idempotente.
--
-- Uso (rode como superusuario NO BANCO ALVO; a senha vai por stdin, nunca na linha de comando nem no repositório):
--   { echo "\\set senha '<senha>'"; cat scripts/infra/infra-ro.sql; } | psql -U postgres -d naosalvo_dev -v ON_ERROR_STOP=1
--
-- O que o papel pode: conectar só neste banco, SELECT no esquema public (menos o que está oculto abaixo),
-- ver catálogo, índices e estatísticas das tabelas do próprio banco, rodar EXPLAIN (ANALYZE) em SELECTs.
-- O que NÃO pode: escrever, criar objetos, apagar, mexer em papéis, ler sessões nem dados pessoais.
-- Não recebe pg_monitor/pg_read_all_stats de propósito: eles mostram o texto das consultas de TODOS os bancos
-- do Postgres compartilhado (outros projetos). Se a infra precisar de pg_stat_statements, decidir à parte.
--
-- Depois de uma migração que cria tabela ou coluna nova, rode este arquivo de novo (ele recalcula os grants);
-- tabelas novas nascem SEM acesso para este papel.

\if :{?senha}
\else
  \echo 'ERRO: defina a senha antes: \\set senha ...'
  \quit
\endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'infra_ro') THEN
    CREATE ROLE infra_ro LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;
  END IF;
END $$;

ALTER ROLE infra_ro WITH LOGIN PASSWORD :'senha';
ALTER ROLE infra_ro SET default_transaction_read_only = on;
ALTER ROLE infra_ro SET statement_timeout = '30s';
ALTER ROLE infra_ro SET lock_timeout = '3s';
ALTER ROLE infra_ro SET idle_in_transaction_session_timeout = '60s';

SELECT format('GRANT CONNECT ON DATABASE %I TO infra_ro', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO infra_ro;
REVOKE CREATE ON SCHEMA public FROM infra_ro;

-- recalcula do zero
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM infra_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM infra_ro;

DO $$
DECLARE
  -- tabelas inteiras com dado pessoal ou de sessão: ficam fora
  excluidas text[] := ARRAY['sessoes', 'contas_oauth', 'feedback', 'contribuidores', 'recados', 'remocoes'];
  -- colunas ocultas nas demais (IP, texto livre de identificação, contato, detalhe de auditoria)
  ocultas   text[] := ARRAY['ip_hash', 'ip', 'user_agent', 'autor', 'contato', 'solicitante', 'detalhe'];
  t record;
  cols text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> ALL (excluidas)
  LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t.relname AND column_name <> ALL (ocultas);
    IF cols IS NOT NULL THEN
      EXECUTE format('GRANT SELECT (%s) ON public.%I TO infra_ro', cols, t.relname);
    END IF;
  END LOOP;
END $$;

-- confirmação (sem senha): o que o papel enxerga
SELECT 'tabelas com SELECT' AS item, count(DISTINCT table_name) AS n
  FROM information_schema.column_privileges WHERE grantee = 'infra_ro' AND privilege_type = 'SELECT' AND table_schema = 'public';
