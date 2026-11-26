// Economia no servidor. O servidor é a autoridade: saldo, XP e cartas só mudam aqui, dentro de transação.
//
// Regras de ouro:
//  1. Moedas e XP só mudam por LINHAS NOVAS em movimentos_moeda / eventos_xp (o razão). usuarios.xp e
//     usuarios.moedas são cache, atualizados na mesma transação com a soma das linhas gravadas.
//  2. Toda operação trava a linha do usuário (SELECT ... FOR UPDATE): operações do mesmo usuário se
//     enfileiram, então não há saldo negativo nem pacote aberto duas vezes por corrida.
//  3. Valores de recompensa vêm de regras_economia (tabela), preços e chances de pacotes_tipo.
import { RARIDADES, criarRng, novaSemente, sortearPacote } from './sorteio.js';
import { equipeDoUsuario, comPatenteFixa, PATENTE_FIXA_SQL } from '../lib/equipe.js';

export class ErroNegocio extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

/** Falta de acervo/regras: o cliente vê uma mensagem genérica; o detalhe (que cita seed e tabelas) só vai para o log. */
export const MSG_INDISPONIVEL = 'serviço indisponível, tente mais tarde';
function indisponivel(detalhe) {
  console.error(new Date().toISOString(), 'economia indisponível:', detalhe);
  return new ErroNegocio(503, MSG_INDISPONIVEL);
}

export async function transacao(pool, fn) {
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const r = await fn(cli);
    await cli.query('COMMIT');
    return r;
  } catch (e) {
    await cli.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cli.release();
  }
}

// ---- apoio ----
async function carregarRegras(db) {
  const { rows } = await db.query('SELECT chave, valor FROM regras_economia');
  const r = Object.fromEntries(rows.map((x) => [x.chave, x.valor]));
  for (const k of ['valor_repetida', 'recompensa_moedas', 'xp_ganho', 'limites']) {
    if (!r[k]) throw indisponivel(`regras_economia sem a chave "${k}" (rode as migrações e o seed)`);
  }
  return r;
}

async function travarUsuario(cli, id) {
  const { rows } = await cli.query('SELECT id, apelido, xp, moedas FROM usuarios WHERE id = $1 FOR UPDATE', [id]);
  if (!rows.length) throw new ErroNegocio(401, 'usuário não encontrado');
  return rows[0];
}

/** Acumulador do razão da transação: grava as linhas e, no fim, aplica a soma ao cache do usuário. */
function criarRazao(cli, usuarioId) {
  const soma = { xp: 0, moedas: 0 };
  return {
    soma,
    // devolve false se a linha já existia (motivos únicos: ver índices da migração 008)
    async xp(valor, motivo, ref = null) {
      if (!valor) return false;
      const r = await cli.query(
        'INSERT INTO eventos_xp (usuario_id, valor, motivo, ref) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',
        [usuarioId, valor, motivo, ref]);
      if (r.rowCount) soma.xp += valor;
      return !!r.rowCount;
    },
    async moedas(valor, motivo, ref = null) {
      if (!valor) return false;
      const r = await cli.query(
        'INSERT INTO movimentos_moeda (usuario_id, valor, motivo, ref) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',
        [usuarioId, valor, motivo, ref]);
      if (r.rowCount) soma.moedas += valor;
      return !!r.rowCount;
    },
    async aplicar() {
      const { rows } = await cli.query(
        'UPDATE usuarios SET xp = xp + $2, moedas = moedas + $3 WHERE id = $1 RETURNING xp, moedas', [usuarioId, soma.xp, soma.moedas]);
      return { xp: Number(rows[0].xp), moedas: Number(rows[0].moedas) };
    }
  };
}


async function patentes(db) {
  return (await db.query('SELECT id, nome, xp_minimo, cor FROM patentes ORDER BY xp_minimo')).rows;
}

