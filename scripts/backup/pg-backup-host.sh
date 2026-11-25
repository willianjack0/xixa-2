#!/usr/bin/env bash
# Backup agendado no host do servidor 2 (lab4): pg_dump -Fc dentro do container do Postgres (Swarm),
# sem senha (o usuario postgres do container). Roda do cron do host; nao precisa de rede nem de pgpass.
#
# Saida: $BACKUP_DIR/<banco>_AAAAMMDD-HHMMSS.dump  (hora UTC)
# Escreve em .partial e so renomeia depois de validar com pg_restore --list.
# Retencao: apaga dumps agendados com mais de RETENTION_DAYS dias, sempre mantendo MIN_KEEP por banco.
# So mexe em arquivos com o padrao exato <banco>_AAAAMMDD-HHMMSS.dump (nunca em dumps manuais, ex. pre-release).
# Codigo de saida 0 so se todos os bancos deram certo.
set -u -o pipefail

BACKUP_DIR="${BACKUP_DIR:-/mnt/lab_data/backups/naosalvo}"
DATABASES="${DATABASES:-naosalvo naosalvo_dev}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MIN_KEEP="${MIN_KEEP:-6}"

mkdir -p "$BACKUP_DIR"
ctr="$(docker ps --filter name=postgres_postgres --format '{{.Names}}' | head -1)"
[ -n "$ctr" ] || { echo "$(date -u +%FT%TZ) FALHOU: container postgres_postgres nao encontrado" >&2; exit 1; }

ts="$(date -u +%Y%m%d-%H%M%S)"
falhas=0
for banco in $DATABASES; do
  final="$BACKUP_DIR/${banco}_${ts}.dump"; parcial="$final.partial"
  if docker exec "$ctr" pg_dump -Fc -U postgres "$banco" > "$parcial" 2> "$parcial.err" \
     && docker exec -i "$ctr" pg_restore --list > /dev/null < "$parcial" 2>> "$parcial.err" \
     && [ -s "$parcial" ]; then
    mv "$parcial" "$final"; rm -f "$parcial.err"
    echo "$(date -u +%FT%TZ) [$banco] OK $(basename "$final") $(stat -c %s "$final") bytes"
  else
    echo "$(date -u +%FT%TZ) [$banco] FALHOU: $(head -c 300 "$parcial.err" 2>/dev/null)" >&2
    rm -f "$parcial" "$parcial.err"; falhas=$((falhas+1)); continue
  fi
  if [ "$RETENTION_DAYS" -gt 0 ]; then
    mapfile -t todos < <(ls -1 "$BACKUP_DIR" | grep -E "^${banco}_[0-9]{8}-[0-9]{6}\.dump$" | sort)
    total=${#todos[@]}
    for f in "${todos[@]}"; do
      [ "$total" -le "$MIN_KEEP" ] && break
      if [ -n "$(find "$BACKUP_DIR/$f" -mtime +"$RETENTION_DAYS" -print 2>/dev/null)" ]; then
        rm -f "$BACKUP_DIR/$f" && total=$((total-1)) && echo "$(date -u +%FT%TZ) [$banco] retencao: removido $f"
      fi
    done
  fi
done
exit $((falhas > 0 ? 1 : 0))
