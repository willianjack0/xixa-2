// Classificação de navegação para o analytics: página, origem do visitante e dispositivo. Sem dados pessoais.
const PAGINAS = new Set(['home', 'linha-do-tempo', 'memepedia', 'album', 'perfil', 'entrar', 'contribuir', 'equipe', '404']);

/** '/', '/index.html' → 'home'; '/album.html' → 'album'; '/contribuir/' → 'contribuir'; o que não conhece → 'outras'. */
export function paginaDe(caminho) {
  let p = String(caminho || '').split(/[?#]/)[0].toLowerCase();
  p = p.replace(/^\/+/, '').replace(/\.html$/, '').replace(/\/?index$/, '').replace(/\/+$/, '');
  if (p === '') return 'home';
  return PAGINAS.has(p) ? p : 'outras';
}

const ORIGENS = [
  ['google', /(^|\.)google\./], ['bing', /(^|\.)bing\.com$/], ['duckduckgo', /(^|\.)duckduckgo\.com$/],
  ['instagram', /(^|\.)instagram\.com$/], ['facebook', /(^|\.)(facebook|fb)\.com$/], ['x', /(^|\.)(twitter\.com|x\.com|t\.co)$/],
  ['tiktok', /(^|\.)tiktok\.com$/], ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/], ['whatsapp', /(^|\.)whatsapp\.com$|^wa\.me$/],
  ['telegram', /(^|\.)(telegram\.org|t\.me)$/], ['reddit', /(^|\.)reddit\.com$/], ['discord', /(^|\.)discord(app)?\.com$/]
];
/** host do site de origem (sem protocolo) → nome conhecido, 'direto' (vazio ou o próprio site) ou 'outros'. */
export function origemDe(host, meuHost = '') {
  const h = String(host || '').toLowerCase().trim().slice(0, 100);
  if (!h || !/^[a-z0-9.-]+$/.test(h)) return 'direto';
  if (meuHost && (h === meuHost || h.endsWith('.' + meuHost))) return 'direto';
  for (const [nome, re] of ORIGENS) if (re.test(h)) return nome;
  return 'outros';
}

export const dispositivoDe = (ua) => {
  const u = String(ua || '');
  if (/ipad|tablet/i.test(u)) return 'tablet';
  if (/mobi|android|iphone|ipod/i.test(u)) return 'celular';
  return 'desktop';
};
export const ehRobo = (ua) => !ua || /bot|crawl|spider|slurp|headless|curl|wget|python|monitor|preview|facebookexternalhit|lighthouse|uptime/i.test(String(ua));
