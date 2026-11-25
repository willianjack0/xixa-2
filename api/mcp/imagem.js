// Imagens vindas do MCP: detecção pelos BYTES (nunca pelo nome nem pelo Content-Type), dimensões e download seguro contra SSRF.
import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

export const MAX_BYTES = 5 * 1024 * 1024;

// ---------- tipo e tamanho pelos bytes ----------
export function detectarImagem(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', tipo: 'image/jpeg', ...dimJpeg(buf) };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', tipo: 'image/png', largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', tipo: 'image/webp', ...dimWebp(buf) };
  return null;
}
function dimJpeg(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { largura: null, altura: null };
}
function dimWebp(b) {
  const f = b.subarray(12, 16).toString('latin1');
  if (f === 'VP8X' && b.length >= 30) return { largura: 1 + b.readUIntLE(24, 3), altura: 1 + b.readUIntLE(27, 3) };
  if (f === 'VP8 ' && b.length >= 30) return { largura: b.readUInt16LE(26) & 0x3fff, altura: b.readUInt16LE(28) & 0x3fff };
  if (f === 'VP8L' && b.length >= 25) { const v = b.readUInt32LE(21); return { largura: 1 + (v & 0x3fff), altura: 1 + ((v >> 14) & 0x3fff) }; }
  return { largura: null, altura: null };
}

// ---------- SSRF: nada de rede interna ----------
export function ipProibido(ip) {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapeado) return ipProibido(mapeado[1]);
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('64:ff9b');
  }
  return true; // não é IP: não confie
}

/** lookup para http(s).request que recusa qualquer endereço interno NA HORA da conexão (vale contra DNS rebinding). */
export function lookupSeguro(host, opcoes, cb) {
  const todos = typeof opcoes === 'object' && opcoes.all;
  dns.lookup(host, { ...(typeof opcoes === 'object' ? opcoes : {}), all: true }, (err, enderecos) => {
    if (err) return cb(err);
    if (!enderecos.length || enderecos.some((e) => ipProibido(e.address))) return cb(new Error('destino não permitido'));
    return todos ? cb(null, enderecos) : cb(null, enderecos[0].address, enderecos[0].family);
  });
}

export function urlPermitida(bruta) {
  let u;
  try { u = new URL(String(bruta)); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const porta = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (![80, 443].includes(porta)) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) ? ipProibido(host) : (!host.includes('.') || /\.(local|internal|localhost|lan)$/i.test(host))) return null;
  return u;
}

/**
 * Baixa uma imagem de uma URL pública: até 3 redirecionamentos (cada um revalidado), 15 s, no máximo MAX_BYTES.
 * Devolve o Buffer; lança Error com mensagem em pt-BR (segura para mostrar à IA) se algo não valer.
 */
export async function baixarImagem(bruta, { maxBytes = MAX_BYTES, timeoutMs = 15_000, lookup = lookupSeguro, validarUrl = urlPermitida } = {}) {
  let atual = validarUrl(bruta);
  if (!atual) throw new Error('url inválida ou não permitida (só http/https público, portas 80 e 443)');
  const limite = Date.now() + timeoutMs;
  for (let salto = 0; salto <= 3; salto++) {
    const r = await pedir(atual, { maxBytes, restante: limite - Date.now(), lookup });
    if (r.redirecionar) {
      const prox = validarUrl(new URL(r.redirecionar, atual).href);
      if (!prox) throw new Error('o redirecionamento aponta para um destino não permitido');
      atual = prox; continue;
    }
    return r.buffer;
  }
  throw new Error('redirecionamentos demais');
}

function pedir(u, { maxBytes, restante, lookup }) {
  return new Promise((resolve, reject) => {
    if (restante <= 0) return reject(new Error('tempo esgotado ao baixar a imagem'));
    const modulo = u.protocol === 'https:' ? https : http;
    const req = modulo.request(u, { method: 'GET', lookup, headers: { 'User-Agent': 'naosalvo-mcp/1.0', Accept: 'image/*' }, timeout: Math.min(restante, 15_000) }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) { res.resume(); return resolve({ redirecionar: res.headers.location }); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`o servidor da imagem respondeu ${res.statusCode}`)); }
      const declarado = Number(res.headers['content-length'] || 0);
      if (declarado > maxBytes) { res.resume(); return reject(new Error('imagem maior que 5 MB')); }
      const partes = []; let total = 0;
      res.on('data', (c) => { total += c.length; if (total > maxBytes) { req.destroy(); reject(new Error('imagem maior que 5 MB')); } else partes.push(c); });
      res.on('end', () => resolve({ buffer: Buffer.concat(partes) }));
      res.on('error', () => reject(new Error('falha ao baixar a imagem')));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('tempo esgotado ao baixar a imagem')); });
    req.on('error', (e) => reject(new Error(e.message === 'destino não permitido' ? 'o endereço da imagem aponta para a rede interna (não permitido)' : 'não consegui baixar a imagem')));
    req.end();
  });
}
