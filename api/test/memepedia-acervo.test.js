// Memepédia: textos do acervo (pesquisados, com fonte) e correções do acervo por migração (020).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { bancoDeTeste, servidor, semBanco } from './helpers.js';
import { TEXTOS_ACERVO, AUTOR_ACERVO, semearMemepedia } from '../lib/memepedia-acervo.js';
import { CAMPOS_MEMEPEDIA } from '../routes/memepedia.js';

const RAIZ = new URL('../../', import.meta.url);
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('data.js', RAIZ), 'utf8') + ';this.MEMES=MEMES', ctx);
const MEMES = ctx.MEMES;

test('textos do acervo: meme existe, campo válido, 10 a 2000 caracteres, fonte https e sem repetir meme+campo', () => {
  const ids = new Set(MEMES.map((m) => m.id)), vistos = new Set();
  assert.ok(TEXTOS_ACERVO.length >= 20);
  for (const [meme, campo, texto, fonte] of TEXTOS_ACERVO) {
    assert.ok(ids.has(meme), 'meme inexistente: ' + meme);
    assert.ok(CAMPOS_MEMEPEDIA.includes(campo), campo);
    assert.ok(texto.length >= 10 && texto.length <= 2000, meme + '/' + campo);
    assert.match(fonte, /^https:\/\/\S+$/, meme + '/' + campo);
    assert.ok(!vistos.has(meme + '/' + campo), 'repetido: ' + meme + '/' + campo); vistos.add(meme + '/' + campo);
  }
  assert.match(AUTOR_ACERVO, /^[\w.-]{3,20}$/);
});

test('data.js: Lagoinha no lugar de Sertãozinho, com o vídeo certo', () => {
  const m = MEMES.find((x) => x.id === 'aonde-e-que-eu-to-sertaozinho');
  assert.match(m.t, /Lagoinha/); assert.equal(m.yt, 'zbnwWlrN5mo'); assert.equal(m.img, undefined);
  assert.ok(!JSON.stringify(MEMES).includes('Sertãozinho'));
});

const pular = semBanco();
let db, api;
before(async () => { if (pular) return; db = await bancoDeTeste({ seed: true }); api = await servidor(db.pool, { adminToken: 'segredo' }); });
after(async () => { if (pular) return; await api.fechar(); await db.fechar(); });
const q = async (sql, v) => (await db.pool.query(sql, v)).rows;

test('semear: publica uma vez, não passa por cima da comunidade e não volta se a moderação recusar', { skip: pular }, async () => {
  // a comunidade já publicou a origem do Taca-le pau: o acervo não entra nesse campo
  await q(`INSERT INTO memepedia_edicoes (meme_id, campo, texto, autor, status, revisado_em) VALUES ('taca-le-pau-marcos','origem','Texto da comunidade sobre a origem.','fulano','aprovado',now())`);
  const n = await semearMemepedia(db.pool, { log: () => {} });
  assert.equal(n, TEXTOS_ACERVO.length - 1);
  assert.equal(await semearMemepedia(db.pool, { log: () => {} }), 0, 'idempotente');
  const r = await api.get('/api/memepedia?id=gravida-de-taubate');
  assert.equal(r.status, 200);
  assert.equal(r.json['gravida-de-taubate'].origem.autor, AUTOR_ACERVO);
  assert.match(r.json['gravida-de-taubate'].origem.fonte, /^https:/);
  assert.equal((await api.get('/api/memepedia?id=taca-le-pau-marcos')).json['taca-le-pau-marcos'].origem.autor, 'fulano');
  // moderação recusou um texto do acervo: não é publicado de novo
  await q(`UPDATE memepedia_edicoes SET status = 'recusado' WHERE meme_id = 'menino-ima' AND campo = 'rede' AND autor = $1`, [AUTOR_ACERVO]);
  assert.equal(await semearMemepedia(db.pool, { log: () => {} }), 0);
  assert.equal((await api.get('/api/memepedia?id=menino-ima')).json['menino-ima'].rede, undefined);
});

test('migração 020: corrige só o que ainda está com o valor antigo (edição do admin fica)', { skip: pular }, async () => {
  const sql = readFileSync(new URL('api/migrations/020_acervo_correcoes_lote1.sql', RAIZ), 'utf8');
  // volta o banco ao estado antigo (como em produção antes da correção)
  await q(`UPDATE memes SET titulo = 'Aonde É Que Eu Tô? Sertãozinho!', ano = 2015, data = '2015-10-09', youtube_id = 'L1EkzLJXkrM', autor = 'Web Caipira' WHERE id = 'aonde-e-que-eu-to-sertaozinho'`);
  await q(`INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ('aonde-e-que-eu-to-sertaozinho', 'imagem', 'memes/aonde-e-q-eu-to-sertaozinho.jpg', 0)`);
  await q(`UPDATE memes SET data = '2010-04-18' WHERE id = 'puta-falta-de-sacanagem'`);
  await q(`UPDATE memes SET descricao = 'Texto que o admin escreveu.' WHERE id = 'gravida-de-taubate'`);
  const cli = await db.pool.connect();
  try { await cli.query('BEGIN'); await cli.query(sql); await cli.query(sql); await cli.query('COMMIT'); } finally { cli.release(); }
  const [l] = await q(`SELECT titulo, ano, to_char(data, 'YYYY-MM-DD') AS data, youtube_id, autor FROM memes WHERE id = 'aonde-e-que-eu-to-sertaozinho'`);
  assert.deepEqual(l, { titulo: 'Onde É Que Eu Tô? Será Que Tô na Lagoinha?', ano: 2020, data: '2020-12-26', youtube_id: 'zbnwWlrN5mo', autor: null });
  assert.equal((await q(`SELECT count(*)::int AS n FROM midias WHERE meme_id = 'aonde-e-que-eu-to-sertaozinho'`))[0].n, 0);
  assert.equal((await q(`SELECT to_char(data, 'YYYY-MM-DD') AS d FROM memes WHERE id = 'puta-falta-de-sacanagem'`))[0].d, '2010-04-28');
  assert.equal((await q(`SELECT descricao FROM memes WHERE id = 'gravida-de-taubate'`))[0].descricao, 'Texto que o admin escreveu.');
});
