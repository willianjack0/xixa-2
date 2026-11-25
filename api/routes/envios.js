// Envios de memes, fila de moderação (consenso de 2 votos, desempate de admin) e remoções (prazo de 72 h).
//  - quem envia: patente Banda larga ou mais (permissão envio.criar); no máximo 5 envios abertos por pessoa;
//  - quem modera: papel moderador ou admin (não vota no próprio envio); o voto dos outros fica oculto (voto cego);
//  - 2 votos iguais fecham o envio; votos divididos esperam o desempate de um admin;
//  - aprovado: o meme entra no acervo (raridade Clássico), o autor ganha XP e moedas e quem votou com o resultado ganha XP;
//  - tudo grava em log_auditoria; XP e moedas só pelo razão (economia/servico.js), valores vindos de regras_economia.
import { send, lerJson, limited } from '../lib/http.js';
import { auditar } from '../lib/auditoria.js';
import { transacao, ErroNegocio, criarRazao, carregarRegras, travarUsuario } from '../economia/servico.js';
import { VOTOS, decidir, normalizarUrl, slugDe, urlValida, youtubeId } from '../lib/envios.js';
import { VOTE_ID } from './votos.js';

const MAX_ABERTOS = 5;
const XP_ALINHADO_PADRAO = 3; // se regras_economia.xp_ganho não tiver "mod_alinhado"

const texto = (v, min, max) => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);

async function corpo(req, res) {
  const b = await lerJson(req);
  if (!b || typeof b !== 'object' || Array.isArray(b)) { send(res, 400, { erro: 'json inválido' }); return null; }
  return b;
}

async function slugLivre(cli, titulo) {
  const base = slugDe(titulo);
  for (let i = 1; i <= 50; i++) {
    const id = i === 1 ? base : `${base.slice(0, 76)}-${i}`;
    if (!(await cli.query('SELECT 1 FROM memes WHERE id = $1', [id])).rowCount) return id;
  }
  throw new ErroNegocio(409, 'não consegui gerar um id livre para o meme');
}

/** Fecha o envio com `resultado`: grava o meme (se aprovado), as recompensas e o log. Roda dentro da transação do voto. */
async function fechar(cli, ctx, envio, votos, resultado, por) {
  const motivo = votos.find((v) => v.voto === resultado && v.motivo)?.motivo || null;
  let memeId = null;
  if (resultado === 'aprovado') {
    if (!envio.ano || !envio.categoria) throw new ErroNegocio(409, 'envio sem ano ou categoria: peça ajuste ao autor');
    const { rows: [autor] } = await cli.query('SELECT apelido FROM usuarios WHERE id = $1', [envio.usuario_id]);
    memeId = await slugLivre(cli, envio.titulo);
    await cli.query(
      `INSERT INTO memes (id, titulo, ano, categoria, tipo, raridade, descricao, autor, youtube_id, status)
       VALUES ($1,$2,$3,$4,'video','Clássico',$5,$6,$7,'publicado')`,
      [memeId, envio.titulo, envio.ano, envio.categoria, envio.descricao, autor?.apelido || null, youtubeId(envio.url)]);
  }
  await cli.query(
    'UPDATE envios SET status = $2, motivo = $3, meme_id = $4, decidido_em = now() WHERE id = $1',
    [envio.id, resultado, motivo, memeId]);

  if (resultado === 'aprovado') {
    const regras = await carregarRegras(cli);
    const xpAlinhado = Number.isInteger(regras.xp_ganho.mod_alinhado) ? regras.xp_ganho.mod_alinhado : XP_ALINHADO_PADRAO;
    const premios = new Map(); // usuario_id -> { xp: [[valor, motivo]], moedas: [[valor, motivo]] }
    const dar = (id, tipo, valor, mot) => { const p = premios.get(id) || { xp: [], moedas: [] }; p[tipo].push([valor, mot]); premios.set(id, p); };
    dar(envio.usuario_id, 'xp', regras.xp_ganho.envio_aprovado, 'envio_aprovado');
    dar(envio.usuario_id, 'moedas', regras.recompensa_moedas.envio_aprovado, 'envio_aprovado');
    for (const v of votos.filter((x) => x.voto === resultado && x.moderador_id !== envio.usuario_id)) dar(v.moderador_id, 'xp', xpAlinhado, 'mod_alinhado');
    for (const id of [...premios.keys()].sort((a, b) => a - b)) { // ordem fixa: evita deadlock entre decisões simultâneas
      await travarUsuario(cli, id);
      const razao = criarRazao(cli, id), p = premios.get(id);
      for (const [valor, mot] of p.xp) await razao.xp(valor, mot, 'envio:' + envio.id);
      for (const [valor, mot] of p.moedas) await razao.moedas(valor, mot, 'envio:' + envio.id);
      await razao.aplicar();
    }
  }
  return { memeId, motivo, por };
}

