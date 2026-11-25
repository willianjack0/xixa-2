// Perfil público (o que um visitante vê) e recados deixados no perfil.
// Tudo é montado no servidor: patente pelo razão de XP, álbum pelo inventário, carta favorita só se a pessoa ainda a tiver.
import { ErroNegocio, transacao } from '../economia/servico.js';
import { patenteDoUsuario } from '../lib/patente.js';

export const APELIDO_URL = /^[A-Za-z0-9_.\-]{3,20}$/;
export const LIMITE_RECADOS = 50;     // quantos recados o perfil mostra (os mais recentes)
export const MAX_TEXTO_RECADO = 300;

const fotoDe = (u) => (u.usar_foto && u.avatar_url ? u.avatar_url : null);

/** Acha o usuário pelo apelido (sem diferenciar maiúsculas). Banido ou inexistente = 404. */
export async function acharPorApelido(db, apelido) {
  if (typeof apelido !== 'string' || !APELIDO_URL.test(apelido)) throw new ErroNegocio(404, 'perfil não encontrado');
  const { rows } = await db.query(
    `SELECT u.id, u.apelido, u.avatar_gato, u.usar_foto, u.perfil_layout, u.carta_favorita, u.criado_em, u.banido, c.avatar_url
       FROM usuarios u LEFT JOIN contas_oauth c ON c.usuario_id = u.id AND c.provedor = 'discord'
      WHERE lower(u.apelido) = lower($1) LIMIT 1`, [apelido]);
  const u = rows[0];
  if (!u || u.banido) throw new ErroNegocio(404, 'perfil não encontrado');
  return u;
}

/** Perfil para visitar: avatar, patente, álbum (resumo por coleção + cartas que a pessoa tem), carta favorita e layout. */
export async function perfilPublico(pool, apelido, visitante) {
  const u = await acharPorApelido(pool, apelido);
  const [{ atual, proxima, xp }, { rows: cols }, { rows: cartas }, { rows: [rc] }] = await Promise.all([
    patenteComXp(pool, u.id),
    pool.query('SELECT id, nome, icone, cor, ordem FROM colecoes ORDER BY ordem, id'),
    pool.query(
      `SELECT c.id, c.colecao_id, c.numero, c.nome, c.emoji, c.raridade, c.meme_id, c.imagem, (i.usuario_id IS NOT NULL) AS tem
         FROM cartas c LEFT JOIN inventario_cartas i ON i.carta_id = c.id AND i.usuario_id = $1 AND i.quantidade > 0
        ORDER BY c.colecao_id, c.numero`, [u.id]),
    pool.query('SELECT count(*)::int AS n FROM recados WHERE dono_id = $1', [u.id])
  ]);
  const eh_meu = !!visitante && Number(visitante.id) === Number(u.id);
  const publicacoes = await listarPublicacoes(pool, u.id, eh_meu);
  const porCol = {};
  for (const c of cartas) (porCol[c.colecao_id] ||= []).push(c);
  const colecoes = cols.map((k) => {
    const l = porCol[k.id] || [], tenho = l.filter((c) => c.tem).length;
    return { id: k.id, nome: k.nome, icone: k.icone, cor: k.cor, total: l.length, tenho, completa: l.length > 0 && tenho === l.length };
  });
  const minhas = cartas.filter((c) => c.tem).map(({ tem, ...c }) => c);
  const fav = u.carta_favorita ? minhas.find((c) => c.id === u.carta_favorita) || null : null;
  return {
    perfil: {
      apelido: u.apelido, avatar_gato: u.avatar_gato || {}, avatar_url: fotoDe(u),
      layout: u.perfil_layout || 'orkut', membro_desde: u.criado_em,
      eh_meu
    },
    patente: atual && { id: atual.id, nome: atual.nome, cor: atual.cor },
    proxima_patente: proxima && { nome: proxima.nome, faltam: proxima.xp_minimo - xp },
    xp,
    carta_favorita: fav,
    album: {
      total: cartas.length, tenho: minhas.length,
      colecoes_completas: colecoes.filter((k) => k.completa).length,
      colecoes, cartas: minhas
    },
    recados: rc.n,
    publicacoes
  };
}

