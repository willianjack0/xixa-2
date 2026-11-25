// Utilidades HTTP compartilhadas pelas rotas: resposta JSON, corpo, limpeza de texto, rate limit.
import { timingSafeEqual } from 'node:crypto';
import { saltosDeProxy } from './config.js';

export const send = (res, code, body, headers = {}) => {
  const isStr = typeof body === 'string';
  res.writeHead(code, {
    'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(isStr ? body : JSON.stringify(body));
};

export const readBody = (req, max = 20_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > max) { reject(new Error('too-large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

/** Lê o corpo como JSON. Devolve undefined se inválido (quem chama responde 400 com a mensagem do seu formato). */
export const lerJson = async (req) => {
  try { return JSON.parse(await readBody(req)); } catch { return undefined; }
};

export const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

// rate limit simples em memória: janela de 10 min por chave (ex.: "f:<ip>")
const hits = new Map();
export const limited = (chave, max = 8) => {
  const now = Date.now(), win = 10 * 60_000;
  const list = (hits.get(chave) || []).filter((t) => now - t < win);
  list.push(now); hits.set(chave, list);
  return list.length > max;
};
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 600_000)) hits.delete(k); }, 600_000).unref();

const PARECE_IP = /^[0-9a-fA-F:.]{2,45}$/;
const limpaIp = (v) => String(v || '').trim().replace(/^::ffff:/i, '');

/**
 * IP do cliente. O X-Forwarded-For é uma lista que CADA proxy acrescenta à direita; o que está à esquerda
 * pode ser forjado pelo cliente. Na cadeia cliente -> Cloudflare -> Traefik -> API, o Cloudflare acrescenta o IP real
 * do cliente e o Traefik acrescenta o IP da borda do Cloudflare, então o IP do cliente é o item na posição `saltos`
 * contando a partir da DIREITA (saltos = 2 => penúltimo). Itens à esquerda são ignorados.
 * Cadeia com menos itens que o esperado: usa o último (o mais próximo de nós). Sem cabeçalho, item inválido
 * ou saltos = 0: IP do socket.
 */
export function extrairIp(req, saltos = 2) {
  const socket = limpaIp(req.socket?.remoteAddress);
  if (!(saltos >= 1)) return socket;
  const itens = String(req.headers['x-forwarded-for'] || '').split(',').map(limpaIp).filter(Boolean);
  if (!itens.length) return socket;
  const escolhido = itens.length >= saltos ? itens[itens.length - saltos] : itens[itens.length - 1];
  return PARECE_IP.test(escolhido) ? escolhido : socket;
}

const SALTOS = saltosDeProxy(); // lido uma vez, na subida
export const ipDe = (req) => extrairIp(req, SALTOS);

export function ehAdmin(req, adminToken) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!adminToken || !token) return false;
  const a = Buffer.from(token), b = Buffer.from(adminToken);
  return a.length === b.length && timingSafeEqual(a, b);
}
