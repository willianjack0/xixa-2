// Apoio puro dos envios: normalização de URL (anti-duplicação), id do YouTube e slug do meme. Sem banco.

const HOSTS_YT = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com']);
const ID_YT = /^[A-Za-z0-9_-]{11}$/;

/** URL http(s) válida (até 500 caracteres) ou null. */
export function urlValida(bruto) {
  if (typeof bruto !== 'string' || bruto.length > 500) return null;
  let u;
  try { u = new URL(bruto.trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || u.username || u.password) return null;
  return u;
}

/** Id de 11 caracteres de um link do YouTube (watch, youtu.be, shorts, embed, live) ou null. */
export function youtubeId(bruto) {
  const u = urlValida(bruto);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (HOSTS_YT.has(host)) {
    const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname);
    id = u.pathname === '/watch' ? u.searchParams.get('v') : m && m[1];
  }
  return id && ID_YT.test(id) ? id : null;
}

/**
 * Chave de comparação: "yt:<id>" para YouTube (qualquer formato de link); senão host + caminho, sem www, sem query,
 * sem âncora e sem barra final, tudo em minúsculas. Links diferentes do mesmo vídeo caem na mesma chave.
 */
export function normalizarUrl(bruto) {
  const yt = youtubeId(bruto);
  if (yt) return 'yt:' + yt;
  const u = urlValida(bruto);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  return (host + u.pathname.replace(/\/+$/, '')).toLowerCase().slice(0, 300);
}

/** Slug a-z0-9- de um título (sem acento), no formato aceito em memes.id. Vazio vira "meme". */
export function slugDe(titulo, max = 70) {
  const s = String(titulo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '');
  return s || 'meme';
}

export const VOTOS = ['aprovado', 'rejeitado', 'ajuste', 'duplicado'];

/**
 * Consenso: 2 votos iguais fecham. Se há 2 ou mais votos e nenhuma opção chegou a 2 (votos divididos), espera o
 * desempate de um admin (`desempate` = o voto do admin, se já existir). Devolve { resultado } ou { resultado: null }.
 */
export function decidir(votos, { desempate = null } = {}) {
  const cont = {};
  for (const v of votos) cont[v.voto] = (cont[v.voto] || 0) + 1;
  const vencedor = Object.entries(cont).find(([, n]) => n >= 2);
  if (vencedor) return { resultado: vencedor[0], por: 'consenso' };
  if (votos.length >= 2 && desempate) return { resultado: desempate, por: 'desempate' };
  return { resultado: null, por: null };
}