export const LIMITE_PUBLICACOES = 30;
export const MAX_LEGENDA = 140;
const cartaDe = (r) => ({ id: r.carta_id, colecao_id: r.colecao_id, numero: r.numero, nome: r.nome, emoji: r.emoji, raridade: r.raridade, meme_id: r.carta_meme, imagem: r.carta_imagem || null });

/** Publicações do perfil, mais recentes primeiro: figurinhas que a pessoa compartilhou do álbum
 *  e memes que ela enviou e a moderação aprovou (envios.status = 'aprovado'). */
export async function listarPublicacoes(pool, usuarioId, ehMeu) {
  const [{ rows: figs }, { rows: envs }] = await Promise.all([
    pool.query(
      `SELECT p.id, p.legenda, p.criado_em, p.carta_id, c.colecao_id, c.numero, c.nome, c.emoji, c.raridade, c.meme_id AS carta_meme, c.imagem AS carta_imagem
         FROM publicacoes p JOIN cartas c ON c.id = p.carta_id
        WHERE p.usuario_id = $1 ORDER BY p.criado_em DESC, p.id DESC LIMIT $2`, [usuarioId, LIMITE_PUBLICACOES]),
    pool.query(
      `SELECT e.id, e.titulo, e.ano, coalesce(e.decidido_em, e.criado_em) AS em, m.id AS meme_id, m.titulo AS meme_titulo, m.ano AS meme_ano, m.youtube_id, m.emoji,
              (SELECT md.caminho FROM midias md WHERE md.meme_id = m.id AND md.tipo = 'imagem' ORDER BY md.ordem, md.id LIMIT 1) AS meme_imagem
         FROM envios e LEFT JOIN memes m ON m.id = e.meme_id AND m.status = 'publicado'
        WHERE e.usuario_id = $1 AND e.status = 'aprovado' ORDER BY em DESC, e.id DESC LIMIT $2`, [usuarioId, LIMITE_PUBLICACOES])
  ]);
  const l = [
    ...figs.map((r) => ({ id: 'f' + r.id, tipo: 'figurinha', em: r.criado_em, legenda: r.legenda || null, carta: cartaDe(r), pode_apagar: !!ehMeu })),
    ...envs.map((r) => ({ id: 'm' + r.id, tipo: 'meme', em: r.em, legenda: null, pode_apagar: false,
      meme: { id: r.meme_id || null, titulo: r.meme_titulo || r.titulo, ano: r.meme_ano || r.ano || null, youtube_id: r.youtube_id || null, imagem: r.meme_imagem || null, emoji: r.emoji || null } }))
  ];
  l.sort((a, b) => new Date(b.em) - new Date(a.em));
  return l.slice(0, LIMITE_PUBLICACOES);
}

/** Legenda opcional: mesma limpeza do recado, 1 a 140 caracteres; vazia = sem legenda. */
function limparLegenda(v) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') throw new ErroNegocio(422, 'legenda inválida');
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if ([...t].length > MAX_LEGENDA) throw new ErroNegocio(422, `a legenda pode ter no máximo ${MAX_LEGENDA} caracteres`);
  return t;
}

/** Compartilhar figurinha no próprio perfil. Só carta que a pessoa tem; compartilhar de novo sobe a publicação. */
export async function publicarFigurinha(pool, usuario, cartaId, legenda) {
  if (typeof cartaId !== 'string' || !/^[A-Za-z0-9_.:-]{1,80}$/.test(cartaId)) throw new ErroNegocio(422, 'figurinha inválida');
  const leg = limparLegenda(legenda);
  const { rows: [tem] } = await pool.query(
    'SELECT 1 FROM inventario_cartas WHERE usuario_id = $1 AND carta_id = $2 AND quantidade > 0', [usuario.id, cartaId]);
  if (!tem) throw new ErroNegocio(422, 'você só pode compartilhar figurinhas que tem');
  const { rows: [r] } = await pool.query(
    `INSERT INTO publicacoes (usuario_id, carta_id, legenda) VALUES ($1, $2, $3)
     ON CONFLICT (usuario_id, carta_id) DO UPDATE SET criado_em = now(), legenda = EXCLUDED.legenda
     RETURNING id, legenda, criado_em, carta_id`, [usuario.id, cartaId, leg]);
  const { rows: [c] } = await pool.query(
    'SELECT colecao_id, numero, nome, emoji, raridade, meme_id AS carta_meme, imagem AS carta_imagem FROM cartas WHERE id = $1', [cartaId]);
  return { id: 'f' + r.id, tipo: 'figurinha', em: r.criado_em, legenda: r.legenda || null, carta: cartaDe({ ...r, ...c }), pode_apagar: true };
}

