// Hash do IP para anti-spam (eventos, links, memepédia). HMAC-SHA256 com o token de admin como chave
// (ou 'naosalvo' se não houver), cortado em 32 hex. O IP puro nunca é gravado.
// ATENÇÃO: não mude o algoritmo, a chave padrão nem o corte: os hashes já gravados deixariam de bater.
import { createHmac } from 'node:crypto';

export const hashIp = (adminToken, ip) =>
  createHmac('sha256', adminToken || 'naosalvo').update(String(ip)).digest('hex').slice(0, 32);