/** Cartas do escopo, em ordem estável (coleção, número): a ordem faz parte da reprodução do sorteio. */
async function cartasDoEscopo(cli, colecaoId) {
  const { rows } = await cli.query(
    `SELECT c.id, c.raridade, c.colecao_id, c.nome, c.emoji, c.meme_id
       FROM cartas c JOIN colecoes k ON k.id = c.colecao_id
      WHERE ($1::text IS NULL OR c.colecao_id = $1) ORDER BY k.ordem, c.numero`, [colecaoId]);
  return rows;
}

const diaNoFuso = (data, fuso) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(data);

// ---- leitura ----
export async function carteira(pool, usuario) {
  const regras = await carregarRegras(pool);
  const [{ rows: [u] }, { rows: [m] }, { rows: [x] }, pats, { rows: est }, { rows: inv }, eq] = await Promise.all([
    pool.query('SELECT id, apelido, xp, moedas FROM usuarios WHERE id = $1', [usuario.id]),
    pool.query('SELECT COALESCE(sum(valor),0)::bigint AS saldo FROM movimentos_moeda WHERE usuario_id = $1', [usuario.id]),
    pool.query('SELECT COALESCE(sum(valor),0)::bigint AS total FROM eventos_xp WHERE usuario_id = $1', [usuario.id]),
    patentes(pool),
    pool.query(
      `SELECT e.tipo, t.nome, e.colecao_id, count(*)::int AS quantidade FROM pacotes_estoque e JOIN pacotes_tipo t ON t.id = e.tipo
        WHERE e.usuario_id = $1 AND e.usado_em IS NULL GROUP BY e.tipo, t.nome, e.colecao_id, t.ordem ORDER BY t.ordem, e.colecao_id`, [usuario.id]),
    pool.query(
      `SELECT i.quantidade, c.raridade FROM inventario_cartas i JOIN cartas c ON c.id = i.carta_id WHERE i.usuario_id = $1 AND i.quantidade > 0`, [usuario.id]),
    equipeDoUsuario(pool, usuario.id)
  ]);
  // o saldo e o XP oficiais são a soma do razão; o cache em usuarios deve bater (conferido nos testes)
  const moedas = Number(m.saldo), xp = Number(x.total);
  const { atual, proxima: prox } = comPatenteFixa(pats, xp, eq && eq.patente_fixa); // equipe pode ter patente fixa
  const totalAlbum = Number((await pool.query('SELECT count(*)::int AS n FROM cartas')).rows[0].n);
  return {
    usuario: { id: Number(u.id), apelido: u.apelido },
    moedas, xp,
    patente: atual,
    proxima_patente: prox ? { ...prox, faltam: prox.xp_minimo - xp } : null,
    pacotes: est,
    cartas: {
      distintas: inv.length, total_no_album: totalAlbum,
      quantidade_total: inv.reduce((n, i) => n + i.quantidade, 0),
      repetidas: inv.reduce((n, i) => n + Math.max(0, i.quantidade - 1), 0)
    },
    valor_das_repetidas: inv.reduce((s, i) => s + Math.max(0, i.quantidade - 1) * (regras.valor_repetida[i.raridade] || 0), 0)
  };
}

export async function album(pool, usuario) {
  const [{ rows: cols }, { rows: cartas }] = await Promise.all([
    pool.query('SELECT id, nome, icone, cor, cores_fundo, sobre FROM colecoes ORDER BY ordem'),
    pool.query(
      `SELECT c.id, c.colecao_id, c.numero, c.nome, c.emoji, c.raridade, c.meme_id, COALESCE(i.quantidade, 0)::int AS quantidade
         FROM cartas c LEFT JOIN inventario_cartas i ON i.carta_id = c.id AND i.usuario_id = $1
        ORDER BY c.colecao_id, c.numero`, [usuario.id])
  ]);
  const porColecao = {};
  for (const c of cartas) (porColecao[c.colecao_id] ||= []).push(c);
  const colecoes = cols.map((k) => {
    const lista = porColecao[k.id] || [];
    const tenho = lista.filter((c) => c.quantidade > 0).length;
    return { ...k, total: lista.length, tenho, completa: lista.length > 0 && tenho === lista.length, cartas: lista.map(({ colecao_id, ...c }) => c) };
  });
  return {
    colecoes,
    total: cartas.length,
    tenho: colecoes.reduce((n, k) => n + k.tenho, 0),
    colecoes_completas: colecoes.filter((k) => k.completa).length
  };
}