/** Apaga publicação de figurinha: só o dono. Qualquer outro caso = 404. */
export async function apagarPublicacao(pool, id, usuario) {
  const m = /^f?([0-9]{1,18})$/.exec(String(id));
  if (!m) throw new ErroNegocio(404, 'publicação não encontrada');
  const { rowCount } = await pool.query('DELETE FROM publicacoes WHERE id = $1 AND usuario_id = $2', [m[1], usuario.id]);
  if (!rowCount) throw new ErroNegocio(404, 'publicação não encontrada');
  return { ok: true };
}

const patenteComXp = (pool, id) => patenteDoUsuario(pool, id); // { xp, atual, proxima }

const recadoDe = (r, visitanteId, donoId) => ({
  id: Number(r.id), texto: r.texto, em: r.criado_em,
  autor: { apelido: r.apelido, avatar_gato: r.avatar_gato || {}, avatar_url: r.usar_foto && r.avatar_url ? r.avatar_url : null },
  pode_apagar: visitanteId != null && (Number(visitanteId) === Number(donoId) || Number(visitanteId) === Number(r.autor_id))
});

/** Recados do perfil, mais recentes primeiro. Recado de autor banido não aparece. */
export async function listarRecados(pool, apelido, visitante) {
  const dono = await acharPorApelido(pool, apelido);
  const { rows } = await pool.query(
    `SELECT r.id, r.texto, r.criado_em, r.autor_id, a.apelido, a.avatar_gato, a.usar_foto, c.avatar_url
       FROM recados r JOIN usuarios a ON a.id = r.autor_id
       LEFT JOIN contas_oauth c ON c.usuario_id = a.id AND c.provedor = 'discord'
      WHERE r.dono_id = $1 AND NOT a.banido ORDER BY r.criado_em DESC, r.id DESC LIMIT $2`, [dono.id, LIMITE_RECADOS]);
  return { itens: rows.map((r) => recadoDe(r, visitante?.id, dono.id)) };
}

/** Texto do recado: sem caracteres de controle (quebra de linha vira espaço), espaços repetidos juntos, 1 a 300. */
export function limparTexto(v) {
  if (typeof v !== 'string') throw new ErroNegocio(422, 'escreva o recado');
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) throw new ErroNegocio(422, 'escreva o recado');
  if ([...t].length > MAX_TEXTO_RECADO) throw new ErroNegocio(422, `o recado pode ter no máximo ${MAX_TEXTO_RECADO} caracteres`);
  return t;
}

export async function criarRecado(pool, apelido, autor, texto) {
  const t = limparTexto(texto);
  const dono = await acharPorApelido(pool, apelido);
  if (Number(dono.id) === Number(autor.id)) throw new ErroNegocio(422, 'você não pode deixar recado no seu próprio perfil');
  return transacao(pool, async (cli) => {
    const { rows: [r] } = await cli.query(
      'INSERT INTO recados (dono_id, autor_id, texto) VALUES ($1, $2, $3) RETURNING id, texto, criado_em, autor_id', [dono.id, autor.id, t]);
    const { rows: [a] } = await cli.query(
      `SELECT u.apelido, u.avatar_gato, u.usar_foto, c.avatar_url FROM usuarios u
         LEFT JOIN contas_oauth c ON c.usuario_id = u.id AND c.provedor = 'discord' WHERE u.id = $1`, [autor.id]);
    return recadoDe({ ...r, ...a }, autor.id, dono.id);
  });
}

/** Apaga: só o dono do perfil ou quem escreveu. Outro usuário (ou recado inexistente) = 404, para não revelar nada. */
export async function apagarRecado(pool, id, usuario) {
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new ErroNegocio(404, 'recado não encontrado');
  const { rowCount } = await pool.query('DELETE FROM recados WHERE id = $1 AND (dono_id = $2 OR autor_id = $2)', [id, usuario.id]);
  if (!rowCount) throw new ErroNegocio(404, 'recado não encontrado');
  return { ok: true };
}
