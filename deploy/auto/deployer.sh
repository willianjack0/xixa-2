#!/bin/sh
# Deploy automático: consulta o GitHub e publica cada branch na sua stack.
#   main -> stack naosalvo     (naosalvo-local.fishlab.com.br, imagens :latest)
#   dev  -> stack naosalvo-dev (naosalvo-dev.fishlab.com.br,   imagens :dev)
# As stacks usadas vêm de /config (copiadas na criação desta imagem), nunca do repositório.
set -u
REPO="${REPO:-https://github.com/willianjack0/xixa-2.git}"
INTERVAL="${INTERVAL:-60}"
ENVS="${ENVS:-main:naosalvo:latest dev:naosalvo-dev:dev}"   # branch:stack:tag
STATE=/state; WORK=/work
mkdir -p "$STATE" "$WORK"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

deploy_env() {
  branch=$1; stack=$2; tag=$3; sha=$4
  dir="$WORK/$branch"
  rm -rf "$dir"
  git clone -q --depth 1 --branch "$branch" "$REPO" "$dir" 2>&1 || { log "[$branch] clone falhou"; return 1; }
  head=$(git -C "$dir" rev-parse HEAD)
  short=$(echo "$head" | cut -c1-7)
  log "[$branch] publicando $short em $stack"
  # número do PR: vem do título do commit de merge ("Merge pull request #60 from ..."); vazio se não for merge de PR
  pr=$(git -C "$dir" log -1 --format=%s | sed -n 's/^Merge pull request #\([0-9][0-9]*\).*/\1/p')
  built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # guarda a versão atual para poder voltar
  docker tag "naosalvo-api:$tag" "naosalvo-api:$tag-prev" 2>/dev/null
  docker tag "naosalvo-frontend:$tag" "naosalvo-frontend:$tag-prev" 2>/dev/null

  # o build da API falha se o server.js tiver erro de sintaxe (node --check no Dockerfile)
  docker build -q -t "naosalvo-api:$tag" "$dir/api" > /dev/null || { log "[$branch] build da API falhou, nada foi publicado"; return 1; }
  docker build -q --build-arg "BUILD_BRANCH=$branch" --build-arg "BUILD_SHA=$short" --build-arg "BUILD_PR=$pr" --build-arg "BUILD_AT=$built_at" -t "naosalvo-frontend:$tag" "$dir" > /dev/null || { log "[$branch] build do site falhou, nada foi publicado"; return 1; }

  docker stack deploy --resolve-image never --detach=true -c "/config/stack.$branch.yml" "$stack" > /dev/null 2>&1 || { log "[$branch] stack deploy falhou"; return 1; }
  for svc in web api; do
    docker service update --force --detach=false "${stack}_${svc}" > /dev/null 2>&1 || { log "[$branch] ${stack}_${svc} falhou (o Swarm reverte sozinho)"; return 1; }
  done
  echo "$head" > "$STATE/$branch.sha"
  rm -f "$STATE/$branch.failed"
  docker image prune -f > /dev/null 2>&1
  log "[$branch] OK $short"
}

log "deployer iniciado: repo=$REPO intervalo=${INTERVAL}s ambientes=$ENVS"
while true; do
  for e in $ENVS; do
    branch=${e%%:*}; rest=${e#*:}; stack=${rest%%:*}; tag=${rest#*:}
    remote=$(git ls-remote "$REPO" "refs/heads/$branch" 2>/dev/null | cut -f1)
    [ -n "$remote" ] || { log "[$branch] não consegui consultar o GitHub"; continue; }
    [ "$(cat "$STATE/$branch.sha" 2>/dev/null)" = "$remote" ] && continue
    [ "$(cat "$STATE/$branch.failed" 2>/dev/null)" = "$remote" ] && continue   # já falhou nesta versão: espera um commit novo
    deploy_env "$branch" "$stack" "$tag" "$remote" || echo "$remote" > "$STATE/$branch.failed"
  done
  sleep "$INTERVAL"
done
