#!/usr/bin/env bash
# Cópia dos backups do banco de PRODUÇÃO (vp3) para o disco do servidor 2 (lab4): /mnt/lab_data/backup, que o Windows
# enxerga como \\192.168.0.9\lab_data\backup. É a cópia fora do servidor: o vp3 guarda os dumps em /opt/naosalvo-backups
# (serviço `backup` da stack) e este script os PUXA, de dentro da rede do laboratório (o vp3 não alcança o servidor 2).
#
# Roda do cron do servidor 2. Usa uma chave SSH própria, que no vp3 só pode LER a pasta de backups (ver docs/backup-e-restauracao.md).
#
# Variáveis (todas opcionais):
#   ORIGEM         usuario@host:pasta/ no vp3          (padrão: root@144.91.91.104:/)  -- com rrsync a pasta já é a raiz
#   DESTINO        pasta local                           (padrão: /mnt/lab_data/backup/naosalvo-vp3)
#   CHAVE          chave privada SSH                     (padrão: ~/.ssh/naosalvo_backup_ed25519)
#   RETENCAO_DIAS  apaga dumps copiados com mais de N dias, nunca deixando menos de MIN_MANTER  (padrão: 60)
#   MIN_MANTER     mínimo de dumps que sempre ficam      (padrão: 10)
#   IDADE_MAX_H    alerta se o ULTIMO_OK do vp3 for mais velho que N horas  (padrão: 30)
#
# Saída: 0 se copiou, validou o dump mais novo e o backup do vp3 está fresco; 1 em qualquer falha (e escreve ALERTA.txt).
# Nunca apaga nada no vp3 (rsync sem --delete e a chave é somente leitura).
set -u -o pipefail

ORIGEM="${ORIGEM:-root@144.91.91.104:/}"
DESTINO="${DESTINO:-/mnt/lab_data/backup/naosalvo-vp3}"
CHAVE="${CHAVE:-$HOME/.ssh/naosalvo_backup_ed25519}"
RETENCAO_DIAS="${RETENCAO_DIAS:-60}"
MIN_MANTER="${MIN_MANTER:-10}"
IDADE_MAX_H="${IDADE_MAX_H:-30}"

case "$RETENCAO_DIAS$MIN_MANTER$IDADE_MAX_H" in *[!0-9]*) echo "RETENCAO_DIAS, MIN_MANTER e IDADE_MAX_H precisam ser inteiros" >&2; exit 2;; esac
[ -r "$CHAVE" ] || { echo "chave SSH não encontrada: $CHAVE" >&2; exit 2; }
umask 077
mkdir -p "$DESTINO" || { echo "não consegui criar $DESTINO" >&2; exit 2; }

agora="$(date -u +%FT%TZ)"
falha() { echo "$agora $1" | tee "$DESTINO/ALERTA.txt" >&2; exit 1; }

# 1) copia só os dumps e os marcadores (sem --delete: o que já veio fica, mesmo se o vp3 apagar pela retenção dele)
rsync -a --partial --timeout=120 \
  --include='naosalvo_*.dump' --include='ULTIMO_OK' --include='ULTIMA_FALHA' --exclude='*' \
  -e "ssh -i $CHAVE -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15" \
  "$ORIGEM" "$DESTINO/" || falha "rsync falhou (rede, chave ou pasta de origem)"

# 2) o backup do vp3 está fresco? (o serviço escreve ULTIMO_OK a cada dump bom e ULTIMA_FALHA se o último falhou)
[ -f "$DESTINO/ULTIMA_FALHA" ] && falha "o vp3 marcou ULTIMA_FALHA: o dump mais recente falhou"
[ -f "$DESTINO/ULTIMO_OK" ] || falha "sem ULTIMO_OK: o serviço backup do vp3 nunca terminou um dump"
ok_em="$(tr -d '\r\n' < "$DESTINO/ULTIMO_OK")"
ok_s="$(date -u -d "$ok_em" +%s 2>/dev/null)" || falha "ULTIMO_OK com data inválida: $ok_em"
idade_h=$(( ( $(date -u +%s) - ok_s ) / 3600 ))
[ "$idade_h" -le "$IDADE_MAX_H" ] || falha "backup velho no vp3: último dump bom há ${idade_h} h (limite ${IDADE_MAX_H} h)"

# 3) valida o dump mais novo que chegou (pg_restore --list, no container do postgres:14 do servidor 2)
novo="$(ls -1t "$DESTINO"/naosalvo_*.dump 2>/dev/null | head -n 1)"
[ -n "$novo" ] || falha "nenhum dump copiado"
docker run --rm -v "$DESTINO":/b:ro postgres:14 pg_restore --list "/b/$(basename "$novo")" > /dev/null \
  || falha "o dump mais novo não passou no pg_restore --list: $(basename "$novo")"

# 4) retenção local: dumps copiados com mais de RETENCAO_DIAS dias, sempre mantendo MIN_MANTER
ls -1t "$DESTINO"/naosalvo_*.dump 2>/dev/null | tail -n +$((MIN_MANTER + 1)) | while read -r velho; do
  if [ -n "$(find "$velho" -mtime +"$RETENCAO_DIAS" 2>/dev/null)" ]; then rm -f -- "$velho"; echo "removido $(basename "$velho")"; fi
done

rm -f "$DESTINO/ALERTA.txt"
echo "$agora ok: $(basename "$novo") ($(du -h "$novo" | cut -f1)), backup do vp3 há ${idade_h} h"
