// Implementação das 3 ferramentas de leitura do MCP (escopo 'ler'):
// - listar_referencias: categorias, eras, coleções, raridades e limites
// - buscar_memes: busca memes por texto, ano, categoria, status, com paginação
// - conferir_duplicado: confere memes e envios por mesmo vídeo, mesmo link, título igual ou parecido
import { normalizarUrl, youtubeId } from '../lib/envios.js';

export const RARIDADES_CARTA = ['Comum', 'Relevante', 'Raro', 'Relíquia', 'Lendário', 'Mítico'];
export const RARIDADES_MEME = [...RARIDADES_CARTA, 'Clássico'];
export const STATUS_MEME = ['publicado', 'oculto', 'removido'];

export const LIMITES = {
  id_meme: 'a-z, 0-9 e hífen, até 80',
  youtube_id: '11 caracteres',
  titulo: 200,
  descricao: 2000,
  midias_por_meme: 20
};

export class ErroArgumento extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroArgumento';
  }
}

export function validarChavesConhecidas(args, permitidas) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new ErroArgumento('argumentos devem ser um objeto');
  }
  for (const chave of Object.keys(args)) {
    if (!permitidas.includes(chave)) {
      throw new ErroArgumento(`campo desconhecido: ${chave}`);
    }
  }
}

export function normalizarTexto(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extrairPalavras(txt) {
  const norm = normalizarTexto(txt);
  const tokens = norm.split(/[^a-z0-9]+/);
  const palavras = new Set();
  for (const t of tokens) {
    if (t.length >= 3) {
      palavras.add(t);
    }
  }
  return palavras;
}

export function calcularJaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersecao = 0;
  for (const el of setA) {
    if (setB.has(el)) intersecao++;
  }
  const uniao = setA.size + setB.size - intersecao;
  return uniao === 0 ? 0 : intersecao / uniao;
}

export async function listar_referencias(pool, args = {}) {
  validarChavesConhecidas(args, []);

  const [resCategorias, resEras, resColecoes] = await Promise.all([
    pool.query('SELECT nome FROM categorias ORDER BY ordem, nome'),
    pool.query('SELECT ano, rotulo FROM eras ORDER BY ano'),
    pool.query('SELECT id, nome FROM colecoes ORDER BY ordem, id')
  ]);

  return {
    categorias: resCategorias.rows.map((c) => c.nome),
    eras: resEras.rows.map((e) => ({ ano: e.ano, rotulo: e.rotulo })),
    colecoes: resColecoes.rows.map((col) => ({ id: col.id, nome: col.nome })),
    raridades_meme: RARIDADES_MEME,
    raridades_carta: RARIDADES_CARTA,
    status_meme: STATUS_MEME,
    limites: LIMITES
  };
}

