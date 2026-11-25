// Teste da limpeza de órfãos no S3 (api/scripts/limpar-orfaos-s3.js).
// Valida: referenciados por midias, por cartas.imagem, órfão velho, órfão recente,
// dry-run não apaga, --apply apaga só os elegíveis, nunca apaga fora de midias/.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bancoDeTeste, semBanco } from './helpers.js';
import { buscarCaminhosReferenciados, limparOrfaosS3 } from '../scripts/limpar-orfaos-s3.js';

const skip = semBanco();
let db;

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
});

after(async () => {
  if (db) await db.fechar();
});

test('buscarCaminhosReferenciados: coleta caminhos de midias.caminho e cartas.imagem', { skip }, async () => {
  // Insere um meme de teste ou usa existentes
  await db.pool.query(
    "INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ('coreia-copa-naosalvo', 'imagem', 'midias/teste-ref-midias.webp', 99) ON CONFLICT DO NOTHING"
  );
  await db.pool.query(
    "UPDATE cartas SET imagem = 'midias/teste-ref-cartas.webp' WHERE id = 'orkut-0'"
  );

  const refs = await buscarCaminhosReferenciados(db.pool);
  assert.ok(refs.has('midias/teste-ref-midias.webp'));
  assert.ok(refs.has('midias/teste-ref-cartas.webp'));
});

test('limparOrfaosS3: dry-run lista tabela e não remove; --apply remove apenas órfãos velhos sob midias/', { skip }, async () => {
  const agora = new Date('2026-11-25T12:00:00Z');
  const h48Atras = new Date('2026-11-23T12:00:00Z'); // 48h atrás (elegível)
  const h2Atras = new Date('2026-11-25T10:00:00Z');  // 2h atrás (recente, não elegível)

  // Garante referências no banco
  await db.pool.query(
    "INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ('coreia-copa-naosalvo', 'imagem', 'midias/em-uso-midia.webp', 100) ON CONFLICT DO NOTHING"
  );
  await db.pool.query(
    "UPDATE cartas SET imagem = 'midias/em-uso-carta.webp' WHERE id = 'orkut-1'"
  );

  // Lista simulada de objetos no S3
  const objetosS3 = [
    { chave: 'midias/em-uso-midia.webp', tamanho: 1000, modificado: h48Atras },
    { chave: 'midias/em-uso-carta.webp', tamanho: 2000, modificado: h48Atras },
    { chave: 'midias/orfao-velho.webp', tamanho: 3000, modificado: h48Atras },
    { chave: 'midias/orfao-recente.webp', tamanho: 4000, modificado: h2Atras },
    { chave: 'outra-pasta/fora.webp', tamanho: 5000, modificado: h48Atras }
  ];

  const removidos = [];
  const s3Falso = {
    async list(prefixo, { max } = {}) {
      return objetosS3.filter((o) => o.chave.startsWith(prefixo));
    },
    async remove(chave) {
      removidos.push(chave);
    }
  };

  const logs = [];
  const capturarLog = (msg) => logs.push(msg);

  // 1. DRY-RUN: deve identificar apenas midias/orfao-velho.webp e NÃO chamar remove
  const resDry = await limparOrfaosS3(s3Falso, db.pool, {
    apply: false,
    minIdadeHoras: 24,
    agora,
    log: capturarLog
  });

  assert.equal(resDry.dryRun, true);
  assert.equal(resDry.removidos, 0);
  assert.equal(resDry.totalLiberado, 0);
  assert.equal(resDry.orfaos.length, 1);
  assert.equal(resDry.orfaos[0].chave, 'midias/orfao-velho.webp');
  assert.equal(resDry.orfaos[0].tamanho, 3000);
  assert.equal(removidos.length, 0, 'dry-run não pode chamar remove');

  // 2. APPLY: deve remover apenas midias/orfao-velho.webp
  const resApply = await limparOrfaosS3(s3Falso, db.pool, {
    apply: true,
    minIdadeHoras: 24,
    agora,
    log: () => {}
  });

  assert.equal(resApply.dryRun, false);
  assert.equal(resApply.removidos, 1);
  assert.equal(resApply.totalLiberado, 3000);
  assert.deepEqual(removidos, ['midias/orfao-velho.webp']);

  // Confirma que nunca tentou apagar 'outra-pasta/fora.webp' nem arquivos recentes ou em uso
  assert.ok(!removidos.includes('outra-pasta/fora.webp'));
  assert.ok(!removidos.includes('midias/orfao-recente.webp'));
  assert.ok(!removidos.includes('midias/em-uso-midia.webp'));
  assert.ok(!removidos.includes('midias/em-uso-carta.webp'));
});
