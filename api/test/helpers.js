// Apoio aos testes (node:test).
//  - servidor(pool): sobe a API numa porta aleatória com o pool dado (real ou falso).
//  - bancoDeTeste(): Postgres descartável. Só roda se TEST_DB_NAME estiver definido (o CI sem Postgres pula esses testes).
//    Cada arquivo de teste ganha um SCHEMA próprio (search_path), então arquivos em paralelo não se atrapalham.
//    Variáveis: TEST_DB_HOST (127.0.0.1), TEST_DB_PORT (5432), TEST_DB_USER, TEST_DB_PASSWORD, TEST_DB_NAME (obrigatória).
//    SEGURANÇA: o nome do banco precisa conter "test" ou "descart" — nunca aponte para naosalvo/naosalvo_dev.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarApp } from '../app.js';

// contagens esperadas lidas do data.js atual (o acervo cresce; os testes não fixam número)
export function dadosDataJs() {
  const ctx = vm.createContext({});
  const arq = fileURLToPath(new URL('../../data.js', import.meta.url));
  vm.runInContext(readFileSync(arq, 'utf8') + ';this.M=MEMES;this.Y=YEAR_INFO;this.C=COLLECTIONS', ctx);
  const porCategoria = {}; for (const m of ctx.M) porCategoria[m.c] = (porCategoria[m.c] || 0) + 1;
  return { porCategoria, memes: ctx.M.length, eras: Object.keys(ctx.Y).length, colecoes: ctx.C.length, cartas: ctx.C.reduce((n, c) => n + c.cards.length, 0) };
}

export const temBanco = () => !!process.env.TEST_DB_NAME;
export const semBanco = () => (temBanco() ? false : 'defina TEST_DB_NAME (Postgres descartável) para rodar');

// O fetch do Node recusa certas portas ("bad port", lista do WHATWG). Com porta aleatória, de vez em quando o sistema
// sorteava uma delas e o teste falhava sem motivo. Sorteia de novo até cair numa porta que o fetch aceita.
const PORTAS_RECUSADAS = new Set([1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]);
async function ouvirEmPortaAceita(server) {
  for (let i = 0; i < 30; i++) {
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    if (!PORTAS_RECUSADAS.has(server.address().port)) return;
    await new Promise((ok) => server.close(ok));
  }
  throw new Error('não consegui uma porta aceita pelo fetch depois de 30 tentativas');
}

export async function servidor(pool, opcoes = {}) {
  const { server, router } = criarApp({ pool, ...opcoes });
  await ouvirEmPortaAceita(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const chamar = async (metodo, caminho, { corpo, headers = {} } = {}) => {
    const r = await fetch(base + caminho, {
      redirect: 'manual', // a API só redireciona no login; os testes inspecionam o 302
      method: metodo,
      headers: { ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined
    });
    const texto = await r.text();
    let json; try { json = JSON.parse(texto); } catch { json = texto; }
    return { status: r.status, json, headers: r.headers, cookies: r.headers.getSetCookie() };
  };
  return {
    base, router,
    get: (c, o) => chamar('GET', c, o),
    post: (c, corpo, o = {}) => chamar('POST', c, { ...o, corpo }),
    patch: (c, corpo, o = {}) => chamar('PATCH', c, { ...o, corpo }),
    del: (c, o) => chamar('DELETE', c, o),
    fechar: () => new Promise((ok) => server.close(ok))
  };
}

/** Cria um schema novo, aplica as migrações e (opcional) o seed. Devolve { pool, fechar }. */
export async function bancoDeTeste({ seed = false } = {}) {
  const nome = process.env.TEST_DB_NAME;
  if (!/test|descart/i.test(nome)) throw new Error(`TEST_DB_NAME="${nome}" não parece banco de teste (precisa conter "test" ou "descart")`);
  // arquivos de teste rodam em paralelo e migram um de cada vez (trava advisory): em disco lento a espera passa dos 30 s padrão
  process.env.MIGRATE_ADVISORY_TIMEOUT ||= '300s';
  process.env.MIGRATE_LOCK_TIMEOUT ||= '60s';
  const { default: pg } = await import('pg');
  const { migrar } = await import('../migrate.js');
  const schema = 't_' + Math.random().toString(36).slice(2, 10);
  const base = {
    host: process.env.TEST_DB_HOST || '127.0.0.1', port: +(process.env.TEST_DB_PORT || 5432),
    user: process.env.TEST_DB_USER || 'naosalvo', password: process.env.TEST_DB_PASSWORD || '', database: nome
  };
  const admin = new pg.Pool({ ...base, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ ...base, max: 8, options: `-c search_path=${schema}` });
  await migrar(pool, { log: () => {} });
  if (seed) { const { carregarAcervo } = await import('../seed/acervo.js'); await carregarAcervo(pool, { log: () => {} }); }
  return {
    pool, schema,
    fechar: async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
  };
}
