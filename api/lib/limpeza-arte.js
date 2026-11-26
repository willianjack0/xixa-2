// Limpeza das artes de carta pendentes (envios_arte_carta + prefixo pendentes/ do S3), no padrão de lib/limpeza.js.
//  1) pendente há mais de 30 dias sem decisão: vira "rejeitado" (motivo "expirou...") e o objeto sai do S3 (libera a carta para a pessoa reenviar);
//  2) objeto em pendentes/ com mais de 24 h que NENHUM envio pendente referencia (sobra de falha, rejeição antiga, upload interrompido): apagado.
// A idade mínima de 24 h evita apagar um upload em andamento (o objeto é gravado antes da linha no banco).
export const EXPIRA_DIAS = 30;
export const MIN_IDADE_HORAS = 24;
const A_CADA_MS = 6 * 60 * 60 * 1000;
const PENDENTE = /^pendentes\/arte-[a-f0-9]{24}\.webp$/;

/** Devolve { expirados, orfaos }. s3 = cliente de mcp/s3.js (list, remove). Erro de S3 não desfaz o que o banco já fez. */
export async function limparArtesPendentes(pool, s3, { dias = EXPIRA_DIAS, minIdadeHoras = MIN_IDADE_HORAS, agora = Date.now() } = {}) {
  const { rows: velhos } = await pool.query(
    `UPDATE envios_arte_carta SET status = 'rejeitado', motivo = 'expirou sem decisão da moderação (30 dias)', decidido_em = now()
      WHERE status = 'pendente' AND criado_em < now() - make_interval(days => $1) RETURNING arquivo`, [dias]);
  let orfaos = 0;
  if (!s3) return { expirados: velhos.length, orfaos };
  for (const v of velhos) if (PENDENTE.test(v.arquivo)) await s3.remove(v.arquivo).catch(() => {});
  const objetos = await s3.list('pendentes/');
  const corte = agora - minIdadeHoras * 3_600_000;
  const candidatos = objetos.filter((o) => PENDENTE.test(o.chave) && o.modificado.getTime() < corte);
  if (!candidatos.length) return { expirados: velhos.length, orfaos };
  const { rows } = await pool.query("SELECT arquivo FROM envios_arte_carta WHERE status = 'pendente' AND arquivo = ANY($1)", [candidatos.map((o) => o.chave)]);
  const vivos = new Set(rows.map((r) => r.arquivo));
  for (const o of candidatos) {
    if (vivos.has(o.chave)) continue;
    try { await s3.remove(o.chave); orfaos++; } catch { /* tenta de novo na próxima rodada */ }
  }
  return { expirados: velhos.length, orfaos };
}

/** Roda já e depois a cada 6h. Nunca lança. getS3 devolve o cliente (ou null se o armazenamento não está configurado). */
export function agendarLimpezaArtes(pool, getS3, { log = console, intervaloMs = A_CADA_MS } = {}) {
  const rodar = async () => {
    try {
      const r = await limparArtesPendentes(pool, getS3());
      if (r.expirados || r.orfaos) log.log(`limpeza de artes: ${r.expirados} pendentes expirados, ${r.orfaos} objetos órfãos em pendentes/`);
    } catch (e) { log.error('limpeza de artes pendentes falhou: ' + (e && e.message)); }
  };
  const primeira = rodar();
  const timer = setInterval(rodar, intervaloMs);
  timer.unref();
  timer.primeira = primeira;
  return timer;
}