// ---- catálogo de pacotes (loja) ----
/** Tipos ativos de pacote, na ordem da loja. gratis = preco 0 (vem do estoque); comprar = à venda (preco > 0). */
export async function tiposDePacote(pool) {
  const { rows } = await pool.query(
    'SELECT id, nome, descricao, preco, cartas, chances, garantia, escopo, icone, gradiente FROM pacotes_tipo WHERE ativo ORDER BY ordem, id');
  if (!rows.length) throw indisponivel('pacotes_tipo vazio (rode node api/seed/acervo.js)');
  return rows.map((t) => ({
    id: t.id, nome: t.nome, descricao: t.descricao, preco: t.preco, cartas: t.cartas,
    chances: Object.fromEntries(RARIDADES.map((r) => [r, Number(t.chances?.[r]) || 0])),
    garantia: t.garantia, escopo: t.escopo, gratis: t.preco === 0, comprar: t.preco > 0, icone: t.icone, gradiente: t.gradiente
  }));
}

// ---- escrita ----
/** Visita do dia: XP e pacote diário (acumula até o limite). Idempotente por dia. O pacote de boas-vindas NÃO vem daqui: vem ao salvar o gato pela primeira vez (api/auth/perfil.js). */
export async function visita(pool, usuario, { agora = new Date() } = {}) {
  return transacao(pool, async (cli) => {
    await travarUsuario(cli, usuario.id);
    const regras = await carregarRegras(cli);
    const dia = diaNoFuso(agora, regras.limites.fuso);
    const razao = criarRazao(cli, usuario.id);
    const nova = await razao.xp(regras.xp_ganho.visita, 'visita_diaria', dia);
    const ganhos = [];
    // sem o tipo "diario" cadastrado (seed não rodou) a visita só dá XP; não há o que guardar no estoque
    const { rows: [temDiario] } = await cli.query("SELECT 1 AS ok FROM pacotes_tipo WHERE id = 'diario' AND ativo");
    if (nova && temDiario) {
      const { rows: [q] } = await cli.query(
        "SELECT count(*)::int AS n FROM pacotes_estoque WHERE usuario_id = $1 AND tipo = 'diario' AND usado_em IS NULL", [usuario.id]);
      if (q.n < regras.limites.pacote_diario_max) {
        await cli.query("INSERT INTO pacotes_estoque (usuario_id, tipo, origem) VALUES ($1,'diario','diario')", [usuario.id]);
        ganhos.push('diario');
      }
    }
    const saldo = await razao.aplicar();
    await cli.query('UPDATE usuarios SET ultimo_acesso = now() WHERE id = $1', [usuario.id]);
    return { dia, primeira_visita_do_dia: nova, xp_ganho: razao.soma.xp, pacotes_ganhos: ganhos, carteira: saldo };
  });
}

/** Jujuba escondida (easter-egg do site): quem acha ganha XP uma vez por dia (no fuso das regras).
 *  Valor em regras_economia.xp_ganho.jujuba (padrão 15). Sem índice único para o motivo: a trava do usuário serializa. */
