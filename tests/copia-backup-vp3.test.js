// Cópia fora do servidor: o servidor 2 puxa os dumps do vp3 para /mnt/lab_data/backup. Confere o script e a doc (texto), sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ler = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sh = ler('scripts/backup/puxar-do-vp3.sh');

test('script: sintaxe bash válida', () => {
  const r = spawnSync('bash', ['-n', new URL('../scripts/backup/puxar-do-vp3.sh', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { encoding: 'utf8' });
  if (r.error) return; // sem bash no ambiente: o CI do Linux cobre
  assert.equal(r.status, 0, r.stderr);
});

test('script: só puxa (rsync sem --delete), só dumps e marcadores, chave dedicada e sem senha', () => {
  assert.match(sh, /rsync -a --partial/);
  assert.doesNotMatch(sh, /--delete/);
  assert.match(sh, /--include='naosalvo_\*\.dump'/); assert.match(sh, /--exclude='\*'/);
  assert.match(sh, /BatchMode=yes/); assert.match(sh, /IdentitiesOnly=yes/);
  assert.match(sh, /naosalvo_backup_ed25519/);
  assert.doesNotMatch(sh, /PGPASSWORD|password|senha=/i);
});

test('script: destino no disco do laboratório e verificações (frescor, validação, alerta, retenção com mínimo)', () => {
  assert.match(sh, /\/mnt\/lab_data\/backup\/naosalvo-vp3/);
  assert.match(sh, /ULTIMO_OK/); assert.match(sh, /ULTIMA_FALHA/);
  assert.match(sh, /pg_restore --list/);
  assert.match(sh, /ALERTA\.txt/);
  assert.match(sh, /MIN_MANTER/); assert.match(sh, /RETENCAO_DIAS/);
});

test('doc: chave restrita a leitura (rrsync -ro) e como revogar', () => {
  const d = ler('docs/backup-e-restauracao.md');
  assert.match(d, /restrict,command="\/usr\/bin\/rrsync -ro \/opt\/naosalvo-backups"/);
  assert.match(d, /puxar-do-vp3\.sh/);
  assert.match(d, /revogar/i);
});
