// Cookies: leitura do header Cookie e montagem de Set-Cookie com os atributos de segurança.

export function lerCookies(header = '') {
  const out = {};
  for (const parte of String(header).split(';')) {
    const i = parte.indexOf('=');
    if (i < 1) continue;
    const nome = parte.slice(0, i).trim();
    if (nome in out) continue; // vale o primeiro (o navegador manda o mais específico antes)
    try { out[nome] = decodeURIComponent(parte.slice(i + 1).trim()); } catch { /* valor inválido: ignora */ }
  }
  return out;
}

/** HttpOnly + SameSite=Lax sempre; Secure por padrão (só desligue em teste/local HTTP). */
export function montarCookie(nome, valor, { maxAge, path = '/', secure = true, sameSite = 'Lax' } = {}) {
  const p = [`${nome}=${encodeURIComponent(valor)}`, `Path=${path}`, 'HttpOnly', `SameSite=${sameSite}`];
  if (secure) p.push('Secure');
  if (Number.isFinite(maxAge)) p.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return p.join('; ');
}

export const apagarCookie = (nome, { path = '/', secure = true } = {}) => montarCookie(nome, '', { maxAge: 0, path, secure });
