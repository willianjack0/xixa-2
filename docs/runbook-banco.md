# Runbook do banco (Fase 1)

Migrações em `api/migrations/`, executor em `api/migrate.js`, carga do acervo em `api/seed/acervo.js`.

## Ordem de subida (dev e, depois, prod)

1. **Backup antes de aplicar** (obrigatório, a 005 renomeia `votos`):
   `pg_dump -Fc -h <host> -U naosalvo <banco> > naosalvo_<banco>_$(date +%F).dump`
2. Suba a API. Na subida ela aplica sozinha as migrações pendentes (`schema_migrations`). Veja o log: `migração 00N_... aplicada`.
3. **Logo depois** rode o seed (a API sobe com tabelas de acervo vazias até lá):
   `DB_HOST=... DB_NAME=naosalvo_dev DB_USER=naosalvo DB_PASSWORD_FILE=<secret> node api/seed/acervo.js`
   (rode da raiz do repositório: ele lê `data.js`). Esperado: `68 memes, 109 cartas`.
4. Confira: `SELECT count(*) FROM memes;` (68) e `FROM cartas;` (109).

## Seed: só em dev, e uma vez

O seed faz upsert: **sobrescreve** título, descrição etc. dos memes que existem no `data.js` e **apaga e recria** as `midias` deles. Depois que o admin editar o acervo (Fase 3) ele desfaz edições. Em prod, rode uma única vez na carga inicial; não use como rotina. Regras de economia editadas no admin não são sobrescritas.

## Timeouts

O executor usa `lock_timeout = 5s` e `statement_timeout = 120s` por migração, e espera até 30s pela trava entre instâncias. Se falhar por timeout, nada daquela migração fica aplicado: tente de novo fora do pico. Ajustáveis por `MIGRATE_LOCK_TIMEOUT`, `MIGRATE_STATEMENT_TIMEOUT`, `MIGRATE_ADVISORY_TIMEOUT`.

## Deploy da stack

**Não** mude o `update_config` da API para `order: start-first`. Com start-first a versão nova migra enquanto a antiga ainda atende; a 005 renomeia `votos` e a versão antiga quebraria. Mantenha `stop-first`.

## Rollback manual (depois da 005)

Só vale se nada novo foi gravado na `votos` nova (ela nasce vazia). Restaure o código antigo **depois** do SQL. Se a `votos` nova já tiver dados, prefira restaurar o dump.

```sql
BEGIN;
DROP TABLE votos;                              -- a nova, vazia
ALTER TABLE votos_legado RENAME TO votos;
ALTER INDEX votos_legado_pkey RENAME TO votos_pkey;
DELETE FROM schema_migrations WHERE versao IN ('005', '006');
COMMIT;
```

Isso desfaz só o nome de `votos`. Como as colunas e tabelas da 005/006 continuam lá, reaplicar 005/006 depois falha ("already exists"): para reaplicar, restaure o dump ou apague antes esses objetos à mão. Colunas novas em `comentarios` e `feedback` (005) e as tabelas da 006 podem ficar: o código antigo as ignora. Para limpar de vez, restaure o dump do passo 1.

## Links sugeridos (007)

`links_sugeridos.meme_id` tem FK para `memes`: sem o seed rodado, `POST /api/links` responde 404 "meme não encontrado". Meme novo vindo de PR (ex.: entradas novas no `data.js`) só aceita sugestão depois de reexecutar o seed no ambiente.

## Antes da migração 008 em produção (conferir duplicatas)

A 008 cria índices **únicos** no razão. Se já existir linha repetida, a criação do índice falha e a migração inteira é desfeita (a API não sobe até corrigir). Rode antes, no banco alvo; o esperado é **0 linhas** nas duas consultas (hoje nenhum código grava nessas tabelas, então só deve haver linhas se alguém inseriu à mão):

```sql
SELECT usuario_id, motivo, ref, count(*) AS n
  FROM eventos_xp
 WHERE motivo IN ('visita_diaria', 'carta_nova', 'colecao_completa')
   AND ref IS NOT NULL
 GROUP BY usuario_id, motivo, ref
HAVING count(*) > 1;

SELECT usuario_id, motivo, ref, count(*) AS n
  FROM movimentos_moeda
 WHERE motivo = 'colecao_completa'
   AND ref IS NOT NULL
 GROUP BY usuario_id, motivo, ref
HAVING count(*) > 1;
```

Se aparecer alguma linha: faça o `pg_dump`, apague as repetidas deixando a de menor `id` de cada grupo e recalcule `usuarios.xp` e `usuarios.moedas` como soma do razão antes de subir. As consultas ignoram `ref` NULL de propósito: NULL é distinto no índice único, então essas linhas não impedem a 008.

## Limpeza de eventos_meme_ip (anti-spam do Sobe.Desce)

`eventos_meme_ip` guarda quem já contou visita/clique no dia (HMAC do IP, migração 009) e crescia sem limite; só o dia corrente importa. `api/lib/limpeza.js` apaga linhas com `dia < hoje - 2` (fuso America/Sao_Paulo; fica hoje + 2 dias de margem):

