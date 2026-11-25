# Backup e restauração do Postgres

Script: `scripts/backup/pg-backup.sh`. Faz `pg_dump -Fc` (formato custom, comprimido) dos bancos `naosalvo` e `naosalvo_dev`, valida cada dump com `pg_restore --list`, e apaga os antigos pela retenção. Sem credenciais no script.

## Configuração

| Variável | Padrão | Para quê |
|---|---|---|
| `PGHOST` / `PGPORT` | `postgres` / `5432` | onde está o Postgres |
| `DATABASES` | `naosalvo:naosalvo naosalvo_dev:naosalvo_dev` | lista `banco[:usuário]` separada por espaço |
| `BACKUP_DIR` | `./backups` | pasta de saída (cria `<pasta>/<banco>/`) |
| `RETENTION_DAYS` | `14` | apaga dumps com mais de N dias (`0` = nunca apaga) |
| `MIN_KEEP` | `3` | nunca deixa menos que N dumps por banco, mesmo velhos (evita ficar sem backup se o job parar) |
| `PGPASSFILE` | — | arquivo no formato `host:porta:banco:usuário:senha`, permissão `600`. **Recomendado**: um arquivo serve aos dois bancos |
| `PGPASSWORD_FILE` | — | alternativa: arquivo com uma senha só (vale para todos os bancos da lista) |

Arquivos gerados: `<BACKUP_DIR>/<banco>/<banco>_AAAAMMDD_HHMMSSZ.dump` (UTC). O dump é escrito como `.partial` e só ganha o nome final depois de validado. Código de saída `0` só se todos os bancos deram certo; qualquer falha devolve `1` (o agendador deve alertar nisso).

Exemplo:

```sh
PGHOST=postgres PGPASSFILE=/run/secrets/naosalvo_pgpass \
BACKUP_DIR=/backups RETENTION_DAYS=14 \
bash scripts/backup/pg-backup.sh
```

O `pgpass` precisa ser um segredo (Swarm secret ou arquivo fora do repositório). Nunca commitar.

## Restauração (procedimento testado)

Restaure sempre primeiro num **Postgres descartável**, nunca por cima do banco em uso.

```sh
# 1. banco descartável (mesma versão major do servidor: 14)
docker run -d --name pgrest -e POSTGRES_PASSWORD=x postgres:14

# 2. copie o dump e restaure num banco novo
docker cp naosalvo_20261119_152239Z.dump pgrest:/tmp/n.dump
docker exec pgrest createdb -U postgres naosalvo_restore
docker exec pgrest pg_restore -U postgres --no-owner --exit-on-error \
  --dbname=naosalvo_restore /tmp/n.dump

# 3. confira
docker exec pgrest psql -U postgres -d naosalvo_restore -Atc \
  "SELECT count(*) FROM memes; SELECT count(*) FROM cartas; SELECT count(*) FROM schema_migrations;"

# 4. descarte
docker rm -f pgrest
```

`--no-owner` evita erro por usuário inexistente. `--exit-on-error` faz a restauração falhar alto em vez de terminar "meio feita". A versão do `pg_restore` deve ser igual ou mais nova que a do `pg_dump`; use a mesma imagem do servidor.

### Restaurar de verdade (incidente)

1. Pare a API do ambiente afetado (`docker service scale naosalvo_api=0`) para ninguém gravar durante a restauração.
2. Restaure num banco novo (passos acima), confira, e só então troque: renomeie o banco antigo (`ALTER DATABASE naosalvo RENAME TO naosalvo_quebrado`) e o restaurado para `naosalvo`, ou aponte `DB_NAME` para ele.
3. Suba a API. Ela só aplica migrações que faltarem (`schema_migrations` vem no dump).
4. Guarde o banco antigo até confirmar que está tudo certo.

## Teste executado

Rodado em 19/11/2026 em Postgres 14.25 descartável (Docker), que é a versão do servidor 2:

1. Banco `naosalvo` criado do zero com `scripts/ci/check-migrations.sh` (7 migrações + seed).
2. `pg-backup.sh` rodou contra ele (`pg_dump 14.25`):

```
[naosalvo] ok: /backups/naosalvo/naosalvo_20261119_152239Z.dump (90128 bytes)
[naosalvo_dev] ok: /backups/naosalvo_dev/naosalvo_dev_20261119_152239Z.dump (874 bytes)
pg-backup: tudo certo
```

3. Restauração do dump num segundo Postgres 14 limpo: `restore_exit=0`.
4. Comparação origem × restaurado:

```
origem : memes=75 cartas=109 migracoes=7 tabelas=28
restaur: memes=75 cartas=109 migracoes=7 tabelas=28
hash das contagens de todas as tabelas, origem  : 7eff094bd45141c17ffaa1bd311ab810
hash das contagens de todas as tabelas, restaur.: 7eff094bd45141c17ffaa1bd311ab810
```

Também verificado em teste anterior (Postgres 16): retenção removeu só os dumps velhos e preservou `MIN_KEEP=3`; banco inexistente gera `FALHOU` e saída `1`, sem deixar `.partial`.

Limite do teste: os dados eram o seed do acervo, sem contas, votos ou comentários reais. Repita o ciclo com um dump de produção real antes de confiar nele, e **repita periodicamente** (sugestão: mensal), porque backup não testado não é backup.

## Como agendar no servidor 2 (proposta, nada foi instalado)

