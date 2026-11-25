#!/usr/bin/env node
// Limpeza de imagens órfãs no S3/MinIO sob o prefixo 'midias/'.
// Órfão = chave em midias/ não referenciada em midias.caminho nem em cartas.imagem,
// e com data de modificação anterior a --min-idade-horas (padrão 24 h).
// Padrão: DRY-RUN. Para remover de fato, execute com --apply.
import { pathToFileURL } from 'node:url';
import { criarPoolDoAmbiente } from '../migrate.js';
import { configDoAmbiente, criarS3 } from '../mcp/s3.js';

/**
 * Busca todos os caminhos de mídias referenciados no banco de dados.
 * Considera: midias.caminho e cartas.imagem.
 */
export async function buscarCaminhosReferenciados(db) {
  const { rows: midiasRows } = await db.query(
    'SELECT caminho FROM midias WHERE caminho IS NOT NULL'
  );
  const { rows: cartasRows } = await db.query(
    'SELECT imagem AS caminho FROM cartas WHERE imagem IS NOT NULL'
  );
  const referenciados = new Set();
  for (const r of midiasRows) if (r.caminho) referenciados.add(String(r.caminho).trim());
  for (const r of cartasRows) if (r.caminho) referenciados.add(String(r.caminho).trim());
  return referenciados;
}

/** Formata bytes para exibição humana (ex: 12.3 KB, 1.5 MB). */
function formatarBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Formata horas de idade para exibição legível. */
function formatarIdade(horas) {
  if (horas < 48) return `${horas.toFixed(1)} h`;
  const dias = (horas / 24).toFixed(1);
  return `${dias} d (${Math.round(horas)} h)`;
}

/**
 * Executa a verificação e limpeza de órfãos.
 *
 * @param {object} s3 - Instância do cliente S3 (com list e remove)
 * @param {object} db - Pool ou client do Postgres
 * @param {object} opcoes
 * @param {boolean} [opcoes.apply=false] - Se true, remove os arquivos órfãos do S3
 * @param {number} [opcoes.minIdadeHoras=24] - Idade mínima em horas para considerar remoção
 * @param {Date} [opcoes.agora=new Date()] - Data de referência para cálculo de idade
 * @param {function} [opcoes.log=console.log] - Função de log
 * @returns {Promise<{ orfaos: Array, totalLiberado: number, removidos: number, dryRun: boolean }>}
 */
export async function limparOrfaosS3(s3, db, {
  apply = false,
  minIdadeHoras = 24,
  agora = new Date(),
  log = console.log
} = {}) {
  const cutoff = new Date(agora.getTime() - minIdadeHoras * 60 * 60 * 1000);
  const referenciados = await buscarCaminhosReferenciados(db);

  // Lista todos os objetos no S3 com prefixo 'midias/'
  const objetos = await s3.list('midias/', { max: 50000 });

  const orfaos = [];
  let totalBytesOrfaos = 0;

  for (const obj of objetos) {
    // SEGURANÇA ABSOLUTA: nunca operar fora de midias/
    if (!obj.chave.startsWith('midias/')) continue;

    // Se estiver referenciado no banco, não é órfão
    if (referenciados.has(obj.chave)) continue;

    const mod = obj.modificado instanceof Date ? obj.modificado : new Date(obj.modificado);
    const idadeHoras = Math.max(0, (agora.getTime() - mod.getTime()) / (60 * 60 * 1000));

    // Se foi modificado recentemente (menos que minIdadeHoras), não limpa (upload em andamento)
    if (mod > cutoff) continue;

    orfaos.push({
      chave: obj.chave,
      tamanho: obj.tamanho || 0,
      modificado: mod,
      idadeHoras
    });
    totalBytesOrfaos += (obj.tamanho || 0);
  }

  log(`[limpar-orfaos-s3] Objetos no S3 em midias/: ${objetos.length}`);
  log(`[limpar-orfaos-s3] Caminhos referenciados no banco: ${referenciados.size}`);
  log(`[limpar-orfaos-s3] Órfãos elegíveis (> ${minIdadeHoras} h): ${orfaos.length} (${formatarBytes(totalBytesOrfaos)})`);

  if (orfaos.length > 0) {
    log('\n' + 'CHAVE'.padEnd(50) + 'TAMANHO'.padEnd(14) + 'IDADE'.padEnd(16) + 'MODIFICADO');
    log('-'.repeat(105));
    for (const o of orfaos) {
      log(
        o.chave.padEnd(50) +
        formatarBytes(o.tamanho).padEnd(14) +
        formatarIdade(o.idadeHoras).padEnd(16) +
        o.modificado.toISOString()
      );
    }
    log('-'.repeat(105));
  }

  let removidos = 0;
  let totalLiberado = 0;

  if (apply) {
    log('\nMODO --apply ATIVO: Removendo objetos do S3...');
    for (const o of orfaos) {
      // Dupla checagem defensiva de prefixo
      if (!o.chave.startsWith('midias/')) {
        throw new Error(`Tentativa de apagar objeto fora de midias/: ${o.chave}`);
      }
      await s3.remove(o.chave);
      removidos++;
      totalLiberado += o.tamanho;
    }
    log(`[limpar-orfaos-s3] Concluído: ${removidos} objeto(s) removido(s), ${formatarBytes(totalLiberado)} liberados.`);
  } else {
    log('\nMODO DRY-RUN: Nenhum arquivo foi removido. Use --apply para executar a limpeza.');
  }

  return {
    orfaos,
    totalLiberado: apply ? totalLiberado : 0,
    totalBytesOrfaos,
    removidos,
    dryRun: !apply
  };
}

// Execução direta via CLI: node limpar-orfaos-s3.js [--apply] [--min-idade-horas=24]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const idadeArg = args.find((a) => a.startsWith('--min-idade-horas='));
  let minIdadeHoras = 24;
  if (idadeArg) {
    const v = Number(idadeArg.split('=')[1]);
    if (!Number.isNaN(v) && v >= 0) minIdadeHoras = v;
  }

  const cfg = configDoAmbiente(process.env);
  if (!cfg) {
    console.error('[limpar-orfaos-s3] Configuração do S3 incompleta ou inválida no ambiente.');
    process.exit(1);
  }

  const s3 = criarS3(cfg);
  const pool = criarPoolDoAmbiente();

  try {
    await limparOrfaosS3(s3, pool, { apply, minIdadeHoras });
  } catch (err) {
    console.error('[limpar-orfaos-s3] Erro:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
