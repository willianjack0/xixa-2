// Validações e esquemas compartilhados do acervo: memes, cartas, coleções, eras.
// Reutilizado pelo painel admin (/api/admin/...) e pelas ferramentas do MCP (/mcp).

export const ID_MEME = /^[a-z0-9-]{1,80}$/;
export const ID_CARTA = /^[a-z0-9-]{1,100}$/;
export const RARIDADES_CARTA = ['Comum', 'Relevante', 'Raro', 'Relíquia', 'Lendário', 'Mítico'];
export const RARIDADES_MEME = [...RARIDADES_CARTA, 'Clássico'];
export const STATUS = ['publicado', 'oculto', 'removido'];
export const TIPOS_MEME = ['video', 'foto'];
export const TIPOS_MIDIA = ['imagem', 'video_arquivo'];

export class Erro422 extends Error {}
export const falha = (msg) => { throw new Erro422(msg); };

export const texto = (min, max) => (v) => {
  if (typeof v !== 'string') falha('precisa ser texto');
  const t = v.trim();
  if (t.length < min || t.length > max) falha(`de ${min} a ${max} caracteres`);
  return t;
};

export const textoOuNulo = (max) => (v) => (v === null || v === '' ? null : texto(1, max)(v));
export const inteiro = (min, max) => (v) => {
  if (!Number.isInteger(v) || v < min || v > max) falha(`inteiro de ${min} a ${max}`);
  return v;
};
export const inteiroOuNulo = (min, max) => (v) => (v === null ? null : inteiro(min, max)(v));
export const um = (lista) => (v) => {
  if (!lista.includes(v)) falha(`um de: ${lista.join(', ')}`);
  return v;
};

export const dataOuNula = (v) => {
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) falha('data AAAA-MM-DD');
  return v;
};

export const youtubeOuNulo = (v) => {
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(v)) falha('id do YouTube com 11 caracteres');
  return v;
};

export const urlOuNula = (v) => {
  if (v === null || v === '') return null;
  let u;
  try { u = new URL(String(v)); } catch { falha('URL inválida'); }
  if (!/^https?:$/.test(u.protocol) || String(v).length > 500) falha('só http(s), até 500 caracteres');
  return String(v);
};

export const caminhoDeMidia = (v) => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_\-./]{1,200}$/.test(v) || v.startsWith('/') || v.includes('..') || v.includes('//')) {
    falha('caminho relativo ao site (ex.: memes/arquivo.jpg), sem .. nem barra inicial');
  }
  return v;
};

export const ESQUEMA_MEME = {
  titulo: texto(1, 200),
  ano: inteiro(1990, 2100),
  data: dataOuNula,
  categoria: texto(1, 40),
  tipo: um(TIPOS_MEME),
  raridade: um(RARIDADES_MEME),
  emoji: textoOuNulo(16),
  descricao: textoOuNulo(2000),
  autor: textoOuNulo(80),
  duracao: inteiroOuNulo(0, 86400),
  youtube_id: youtubeOuNulo,
  status: um(STATUS)
};

export const OBRIGATORIOS_MEME = ['titulo', 'ano', 'categoria', 'raridade'];

export const ESQUEMA_CARTA = {
  nome: texto(1, 80),
  emoji: textoOuNulo(16),
  raridade: um(RARIDADES_CARTA),
  meme_id: (v) => (v === null || v === '' ? null : (ID_MEME.test(String(v)) ? String(v) : falha('id de meme inválido')))
};

export const ESQUEMA_COLECAO = {
  nome: texto(1, 80),
  icone: textoOuNulo(40),
  cor: textoOuNulo(20),
  sobre: textoOuNulo(2000),
  ordem: inteiro(0, 10000),
  cores_fundo: (v) => {
    if (!Array.isArray(v) || v.length > 6 || v.some((c) => typeof c !== 'string' || c.length > 20)) falha('lista de até 6 cores');
    return v;
  }
};

export const ESQUEMA_ERA = {
  rotulo: texto(1, 20),
  lema: texto(1, 120),
  texto: texto(1, 2000)
};

/** Lê só os campos do esquema presentes no corpo. Devolve { dados, erros, desconhecidos }. */
export function lerCampos(corpo, esquema, obrigatorios = []) {
  const dados = {}, erros = {};
  for (const [campo, validar] of Object.entries(esquema)) {
    if (!(campo in corpo)) {
      if (obrigatorios.includes(campo)) erros[campo] = 'obrigatório';
      continue;
    }
    try {
      dados[campo] = validar(corpo[campo]);
    } catch (e) {
      if (e instanceof Erro422) erros[campo] = e.message;
      else throw e;
    }
  }
  const desconhecidos = Object.keys(corpo).filter((k) => !(k in esquema));
  return { dados, erros, desconhecidos };
}

export function lerMidias(lista) {
  if (!Array.isArray(lista) || lista.length > 20) return { erro: 'midias: lista de até 20 itens' };
  const out = [];
  for (const [i, m] of lista.entries()) {
    if (!m || typeof m !== 'object') return { erro: `midias[${i}] inválida` };
    try {
      out.push({
        tipo: um(TIPOS_MIDIA)(m.tipo),
        caminho: caminhoDeMidia(m.caminho),
        origem_url: urlOuNula(m.origem_url ?? null),
        credito_por: textoOuNulo(120)(m.credito_por ?? null),
        credito_url: urlOuNula(m.credito_url ?? null),
        largura: inteiroOuNulo(1, 20000)(m.largura ?? null),
        altura: inteiroOuNulo(1, 20000)(m.altura ?? null)
      });
    } catch (e) {
      if (e instanceof Erro422) return { erro: `midias[${i}]: ${e.message}` };
      throw e;
    }
  }
  if (new Set(out.map((m) => m.tipo + '|' + m.caminho)).size !== out.length) return { erro: 'midias repetidas (mesmo tipo e caminho)' };
  return { midias: out };
}

export const corta = (v) => (typeof v === 'string' && v.length > 80 ? v.slice(0, 80) + '…' : v);

/** { campo: { de, para } } só dos que mudaram. */
export const diff = (antes, dados) => Object.fromEntries(
  Object.entries(dados)
    .filter(([k, v]) => String(antes[k] ?? '') !== String(v ?? ''))
    .map(([k, v]) => [k, { de: corta(antes[k] ?? null), para: corta(v) }])
);

export const ehoDia = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);