export const XP_JUJUBA_PADRAO = 15;
export async function jujuba(pool, usuario, { agora = new Date() } = {}) {
  return transacao(pool, async (cli) => {
    await travarUsuario(cli, usuario.id);
    const regras = await carregarRegras(cli);
    const dia = diaNoFuso(agora, regras.limites.fuso);
    const valor = Number.isInteger(regras.xp_ganho.jujuba) && regras.xp_ganho.jujuba > 0 ? regras.xp_ganho.jujuba : XP_JUJUBA_PADRAO;
    const { rows: [ja] } = await cli.query("SELECT 1 AS ok FROM eventos_xp WHERE usuario_id = $1 AND motivo = 'jujuba' AND ref = $2", [usuario.id, dia]);
    const razao = criarRazao(cli, usuario.id);
    if (!ja) await razao.xp(valor, 'jujuba', dia);
    const saldo = await razao.aplicar();
    return { dia, nova: !ja, xp_ganho: razao.soma.xp, carteira: saldo };
  });
}

export async function comprarPacote(pool, usuario, { tipo, colecao_id = null }) {
  return transacao(pool, async (cli) => {
    const u = await travarUsuario(cli, usuario.id);
    const { rows: [p] } = await cli.query('SELECT id, nome, preco, escopo FROM pacotes_tipo WHERE id = $1 AND ativo', [String(tipo || '')]);
    if (!p) throw new ErroNegocio(404, 'pacote não encontrado');
    if (!(p.preco > 0)) throw new ErroNegocio(400, 'este pacote não está à venda');
    let colecao = null;
    if (p.escopo === 'colecao') {
      const { rows } = await cli.query('SELECT id FROM colecoes WHERE id = $1', [String(colecao_id || '')]);
      if (!rows.length) throw new ErroNegocio(400, 'escolha uma coleção válida (colecao_id)');
      colecao = rows[0].id;
    }
    if (Number(u.moedas) < p.preco) throw new ErroNegocio(402, 'moedas insuficientes');
    const razao = criarRazao(cli, usuario.id);
    await razao.moedas(-p.preco, 'pacote_comprado', p.id);
    const { rows: [e] } = await cli.query(
      "INSERT INTO pacotes_estoque (usuario_id, tipo, colecao_id, origem) VALUES ($1,$2,$3,'compra') RETURNING id", [usuario.id, p.id, colecao]);
    const saldo = await razao.aplicar();
    return { estoque_id: Number(e.id), tipo: p.id, nome: p.nome, colecao_id: colecao, preco: p.preco, carteira: saldo };
  });
}