Hoje o Postgres roda como serviço Swarm `postgres_postgres` (imagem `postgres:14`, volume `postgres_data`) na rede overlay `v0net`. O Swarm não tem cron nativo, então há duas opções:

**Opção A (recomendada, simples): cron no host `lab4`** disparando um container descartável na rede `v0net`:

```cron
# /etc/cron.d/naosalvo-backup  (diário, 03:30)
30 3 * * * root docker run --rm --network v0net \
  -e PGHOST=postgres -e PGPASSFILE=/secrets/pgpass \
  -e BACKUP_DIR=/backups -e RETENTION_DAYS=14 \
  -v /srv/backups/naosalvo:/backups \
  -v /srv/secrets/naosalvo_pgpass:/secrets/pgpass:ro \
  -v /srv/naosalvo/scripts/backup/pg-backup.sh:/pg-backup.sh:ro \
  postgres:14 bash /pg-backup.sh >> /var/log/naosalvo-backup.log 2>&1
```

Pré-requisitos a criar quando for instalar: pasta `/srv/backups/naosalvo`, o `pgpass` (modo `600`, com as duas linhas), o script em `/srv/naosalvo/`, e alerta quando o log tiver `FALHOU` ou o cron sair com erro (por exemplo `|| curl` num webhook). Como o `docker run` precisa alcançar `postgres` pela rede `v0net`, ela deve ser `attachable` (confira antes: `docker network inspect v0net`).

**Opção B: serviço Swarm com laço de `sleep`** (mesma imagem e script, `restart_policy: any`, `while true; do bash /pg-backup.sh; sleep 86400; done`). Fica dentro do próprio stack, mas o horário deriva a cada reinício e falha silenciosa é mais fácil de passar batida.

Independente da opção:

- **Cópia fora do servidor.** Dump no mesmo disco do banco não protege contra perda do disco. Copie `/srv/backups/naosalvo` para outro lugar (outra máquina ou bucket) por `rclone` ou `rsync`.
- **Antes de migração arriscada** (ex.: promoção `dev` → `main`), rode o script manualmente. É o "backup feito" do checklist de release.
- **Alerta de falha:** o script sai com `1` se qualquer banco falhar; ligue isso ao canal de alertas.

---

# Backup do Bucket S3 (MinIO)

Script: `scripts/backup/s3-backup.sh`. Faz espelhamento do bucket S3 (`naosalvo/midias/`) via `mc mirror --overwrite` para uma pasta de destino, gera um snapshot diário compactado (`.tar.gz`) e gerencia retenção com `RETENTION_DAYS` e `MIN_KEEP`.

## Configuração

| Variável | Padrão | Para quê |
|---|---|---|
| `S3_ENDPOINT` | `https://s3.fishlab.com.br` | URL da API do MinIO/S3 |
| `S3_BUCKET` | `naosalvo` | Nome do bucket |
| `S3_PREFIX` | `midias` | Prefixo das imagens do acervo |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | — | Credenciais de acesso ao bucket |
| `S3_ACCESS_KEY_FILE` / `S3_SECRET_KEY_FILE` | — | Alternativa: caminho de arquivos contendo as credenciais |
| `BACKUP_DIR` | `./backups` | Pasta de saída (`s3_mirror/` e `s3_snapshots/`) |
| `RETENTION_DAYS` | `14` | Apaga snapshots com mais de N dias (`0` = nunca apaga) |
| `MIN_KEEP` | `3` | Nunca deixa menos que N snapshots |

Arquivos gerados:
- Espelho sincronizado: `<BACKUP_DIR>/s3_mirror/<bucket>/<prefixo>/`
- Snapshots compactados: `<BACKUP_DIR>/s3_snapshots/<bucket>_<prefixo>_AAAAMMDD_HHMMSSZ.tar.gz`

## Como agendar junto do `pg-backup`

No host `lab4`, é recomendável agendar o backup do S3 imediatamente antes ou logo após o backup do banco de dados (exemplo às 03:45 UTC):

```cron
# /etc/cron.d/naosalvo-backup
30 3 * * * root docker run --rm --network v0net \
  -e PGHOST=postgres -e PGPASSFILE=/secrets/pgpass \
  -e BACKUP_DIR=/backups -e RETENTION_DAYS=14 \
  -v /srv/backups/naosalvo:/backups \
  -v /srv/secrets/naosalvo_pgpass:/secrets/pgpass:ro \
  -v /srv/naosalvo/scripts/backup/pg-backup.sh:/pg-backup.sh:ro \
  postgres:14 bash /pg-backup.sh >> /var/log/naosalvo-backup.log 2>&1

45 3 * * * root docker run --rm \
  -e S3_ENDPOINT=https://s3.fishlab.com.br \
  -e S3_BUCKET=naosalvo -e S3_PREFIX=midias \
  -e S3_ACCESS_KEY_FILE=/secrets/s3_access \
  -e S3_SECRET_KEY_FILE=/secrets/s3_secret \
  -e BACKUP_DIR=/backups -e RETENTION_DAYS=14 \
  -v /srv/backups/naosalvo:/backups \
  -v /srv/secrets/s3_access:/secrets/s3_access:ro \
  -v /srv/secrets/s3_secret:/secrets/s3_secret:ro \
  -v /srv/naosalvo/scripts/backup/s3-backup.sh:/s3-backup.sh:ro \
  minio/mc:latest bash /s3-backup.sh >> /var/log/naosalvo-s3-backup.log 2>&1
```

