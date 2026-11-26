// Perfil do usuário: apelido editável, gato (avatar padrão), foto do Discord opcional (usar_foto), fim do cadastro,
// e o perfil público: layout (perfil_layout) e carta favorita (carta_favorita).
// O servidor valida tudo: nada do que vem do cliente entra no banco sem passar por lista fechada ou regra.
import { ErroNegocio, MSG_INDISPONIVEL, transacao } from '../economia/servico.js';
import { ehReservado, ESPERA_TROCA_HORAS } from './apelidos.js';

export class ErroPerfil extends ErroNegocio {
  constructor(status, mensagem, campo = null, extra = null) { super(status, mensagem); this.campo = campo; this.extra = extra; } // extra: campos a mais no corpo (ex.: tente_em_segundos)
}

// ---- lista fechada do gato: as opções do criador de gato (common.js: SG.fur/pat/eye/acc/clo/bg), tamanho de cada lista ----
//  fur 15 (9 = Sphynx) · pat 9 · eye 8 · acc 18 · clo 14 · bg 8. Opções novas entram sempre no fim (o gato salvo guarda o índice). Se o criador ganhar opções, atualize aqui (e os testes).
export const OPCOES_GATO = Object.freeze({ fur: 15, pat: 9, eye: 8, acc: 18, clo: 14, bg: 8 });
const CHAVES_GATO = Object.keys(OPCOES_GATO);

/** Devolve o gato normalizado ({fur,pat,eye,acc,clo,bg}) ou lança 422. Só aceita objeto simples, todas as 6 chaves, inteiros na faixa. */
export function validarAvatarGato(v) {
  const erro = (m) => new ErroPerfil(422, m, 'avatar_gato');
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw erro('avatar_gato deve ser um objeto');
  const chaves = Object.keys(v);
  const extra = chaves.find((k) => !CHAVES_GATO.includes(k));
  if (extra !== undefined) throw erro('avatar_gato tem uma opção desconhecida');
  const out = {};
  for (const k of CHAVES_GATO) {
    const x = v[k];
    if (!Number.isInteger(x) || x < 0 || x >= OPCOES_GATO[k]) throw erro(`avatar_gato.${k} fora das opções (0 a ${OPCOES_GATO[k] - 1})`);
    out[k] = x;
  }
  return out;
}

const APELIDO = /^[A-Za-z0-9_.\-]{3,20}$/; // mesma regra do CHECK de usuarios.apelido
export function validarApelido(v) {
  if (typeof v !== 'string') throw new ErroPerfil(422, 'apelido deve ser texto', 'apelido');
  const a = v.trim();
  if (!APELIDO.test(a)) throw new ErroPerfil(422, 'apelido: 3 a 20 caracteres, só letras, números, _ . -', 'apelido');
  if (ehReservado(a)) throw new ErroPerfil(422, 'esse apelido é reservado, escolha outro', 'apelido');
  return a;
}

// visual do perfil público (lista fechada; a mesma do CHECK da migração 015)
export const LAYOUTS = Object.freeze(['homepage', 'icq', 'orkut', 'fotolog', 'msn', 'twitter', 'facebook', 'ask', 'whatsapp', 'vine', 'snapchat', 'instagram', 'tiktok']);
const CARTA_ID = /^[a-z0-9_-]{1,60}$/i;

const CAMPOS = ['apelido', 'avatar_gato', 'usar_foto', 'perfil_layout', 'carta_favorita'];

/** Perfil público do próprio usuário (o que /api/eu devolve em "usuario"). usar_foto efetivo: só true se existir avatar_url. */
export async function lerPerfil(db, usuarioId) {
  const { rows } = await db.query(
    `SELECT u.id, u.apelido, u.avatar_gato, u.usar_foto, u.cadastro_completo_em, u.perfil_layout, u.carta_favorita, c.avatar_url
       FROM usuarios u LEFT JOIN contas_oauth c ON c.usuario_id = u.id AND c.provedor = 'discord'
      WHERE u.id = $1`, [usuarioId]);
  if (!rows.length) throw new ErroNegocio(401, 'usuário não encontrado');
  const u = rows[0];
  return {
    id: Number(u.id), apelido: u.apelido, avatar_gato: u.avatar_gato || {}, avatar_url: u.avatar_url ?? null,
    usar_foto: !!u.usar_foto && u.avatar_url != null, cadastro_completo: u.cadastro_completo_em != null,
    perfil_layout: u.perfil_layout || 'orkut', carta_favorita: u.carta_favorita ?? null
  };
}

/**
 * PATCH /api/eu. Tudo ou nada, numa transação com a linha do usuário travada (FOR UPDATE).
 * Primeira vez que o avatar_gato é salvo: preenche cadastro_completo_em e põe 1 pacote "boas" no estoque (nunca 2:
 * a trava da linha serializa as requisições e o índice único parcial pacotes_estoque_boas_uq é a segunda barreira).
 */
