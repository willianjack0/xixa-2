// Monitor de produção (workflow agendado): confere o texto do arquivo. Sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const w = readFileSync(new URL('../.github/workflows/monitor-producao.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('roda a cada 15 minutos e sob demanda, com permissão mínima (só issues)', () => {
  assert.match(w, /cron: '\*\/15 \* \* \* \*'/);
  assert.match(w, /workflow_dispatch:/);
  assert.match(w, /permissions:\n  contents: read\n  issues: write/);
});

test('confere API de saúde (ok e banco), versão e página inicial, com 3 tentativas', () => {
  assert.match(w, /\$SITE\/api\/health/); assert.match(w, /"banco":/);
  assert.match(w, /\$SITE\/versao\.json/);
  assert.match(w, /for i in 1 2 3/);
});

test('abre issue com rótulo, comenta se já existe e fecha quando volta', () => {
  assert.match(w, /ROTULO: producao-fora/);
  assert.match(w, /gh issue create/); assert.match(w, /gh issue comment/); assert.match(w, /gh issue close/);
});

test('sem segredos: só o token do próprio workflow', () => {
  assert.doesNotMatch(w, /secrets\./);
  assert.match(w, /GH_TOKEN: \$\{\{ github\.token \}\}/);
});
