# pgAdmin para a equipe de infra (somente leitura)

A infra revisa e otimiza o banco do Não Salvo pelo pgAdmin, com um papel que só lê. Esta primeira etapa cobre **só o `naosalvo_dev`**.

## Acesso

| Item | Valor |
|---|---|
| Endereço | `http://192.168.0.9:5050` (rede interna ou VPN; **sem** subdomínio público, sem Cloudflare) |
| Login no pgAdmin | cada pessoa da infra ganha a **sua conta** (o admin cria em *Administration → Users*) |
| Banco já cadastrado | "naosalvo_dev (somente leitura)", host `postgres`, usuário `infra_ro` (a senha é pedida no primeiro acesso) |
| Senhas | em `.secrets/pgadmin-infra.env` (fora do git) e no Docker secret `naosalvo_pgadmin_admin_password` |

Atenção: o acesso é por HTTP simples, dentro da rede. Não exponha a porta 5050 para a internet. Se for preciso, o próximo passo é HTTPS por subdomínio com Traefik, travado por IP ou por Cloudflare Access.

## O que o papel `infra_ro` pode e não pode

- **Pode:** conectar só no `naosalvo_dev`; `SELECT` no esquema `public`; ver catálogo, índices e estatísticas das tabelas do banco (`pg_indexes`, `pg_stat_user_tables`); rodar `EXPLAIN` e `EXPLAIN ANALYZE` de consultas `SELECT`.
- **Não pode:** escrever, criar objetos, apagar, mexer em papéis, abrir mais de 5 conexões. A sessão nasce somente leitura, com `statement_timeout` de 30 s, `lock_timeout` de 3 s e `idle_in_transaction_session_timeout` de 60 s.
- **Fica de fora de propósito (dado pessoal e de sessão):**
  - tabelas inteiras: `sessoes`, `contas_oauth`, `feedback`, `contribuidores`, `recados`, `remocoes`;
  - colunas: `ip_hash`, `ip`, `user_agent`, `autor`, `contato`, `solicitante` e `detalhe` (auditoria).
  Consequência: `SELECT *` falha em tabelas que têm uma dessas colunas (por exemplo `memes`, que tem `autor`). Liste as colunas.
- **Sem `pg_monitor`:** ele mostraria o texto das consultas de todos os bancos do Postgres compartilhado, que também atende outros projetos. Se a infra precisar de `pg_stat_statements`, decidir à parte.

Tabelas e colunas novas nascem **sem acesso**: depois de uma migração, rode `scripts/infra/infra-ro.sql` de novo.

## Como foi montado

```bash
# 1) papel de leitura (como superusuário, NO banco alvo; a senha vai por stdin)
{ echo "\\set senha '<senha>'"; cat scripts/infra/infra-ro.sql; } | psql -U postgres -d naosalvo_dev -v ON_ERROR_STOP=1

# 2) endurecer o esquema public (PG14: o CREATE no public vale para todos)
{ echo "\\set app 'naosalvo_dev'"; cat scripts/infra/endurecer-schema-public.sql; } | psql -U postgres -d naosalvo_dev -v ON_ERROR_STOP=1

# 3) pgAdmin (imagem fixada por digest, pgAdmin 9.19)
printf '<senha-admin>' | docker --context servidor2 secret create naosalvo_pgadmin_admin_password -
docker --context servidor2 stack deploy --resolve-image never -c deploy/pgadmin/stack.yml naosalvo-pgadmin
```

O passo 2 existe porque, no Postgres 14, qualquer papel consegue criar tabelas no `public` se desligar o modo somente leitura da própria sessão. Depois dele, só o papel da API (`naosalvo_dev`) cria objetos. Reverter: `GRANT CREATE ON SCHEMA public TO PUBLIC;`.

## Verificação feita

Com o papel `infra_ro`: `SELECT` em `memes` (68 linhas), `usuarios`, índices e estatísticas funcionam; `sessoes`, `contas_oauth`, `recados`, `feedback` e as colunas de IP e autor dão `permission denied`; `INSERT`, `UPDATE`, `CREATE` e `DROP` falham; mesmo desligando o modo somente leitura, `INSERT` e `CREATE TABLE` são negados. O papel da API continua criando tabelas (migrações), e `/api/health` responde 200.

## Produção (`naosalvo`)

Fora do escopo desta etapa. Para liberar depois: rodar os dois scripts no banco `naosalvo` (com `app` = `naosalvo`), cadastrar o servidor no pgAdmin e rever com o responsável por LGPD a lista de tabelas e colunas ocultas, porque lá estão os dados reais.

## Para a infra otimizar

Pontos para começar: índices sem uso (`pg_stat_user_indexes.idx_scan = 0`), tabelas com muitas varreduras sequenciais (`pg_stat_user_tables.seq_scan`), `eventos_meme_ip` (limpeza a cada 6 h, `docs/runbook-banco.md`), o tamanho do pool da API (`DB_POOL_MAX`) e a retenção do backup. Sugestões que mexem no banco viram PR (migração numerada), nunca alteração direta.
