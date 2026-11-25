#!/usr/bin/env bash
# node --check em todos os JS do site (raiz, seppzone/, contribuir/, dashboard/) e da api/.
set -u
cd "$(dirname "$0")/../.."
fail=0; n=0
while IFS= read -r f; do
  n=$((n+1))
  if ! out=$(node --check "$f" 2>&1); then
    echo "::error file=$f::erro de sintaxe"; echo "$out"; fail=1
  fi
done < <(find . -name '*.js' \
  -not -path '*/node_modules/*' -not -path './.git/*' -not -path './.maestri/*' \
  -not -path './.impeccable/*' -not -path './.secrets/*' -not -path './memes/*' | sort)
if [ "$fail" = 0 ]; then res=OK; else res=FALHOU; fi
echo "check-syntax: $n arquivos, $res"
exit $fail
