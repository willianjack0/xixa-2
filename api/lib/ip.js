// Hash do IP para anti-spam (eventos, links, memepédia). HMAC-SHA256 com a HMAC_KEY (ou o ADMIN_TOKEN, se ainda não houver) como chave
// O IP puro nunca é gravado; o hash é cortado em 32 hex. Sem chave nenhuma, usa 'naosalvo'.
// ATENÇÃO: não mude o algoritmo, a chave padrão nem o corte: os hashes já gravados deixariam de bater.
import { createHmac } from 'node:crypto';

export const hashIp = (chave, ip) =>
  createHmac('sha256', chave || 'naosalvo').update(String(ip)).digest('hex').slice(0, 32);
