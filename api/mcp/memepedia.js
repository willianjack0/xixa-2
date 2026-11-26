// Ferramentas da Memepédia no MCP:
// - obter_memepedia (ler): textos publicados de um meme, fila pendente e campos que ainda faltam
// - escrever_memepedia (escrever): grava o texto de um campo. Entra na fila da moderação; com o escopo publicar e
//   publicar=true entra já publicado (como a equipe faz em /api/memepedia/direto)
// - moderar_memepedia (publicar): aprova, recusa ou devolve à fila uma edição pendente
import { auditar } from '../lib/auditoria.js';
import { ID_MEME } from '../lib/acervo-validacao.js';
import { clean } from '../lib/http.js';
import { ErroArgumento, validarChavesConhecidas } from './ferramentas.js';

export const CAMPOS_MEMEPEDIA = ['origem', 'porque', 'usos', 'rede', 'hoje', 'curiosidades'];
export const STATUS_MODERACAO = ['aprovado', 'recusado', 'pendente'];
const AUTOR = /^[\w.\-]{3,20}$/;

function idDoMeme(args) {
  if (!args.id || typeof args.id !== 'string' || !ID_MEME.test(args.id)) {
    throw new ErroArgumento('campo "id" obrigatório: slug a-z, 0-9 e hífen, até 80 caracteres');
  }
  return args.id;
}

export async function obter_memepedia(pool, args = {}) {
  validarChavesConhecidas(args, ['id']);
  const id = idDoMeme(args);

  const { rows: [meme] } = await pool.query('SELECT id, titulo, status FROM memes WHERE id = $1', [id]);
  if (!meme) throw new ErroArgumento('meme não encontrado');

  const { rows: pub } = await pool.query(
    `SELECT DISTINCT ON (campo) campo, texto, fonte, autor, revisado_em
       FROM memepedia_edicoes WHERE meme_id = $1 AND status = 'aprovado'
      ORDER BY campo, revisado_em DESC`, [id]);
  const { rows: pend } = await pool.query(
    `SELECT id, campo, texto, fonte, autor, criado_em
       FROM memepedia_edicoes WHERE meme_id = $1 AND status = 'pendente' ORDER BY criado_em`, [id]);

  const campos = {};
  for (const x of pub) campos[x.campo] = { texto: x.texto, fonte: x.fonte, autor: x.autor, em: x.revisado_em };

  return {
    meme: { id: meme.id, titulo: meme.titulo, status: meme.status },
    campos,
    pendentes: pend.map((x) => ({ id: Number(x.id), campo: x.campo, texto: x.texto, fonte: x.fonte, autor: x.autor, criado_em: x.criado_em })),
    faltando: CAMPOS_MEMEPEDIA.filter((c) => !campos[c])
  };
}

export async function escrever_memepedia(pool, args = {}, ctx = {}) {
  validarChavesConhecidas(args, ['id', 'campo', 'texto', 'fonte', 'publicar']);
  const id = idDoMeme(args);

  if (!CAMPOS_MEMEPEDIA.includes(args.campo)) {
    throw new ErroArgumento(`campo "campo" inválido: use ${CAMPOS_MEMEPEDIA.join(', ')}`);
  }
  if (typeof args.texto !== 'string') throw new ErroArgumento('campo "texto" obrigatório');
  const texto = clean(args.texto, 2000);
  if (texto.length < 10) throw new ErroArgumento('campo "texto" precisa de pelo menos 10 caracteres (máximo 2000)');
  if (args.texto.trim().length > 2000) throw new ErroArgumento('campo "texto" passa de 2000 caracteres');

  let fonte = null;
  if (args.fonte !== undefined && args.fonte !== null && args.fonte !== '') {
    fonte = clean(args.fonte, 300);
    if (!/^https?:\/\/\S+$/i.test(fonte)) throw new ErroArgumento('campo "fonte" deve ser um link http ou https (até 300 caracteres)');
  }

  const publicar = args.publicar === undefined ? false : args.publicar;
  if (typeof publicar !== 'boolean') throw new ErroArgumento('campo "publicar" deve ser booleano');
  if (publicar && !(ctx.mcp?.escopos || []).includes('publicar')) throw new ErroArgumento('falta o escopo publicar');

  const apelido = String(ctx.mcp?.apelido || '');
  const autor = AUTOR.test(apelido) ? apelido : 'equipe-mcp';

  const { rows: [meme] } = await pool.query('SELECT id FROM memes WHERE id = $1', [id]);
  if (!meme) throw new ErroArgumento('meme não encontrado');

  if (!publicar) {
    const { rows: [qt] } = await pool.query(
      "SELECT count(*)::int AS n FROM memepedia_edicoes WHERE meme_id = $1 AND campo = $2 AND status = 'pendente' AND autor = $3",
      [id, args.campo, autor]);
    if (qt.n >= 3) throw new ErroArgumento('já há 3 edições pendentes deste campo desta chave; peça para moderar antes de enviar outra');
  }

  const status = publicar ? 'aprovado' : 'pendente';
  const { rows: [nova] } = await pool.query(
    `INSERT INTO memepedia_edicoes (meme_id, campo, texto, fonte, autor, status, revisado_em)
     VALUES ($1, $2, $3, $4, $5, $6, ${publicar ? 'now()' : 'NULL'}) RETURNING id`,
    [id, args.campo, texto, fonte, autor, status]);

  await auditar({ ...ctx, pool }, publicar ? 'memepedia.direto' : 'memepedia.enviar', 'memes:' + id,
    { campo: args.campo, fonte, edicao_id: Number(nova.id) });

  return { ok: true, edicao_id: Number(nova.id), meme_id: id, campo: args.campo, status, publicado: publicar };
}

export async function moderar_memepedia(pool, args = {}, ctx = {}) {
  validarChavesConhecidas(args, ['edicao_id', 'status']);
  if (!Number.isInteger(args.edicao_id) || args.edicao_id < 1) throw new ErroArgumento('campo "edicao_id" deve ser inteiro (veja obter_memepedia)');
  if (!STATUS_MODERACAO.includes(args.status)) throw new ErroArgumento(`campo "status" inválido: use ${STATUS_MODERACAO.join(', ')}`);

  const { rows: [antes] } = await pool.query('SELECT id, meme_id, campo, status FROM memepedia_edicoes WHERE id = $1', [args.edicao_id]);
  if (!antes) throw new ErroArgumento('edição não encontrada');
  if (antes.status === args.status) {
    return { ok: true, sem_mudanca: true, edicao_id: args.edicao_id, status: antes.status };
  }

  await pool.query('UPDATE memepedia_edicoes SET status = $1, revisado_em = now() WHERE id = $2', [args.status, args.edicao_id]);
  await auditar({ ...ctx, pool }, 'memepedia.moderar', 'memes:' + antes.meme_id,
    { edicao_id: args.edicao_id, campo: antes.campo, de: antes.status, para: args.status });

  return { ok: true, edicao_id: args.edicao_id, meme_id: antes.meme_id, campo: antes.campo, status: args.status };
}
