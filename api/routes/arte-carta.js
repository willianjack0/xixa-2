// Envio de arte de carta pela comunidade (página temporária enviar-arte.html) e a moderação desses envios.
//  - GET  /api/arte/cartas            cartas SEM imagem aprovada (cartas.imagem IS NULL), com busca e filtro de coleção (login)
//  - POST /api/arte/envios?carta=ID   corpo binário (image/png|jpeg|webp, até 5 MB): valida pelos bytes, otimiza e guarda em pendentes/
//  - GET  /api/arte/meus              os envios de quem está logado e a situação de cada um
//  - DELETE /api/arte/envios/:id      cancela o próprio envio (só dono, só pendente) e apaga o arquivo pendente
//  - GET  /api/mod/arte/envios        fila (papel moderador ou admin)
//  - GET  /api/mod/arte/envios/:id/arquivo   a imagem pendente (só moderador; nunca pública)
//  - POST /api/mod/arte/envios/:id/aprovar   copia para midias/, grava cartas.imagem e audita
//  - POST /api/mod/arte/envios/:id/rejeitar  { motivo } (3 a 300 caracteres)
// Ordem dos travamentos (evita deadlock): SEMPRE a carta primeiro, depois o envio. S3 fica FORA das transações.
// Só a APROVAÇÃO tira a carta da lista. Enquanto isso a carta segue disponível para receber arte de outras pessoas.
// Arquivo pendente mora em pendentes/ (o nginx só expõe midias/) e o nome é sempre gerado pelo servidor.
import { randomBytes } from 'node:crypto';
import { send, limited, lerJson, readBodyBuffer } from '../lib/http.js';
import { auditar } from '../lib/auditoria.js';
import { otimizarImagem, ErroImagem } from '../lib/imagens.js';
import { detectarImagem } from '../mcp/imagem.js';
import { criarSemaforo } from '../lib/semaforo.js';
import { ID_CARTA } from '../lib/acervo-validacao.js';
import { ErroNegocio, transacao } from '../economia/servico.js';
import { papelAtinge } from '../lib/papel.js';
import { configDoAmbiente, criarS3 } from '../mcp/s3.js';

export const MAX_BYTES_ARTE = 5 * 1024 * 1024; // entrada; depois de otimizada (WebP, 800 px) costuma ficar abaixo de 300 KB
export const MIN_LADO_ARTE = 400; // lado menor da imagem original, em px
export const PROPORCAO_ARTE = { min: 0.5, max: 2 }; // largura / altura: nada de tira fina
export const MAX_POR_DIA = 10; // envios por usuário em 24 h (qualquer situação)
// conversões de imagem (sharp) simultâneas no processo: a CPU/memória do sharp é o custo mais alto da rota
const conversoes = criarSemaforo(Math.min(3, Math.max(2, Number(process.env.ARTE_CONVERSOES) || 2)));
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ARQUIVO_PENDENTE = /^pendentes\/arte-[a-f0-9]{24}\.webp$/;

