// Aviso (não falha) quando css/js muda sem trocar o ?v= em index.html, album.html e seppzone/index.html.
// Uso: node scripts/ci/check-asset-versions.mjs [baseRef] [--strict]
// baseRef padrão: origin/$GITHUB_BASE_REF no CI, senão origin/dev. --strict transforma aviso em erro.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const strict = process.argv.includes('--strict');
const base = process.argv.slice(2).find(a => !a.startsWith('--'))
  || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/dev');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const PAGES = ['index.html', 'album.html', 'seppzone/index.html'];

let changed;
try { changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean); }
catch (e) {
  console.log(`check-asset-versions: não deu pra comparar com ${base} (${e.message.split('\n')[0]}); pulando`);
  process.exit(0);
}

// Assets do site ficam na raiz do repositório.
const assets = changed.filter(f => /\.(css|js)$/.test(f) && !f.includes('/'));
const refRe = /(?:href|src)="\/?([^"?]+\.(?:css|js))\?v=([^"]+)"/g;
const refs = text => [...text.matchAll(refRe)].map(x => [x[1], x[2]]);

let warns = 0;
for (const asset of assets) {
  for (const page of PAGES) {
    const head = refs(readFileSync(resolve(root, page), 'utf8')).filter(([f]) => f === asset);
    if (!head.length) continue; // página não usa esse asset
    let baseText = '';
    try { baseText = git('show', `${base}:${page}`); } catch { /* página nova */ }
    const old = refs(baseText).filter(([f]) => f === asset).map(([, v]) => v);
    if (head.some(([, v]) => old.includes(v))) {
      warns++;
      console.log(`::warning file=${page}::${asset} mudou mas ${page} manteve ?v=${head[0][1]}`);
    }
  }
}
console.log(`check-asset-versions: ${assets.length} css/js alterados vs ${base}, ${warns} aviso(s)`);
process.exit(strict && warns ? 1 : 0);