export default function registrar(r) {
  // ---------- quem envia ----------
  r.post('/api/envios', async (ctx) => {
    const { req, res, pool, usuario } = ctx;
    if (limited('envio:' + usuario.id, 10)) return send(res, 429, { erro: 'Muitos envios seguidos. Aguarde um pouco.' });
    const b = await corpo(req, res); if (!b) return;
    const url = urlValida(b.url) && b.url.trim(), titulo = texto(b.titulo, 3, 200), categoria = texto(b.categoria, 1, 40);
    const descricao = b.descricao == null || b.descricao === '' ? null : texto(b.descricao, 1, 2000);
    const erros = {};
    if (!url) erros.url = 'link http(s) válido, até 500 caracteres';
    if (!titulo) erros.titulo = 'de 3 a 200 caracteres';
    if (!Number.isInteger(b.ano) || b.ano < 1990 || b.ano > new Date().getFullYear()) erros.ano = 'ano entre 1990 e o atual';
    if (!categoria) erros.categoria = 'obrigatória';
    if (b.descricao != null && b.descricao !== '' && !descricao) erros.descricao = 'até 2000 caracteres';
    if (Object.keys(erros).length) return send(res, 422, { erro: 'campos inválidos', campos: erros });

    const norm = normalizarUrl(url);
    const { rows: [abertos] } = await pool.query("SELECT count(*)::int AS n FROM envios WHERE usuario_id = $1 AND status = 'aberto'", [usuario.id]);
    if (abertos.n >= MAX_ABERTOS) return send(res, 429, { erro: `Você já tem ${MAX_ABERTOS} envios aguardando moderação.` });
    const { rows: [jaEnvio] } = await pool.query("SELECT id, status FROM envios WHERE url_normalizada = $1 AND status IN ('aberto','aprovado') LIMIT 1", [norm]);
    if (jaEnvio) return send(res, 409, { erro: 'esse link já foi enviado', duplicado_de: { envio: jaEnvio.id, status: jaEnvio.status } });
    const yt = youtubeId(url);
    if (yt) {
      const { rows: [jaMeme] } = await pool.query("SELECT id, titulo FROM memes WHERE youtube_id = $1 AND status <> 'removido' LIMIT 1", [yt]);
      if (jaMeme) return send(res, 409, { erro: 'esse vídeo já está no acervo', duplicado_de: { meme: jaMeme.id, titulo: jaMeme.titulo } });
    }
    try {
      const { rows: [e] } = await pool.query(
        `INSERT INTO envios (usuario_id, titulo, ano, categoria, url, url_normalizada, descricao) VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, titulo, ano, categoria, url, status, criado_em`, [usuario.id, titulo, b.ano, categoria, url, norm, descricao]);
      return send(res, 201, { ok: true, envio: e });
    } catch (e) {
      if (e.code === '23503') return send(res, 422, { erro: 'campos inválidos', campos: { categoria: 'categoria inexistente' } });
      throw e;
    }
  }, { patente: 'banda_larga' });

  r.get('/api/envios/meus', async ({ res, pool, usuario }) => {
    const { rows } = await pool.query(
      'SELECT id, titulo, ano, categoria, url, status, motivo, meme_id, criado_em, decidido_em FROM envios WHERE usuario_id = $1 ORDER BY id DESC LIMIT 100', [usuario.id]);
    return send(res, 200, { itens: rows });
  }, { autenticada: true });

  // ---------- moderação ----------
  // fila: só envios abertos de outras pessoas; mostra o meu voto e QUANTOS votos há, nunca os votos dos outros (voto cego)
  r.get('/api/mod/fila', async ({ res, pool, usuario }) => {
    const { rows } = await pool.query(
      `SELECT e.id, e.titulo, e.ano, e.categoria, e.url, e.descricao, e.criado_em, u.apelido AS autor,
              (SELECT v.voto FROM votos_moderacao v WHERE v.envio_id = e.id AND v.moderador_id = $1) AS meu_voto,
              (SELECT count(*)::int FROM votos_moderacao v WHERE v.envio_id = e.id) AS votos
         FROM envios e JOIN usuarios u ON u.id = e.usuario_id
        WHERE e.status = 'aberto' AND e.usuario_id <> $1 ORDER BY e.criado_em, e.id LIMIT 200`, [usuario.id]);
    return send(res, 200, { itens: rows });
  }, { papel: 'moderador' });

  // voto: { voto: aprovado | rejeitado | ajuste | duplicado, motivo?: texto até 300 }. Pode trocar o voto enquanto o envio estiver aberto.
  r.post(/^\/api\/mod\/fila\/(\d{1,18})\/voto$/, async (ctx) => {
    const { req, res, pool, params, usuario } = ctx;
    if (limited('modvoto:' + usuario.id, 120)) return send(res, 429, { erro: 'Muitas ações. Aguarde um pouco.' });
    const b = await corpo(req, res); if (!b) return;
    if (!VOTOS.includes(b.voto)) return send(res, 400, { erro: 'voto inválido', validos: VOTOS });
    const motivo = b.motivo == null || b.motivo === '' ? null : texto(b.motivo, 1, 300);
    if (b.motivo != null && b.motivo !== '' && !motivo) return send(res, 422, { erro: 'motivo de 1 a 300 caracteres' });
    try {
      const out = await transacao(pool, async (cli) => {
        const { rows: [e] } = await cli.query('SELECT * FROM envios WHERE id = $1 FOR UPDATE', [params[0]]);
        if (!e) throw new ErroNegocio(404, 'envio não encontrado');
        if (e.status !== 'aberto') throw new ErroNegocio(409, 'esse envio já foi decidido');
        if (Number(e.usuario_id) === Number(usuario.id)) throw new ErroNegocio(403, 'você não vota no próprio envio');
        const { rows: [eu] } = await cli.query('SELECT papel FROM usuarios WHERE id = $1', [usuario.id]);
        const antes = (await cli.query('SELECT moderador_id, voto, motivo FROM votos_moderacao WHERE envio_id = $1 AND moderador_id <> $2', [e.id, usuario.id])).rows;
        await cli.query(
          `INSERT INTO votos_moderacao (envio_id, moderador_id, voto, motivo) VALUES ($1,$2,$3,$4)
           ON CONFLICT (envio_id, moderador_id) DO UPDATE SET voto = EXCLUDED.voto, motivo = EXCLUDED.motivo, criado_em = now()`,
          [e.id, usuario.id, b.voto, motivo]);
        const votos = [...antes.map((v) => ({ ...v, moderador_id: Number(v.moderador_id) })), { moderador_id: Number(usuario.id), voto: b.voto, motivo }];
        // desempate: só vale o voto de um admin dado DEPOIS de já haver 2+ votos sem consenso
        const dividido = antes.length >= 2 && !decidir(antes).resultado;
        const d = decidir(votos, { desempate: dividido && eu.papel === 'admin' ? b.voto : null });
        await auditar({ ...ctx, pool: cli }, 'envio.votar', 'envios:' + e.id, { voto: b.voto }); // no mesmo cliente: se a transação desfizer, o log some junto
        if (!d.resultado) return { decidido: null, votos: votos.length };
        const fim = await fechar(cli, ctx, e, votos, d.resultado, d.por);
        await auditar({ ...ctx, pool: cli }, 'envio.decidir', 'envios:' + e.id, { resultado: d.resultado, por: d.por, votos: votos.length, ...(fim.memeId ? { meme: fim.memeId } : {}) });
        return { decidido: d.resultado, por: d.por, meme_id: fim.memeId, votos: votos.length };
      });
      return send(res, 200, { ok: true, ...out });
    } catch (e) {
      if (e instanceof ErroNegocio) return send(res, e.status, { erro: e.message });
      throw e;
    }
  }, { papel: 'moderador' });

  // ---------- remoções (prazo de 72 h) ----------
  // público: dono do conteúdo pede a remoção (o botão do rodapé "Peça a remoção")
  r.post('/api/remocoes', async ({ req, res, pool, ip }) => {
    if (limited('rem:' + ip, 5)) return send(res, 429, { erro: 'Muitos pedidos seguidos. Aguarde um pouco.' });
    const b = await corpo(req, res); if (!b) return;
    const solicitante = texto(b.solicitante, 2, 120), motivo = texto(b.motivo, 10, 2000);
    const contato = b.contato == null || b.contato === '' ? null : texto(b.contato, 3, 200);
    const memeId = b.meme_id == null || b.meme_id === '' ? null : String(b.meme_id);
    const erros = {};
    if (!solicitante) erros.solicitante = 'de 2 a 120 caracteres';
    if (!motivo) erros.motivo = 'de 10 a 2000 caracteres';
    if (b.contato != null && b.contato !== '' && !contato) erros.contato = 'de 3 a 200 caracteres';
    if (memeId && !VOTE_ID.test(memeId)) erros.meme_id = 'id inválido';
    if (Object.keys(erros).length) return send(res, 422, { erro: 'campos inválidos', campos: erros });
    if (memeId && !(await pool.query('SELECT 1 FROM memes WHERE id = $1', [memeId])).rowCount) return send(res, 422, { erro: 'campos inválidos', campos: { meme_id: 'meme inexistente' } });
    const { rows: [x] } = await pool.query('INSERT INTO remocoes (meme_id, solicitante, motivo, contato) VALUES ($1,$2,$3,$4) RETURNING id, prazo_em', [memeId, solicitante, motivo, contato]);
    return send(res, 201, { ok: true, id: x.id, prazo_em: x.prazo_em });
  });

  r.get('/api/mod/remocoes', async ({ res, pool }) => {
    const { rows } = await pool.query(
      `SELECT x.id, x.meme_id, m.titulo AS meme_titulo, x.solicitante, x.motivo, x.contato, x.status, x.prazo_em, x.criado_em, x.respondido_em,
              (x.status = 'aberta' AND x.prazo_em < now()) AS atrasada
         FROM remocoes x LEFT JOIN memes m ON m.id = x.meme_id
        ORDER BY (x.status = 'aberta') DESC, x.prazo_em LIMIT 200`);
    return send(res, 200, { itens: rows });
  }, { papel: 'moderador' });

  // decide: { decisao: 'atendida' | 'negada' }. Atendida tira o meme do site (status removido).
  r.post(/^\/api\/mod\/remocoes\/(\d{1,18})$/, async (ctx) => {
    const { req, res, pool, params, usuario } = ctx;
    const b = await corpo(req, res); if (!b) return;
    if (b.decisao !== 'atendida' && b.decisao !== 'negada') return send(res, 400, { erro: 'decisao: atendida ou negada' });
    try {
      const out = await transacao(pool, async (cli) => {
        const { rows: [x] } = await cli.query('SELECT id, meme_id, status FROM remocoes WHERE id = $1 FOR UPDATE', [params[0]]);
        if (!x) throw new ErroNegocio(404, 'pedido não encontrado');
        if (x.status !== 'aberta') throw new ErroNegocio(409, 'esse pedido já foi respondido');
        await cli.query('UPDATE remocoes SET status = $2, respondido_por = $3, respondido_em = now() WHERE id = $1', [x.id, b.decisao, usuario.id]);
        if (b.decisao === 'atendida' && x.meme_id) await cli.query("UPDATE memes SET status = 'removido' WHERE id = $1", [x.meme_id]);
        await auditar({ ...ctx, pool: cli }, 'remocao.' + (b.decisao === 'atendida' ? 'atender' : 'negar'), 'remocoes:' + x.id, x.meme_id ? { meme: x.meme_id } : {});
        return { meme_removido: b.decisao === 'atendida' && !!x.meme_id };
      });
      return send(res, 200, { ok: true, ...out });
    } catch (e) {
      if (e instanceof ErroNegocio) return send(res, e.status, { erro: e.message });
      throw e;
    }
  }, { papel: 'moderador' });
}
