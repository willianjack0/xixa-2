// Semáforo simples (fila FIFO) para limitar trabalho pesado simultâneo, como a conversão de imagens com sharp/libvips.
export function criarSemaforo(max) {
  if (!Number.isInteger(max) || max < 1) throw new Error('semáforo: max precisa ser inteiro >= 1');
  let ativos = 0;
  const fila = [];
  const proximo = () => { while (ativos < max && fila.length) { ativos++; fila.shift()(); } };
  return {
    /** Roda fn quando houver vaga; libera a vaga mesmo se fn lançar. */
    async rodar(fn) {
      await new Promise((ok) => { fila.push(ok); proximo(); });
      try { return await fn(); } finally { ativos--; proximo(); }
    },
    get ativos() { return ativos; },
    get espera() { return fila.length; }
  };
}