- Roda no boot da API (`server.js`) e depois a cada 6h (`setInterval(...).unref()`). Em cada réplica: o DELETE é idempotente, rodar duas vezes só custa uma consulta vazia.
- Em lotes de 5000 linhas (um DELETE por lote, transação curta, sem lock longo) até esgotar; teto de 2000 lotes por execução.
- Nunca derruba a API: erro vira log `limpeza de eventos_meme_ip falhou: ...`; sucesso com linhas apagadas loga `limpeza: N linhas antigas removidas`.
- Migração 011 cria `eventos_meme_ip_dia_idx (dia)` para achar as linhas antigas sem varrer a tabela (a PK começa por `meme_id`). No primeiro deploy a tabela pode ter muitas linhas acumuladas: o `CREATE INDEX` comum bloqueia INSERTs (`/api/eventos`) enquanto roda. Em produção, confira antes `SELECT count(*) FROM eventos_meme_ip`; se passar de alguns milhões, crie o índice antes à mão com `CREATE INDEX CONCURRENTLY eventos_meme_ip_dia_idx ON eventos_meme_ip (dia)` (a migração 011 usa `IF NOT EXISTS`, então segue sem erro).
- Manual: `DELETE FROM eventos_meme_ip WHERE dia < (now() AT TIME ZONE America/Sao_Paulo)::date - 2;`

O hash do IP (`api/lib/ip.js`, HMAC-SHA256 com o token de admin, 32 hex) é único para eventos, links e memepédia. **Não mude o algoritmo nem o token de admin sem avisar**: trocar o token invalida o anti-spam do dia (inofensivo, mas conta de novo).

## Conferir o IP real depois do deploy (TRUSTED_PROXY_HOPS)

A API só enxerga o IP certo se `TRUSTED_PROXY_HOPS` bater com a cadeia real (padrão 2 = Cloudflare + Traefik). **Depois de publicar no dev, confira com um request de verdade**, antes de confiar no rate limit:

1. Faça login no site pelo navegador (ou `curl` em uma rota que grave IP).
2. No banco do dev: `SELECT ip, criada_em FROM sessoes ORDER BY criada_em DESC LIMIT 3;` — a coluna `ip` tem de ser o **seu IP público** (o mesmo de `curl ifconfig.me`).
   - É um IP `172.x`/`10.x` do Traefik ou do Cloudflare? Há proxies a menos na conta: **diminua** `TRUSTED_PROXY_HOPS`.
   - É um IP que você não reconhece e muda a cada request? Há proxies a mais: **aumente**.
3. Teste de forja: `curl -H 'X-Forwarded-For: 6.6.6.6' https://naosalvo-dev.fishlab.com.br/api/auth/discord -o /dev/null` e confira que `6.6.6.6` não aparece como IP da sessão/rate limit (o valor forjado fica à esquerda e é ignorado).
4. Para mudar: variável de ambiente `TRUSTED_PROXY_HOPS` no serviço `api` das stacks (hoje não definida = 2) e redeploy.

## Antes da migração 013 (perfil e cadastro)

A 013 cria o índice único parcial `pacotes_estoque_boas_uq` (1 pacote `boas` por usuário). Se existir usuário com mais de um, o índice falha e a migração é desfeita (a API não sobe até corrigir). Confira antes, no banco alvo; o esperado é **0 linhas**:

```sql
SELECT usuario_id, count(*) AS n
  FROM pacotes_estoque
 WHERE origem = 'boas'
 GROUP BY usuario_id
HAVING count(*) > 1;
```

Se aparecer linha: `pg_dump` antes e apague os excedentes não abertos (`usado_em IS NULL`), deixando um por usuário. As colunas novas (`usar_foto`, `cadastro_completo_em`) são aditivas. Quem já existe fica com `cadastro_completo_em` nulo: o front leva essas contas ao criador de gato, e o pacote de boas-vindas vem ao salvar o gato (quem já tinha ganhado `boas` pela visita antiga não ganha outro).

## Migração 014 (limite de troca de apelido) e apelidos reservados

A 014 só acrescenta `usuarios.apelido_alterado_em TIMESTAMPTZ NULL` (`ADD COLUMN IF NOT EXISTS`, `lock_timeout` 5 s, sem backfill, sem reescrever a tabela). Nada a conferir antes. Todo mundo começa com a primeira troca livre.

A lista de reservados (`api/auth/apelidos.js`) vale para trocas e para novos logins; **contas que já têm um apelido reservado não são renomeadas**. Para achar quem já usa um (e decidir caso a caso, p.ex. pelo admin):

```sql
SELECT id, apelido, criado_em
  FROM usuarios
 WHERE regexp_replace(lower(translate(apelido, '._-', '')), '[0-9]+$', '') IN
       ('admin','administrador','mod','moderador','moderacao','suporte','staff','naosalvo','xet','sistema','system','root','discord','oficial');
```

(O SQL cobre apelidos ASCII, que é a única forma aceita pelo CHECK da tabela. Quem aparecer aí continua logando normalmente; só não consegue manter esse nome se trocar e voltar.)
