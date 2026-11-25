// Migração 021: a coleção "Memes Icônicos" sai do álbum e cada cópia vira moedas (valor de repetida da raridade);
// entram as coleções Lendas do Fotolog e YouTube Raiz, as cartas novas e os memes novos com vídeo.
// Simula o banco de produção (acervo já carregado e a coleção antiga com cartas no inventário) e roda o arquivo
// dentro de uma transação que é desfeita no fim.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bancoDeTeste, semBanco, dadosDataJs } from './helpers.js';

const SQL = readFileSync(fileURLToPath(new URL('../migrations/021_album_figurinhas_memes.sql', import.meta.url)), 'utf8');
let db;
before(async () => { if (!semBanco()) db = await bancoDeTeste({ seed: true }); });
after(async () => { if (db) await db.fechar(); });

test('seed: álbum sem Memes Icônicos e com as coleções novas', { skip: semBanco() }, async () => {
  const cols = (await db.pool.query('SELECT id FROM colecoes ORDER BY ordem')).rows.map((r) => r.id);
  assert.ok(!cols.includes('memes'));
  assert.ok(cols.includes('fotolog') && cols.includes('youtube'));
  const n = (await db.pool.query('SELECT count(*)::int AS n FROM cartas')).rows[0].n;
  assert.equal(n, dadosDataJs().cartas);
});

test('021 converte Memes Icônicos em moedas e traz as cartas e memes novos', { skip: semBanco() }, async () => {
  const cli = await db.pool.connect();
  try {
    await cli.query('BEGIN');
    const q = async (s, p) => (await cli.query(s, p)).rows;
    // estado de produção: coleção antiga com cartas; coleções e memes novos ainda não existem
    await q(`INSERT INTO colecoes (id, nome, ordem) VALUES ('memes', 'Memes Icônicos', 2)`);
    await q(`INSERT INTO cartas (id, colecao_id, numero, nome, raridade) VALUES
      ('memes-0', 'memes', 1, 'Que Show da Xuxa É Esse?!', 'Mítico'), ('memes-1', 'memes', 2, 'Stefhany do Crossfox', 'Comum')`);
    await q(`DELETE FROM cartas WHERE colecao_id IN ('fotolog', 'youtube') OR id = 'orkut-9'`);
    await q(`DELETE FROM colecoes WHERE id IN ('fotolog', 'youtube')`);
    await q(`DELETE FROM memes WHERE id = 'cala-boca-galvao'`);
    const [u] = await q(`INSERT INTO usuarios (apelido, moedas) VALUES ('colecionador', 50) RETURNING id`);
    const [v] = await q(`INSERT INTO usuarios (apelido) VALUES ('sem-memes') RETURNING id`);
    await q(`INSERT INTO movimentos_moeda (usuario_id, valor, motivo) VALUES ($1, 50, 'teste')`, [u.id]);
    await q(`INSERT INTO inventario_cartas (usuario_id, carta_id, quantidade) VALUES ($1, 'memes-0', 2), ($1, 'memes-1', 1), ($1, 'orkut-0', 1)`, [u.id]);
    await q(`UPDATE usuarios SET carta_favorita = 'memes-0' WHERE id = $1`, [u.id]);
    await q(`INSERT INTO pacotes_estoque (usuario_id, tipo, colecao_id, origem) VALUES ($1, 'colecao', 'memes', 'compra')`, [u.id]);

    await cli.query(SQL);

    // 2 × Mítico (150) + 1 × Comum (5) = 305
    const mov = await q(`SELECT ref, valor FROM movimentos_moeda WHERE usuario_id = $1 AND motivo = 'colecao_retirada' ORDER BY ref`, [u.id]);
    assert.deepEqual(mov, [{ ref: 'memes-0', valor: 300 }, { ref: 'memes-1', valor: 5 }]);
    const [{ moedas }] = await q('SELECT moedas FROM usuarios WHERE id = $1', [u.id]);
    const [{ saldo }] = await q('SELECT sum(valor)::bigint AS saldo FROM movimentos_moeda WHERE usuario_id = $1', [u.id]);
    assert.equal(Number(moedas), 355);
    assert.equal(Number(saldo), 355, 'o cache bate com o razão');
    assert.equal((await q(`SELECT count(*)::int AS n FROM movimentos_moeda WHERE usuario_id = $1`, [v.id]))[0].n, 0);

    assert.equal((await q(`SELECT count(*)::int AS n FROM cartas WHERE colecao_id = 'memes'`))[0].n, 0);
    assert.equal((await q(`SELECT count(*)::int AS n FROM colecoes WHERE id = 'memes'`))[0].n, 0);
    assert.deepEqual(await q(`SELECT carta_id, quantidade FROM inventario_cartas WHERE usuario_id = $1`, [u.id]), [{ carta_id: 'orkut-0', quantidade: 1 }]);
    assert.equal((await q('SELECT carta_favorita FROM usuarios WHERE id = $1', [u.id]))[0].carta_favorita, null);
    assert.equal((await q('SELECT colecao_id FROM pacotes_estoque WHERE usuario_id = $1', [u.id]))[0].colecao_id, null);

    const [{ n: nFoto }] = await q(`SELECT count(*)::int AS n FROM cartas WHERE colecao_id = 'fotolog'`);
    assert.ok(nFoto > 0);
    assert.equal((await q(`SELECT count(*)::int AS n FROM cartas WHERE id = 'orkut-9'`))[0].n, 1);
    const [m] = await q(`SELECT titulo, youtube_id, data::text FROM memes WHERE id = 'cala-boca-galvao'`);
    assert.deepEqual(m, { titulo: 'Cala Boca Galvão', youtube_id: 'bdTadK9p14A', data: '2010-06-11' });

    // idempotente: rodar de novo não paga duas vezes
    await cli.query(SQL);
    assert.equal((await q(`SELECT count(*)::int AS n FROM movimentos_moeda WHERE motivo = 'colecao_retirada'`))[0].n, 2);
  } finally {
    await cli.query('ROLLBACK');
    cli.release();
  }
});