/** Abre um pacote do estoque: sorteia, grava pacotes_abertos, cartas + moedas + XP — tudo ou nada. */
export async function abrirPacote(pool, usuario, { estoque_id = null, tipo = null, colecao_id = null }) {
  return transacao(pool, async (cli) => {
    await travarUsuario(cli, usuario.id);
    let item;
    if (estoque_id != null) {
      if (!Number.isInteger(estoque_id) || estoque_id < 1) throw new ErroNegocio(400, 'estoque_id inválido');
      item = (await cli.query(
        'SELECT id, tipo, colecao_id FROM pacotes_estoque WHERE id = $1 AND usuario_id = $2 AND usado_em IS NULL FOR UPDATE', [estoque_id, usuario.id])).rows[0];
    } else if (tipo) {
      item = (await cli.query(
        `SELECT id, tipo, colecao_id FROM pacotes_estoque WHERE usuario_id = $1 AND tipo = $2 AND usado_em IS NULL
            AND ($3::text IS NULL OR colecao_id = $3) ORDER BY criado_em, id LIMIT 1 FOR UPDATE`, [usuario.id, String(tipo), colecao_id ? String(colecao_id) : null])).rows[0];
    } else {
      throw new ErroNegocio(400, 'informe estoque_id ou tipo');
    }
    if (!item) throw new ErroNegocio(404, 'pacote não encontrado no seu estoque');

    const { rows: [pk] } = await cli.query('SELECT id, nome, cartas, chances, garantia, escopo FROM pacotes_tipo WHERE id = $1', [item.tipo]);
    const escopo = pk ? await cartasDoEscopo(cli, pk.escopo === 'colecao' ? item.colecao_id : null) : [];
    // acervo não carregado (seed não rodou): erro claro e nada é gravado
    if (!pk || !escopo.length) throw indisponivel(`acervo de cartas não carregado (pacote ${item.tipo}, ${escopo.length} cartas no escopo): rode node api/seed/acervo.js`);
    const semente = novaSemente();
    const sorteadas = sortearPacote({ cartas: escopo, chances: pk.chances, garantia: pk.garantia, quantidade: pk.cartas, rng: criarRng(semente) });

    const regras = await carregarRegras(cli);
    const razao = criarRazao(cli, usuario.id);
    const { rows: [aberto] } = await cli.query(
      'INSERT INTO pacotes_abertos (usuario_id, tipo, colecao_id, cartas, semente) VALUES ($1,$2,$3,$4,$5) RETURNING id, aberto_em',
      [usuario.id, pk.id, pk.escopo === 'colecao' ? item.colecao_id : null, JSON.stringify(sorteadas.map((c) => c.id)), semente]);
    await cli.query('UPDATE pacotes_estoque SET usado_em = now(), aberto_id = $2 WHERE id = $1', [item.id, aberto.id]);

    await razao.xp(regras.xp_ganho.pacote, 'pacote_aberto', String(aberto.id));
    // cartas já possuídas antes deste pacote
    const { rows: tinha } = await cli.query('SELECT carta_id FROM inventario_cartas WHERE usuario_id = $1 AND quantidade > 0', [usuario.id]);
    const possui = new Set(tinha.map((x) => x.carta_id));
    const resultado = [];
    for (const c of sorteadas) {
      const nova = !possui.has(c.id);
      possui.add(c.id);
      await cli.query(
        `INSERT INTO inventario_cartas (usuario_id, carta_id, quantidade) VALUES ($1,$2,1)
         ON CONFLICT (usuario_id, carta_id) DO UPDATE SET quantidade = inventario_cartas.quantidade + 1`, [usuario.id, c.id]);
      if (nova) await razao.xp(regras.xp_ganho.carta_nova[c.raridade] || 0, 'carta_nova', c.id);
      resultado.push({ id: c.id, nome: c.nome, emoji: c.emoji, raridade: c.raridade, colecao_id: c.colecao_id, meme_id: c.meme_id, nova });
    }

    // coleções que acabaram de ficar completas (uma vez por coleção: índice único no razão)
    const completas = [];
    for (const colId of [...new Set(sorteadas.map((c) => c.colecao_id))]) {
      const { rows: [q] } = await cli.query(
        `SELECT (SELECT count(*) FROM cartas WHERE colecao_id = $2)::int AS total,
                (SELECT count(*) FROM inventario_cartas i JOIN cartas c ON c.id = i.carta_id
                  WHERE i.usuario_id = $1 AND c.colecao_id = $2 AND i.quantidade > 0)::int AS tenho`, [usuario.id, colId]);
      if (q.total > 0 && q.tenho === q.total) {
        const pagou = await razao.xp(regras.xp_ganho.colecao_completa, 'colecao_completa', colId);
        await razao.moedas(regras.recompensa_moedas.colecao_completa, 'colecao_completa', colId);
        if (pagou) completas.push(colId);
      }
    }

    const saldo = await razao.aplicar();
    const valorRepetidas = resultado.filter((c) => !c.nova).reduce((s, c) => s + (regras.valor_repetida[c.raridade] || 0), 0);
    return {
      pacote_id: Number(aberto.id), tipo: pk.id, nome: pk.nome, aberto_em: aberto.aberto_em, cartas: resultado,
      novas: resultado.filter((c) => c.nova).length,
      xp_ganho: razao.soma.xp, moedas_ganhas: razao.soma.moedas,
      colecoes_completas: completas, valor_das_repetidas: valorRepetidas, carteira: saldo
    };
  });
}

