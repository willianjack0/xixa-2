// Stack do vp3: o serviço de backup do banco existe, usa o secret (nunca senha no repositório), valida o dump e tem retenção.
// Confere o texto do arquivo (sem biblioteca de YAML): protege contra apagarem o backup sem querer num ajuste da stack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stack = readFileSync(new URL('../deploy/vp3/stack.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const i = stack.indexOf('\n  backup:\n');
const bloco = stack.slice(i, stack.indexOf('\nsecrets:', i));

test('stack tem o serviço backup, na rede da produção e com o Postgres 14 do servidor', () => {
  assert.ok(i > 0, 'serviço backup');
  assert.match(bloco, /image: postgres:14\n/);
  assert.match(bloco, /PGHOST: postgres_postgres/);
  assert.match(bloco, /- jknet/);
  assert.match(bloco, /\/opt\/naosalvo-backups:\/backups/);
});

test('senha só pelo Docker secret, nunca escrita na stack', () => {
  assert.match(bloco, /PGPASSWORD_FILE: \/run\/secrets\/naosalvo_db_password/);
  assert.match(bloco, /secrets:\n      - naosalvo_db_password/);
  assert.doesNotMatch(bloco, /PGPASSWORD:/);
});

test('dump é validado antes de valer, tem marcadores e retenção com mínimo', () => {
  assert.match(bloco, /pg_dump -Fc --no-owner -f/);
  assert.match(bloco, /pg_restore --list/);
  assert.match(bloco, /\.partial/);
  assert.match(bloco, /ULTIMO_OK/); assert.match(bloco, /ULTIMA_FALHA/);
  assert.match(bloco, /BACKUP_KEEP_DAYS: "14"/); assert.match(bloco, /BACKUP_MIN_KEEP: "3"/);
});

test('horários: 06:00 e 15:00 UTC (03:00 e 12:00 de Brasília), reinício automático e limite de memória', () => {
  assert.match(bloco, /prox=\$\$\(\(dia \+ 21600\)\)/);   // 06:00 UTC
  assert.match(bloco, /prox=\$\$\(\(dia \+ 54000\)\)/);   // 15:00 UTC
  assert.match(bloco, /condition: any/);
  assert.match(bloco, /memory: 256M/);
});

test('o corpo do script usa $$ (o Docker troca por $); um $ simples seria interpolado pelo stack deploy', () => {
  const k = bloco.indexOf('      - |\n');
  const script = bloco.slice(k, bloco.indexOf('    deploy:'));
  assert.doesNotMatch(script.replace(/\$\$/g, ''), /\$[({A-Za-z_]/);
});
