// Cartas pelo MCP: buscar_cartas (ler) e editar_carta (escrever), inclusive trocar ou tirar a imagem da carta.
// A imagem segue o mesmo caminho do painel e de anexar_midia: otimizada (WebP, 800 px, sem metadados) e gravada no S3 em
// midias/carta-<aleatório>.webp; o álbum e o perfil mostram a imagem do banco.
import { randomBytes } from 'node:crypto';
import { auditar } from '../lib/auditoria.js';
import { ID_CARTA, ESQUEMA_CARTA, lerCampos, diff } from '../lib/acervo-validacao.js';
import { ErroArgumento, validarChavesConhecidas } from './ferramentas.js';
import { configDoAmbiente, criarS3 } from './s3.js';
import { baixarImagem, MAX_BYTES } from './imagem.js';
import { otimizarImagem, ErroImagem } from '../lib/imagens.js';

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const escaparLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
const COLUNAS = 'c.id, c.colecao_id, k.nome AS colecao_nome, c.numero, c.nome, c.emoji, c.raridade, c.meme_id, c.imagem';

export async function buscar_cartas(pool, args = {}) {
  validarChavesConhecidas(args, ['busca', 'colecao_id', 'sem_imagem', 'limite']);
  const onde = [], val = [];
  const add = (cond, v) => { val.push(v); onde.push(cond.replace('?', '$' + val.length)); };
  if (args.busca !== undefined && args.busca !== null && args.busca !== '') {
    if (typeof args.busca !== 'string' || args.busca.trim().length > 60) throw new ErroArgumento('campo "busca" deve ser texto de até 60 caracteres');
    add("lower(c.nome) LIKE lower(?) ESCAPE '\\'", '%' + escaparLike(args.busca.trim()) + '%');
  }
  if (args.colecao_id !== undefined && args.colecao_id !== null && args.colecao_id !== '') {
    if (typeof args.colecao_id !== 'string' || !ID_CARTA.test(args.colecao_id)) throw new ErroArgumento('campo "colecao_id" inválido');
    add('c.colecao_id = ?', args.colecao_id);
  }
  if (args.sem_imagem !== undefined) {
    if (typeof args.sem_imagem !== 'boolean') throw new ErroArgumento('campo "sem_imagem" deve ser verdadeiro ou falso');
    if (args.sem_imagem) onde.push('c.imagem IS NULL');
  }
  let limite = 20;
  if (args.limite !== undefined) {
    if (!Number.isInteger(args.limite) || args.limite < 1 || args.limite > 50) throw new ErroArgumento('campo "limite" deve ser inteiro de 1 a 50');
    limite = args.limite;
  }
  const where = onde.length ? 'WHERE ' + onde.join(' AND ') : '';
  const [{ rows }, { rows: [{ total }] }] = await Promise.all([
    pool.query(`SELECT ${COLUNAS} FROM cartas c JOIN colecoes k ON k.id = c.colecao_id ${where} ORDER BY k.ordem, c.numero LIMIT ${limite}`, val),
    pool.query(`SELECT count(*)::int AS total FROM cartas c JOIN colecoes k ON k.id = c.colecao_id ${where}`, val)
  ]);
  return { total, itens: rows };
}