/** Converte repetidas em moedas (fica 1 de cada carta). Uma carta (carta_id) ou todas. */
export async function reciclar(pool, usuario, { carta_id = null, todas = false }) {
  if (!todas && !carta_id) throw new ErroNegocio(400, 'informe carta_id ou todas: true');
  return transacao(pool, async (cli) => {
    await travarUsuario(cli, usuario.id);
    const regras = await carregarRegras(cli);
    const { rows } = await cli.query(
      `SELECT i.carta_id, i.quantidade, c.raridade FROM inventario_cartas i JOIN cartas c ON c.id = i.carta_id
        WHERE i.usuario_id = $1 AND i.quantidade > 1 AND ($2::text IS NULL OR i.carta_id = $2) FOR UPDATE OF i`,
      [usuario.id, todas ? null : String(carta_id)]);
    if (!rows.length) throw new ErroNegocio(409, 'você não tem repetidas para converter');
    const razao = criarRazao(cli, usuario.id);
    let convertidas = 0;
    for (const r of rows) {
      const extra = r.quantidade - 1;
      await cli.query('UPDATE inventario_cartas SET quantidade = 1 WHERE usuario_id = $1 AND carta_id = $2', [usuario.id, r.carta_id]);
      await razao.moedas(extra * (regras.valor_repetida[r.raridade] || 0), 'carta_reciclada', r.carta_id);
      convertidas += extra;
    }
    const saldo = await razao.aplicar();
    return { convertidas, cartas_afetadas: rows.length, moedas_ganhas: razao.soma.moedas, carteira: saldo };
  });
}

// ---- ranking (público) ----
// A foto do Discord só aparece quando a pessoa escolheu usá-la (usar_foto); senão null e o front mostra o gato.
const FOTO_DO_RANKING = `CASE WHEN u.usar_foto THEN (SELECT c.avatar_url FROM contas_oauth c WHERE c.usuario_id = u.id AND c.provedor = 'discord' LIMIT 1) END AS avatar_url`;
export async function ranking(pool, { metrica = 'xp', limite = 50 } = {}) {
  const lim = Math.max(1, Math.min(100, limite));
  const pats = await patentes(pool);
  if (metrica === 'cartas') {
    const { rows } = await pool.query(
      `SELECT u.id, u.apelido, u.avatar_gato, count(*)::int AS valor, u.xp, u.papel, ${FOTO_DO_RANKING}, ${PATENTE_FIXA_SQL}
         FROM inventario_cartas i JOIN usuarios u ON u.id = i.usuario_id
        WHERE i.quantidade > 0 AND NOT u.banido GROUP BY u.id ORDER BY valor DESC, u.xp DESC, u.id LIMIT $1`, [lim]);
    return rows.map((r, i) => ({ posicao: i + 1, apelido: r.apelido, avatar_gato: r.avatar_gato, avatar_url: r.avatar_url, valor: r.valor, patente: comPatenteFixa(pats, Number(r.xp), r.patente_fixa).atual?.nome, moderador: r.papel === 'moderador' }));
  }
  // xp: soma do razão (eventos reais), não o cache
  const { rows } = await pool.query(
    `SELECT u.id, u.apelido, u.avatar_gato, sum(e.valor)::bigint AS valor, u.papel, ${FOTO_DO_RANKING}, ${PATENTE_FIXA_SQL}
       FROM eventos_xp e JOIN usuarios u ON u.id = e.usuario_id
      WHERE NOT u.banido GROUP BY u.id HAVING sum(e.valor) > 0 ORDER BY valor DESC, u.id LIMIT $1`, [lim]);
  return rows.map((r, i) => ({ posicao: i + 1, apelido: r.apelido, avatar_gato: r.avatar_gato, avatar_url: r.avatar_url, valor: Number(r.valor), patente: comPatenteFixa(pats, Number(r.valor), r.patente_fixa).atual?.nome, moderador: r.papel === 'moderador' }));
}

export { RARIDADES, indisponivel, criarRazao, carregarRegras, travarUsuario };