export async function buscar_memes(pool, args = {}) {
  validarChavesConhecidas(args, ['busca', 'ano', 'categoria', 'status', 'limite', 'offset']);

  let busca = null;
  if ('busca' in args) {
    if (typeof args.busca !== 'string') throw new ErroArgumento('campo "busca" deve ser texto');
    if (args.busca.length > 200) throw new ErroArgumento('campo "busca" muito longo (máx. 200 caracteres)');
    busca = args.busca.trim();
  }

  let ano = null;
  if ('ano' in args) {
    if (!Number.isInteger(args.ano) || args.ano < 1900 || args.ano > 2100) {
      throw new ErroArgumento('campo "ano" deve ser um inteiro válido');
    }
    ano = args.ano;
  }

  let categoria = null;
  if ('categoria' in args) {
    if (typeof args.categoria !== 'string') throw new ErroArgumento('campo "categoria" deve ser texto');
    if (args.categoria.length > 40) throw new ErroArgumento('campo "categoria" muito longo');
    categoria = args.categoria.trim();
  }

  let status = null;
  if ('status' in args) {
    if (typeof args.status !== 'string' || !STATUS_MEME.includes(args.status)) {
      throw new ErroArgumento(`campo "status" inválido (permitidos: ${STATUS_MEME.join(', ')})`);
    }
    status = args.status;
  }

  let limite = 20;
  if ('limite' in args) {
    if (!Number.isInteger(args.limite) || args.limite < 1 || args.limite > 50) {
      throw new ErroArgumento('campo "limite" deve ser um inteiro entre 1 e 50');
    }
    limite = args.limite;
  }

  let offset = 0;
  if ('offset' in args) {
    if (!Number.isInteger(args.offset) || args.offset < 0) {
      throw new ErroArgumento('campo "offset" deve ser um inteiro maior ou igual a 0');
    }
    offset = args.offset;
  }

  const onde = [];
  const val = [];

  if (status) {
    val.push(status);
    onde.push(`m.status = $${val.length}`);
  }

  if (ano !== null) {
    val.push(ano);
    onde.push(`m.ano = $${val.length}`);
  }

  if (categoria) {
    val.push(categoria);
    onde.push(`m.categoria = $${val.length}`);
  }

  if (busca) {
    // Escapar %, _ e \ para busca exata de substring
    const buscaEscapada = busca.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    val.push(`%${buscaEscapada}%`);
    onde.push(`m.titulo ILIKE $${val.length}`);
  }

  const where = onde.length ? `WHERE ${onde.join(' AND ')}` : '';

  const [resTotal, resItens] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total FROM memes m ${where}`, val),
    pool.query(
      `SELECT m.id, m.titulo, m.ano, m.categoria, m.raridade, m.status, m.youtube_id
         FROM memes m
         ${where}
        ORDER BY m.ano, m.id
        LIMIT ${limite} OFFSET ${offset}`,
      val
    )
  ]);

  return {
    total: resTotal.rows[0].total,
    itens: resItens.rows
  };
}

export async function conferir_duplicado(pool, args = {}) {
  validarChavesConhecidas(args, ['url', 'titulo']);

  let url = null;
  if ('url' in args && args.url !== null && args.url !== '') {
    if (typeof args.url !== 'string') throw new ErroArgumento('campo "url" deve ser texto');
    if (args.url.length > 500) throw new ErroArgumento('campo "url" muito longo');
    url = args.url.trim();
  }

  let titulo = null;
  if ('titulo' in args && args.titulo !== null && args.titulo !== '') {
    if (typeof args.titulo !== 'string') throw new ErroArgumento('campo "titulo" deve ser texto');
    if (args.titulo.length > 200) throw new ErroArgumento('campo "titulo" muito longo');
    titulo = args.titulo.trim();
  }

  if (!url && !titulo) {
    throw new ErroArgumento('informe ao menos "url" ou "titulo"');
  }

  const motivos = [];
  const vistoChaves = new Set();

  function adicionarMotivo(m) {
    const chave = `${m.tipo}:${m.meme_id || ''}:${m.envio_id || ''}`;
    if (!vistoChaves.has(chave) && motivos.length < 10) {
      vistoChaves.add(chave);
      motivos.push(m);
    }
  }

  let yt = null;
  let normUrl = null;
  if (url) {
    yt = youtubeId(url);
    normUrl = normalizarUrl(url);
  }

  // 1) Checagem por vídeo / link
  if (yt) {
    const { rows: memesYt } = await pool.query(
      "SELECT id, titulo, status FROM memes WHERE youtube_id = $1 AND status <> 'removido' LIMIT 5",
      [yt]
    );
    for (const m of memesYt) {
      adicionarMotivo({
        tipo: 'mesmo_video',
        meme_id: m.id,
        titulo: m.titulo,
        status: m.status
      });
    }
  }

  if (normUrl) {
    const { rows: enviosUrl } = await pool.query(
      "SELECT id, titulo, status FROM envios WHERE url_normalizada = $1 AND status IN ('aberto', 'aprovado') LIMIT 5",
      [normUrl]
    );
    for (const e of enviosUrl) {
      adicionarMotivo({
        tipo: 'mesmo_link',
        envio_id: Number(e.id),
        titulo: e.titulo,
        status: e.status
      });
    }
  }

  // 2) Checagem por título (igual ou parecido)
  if (titulo) {
    const normTitulo = normalizarTexto(titulo);
    const palavrasTitulo = extrairPalavras(titulo);

    // Memes no acervo
    const { rows: memes } = await pool.query(
      "SELECT id, titulo, status FROM memes WHERE status <> 'removido'"
    );

    for (const m of memes) {
      const normMeme = normalizarTexto(m.titulo);
      if (normMeme === normTitulo) {
        adicionarMotivo({
          tipo: 'titulo_igual',
          meme_id: m.id,
          titulo: m.titulo,
          status: m.status
        });
      } else if (palavrasTitulo.size > 0) {
        const palavrasMeme = extrairPalavras(m.titulo);
        const jaccard = calcularJaccard(palavrasTitulo, palavrasMeme);
        if (jaccard >= 0.6) {
          adicionarMotivo({
            tipo: 'titulo_parecido',
            meme_id: m.id,
            titulo: m.titulo,
            status: m.status
          });
        }
      }
    }

    // Envios em aberto ou aprovado
    const { rows: envios } = await pool.query(
      "SELECT id, titulo, status FROM envios WHERE status IN ('aberto', 'aprovado') ORDER BY id DESC LIMIT 5000"
    );

    for (const e of envios) {
      const normEnvio = normalizarTexto(e.titulo);
      if (normEnvio === normTitulo) {
        adicionarMotivo({
          tipo: 'titulo_igual',
          envio_id: Number(e.id),
          titulo: e.titulo,
          status: e.status
        });
      } else if (palavrasTitulo.size > 0) {
        const palavrasEnvio = extrairPalavras(e.titulo);
        const jaccard = calcularJaccard(palavrasTitulo, palavrasEnvio);
        if (jaccard >= 0.6) {
          adicionarMotivo({
            tipo: 'titulo_parecido',
            envio_id: Number(e.id),
            titulo: e.titulo,
            status: e.status
          });
        }
      }
    }
  }

  return {
    duplicado: motivos.length > 0,
    motivos: motivos.slice(0, 10)
  };
}

import { criar_meme, editar_meme, publicar_meme, criar_carta } from './escrita.js';
import { anexar_midia } from './midias.js';

export const FERRAMENTAS_MAP = {
  listar_referencias,
  buscar_memes,
  conferir_duplicado,
  criar_meme,
  editar_meme,
  publicar_meme,
  criar_carta,
  anexar_midia
};
