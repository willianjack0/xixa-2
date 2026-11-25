// Apelidos reservados: ninguém se passa pela equipe, pelo sistema ou pela marca.
// Comparação NORMALIZADA: minúsculas, sem acentos, sem espaço nem . _ - e sem números no fim.
// Assim 'Admin', 'ADMIN', 'a.d.m.i.n', 'admin_2', 'Admin123' e 'Nao_Salvo' caem na mesma regra.
export const RESERVADOS = Object.freeze(['admin', 'administrador', 'mod', 'moderador', 'moderacao', 'suporte', 'staff',
  'nao salvo', 'naosalvo', 'xet', 'sistema', 'system', 'root', 'discord', 'oficial']);

export const normalizarApelido = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[\s._-]+/g, '').replace(/\d+$/, '');

const CONJUNTO = new Set(RESERVADOS.map(normalizarApelido));
export const ehReservado = (s) => CONJUNTO.has(normalizarApelido(s));

/** Janela mínima entre duas trocas de apelido (a primeira troca é livre). */
export const ESPERA_TROCA_HORAS = 24;
