// Limpeza de eventos_meme_ip contra Postgres descartável (pulado sem TEST_DB_NAME).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bancoDeTeste, semBanco } from './helpers.js';
import { limparEventosIp, agendarLimpezaEventosIp } from '../lib/limpeza.js';

const skip = semBanco();
let db;
before(async () => { if (!skip) db = await bancoDeTeste(); });
after(async () => { if (!skip) await db.fechar(); });

const HOJE = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
const q = async (sql, v) => (await db.pool.query(sql, v)).rows;
// insere n linhas no dia (hoje - atras)
const semear = (atras, n, prefixo) => db.pool.query(
  `INSERT INTO eventos_meme_ip (meme_id, tipo, dia, ip_hash)
   SELECT 'm', 'visita', ${HOJE} - $1::int, $3 || g FROM generate_series(1, $2::int) g`, [atras, n, prefixo]);
const contar = async (atras) => (await q(`SELECT count(*)::int n FROM eventos_meme_ip WHERE dia = ${HOJE} - $1::int`, [atras]))[0].n;

test('apaga dia < hoje-2 e mantém hoje, ontem, anteontem e o futuro', { skip }, async () => {
  await db.pool.query('TRUNCATE eventos_meme_ip');
  for (const [atras, n] of [[-1, 2], [0, 3], [1, 4], [2, 5], [3, 6], [10, 7]]) await semear(atras, n, `d${atras}_`);
  const apagadas = await limparEventosIp(db.pool);
  assert.equal(apagadas, 6 + 7);
  assert.deepEqual([await contar(-1), await contar(0), await contar(1), await contar(2), await contar(3), await contar(10)], [2, 3, 4, 5, 0, 0]);
});

test('apaga em lotes (mais linhas que o tamanho do lote) e é idempotente', { skip }, async () => {
  await db.pool.query('TRUNCATE eventos_meme_ip');
  await semear(5, 23, 'a');
  await semear(0, 2, 'b');
  let consultas = 0;
  const pool = { query: (...a) => { consultas++; return db.pool.query(...a); } };
  assert.equal(await limparEventosIp(pool, { lote: 5 }), 23);
  assert.equal(consultas, 5, '23 linhas em lotes de 5 = 5 DELETEs (o último parcial encerra)');
  assert.equal(await contar(0), 2);
  assert.equal(await limparEventosIp(db.pool), 0);
});

test('o índice por dia existe (migração 011)', { skip }, async () => {
  const r = await q(`SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'eventos_meme_ip_dia_idx'`);
  assert.equal(r.length, 1);
});

test('agendarLimpezaEventosIp roda no boot, usa unref e nunca lança', { skip }, async () => {
  await db.pool.query('TRUNCATE eventos_meme_ip');
  await semear(9, 3, 'x');
  const logs = [];
  const log = { log: (m) => logs.push(m), error: (m) => logs.push('ERRO ' + m) };
  const t = agendarLimpezaEventosIp(db.pool, { log, intervaloMs: 3_600_000 });
  try {
    await t.primeira;
    assert.equal(t.hasRef(), false, 'o timer não pode segurar o processo');
    assert.equal(await contar(9), 0);
    assert.ok(logs.some((l) => /3 linhas/.test(l)), logs.join('|'));
  } finally { clearInterval(t); }
});

test('falha do banco vira log, não exceção', async () => {
  const logs = [];
  const pool = { query: async () => { throw new Error('banco caiu'); } };
  const t = agendarLimpezaEventosIp(pool, { log: { log() {}, error: (m) => logs.push(m) }, intervaloMs: 3_600_000 });
  try {
    await t.primeira; // não rejeita
    assert.match(logs[0], /falhou: banco caiu/);
  } finally { clearInterval(t); }
});