/** Fábrica com dependências injetáveis (nos testes entram um S3 e um downloader falsos). */
export function fazerEditarCarta({ s3 = null, baixar = baixarImagem, otimizar = otimizarImagem } = {}) {
  return async function editar_carta(pool, args = {}, ctx = {}) {
    validarChavesConhecidas(args, ['id', 'nome', 'emoji', 'raridade', 'meme_id', 'imagem_url', 'imagem_base64', 'remover_imagem']);
    if (typeof args.id !== 'string' || !ID_CARTA.test(args.id)) throw new ErroArgumento('campo "id" obrigatório (id da carta, ex.: plataformas-2)');
    const { id, imagem_url: url, imagem_base64: b64, remover_imagem: remover, ...campos } = args;

    const temUrl = url !== undefined && url !== null && url !== '';
    const temB64 = b64 !== undefined && b64 !== null && b64 !== '';
    if (remover !== undefined && typeof remover !== 'boolean') throw new ErroArgumento('campo "remover_imagem" deve ser verdadeiro ou falso');
    if ([temUrl, temB64, remover === true].filter(Boolean).length > 1) throw new ErroArgumento('informe só um entre "imagem_url", "imagem_base64" e "remover_imagem"');

    const lido = lerCampos(campos, ESQUEMA_CARTA);
    const ruim = Object.keys(lido.erros)[0];
    if (ruim) throw new ErroArgumento(`campo "${ruim}" inválido: ${lido.erros[ruim]}`);
    const dados = { ...lido.dados };
    if (!Object.keys(dados).length && !temUrl && !temB64 && remover !== true) throw new ErroArgumento('nada para alterar');

    const { rows: [antes] } = await pool.query('SELECT id, nome, emoji, raridade, meme_id, imagem FROM cartas WHERE id = $1', [id]);
    if (!antes) throw new ErroArgumento('carta não encontrada');
    if (dados.meme_id) {
      const { rows: [m] } = await pool.query('SELECT id FROM memes WHERE id = $1', [dados.meme_id]);
      if (!m) throw new ErroArgumento('meme_id não encontrado');
    }

    let cliente = null, nova = null, img = null;
    if (temUrl || temB64) {
      cliente = s3 || (() => { const cfg = configDoAmbiente(); return cfg ? criarS3(cfg) : null; })();
      if (!cliente) throw new ErroArgumento('o armazenamento de imagens não está configurado neste servidor');
      let buf;
      if (temB64) {
        if (typeof b64 !== 'string') throw new ErroArgumento('campo "imagem_base64" deve ser texto');
        const limpo = b64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
        if (limpo.length > Math.ceil(MAX_BYTES * 4 / 3) + 8 || !BASE64.test(limpo)) throw new ErroArgumento('"imagem_base64" inválido ou maior que 5 MB');
        buf = Buffer.from(limpo, 'base64');
        if (buf.length > MAX_BYTES) throw new ErroArgumento('imagem maior que 5 MB');
      } else {
        if (typeof url !== 'string' || url.length > 500) throw new ErroArgumento('campo "imagem_url" deve ser um link de até 500 caracteres');
        try { buf = await baixar(url.trim()); } catch (e) { throw new ErroArgumento(String(e.message || 'não consegui baixar a imagem')); }
      }
      try { img = await otimizar(buf, 'carta'); } catch (e) { throw e instanceof ErroImagem ? new ErroArgumento(e.message) : e; }
      nova = `midias/carta-${randomBytes(6).toString('hex')}.${img.ext}`;
      try { await cliente.put(nova, img.buffer, img.tipo); } catch { throw new ErroArgumento('não consegui gravar a imagem no armazenamento; tente de novo'); }
      dados.imagem = nova;
    } else if (remover === true) {
      dados.imagem = null;
    }

    const cols = Object.keys(dados);
    let depois;
    try {
      ({ rows: [depois] } = await pool.query(
        `UPDATE cartas SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING id, colecao_id, numero, nome, emoji, raridade, meme_id, imagem`,
        [id, ...cols.map((c) => dados[c])]));
    } catch (e) {
      if (nova) await cliente.remove(nova).catch(() => {}); // não deixa arquivo órfão
      if (e.code === '23503') throw new ErroArgumento('meme_id não encontrado');
      throw e;
    }

    const mudou = diff(antes, dados);
    if (Object.keys(mudou).length) {
      await auditar({ ...ctx, pool }, 'carta.editar', 'cartas:' + id, img
        ? { campos: mudou, bytes: img.bytes, bytes_original: img.original.bytes, origem: temUrl ? 'url' : 'base64' }
        : { campos: mudou });
    }

    // imagem antiga: apaga do S3 se nenhuma outra carta ou mídia de meme a usa (melhor esforço)
    if (antes.imagem && antes.imagem !== depois.imagem && /^midias\/carta-[a-z0-9]+\.webp$/.test(antes.imagem)) {
      try {
        const cl = cliente || s3 || (() => { const cfg = configDoAmbiente(); return cfg ? criarS3(cfg) : null; })();
        const { rows: [{ usos }] } = await pool.query(
          'SELECT (SELECT count(*) FROM cartas WHERE imagem = $1) + (SELECT count(*) FROM midias WHERE caminho = $1) AS usos', [antes.imagem]);
        if (cl && Number(usos) === 0) await cl.remove(antes.imagem);
      } catch { /* arquivo órfão é só espaço perdido */ }
    }
    return { ok: true, carta: depois, imagem: img ? { caminho: nova, url_publica: '/' + nova, largura: img.largura ?? null, altura: img.altura ?? null, bytes: img.bytes, bytes_original: img.original.bytes } : undefined };
  };
}

export const editar_carta = fazerEditarCarta();
