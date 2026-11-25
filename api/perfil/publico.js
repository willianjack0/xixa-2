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
      `SELECT c.id, c.colecao_id, c.numero, c.nome, c.emoji, c.raridade, c.meme_id, (i.usuario_id IS NOT NULL) AS tem
         FROM cartas c LEFT JOIN inventario_cartas i ON i.carta_id = c.id AND i.usuario_id = $1 AND i.quantidade > 0
        ORDER BY c.colecao_id, c.numero`, [u.id]),
    pool.query('SELECT count(*)::int AS n FROM recados WHERE dono_id = $1', [u.id])
  ]);
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
      eh_meu: !!visitante && Number(visitante.id) === Number(u.id)
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
    recados: rc.n
  };
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
