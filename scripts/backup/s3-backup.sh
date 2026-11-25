#!/usr/bin/env bash
# Backup do bucket S3/MinIO do Não Salvo via MinIO Client (mc mirror).
#
# Sem credenciais hardcoded. As chaves vêm das variáveis de ambiente:
#   S3_ENDPOINT       endpoint da API S3                     (padrão: https://s3.fishlab.com.br)
#   S3_BUCKET         nome do bucket                          (padrão: naosalvo)
#   S3_PREFIX         prefixo a espelhar                      (padrão: midias)
#   S3_ACCESS_KEY     chave de acesso
#   S3_SECRET_KEY     chave secreta
#   ou arquivos de secret:
#   S3_ACCESS_KEY_FILE / S3_SECRET_KEY_FILE (lidos se S3_ACCESS_KEY/S3_SECRET_KEY não definidos)
#
# Variáveis de destino e retenção:
#   BACKUP_DIR        pasta raiz de backup local              (padrão: ./backups)
#   RETENTION_DAYS    apaga snapshots com mais de N dias      (padrão: 14; 0 = nunca apaga)
#   MIN_KEEP          número mínimo de snapshots a manter     (padrão: 3)
#
# Modo de operação:
#   1. Mantém uma pasta mirror local contínua em $BACKUP_DIR/s3_mirror/$S3_BUCKET/$S3_PREFIX
#      usando 'mc mirror --overwrite'.
#   2. Cria um snapshot compactado diário/por execução em:
#      $BACKUP_DIR/s3_snapshots/${S3_BUCKET}_${S3_PREFIX}_AAAAMMDD_HHMMSSZ.tar.gz
#   3. Aplica a retenção aos snapshots .tar.gz preservando os MIN_KEEP mais novos.
#
# Código de saída: 0 em sucesso, >0 em caso de falha.
set -u -o pipefail

S3_ENDPOINT="${S3_ENDPOINT:-https://s3.fishlab.com.br}"
S3_BUCKET="${S3_BUCKET:-naosalvo}"
S3_PREFIX="${S3_PREFIX:-midias}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MIN_KEEP="${MIN_KEEP:-3}"

# Leitura segura de credenciais
if [ -z "${S3_ACCESS_KEY:-}" ] && [ -n "${S3_ACCESS_KEY_FILE:-}" ] && [ -f "$S3_ACCESS_KEY_FILE" ]; then
  S3_ACCESS_KEY="$(tr -d '\r\n' < "$S3_ACCESS_KEY_FILE")"
fi

if [ -z "${S3_SECRET_KEY:-}" ] && [ -n "${S3_SECRET_KEY_FILE:-}" ] && [ -f "$S3_SECRET_KEY_FILE" ]; then
  S3_SECRET_KEY="$(tr -d '\r\n' < "$S3_SECRET_KEY_FILE")"
fi

if [ -z "${S3_ACCESS_KEY:-}" ] || [ -z "${S3_SECRET_KEY:-}" ]; then
  echo "s3-backup: S3_ACCESS_KEY e S3_SECRET_KEY (ou respectivos *_FILE) são obrigatórios" >&2
  exit 2
fi

case "$RETENTION_DAYS$MIN_KEEP" in *[!0-9]*) echo "RETENTION_DAYS e MIN_KEEP precisam ser inteiros" >&2; exit 2;; esac
command -v mc >/dev/null || { echo "MinIO Client (mc) não encontrado no PATH" >&2; exit 2; }
command -v tar >/dev/null || { echo "tar não encontrado no PATH" >&2; exit 2; }

# Pasta temporária para configuração isolada do mc (evita conflitar com ~/.mc do host)
MC_TEMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'mctmp')"
trap 'rm -rf "$MC_TEMP_DIR"' EXIT

ALIAS_NAME="backup-$$-${RANDOM:-0}"
export MC_CONFIG_DIR="$MC_TEMP_DIR"

# Configura alias temporário
mc alias set "$ALIAS_NAME" "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null || {
  echo "s3-backup: falha ao configurar alias no mc" >&2
  exit 1
}

TARGET_MIRROR="$BACKUP_DIR/s3_mirror/$S3_BUCKET/$S3_PREFIX"
SNAPSHOTS_DIR="$BACKUP_DIR/s3_snapshots"
mkdir -p "$TARGET_MIRROR" "$SNAPSHOTS_DIR" || {
  echo "s3-backup: não foi possível criar diretórios em $BACKUP_DIR" >&2
  exit 1
}

echo "s3-backup: sincronizando $ALIAS_NAME/$S3_BUCKET/$S3_PREFIX -> $TARGET_MIRROR..."
if ! mc mirror --overwrite "$ALIAS_NAME/$S3_BUCKET/$S3_PREFIX" "$TARGET_MIRROR"; then
  echo "s3-backup: falha na sincronização do mc mirror" >&2
  exit 1
fi

stamp="$(date -u +%Y%m%d_%H%M%SZ)"
snapshot_file="$SNAPSHOTS_DIR/${S3_BUCKET}_${S3_PREFIX}_${stamp}.tar.gz"
parcial="$snapshot_file.partial"

echo "s3-backup: criando snapshot compactado em $snapshot_file..."
if tar -czf "$parcial" -C "$BACKUP_DIR/s3_mirror/$S3_BUCKET" "$S3_PREFIX" && mv "$parcial" "$snapshot_file"; then
  echo "s3-backup: snapshot concluído com sucesso ($(wc -c < "$snapshot_file") bytes)"
else
  echo "s3-backup: falha ao criar snapshot compactado" >&2
  rm -f "$parcial"
  exit 1
fi

# Retenção dos snapshots antigos
if [ "$RETENTION_DAYS" -gt 0 ]; then
  total="$(find "$SNAPSHOTS_DIR" -maxdepth 1 -name "${S3_BUCKET}_${S3_PREFIX}_*.tar.gz" | wc -l)"
  find "$SNAPSHOTS_DIR" -maxdepth 1 -name "${S3_BUCKET}_${S3_PREFIX}_*.tar.gz" -mtime +"$RETENTION_DAYS" -print | sort | while read -r velho; do
    [ "$total" -le "$MIN_KEEP" ] && break
    rm -f "$velho" && total=$((total-1)) && echo "s3-backup: retenção: removido snapshot $velho"
  done
fi

echo "s3-backup: tudo certo"
