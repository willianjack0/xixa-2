#!/bin/sh
# Builda as imagens do Não Salvo e publica no Docker Hub (willianjack0/naosalvo-api e willianjack0/naosalvo-web).
# Roda na máquina que tem Docker e `docker login` feito (a vp3 serve). Uso, a partir de um checkout limpo da branch main:
#   sh deploy/vp3/build-push.sh            # tags: <sha7> e latest
#   sh deploy/vp3/build-push.sh --so-build # constrói e não publica (teste)
#   sh deploy/vp3/build-push.sh --sem-latest  # publica só a tag <sha7> (não mexe no latest)
# BUILD_BRANCH=main força o ramo mostrado na tarja (útil em checkout detached; padrão: ramo atual, ou "detached").
# O site recebe ramo, SHA, PR e hora no /versao.json (tarja do rodapé). Nada de segredo entra nas imagens.
set -eu
cd "$(dirname "$0")/../.."
HUB="${HUB:-willianjack0}"
sha=$(git rev-parse --short=7 HEAD)
ramo="${BUILD_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
[ "$ramo" = "HEAD" ] && ramo=detached
pr=$(git log -1 --format=%s | sed -n 's/^Merge pull request #\([0-9][0-9]*\).*/\1/p')
em=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then echo "checkout com alterações não commitadas: publique só de um checkout limpo" >&2; exit 1; fi
echo "== ramo=$ramo sha=$sha pr=${pr:-nenhum} em=$em"

docker build -t "$HUB/naosalvo-api:$sha" -t "$HUB/naosalvo-api:latest" api
docker build -t "$HUB/naosalvo-web:$sha" -t "$HUB/naosalvo-web:latest" \
  --build-arg "BUILD_BRANCH=$ramo" --build-arg "BUILD_SHA=$sha" --build-arg "BUILD_PR=$pr" --build-arg "BUILD_AT=$em" .

case "${1:-}" in
  --so-build) echo "só build: nada foi publicado"; exit 0 ;;
esac
for img in naosalvo-api naosalvo-web; do
  docker push "$HUB/$img:$sha"
  [ "${1:-}" = "--sem-latest" ] || docker push "$HUB/$img:latest"
done
echo "== publicado: $HUB/naosalvo-{api,web}:$sha (e latest). No Portainer, NAOSALVO_TAG=$sha e Update the stack."