const aInt = (v, padrao, min, max) => {
  if (v === null || v === undefined || v === '') return padrao;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const escaparLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
const CONFLITO = 'conflito com outra decisão ao mesmo tempo: tente de novo';
/** Transação com mapeamento de deadlock/serialização (40P01, 40001) para 409. */
export async function tx(pool, fn) {
  try { return await transacao(pool, fn); } catch (e) {
    if (e && (e.code === '40P01' || e.code === '40001')) throw new ErroNegocio(409, CONFLITO);
    throw e;
  }
}
/** Trava a CARTA e depois o envio (mesma ordem em todas as rotas). Devolve { c, e } (e = linha do envio, c = { id, imagem }). */
async function travar(cli, envioId) {
  const { rows: [pre] } = await cli.query('SELECT carta_id FROM envios_arte_carta WHERE id = $1', [envioId]);
  if (!pre) throw new ErroNegocio(404, 'envio não encontrado');
  const { rows: [c] } = await cli.query('SELECT id, imagem FROM cartas WHERE id = $1 FOR UPDATE', [pre.carta_id]);
  if (!c) throw new ErroNegocio(404, 'carta não encontrada');
  const { rows: [e] } = await cli.query('SELECT * FROM envios_arte_carta WHERE id = $1 FOR UPDATE', [envioId]);
  if (!e || e.carta_id !== c.id) throw new ErroNegocio(409, CONFLITO);
  return { c, e };
}
/** Regras baratas do envio (sem sharp): carta existe e sem arte, limite diário, 1 pendente por pessoa e carta. Lança ErroNegocio. */
async function checarEnvio(db, carta, usuarioId, { travarCarta = false } = {}) {
  const { rows: [c] } = await db.query(`SELECT id, imagem FROM cartas WHERE id = $1${travarCarta ? ' FOR SHARE' : ''}`, [carta]);
  if (!c) throw new ErroNegocio(404, 'carta não encontrada');
  if (c.imagem) throw new ErroNegocio(409, 'essa carta já tem arte aprovada');
  const { rows: [{ n }] } = await db.query("SELECT count(*)::int AS n FROM envios_arte_carta WHERE usuario_id = $1 AND criado_em > now() - interval '24 hours'", [usuarioId]);
  if (n >= MAX_POR_DIA) throw new ErroNegocio(429, `Limite de ${MAX_POR_DIA} envios por dia atingido. Tente amanhã.`);
  const { rows: [ja] } = await db.query("SELECT 1 AS x FROM envios_arte_carta WHERE carta_id = $1 AND usuario_id = $2 AND status = 'pendente'", [carta, usuarioId]);
  if (ja) throw new ErroNegocio(409, 'você já tem uma arte pendente para essa carta; espere a moderação decidir');
}
const erroDe = (res, e) => { if (e instanceof ErroNegocio) { send(res, e.status, { erro: e.message }); return true; } return false; };

export default function registrar(r, { s3 = null } = {}) {
  const armazenamento = () => s3 || (() => { const cfg = configDoAmbiente(); return cfg ? criarS3(cfg) : null; })();

  // ---------- lista de cartas sem arte ----------
  r.get('/api/arte/cartas', async ({ res, url, pool, usuario }) => {
    const q = url.searchParams;
    const onde = ['c.imagem IS NULL'], val = [];
    const add = (cond, v) => { val.push(v); onde.push(cond.replace('?', '$' + val.length)); };
    const busca = (q.get('busca') || '').trim();
    if (busca.length > 60) return send(res, 400, { erro: 'busca com até 60 caracteres' });
    if (busca) add("lower(c.nome) LIKE lower(?) ESCAPE '\\'", '%' + escaparLike(busca) + '%');
    const col = q.get('colecao_id');
    if (col) { if (!ID_CARTA.test(col)) return send(res, 400, { erro: 'colecao_id inválido' }); add('c.colecao_id = ?', col); }
    const limite = aInt(q.get('limite'), 24, 1, 50), pagina = aInt(q.get('pagina'), 1, 1, 10000);
    if (limite === null || pagina === null) return send(res, 400, { erro: 'limite (1 a 50) ou pagina inválidos' });
    const where = 'WHERE ' + onde.join(' AND ');
    const [{ rows: itens }, { rows: [{ total }] }, { rows: colecoes }] = await Promise.all([
      pool.query(
        `SELECT c.id, c.colecao_id, k.nome AS colecao_nome, c.numero, c.nome, c.emoji, c.raridade,
                (SELECT count(*)::int FROM envios_arte_carta e WHERE e.carta_id = c.id AND e.status = 'pendente') AS pendentes,
                EXISTS (SELECT 1 FROM envios_arte_carta e WHERE e.carta_id = c.id AND e.usuario_id = $${val.length + 1} AND e.status = 'pendente') AS meu_pendente
           FROM cartas c JOIN colecoes k ON k.id = c.colecao_id ${where}
          ORDER BY k.ordem, c.numero LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`, [...val, usuario.id]),
      pool.query(`SELECT count(*)::int AS total FROM cartas c ${where}`, val),
      pool.query(`SELECT k.id, k.nome, count(*)::int AS sem_arte FROM cartas c JOIN colecoes k ON k.id = c.colecao_id WHERE c.imagem IS NULL GROUP BY k.id, k.nome, k.ordem ORDER BY k.ordem`)
    ]);
    return send(res, 200, { total, pagina, limite, itens, colecoes });
  }, { autenticada: true });

  // ---------- envio ----------
  r.post('/api/arte/envios', async (ctx) => {
    const { req, res, url, pool, usuario } = ctx;
    const carta = url.searchParams.get('carta') || '';
    if (!ID_CARTA.test(carta)) return send(res, 400, { erro: 'carta inválida' });
    const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!TIPOS.has(tipo)) return send(res, 415, { erro: 'envie uma imagem png, jpeg ou webp' }, { Connection: 'close' });
    if (Number(req.headers['content-length'] || 0) > MAX_BYTES_ARTE) return send(res, 413, { erro: 'imagem maior que 5 MB' }, { Connection: 'close' });
    const cliente = armazenamento();
    if (!cliente) return send(res, 503, { erro: 'o armazenamento de imagens não está configurado neste servidor' });
    if (limited('arte:' + usuario.id, 20)) return send(res, 429, { erro: 'Muitos envios seguidos. Aguarde um pouco.' }, { Connection: 'close' });

    let buf;
    try { buf = await readBodyBuffer(req, MAX_BYTES_ARTE); } catch (e) {
      return send(res, e.message === 'too-large' ? 413 : 400, { erro: e.message === 'too-large' ? 'imagem maior que 5 MB' : 'não consegui ler o arquivo enviado' });
    }
    if (!buf.length) return send(res, 400, { erro: 'arquivo vazio' });

    // 1) regras baratas ANTES do sharp (carta sem arte, limite diário, 1 pendente por pessoa)
    try { await checarEnvio(pool, carta, usuario.id); } catch (e) { if (erroDe(res, e)) return; throw e; }

    // 2) o arquivo: tipo pelos bytes (nunca pelo nome nem pelo Content-Type); só então a conversão pesada, com no máximo 2 a 3 ao mesmo tempo
    if (!detectarImagem(buf)) return send(res, 422, { erro: 'o arquivo não é uma imagem jpeg, png ou webp' });
    let img;
    try { img = await conversoes.rodar(() => otimizarImagem(buf, 'carta')); } catch (e) {
      if (e instanceof ErroImagem) return send(res, 422, { erro: e.message });
      throw e;
    }
    const { largura: w, altura: h } = img.original;
    if (!(w >= MIN_LADO_ARTE && h >= MIN_LADO_ARTE)) return send(res, 422, { erro: `imagem pequena demais: o menor lado precisa ter pelo menos ${MIN_LADO_ARTE} px` });
    const prop = w / h;
    if (prop < PROPORCAO_ARTE.min || prop > PROPORCAO_ARTE.max) return send(res, 422, { erro: 'proporção fora do aceito: a imagem não pode ser mais de 2 vezes mais larga que alta, nem o contrário' });

    // 3) grava o pendente (nome gerado pelo servidor), depois o registro numa transação com a carta travada (FOR SHARE) e as regras revalidadas
    const arquivo = `pendentes/arte-${randomBytes(12).toString('hex')}.${img.ext}`;
    try { await cliente.put(arquivo, img.buffer, img.tipo); } catch {
      return send(res, 502, { erro: 'não consegui guardar a imagem; tente de novo' });
    }
    try {
      const e = await tx(pool, async (cli) => {
        await cli.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['arte:' + usuario.id]); // serializa os envios da mesma pessoa (limite diário exato)
        await checarEnvio(cli, carta, usuario.id, { travarCarta: true }); // aprovação concorrente trava a carta: aqui vê imagem NOT NULL
        const { rows: [novo] } = await cli.query(
          'INSERT INTO envios_arte_carta (carta_id, usuario_id, arquivo, largura, altura, bytes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, criado_em',
          [carta, usuario.id, arquivo, img.largura, img.altura, img.bytes]);
        return novo;
      });
      return send(res, 201, { ok: true, id: Number(e.id), status: 'pendente', criado_em: e.criado_em });
    } catch (e) {
      await cliente.remove(arquivo).catch(() => {}); // não deixa arquivo órfão
      if (erroDe(res, e)) return;
      if (e.code === '23505') return send(res, 409, { erro: 'você já tem uma arte pendente para essa carta; espere a moderação decidir' });
      if (e.code === '23503') return send(res, 404, { erro: 'carta não encontrada' });
      throw e;
    }
  }, { autenticada: true });

  // cancelar o próprio envio: só o dono e só enquanto pendente (qualquer outro caso = 404/409); apaga o arquivo pendente
  r.delete(/^\/api\/arte\/envios\/(\d{1,18})$/, async ({ res, pool, params, usuario }) => {
    let arquivo;
    try {
      arquivo = await tx(pool, async (cli) => {
        const { e } = await travar(cli, params[0]);
        if (Number(e.usuario_id) !== Number(usuario.id)) throw new ErroNegocio(404, 'envio não encontrado'); // não revela envio de outra pessoa
        if (e.status !== 'pendente') throw new ErroNegocio(409, 'esse envio já foi decidido e não pode mais ser cancelado');
        await cli.query('DELETE FROM envios_arte_carta WHERE id = $1', [e.id]);
        return e.arquivo;
      });
    } catch (e) { if (erroDe(res, e)) return; throw e; }
    if (ARQUIVO_PENDENTE.test(arquivo)) { const cl = armazenamento(); if (cl) await cl.remove(arquivo).catch(() => {}); }
    return send(res, 200, { ok: true });
  }, { autenticada: true });

  r.get('/api/arte/meus', async ({ res, pool, usuario }) => {
    const { rows } = await pool.query(
      `SELECT e.id, e.carta_id, c.nome AS carta_nome, e.status, e.motivo, e.criado_em, e.decidido_em
         FROM envios_arte_carta e JOIN cartas c ON c.id = e.carta_id
        WHERE e.usuario_id = $1 ORDER BY e.criado_em DESC LIMIT 50`, [usuario.id]);
    return send(res, 200, { itens: rows.map((x) => ({ ...x, id: Number(x.id) })) });
  }, { autenticada: true });

  // ---------- moderação (papel moderador ou admin) ----------
  r.get('/api/mod/arte/envios', async ({ res, url, pool }) => {
    const status = url.searchParams.get('status') || 'pendente';
    if (!['pendente', 'aprovado', 'rejeitado'].includes(status)) return send(res, 400, { erro: 'status inválido' });
    const limite = aInt(url.searchParams.get('limite'), 30, 1, 100);
    if (limite === null) return send(res, 400, { erro: 'limite inválido (1 a 100)' });
    const { rows } = await pool.query(
      `SELECT e.id, e.carta_id, c.nome AS carta_nome, c.raridade, k.nome AS colecao_nome, u.apelido AS autor, e.usuario_id AS autor_id,
              e.status, e.motivo, e.largura, e.altura, e.bytes, e.criado_em, e.decidido_em,
              (SELECT count(*)::int FROM envios_arte_carta o WHERE o.carta_id = e.carta_id AND o.status = 'pendente' AND o.id <> e.id) AS outros_pendentes,
              (c.imagem IS NOT NULL) AS carta_ja_tem_arte
         FROM envios_arte_carta e JOIN cartas c ON c.id = e.carta_id JOIN colecoes k ON k.id = c.colecao_id JOIN usuarios u ON u.id = e.usuario_id
        WHERE e.status = $1 ORDER BY ${status === 'pendente' ? 'e.criado_em ASC' : 'e.decidido_em DESC NULLS LAST'} LIMIT ${limite}`, [status]);
    const { rows: [{ total }] } = await pool.query('SELECT count(*)::int AS total FROM envios_arte_carta WHERE status = $1', [status]);
    return send(res, 200, { total, itens: rows.map((x) => ({ ...x, id: Number(x.id), autor_id: Number(x.autor_id) })) });
  }, { papel: 'moderador' });

  r.get(/^\/api\/mod\/arte\/envios\/(\d{1,18})\/arquivo$/, async ({ res, pool, params }) => {
    const { rows: [e] } = await pool.query('SELECT arquivo, status FROM envios_arte_carta WHERE id = $1', [params[0]]);
    if (!e || e.status !== 'pendente' || !ARQUIVO_PENDENTE.test(e.arquivo)) return send(res, 404, { erro: 'arquivo não encontrado' });
    const cliente = armazenamento();
    if (!cliente) return send(res, 503, { erro: 'o armazenamento de imagens não está configurado neste servidor' });
    let buf;
    try { buf = await cliente.get(e.arquivo, { max: MAX_BYTES_ARTE }); } catch { return send(res, 502, { erro: 'não consegui ler a imagem' }); }
    if (!buf) return send(res, 404, { erro: 'arquivo não encontrado' });
    res.writeHead(200, {
      'Content-Type': 'image/webp', 'Content-Length': buf.length, 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline; filename="arte.webp"'
    });
    res.end(buf);
  }, { papel: 'moderador' });

  // aprovar: S3 FORA da transação (copia pendentes/ -> midias/ sem recodificar), banco depois; se o banco falhar, apaga o objeto novo.
  // Quem envia não decide o próprio envio (só admin: por desenho, admin pode aprovar o próprio).
  r.post(/^\/api\/mod\/arte\/envios\/(\d{1,18})\/aprovar$/, async (ctx) => {
    const { res, pool, params, usuario } = ctx;
    const cliente = armazenamento();
    if (!cliente) return send(res, 503, { erro: 'o armazenamento de imagens não está configurado neste servidor' });
    const ehAdmin = papelAtinge(ctx.papel, 'admin');
    const proprio = (e) => Number(e.usuario_id) === Number(usuario.id) && !ehAdmin;
    let nova = null, descartar = [], decidido;
    try {
      // A) checagens baratas e cópia no S3, sem segurar lock de banco
      const { rows: [pre] } = await pool.query('SELECT * FROM envios_arte_carta WHERE id = $1', [params[0]]);
      if (!pre) throw new ErroNegocio(404, 'envio não encontrado');
      if (pre.status !== 'pendente') throw new ErroNegocio(409, 'esse envio já foi decidido');
      if (proprio(pre)) throw new ErroNegocio(403, 'você não decide o seu próprio envio; peça a outra pessoa da moderação');
      if (!ARQUIVO_PENDENTE.test(pre.arquivo)) throw new ErroNegocio(409, 'arquivo pendente inválido');
      let bruto;
      try { bruto = await cliente.get(pre.arquivo, { max: MAX_BYTES_ARTE }); } catch { throw new ErroNegocio(502, 'não consegui ler a imagem pendente; tente de novo'); }
      if (!bruto) throw new ErroNegocio(409, 'o arquivo desse envio sumiu do armazenamento; rejeite o envio');
      const det = detectarImagem(bruto);
      if (!det || det.ext !== 'webp') throw new ErroNegocio(409, 'arquivo pendente inválido; rejeite o envio'); // o pendente é sempre o WebP gerado no envio
      const destino = `midias/carta-${randomBytes(6).toString('hex')}.webp`;
      try { await cliente.put(destino, bruto, 'image/webp'); } catch { throw new ErroNegocio(502, 'não consegui gravar a imagem; tente de novo'); }
      nova = destino;
      // B) banco: carta primeiro, depois o envio
      decidido = await tx(pool, async (cli) => {
        const { c, e } = await travar(cli, params[0]);
        if (e.status !== 'pendente') throw new ErroNegocio(409, 'esse envio já foi decidido');
        if (e.arquivo !== pre.arquivo) throw new ErroNegocio(409, CONFLITO);
        if (c.imagem) throw new ErroNegocio(409, 'a carta já tem arte aprovada; rejeite este envio');
        await cli.query('UPDATE cartas SET imagem = $2 WHERE id = $1', [c.id, destino]);
        await cli.query("UPDATE envios_arte_carta SET status = 'aprovado', decidido_por = $2, decidido_em = now() WHERE id = $1", [e.id, usuario.id]);
        const { rows: outros } = await cli.query(
          `UPDATE envios_arte_carta SET status = 'rejeitado', motivo = 'outra arte foi aprovada para esta carta', decidido_por = $2, decidido_em = now()
            WHERE carta_id = $1 AND status = 'pendente' RETURNING id, arquivo`, [c.id, usuario.id]);
        descartar = [e.arquivo, ...outros.map((o) => o.arquivo)];
        return { envio_id: Number(e.id), carta_id: c.id, autor_id: Number(e.usuario_id), imagem: destino, rejeitados: outros.length, bytes: bruto.length };
      });
    } catch (e) {
      if (nova) await cliente.remove(nova).catch(() => {}); // não deixa arquivo órfão em midias/
      if (erroDe(res, e)) return;
      throw e;
    }
    await auditar(ctx, 'carta.arte_aprovar', 'cartas:' + decidido.carta_id, { envio_id: decidido.envio_id, autor_id: decidido.autor_id, imagem: decidido.imagem, bytes: decidido.bytes, rejeitados: decidido.rejeitados });
    for (const a of descartar) if (ARQUIVO_PENDENTE.test(a)) await cliente.remove(a).catch(() => {}); // melhor esforço: a limpeza periódica pega o que sobrar
    return send(res, 200, { ok: true, carta_id: decidido.carta_id, imagem: decidido.imagem, url_publica: '/' + decidido.imagem, outros_rejeitados: decidido.rejeitados });
  }, { papel: 'moderador' });

  r.post(/^\/api\/mod\/arte\/envios\/(\d{1,18})\/rejeitar$/, async (ctx) => {
    const { req, res, pool, params, usuario } = ctx;
    const corpo = await lerJson(req);
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return send(res, 400, { erro: 'json inválido' });
    const motivo = typeof corpo.motivo === 'string' ? corpo.motivo.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
    if (motivo.length < 3 || motivo.length > 300) return send(res, 422, { erro: 'diga o motivo (3 a 300 caracteres)' });
    let arquivo, cartaId;
    try {
      ({ arquivo, cartaId } = await tx(pool, async (cli) => {
        const { c, e } = await travar(cli, params[0]);
        if (e.status !== 'pendente') throw new ErroNegocio(409, 'esse envio já foi decidido');
        if (Number(e.usuario_id) === Number(usuario.id) && !papelAtinge(ctx.papel, 'admin')) throw new ErroNegocio(403, 'você não decide o seu próprio envio; peça a outra pessoa da moderação');
        await cli.query("UPDATE envios_arte_carta SET status = 'rejeitado', motivo = $2, decidido_por = $3, decidido_em = now() WHERE id = $1", [e.id, motivo, usuario.id]);
        return { arquivo: e.arquivo, cartaId: c.id };
      }));
    } catch (e) { if (erroDe(res, e)) return; throw e; }
    await auditar(ctx, 'carta.arte_rejeitar', 'cartas:' + cartaId, { envio_id: Number(params[0]), motivo });
    if (ARQUIVO_PENDENTE.test(arquivo)) { const cl = armazenamento(); if (cl) await cl.remove(arquivo).catch(() => {}); }
    return send(res, 200, { ok: true, carta_id: cartaId });
  }, { papel: 'moderador' });
}