export async function atualizarPerfil(pool, usuario, corpo) {
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) throw new ErroPerfil(400, 'corpo deve ser um objeto JSON');
  const desconhecida = Object.keys(corpo).find((k) => !CAMPOS.includes(k));
  if (desconhecida !== undefined) throw new ErroPerfil(400, `campo não permitido: ${desconhecida.slice(0, 40)}`);
  if (!CAMPOS.some((k) => k in corpo)) throw new ErroPerfil(400, 'envie ao menos um campo: apelido, avatar_gato, usar_foto, perfil_layout ou carta_favorita');

  // validação de formato antes de abrir transação
  const novo = {};
  if ('apelido' in corpo) novo.apelido = validarApelido(corpo.apelido);
  if ('avatar_gato' in corpo) novo.avatar_gato = validarAvatarGato(corpo.avatar_gato);
  if ('usar_foto' in corpo) {
    if (typeof corpo.usar_foto !== 'boolean') throw new ErroPerfil(422, 'usar_foto deve ser true ou false', 'usar_foto');
    novo.usar_foto = corpo.usar_foto;
  }
  if ('perfil_layout' in corpo) {
    if (typeof corpo.perfil_layout !== 'string' || !LAYOUTS.includes(corpo.perfil_layout))
      throw new ErroPerfil(422, `perfil_layout deve ser um destes: ${LAYOUTS.join(', ')}`, 'perfil_layout');
    novo.perfil_layout = corpo.perfil_layout;
  }
  if ('carta_favorita' in corpo) { // null = sem carta favorita
    const c = corpo.carta_favorita;
    if (c !== null && (typeof c !== 'string' || !CARTA_ID.test(c))) throw new ErroPerfil(422, 'carta_favorita inválida', 'carta_favorita');
    novo.carta_favorita = c;
  }

  return transacao(pool, async (cli) => {
    // espera = segundos que faltam para poder trocar o apelido de novo (NULL = nunca trocou: primeira troca livre). Relógio do banco.
    const { rows: [u] } = await cli.query(
      `SELECT id, apelido, cadastro_completo_em,
              CEIL(GREATEST(0, EXTRACT(EPOCH FROM (apelido_alterado_em + make_interval(hours => $2) - now()))))::int AS espera
         FROM usuarios WHERE id = $1 FOR UPDATE`, [usuario.id, ESPERA_TROCA_HORAS]);
    if (!u) throw new ErroNegocio(401, 'usuário não encontrado');
    let pacote = null;

    // mesmo valor = nada a fazer (não conta como troca e não gasta a janela)
    if (novo.apelido !== undefined && novo.apelido !== u.apelido) {
      if (u.espera > 0) throw new ErroPerfil(429, `você já trocou o apelido há pouco; tente de novo em ${Math.ceil(u.espera / 60)} min`, 'apelido', { tente_em_segundos: u.espera });
      const { rows: ocupado } = await cli.query('SELECT 1 FROM usuarios WHERE lower(apelido) = lower($1) AND id <> $2', [novo.apelido, u.id]);
      if (ocupado.length) throw new ErroPerfil(409, 'apelido já está em uso', 'apelido');
      try { await cli.query('UPDATE usuarios SET apelido = $2, apelido_alterado_em = now() WHERE id = $1', [u.id, novo.apelido]); }
      catch (e) { if (e.code === '23505') throw new ErroPerfil(409, 'apelido já está em uso', 'apelido'); throw e; }
    }

    if (novo.usar_foto !== undefined) {
      if (novo.usar_foto) {
        const { rows: [c] } = await cli.query("SELECT avatar_url FROM contas_oauth WHERE usuario_id = $1 AND provedor = 'discord'", [u.id]);
        if (!c || c.avatar_url == null) throw new ErroPerfil(422, 'sua conta não tem foto do Discord para usar', 'usar_foto');
      }
      await cli.query('UPDATE usuarios SET usar_foto = $2 WHERE id = $1', [u.id, novo.usar_foto]);
    }

    if (novo.perfil_layout !== undefined) await cli.query('UPDATE usuarios SET perfil_layout = $2 WHERE id = $1', [u.id, novo.perfil_layout]);
    if (novo.carta_favorita !== undefined) {
      // só uma carta que a pessoa TEM (quantidade > 0) pode ser a favorita
      if (novo.carta_favorita !== null) {
        const { rows: tem } = await cli.query('SELECT 1 FROM inventario_cartas WHERE usuario_id = $1 AND carta_id = $2 AND quantidade > 0', [u.id, novo.carta_favorita]);
        if (!tem.length) throw new ErroPerfil(422, 'você não tem essa carta no álbum', 'carta_favorita');
      }
      await cli.query('UPDATE usuarios SET carta_favorita = $2 WHERE id = $1', [u.id, novo.carta_favorita]);
    }

    if (novo.avatar_gato !== undefined) {
      await cli.query('UPDATE usuarios SET avatar_gato = $2 WHERE id = $1', [u.id, JSON.stringify(novo.avatar_gato)]);
      if (u.cadastro_completo_em == null) {
        // primeira vez: sem o pacote cadastrado (seed não rodou) não completa o cadastro, senão a pessoa perderia o presente
        const { rows: [t] } = await cli.query("SELECT 1 AS ok FROM pacotes_tipo WHERE id = 'boas' AND ativo");
        if (!t) {
          console.error(new Date().toISOString(), "perfil: pacote 'boas' não cadastrado (rode node api/seed/acervo.js)");
          throw new ErroNegocio(503, MSG_INDISPONIVEL);
        }
        await cli.query('UPDATE usuarios SET cadastro_completo_em = now() WHERE id = $1', [u.id]);
        const { rows: [e] } = await cli.query(
          "INSERT INTO pacotes_estoque (usuario_id, tipo, origem) VALUES ($1, 'boas', 'boas') ON CONFLICT DO NOTHING RETURNING id", [u.id]);
        if (e) pacote = { estoque_id: Number(e.id) }; // conta antiga que já tinha ganho 'boas' pela visita: não ganha de novo
      }
    }

    return { usuario: await lerPerfil(cli, u.id), pacote_boas_vindas: pacote };
  });
}
