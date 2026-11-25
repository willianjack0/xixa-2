// Executor de migrações: aplica api/migrations/NNN_nome.sql em ordem e registra em schema_migrations.
// - Cada arquivo roda numa transação própria (falhou = nada daquele arquivo fica aplicado).
// - Trava advisory: duas réplicas subindo juntas não aplicam a mesma migração duas vezes.
// - Migração já aplicada não pode ser editada (checksum): corrija com uma migração nova.
// Uso: importado pelo server.js na subida, ou `node migrate.js` (lê as variáveis DB_* e *_FILE).
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { tamanhoDoPool, segredo } from './lib/config.js';
export { segredo };

const PASTA = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const TRAVA = 7_435_001; // chave arbitrária do pg_advisory_lock
// limites para não travar a API em produção: ALTER em tabela em uso espera pouco e falha em vez de enfileirar tudo
const LOCK_TIMEOUT = process.env.MIGRATE_LOCK_TIMEOUT || '5s';           // espera por lock de tabela
const STATEMENT_TIMEOUT = process.env.MIGRATE_STATEMENT_TIMEOUT || '120s'; // duração máxima de cada comando
const ESPERA_TRAVA = process.env.MIGRATE_ADVISORY_TIMEOUT || '30s';       // espera pela trava entre réplicas
const NOME = /^(\d{3,})_([a-z0-9_]+)\.sql$/;


export const criarPoolDoAmbiente = (extra = {}) => new pg.Pool({
  host: process.env.DB_HOST || 'postgres',
  port: +(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'naosalvo',
  database: process.env.DB_NAME || 'naosalvo',
  password: segredo('DB_PASSWORD'),
  max: tamanhoDoPool(), // DB_POOL_MAX (padrão 10)
  ...extra
});

// LF sempre: o mesmo arquivo dá o mesmo checksum no Windows (CRLF) e no container (LF)
const lerSql = (arquivo) => readFileSync(arquivo, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const checksum = (sql) => createHash('sha256').update(sql).digest('hex');

export function listarMigracoes(pasta = PASTA) {
  const itens = readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort().map((f) => {
    const m = NOME.exec(f);
    if (!m) throw new Error(`Migração com nome fora do padrão NNN_nome.sql: ${f}`);
    const sql = lerSql(join(pasta, f));
    return { versao: m[1], nome: m[2], arquivo: f, sql, checksum: checksum(sql) };
  });
  const vistas = new Set();
  for (const it of itens) {
    if (vistas.has(it.versao)) throw new Error(`Versão de migração duplicada: ${it.versao}`);
    vistas.add(it.versao);
  }
  return itens;
}

/** Aplica as migrações pendentes. Devolve a lista das aplicadas agora. */
export async function migrar(pool, { pasta = PASTA, log = console.log } = {}) {
  const todas = listarMigracoes(pasta);
  const cliente = await pool.connect();
  const aplicadasAgora = [];
  try {
    // lock_timeout também vale para o advisory lock: outra réplica migrando por tempo demais não pendura esta para sempre
    await cliente.query(`SET lock_timeout = '${ESPERA_TRAVA}'`);
    try { await cliente.query('SELECT pg_advisory_lock($1)', [TRAVA]); }
    catch (e) { throw new Error(`Não consegui a trava de migração em ${ESPERA_TRAVA} (outra instância migrando?): ${e.message}`); }
    await cliente.query('RESET lock_timeout');
    await cliente.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        versao      TEXT PRIMARY KEY,
        nome        TEXT NOT NULL,
        checksum    TEXT NOT NULL,
        aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
        duracao_ms  INT NOT NULL DEFAULT 0
      )`);
    const { rows } = await cliente.query('SELECT versao, checksum FROM schema_migrations');
    const feitas = new Map(rows.map((r) => [r.versao, r.checksum]));

    for (const [versao] of feitas) {
      if (!todas.some((m) => m.versao === versao)) {
        // rollback de código depois de migrar: não derruba a API, só avisa
        log(`AVISO: banco tem a migração ${versao} que não existe nos arquivos (código mais antigo que o banco?)`);
      }
    }
    for (const m of todas) {
      if (!feitas.has(m.versao)) continue;
      if (feitas.get(m.versao) !== m.checksum) {
        throw new Error(`Migração ${m.arquivo} foi alterada depois de aplicada. Não edite: crie uma nova.`);
      }
    }
    for (const m of todas) {
      if (feitas.has(m.versao)) continue;
      const ini = Date.now();
      try {
        await cliente.query('BEGIN');
        await cliente.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
        await cliente.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
        await cliente.query(m.sql);
        await cliente.query(
          'INSERT INTO schema_migrations (versao, nome, checksum, duracao_ms) VALUES ($1,$2,$3,$4)',
          [m.versao, m.nome, m.checksum, Date.now() - ini]);
        await cliente.query('COMMIT');
      } catch (e) {
        await cliente.query('ROLLBACK').catch(() => {});
        e.message = `Migração ${m.arquivo} falhou: ${e.message}`;
        throw e;
      }
      log(`migração ${m.arquivo} aplicada (${Date.now() - ini} ms)`);
      aplicadasAgora.push(m.arquivo);
    }
    if (!aplicadasAgora.length) log('migrações: banco já está em dia');
    return aplicadasAgora;
  } finally {
    await cliente.query('RESET lock_timeout').catch(() => {});
    await cliente.query('SELECT pg_advisory_unlock($1)', [TRAVA]).catch(() => {});
    cliente.release();
  }
}

// execução direta: node migrate.js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = criarPoolDoAmbiente();
  try { await migrar(pool); } catch (e) { console.error(e.message); process.exitCode = 1; } finally { await pool.end(); }
}
