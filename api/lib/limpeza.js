// Limpeza periódica de eventos_meme_ip (quem já contou hoje). Só o dia corrente importa para o anti-spam;
// guardamos hoje e 2 dias para trás (margem p/ virada de dia e fuso) e apagamos o resto, em lotes.
const MANTER_DIAS = 2;
const LOTE = 5000;
const MAX_LOTES = 2000; // trava de segurança por execução (10 milhões de linhas)
const A_CADA_MS = 6 * 60 * 60 * 1000;
// dia no fuso de São Paulo, igual ao usado pelas rotas e pelas migrações
const LIMITE = `((now() AT TIME ZONE 'America/Sao_Paulo')::date - ${MANTER_DIAS})`;

/** Apaga linhas com dia < hoje-2 (America/Sao_Paulo), em lotes, sem lock longo. Devolve o total apagado. */
export async function limparEventosIp(pool, { lote = LOTE, maxLotes = MAX_LOTES } = {}) {
  let total = 0;
  for (let i = 0; i < maxLotes; i++) {
    // cada lote é uma transação curta; o ctid evita varrer a PK (meme_id, tipo, dia, ip_hash)
    const r = await pool.query(
      `DELETE FROM eventos_meme_ip WHERE ctid = ANY (ARRAY(
         SELECT ctid FROM eventos_meme_ip WHERE dia < ${LIMITE} LIMIT $1))`, [lote]);
    total += r.rowCount;
    if (r.rowCount < lote) break;
  }
  return total;
}

/** Roda já e depois a cada 6h. Nunca lança: erro vai para o log. Devolve o timer (unref: não segura o processo). */
export function agendarLimpezaEventosIp(pool, { log = console, intervaloMs = A_CADA_MS } = {}) {
  const rodar = async () => {
    try {
      const n = await limparEventosIp(pool);
      if (n) log.log(`limpeza: ${n} linhas antigas removidas de eventos_meme_ip`);
    } catch (e) {
      log.error('limpeza de eventos_meme_ip falhou: ' + (e && e.message));
    }
  };
  const primeira = rodar();
  const timer = setInterval(rodar, intervaloMs);
  timer.unref();
  timer.primeira = primeira; // só para testes aguardarem a primeira execução
  return timer;
}
