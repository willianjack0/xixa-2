// Ferramentas de escrita do MCP: criar_meme, editar_meme, publicar_meme, criar_carta.
// Validações com esquemas de api/lib/acervo-validacao.js e auditoria com via='mcp'.
import { auditar } from '../lib/auditoria.js';
import {
  ID_MEME, ID_CARTA, ESQUEMA_MEME, OBRIGATORIOS_MEME, ESQUEMA_CARTA,
  lerCampos, diff, corta, ehoDia
} from '../lib/acervo-validacao.js';
import { conferir_duplicado, ErroArgumento, validarChavesConhecidas } from './ferramentas.js';

const COLUNAS_MEME = 'id, titulo, ano, data, categoria, tipo, raridade, emoji, descricao, autor, duracao, youtube_id, adicionado_em, status';

async function emTransacao(pool, fn) {
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const r = await fn(cli);
    await cli.query('COMMIT');
    return r;
  } catch (e) {
    await cli.query('ROLLBACK').catch(() => {});
    throw e;
  }
  finally {
    cli.release();
  }
}

export async function criar_meme(pool, args = {}, ctx = {}) {
  validarChavesConhecidas(args, [
    'id', 'titulo', 'ano', 'categoria', 'raridade',
    'tipo', 'data', 'emoji', 'descricao', 'autor', 'duracao', 'youtube_id',
    'publicar', 'forcar'
  ]);

  if (!args.id || typeof args.id !== 'string' || !ID_MEME.test(args.id)) {
    throw new ErroArgumento('campo "id" obrigatório: slug a-z, 0-9 e hífen, até 80 caracteres');
  }

  const { id, publicar = false, forcar = false, ...resto } = args;

  if (typeof publicar !== 'boolean') {
    throw new ErroArgumento('campo "publicar" deve ser booleano');
  }
  if (typeof forcar !== 'boolean') {
    throw new ErroArgumento('campo "forcar" deve ser booleano');
  }

  const escopos = ctx.mcp?.escopos || [];
  if (publicar && !escopos.includes('publicar')) {
    throw new ErroArgumento('falta o escopo publicar');
  }

  const lido = lerCampos(resto, ESQUEMA_MEME, OBRIGATORIOS_MEME);
  if (Object.keys(lido.erros).length > 0) {
    const primeiroCampo = Object.keys(lido.erros)[0];
    throw new ErroArgumento(`campo "${primeiroCampo}" inválido: ${lido.erros[primeiroCampo]}`);
  }

  // Checagem anti-duplicação
  const tituloParaChecar = lido.dados.titulo;
  const youtubeIdParaChecar = lido.dados.youtube_id;
  const urlParaChecar = youtubeIdParaChecar ? `https://www.youtube.com/watch?v=${youtubeIdParaChecar}` : null;

  const resultadoDup = await conferir_duplicado(pool, {
    url: urlParaChecar,
    titulo: tituloParaChecar
  });

  if (resultadoDup.duplicado && !forcar) {
    throw new ErroArgumento(`meme duplicado detectado: ${JSON.stringify(resultadoDup.motivos)}`);
  }

  // Id já existente
  const { rows: [jaExisteId] } = await pool.query('SELECT id FROM memes WHERE id = $1', [id]);
  if (jaExisteId) {
    throw new ErroArgumento('já existe um meme com esse id');
  }

  const status = publicar ? 'publicado' : 'oculto';
  const d = { tipo: 'video', ...lido.dados, status };

  try {
    const novo = await emTransacao(pool, async (cli) => {
      const { rows: [m] } = await cli.query(
        `INSERT INTO memes (id, titulo, ano, data, categoria, tipo, raridade, emoji, descricao, autor, duracao, youtube_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${COLUNAS_MEME}`,
        [
          id, d.titulo, d.ano, d.data ?? null, d.categoria, d.tipo, d.raridade,
          d.emoji ?? null, d.descricao ?? null, d.autor ?? null, d.duracao ?? null,
          d.youtube_id ?? null, d.status
        ]
      );
      return m;
    });

    await auditar({ ...ctx, pool }, 'meme.criar', 'memes:' + id, {
      titulo: corta(d.titulo),
      publicado: publicar,
      forcado: forcar
    });

    return {
      ok: true,
      meme: { id: novo.id, titulo: novo.titulo, status: novo.status },
      aviso: publicar ? null : 'criado como rascunho; um admin publica no painel'
    };
  } catch (e) {
    if (e.code === '23503') {
      throw new ErroArgumento('categoria inexistente no acervo');
    }
    if (e.code === '23505') {
      throw new ErroArgumento('já existe um meme com esse id');
    }
    throw e;
  }
}

export async function editar_meme(pool, args = {}, ctx = {}) {
  validarChavesConhecidas(args, [
    'id', 'titulo', 'ano', 'data', 'categoria', 'raridade',
    'tipo', 'emoji', 'descricao', 'autor', 'duracao', 'youtube_id',
    'status', 'midias'
  ]);

  if ('status' in args) {
    throw new ErroArgumento('use publicar_meme para publicar; remover só pelo painel');
  }
  if ('midias' in args) {
    throw new ErroArgumento('edição de mídias não permitida pelo MCP');
  }

  if (!args.id || typeof args.id !== 'string' || !ID_MEME.test(args.id)) {
    throw new ErroArgumento('campo "id" obrigatório: slug a-z, 0-9 e hífen, até 80 caracteres');
  }

  const { id, ...resto } = args;
  const lido = lerCampos(resto, ESQUEMA_MEME);
  if (Object.keys(lido.erros).length > 0) {
    const primeiroCampo = Object.keys(lido.erros)[0];
    throw new ErroArgumento(`campo "${primeiroCampo}" inválido: ${lido.erros[primeiroCampo]}`);
  }

  try {
    const resultado = await emTransacao(pool, async (cli) => {
      const { rows: [antes] } = await cli.query('SELECT * FROM memes WHERE id = $1 FOR UPDATE', [id]);
      if (!antes) return null;
      if (antes.status === 'removido') {
        throw new ErroArgumento('não é possível editar meme com status removido');
      }

      antes.data = ehoDia(antes.data);
      const campos = Object.keys(lido.dados);
      let novo = antes;

      if (campos.length) {
        const sets = campos.map((c, i) => `${c} = $${i + 2}`).join(', ');
        ({ rows: [novo] } = await cli.query(
          `UPDATE memes SET ${sets} WHERE id = $1 RETURNING ${COLUNAS_MEME}`,
          [id, ...campos.map((c) => lido.dados[c])]
        ));
      }
      return { antes, novo };
    });

    if (!resultado) {
      throw new ErroArgumento('meme não encontrado');
    }

    const mudou = diff(resultado.antes, lido.dados);
    if (Object.keys(mudou).length) {
      await auditar({ ...ctx, pool }, 'meme.editar', 'memes:' + id, { campos: mudou });
    }

    return {
      ok: true,
      meme: { id: resultado.novo.id, titulo: resultado.novo.titulo, status: resultado.novo.status }
    };
  } catch (e) {
    if (e.code === '23503') {
      throw new ErroArgumento('categoria inexistente no acervo');
    }
    throw e;
  }
}

export async function publicar_meme(pool, args = {}, ctx = {}) {
  validarChavesConhecidas(args, ['id']);

  if (!args.id || typeof args.id !== 'string' || !ID_MEME.test(args.id)) {
    throw new ErroArgumento('campo "id" obrigatório: slug a-z, 0-9 e hífen, até 80 caracteres');
  }

  const { id } = args;

  const resultado = await emTransacao(pool, async (cli) => {
    const { rows: [antes] } = await cli.query('SELECT id, titulo, status FROM memes WHERE id = $1 FOR UPDATE', [id]);
    if (!antes) return null;

    if (antes.status === 'removido') {
      throw new ErroArgumento('meme removido só o painel reativa');
    }

    if (antes.status === 'publicado') {
      return { antes, novo: antes, sem_mudanca: true };
    }

    const { rows: [novo] } = await cli.query(
      `UPDATE memes SET status = 'publicado' WHERE id = $1 RETURNING id, titulo, status`,
      [id]
    );
    return { antes, novo, sem_mudanca: false };
  });

  if (!resultado) {
    throw new ErroArgumento('meme não encontrado');
  }

  if (resultado.sem_mudanca) {
    return {
      ok: true,
      sem_mudanca: true,
      meme: { id: resultado.novo.id, titulo: resultado.novo.titulo, status: resultado.novo.status }
    };
  }

  await auditar({ ...ctx, pool }, 'meme.publicar', 'memes:' + id, { titulo: corta(resultado.novo.titulo) });

  return {
    ok: true,
    meme: { id: resultado.novo.id, titulo: resultado.novo.titulo, status: resultado.novo.status }
  };
}

export async function ocultar_meme(pool, args = {}, ctx = {}) {
  validarChavesConhecidas(args, ['id']);

  if (!args.id || typeof args.id !== 'string' || !ID_MEME.test(args.id)) {
    throw new ErroArgumento('campo "id" obrigatório: slug a-z, 0-9 e hífen, até 80 caracteres');
  }

  const { id } = args;

  const resultado = await emTransacao(pool, async (cli) => {
    const { rows: [antes] } = await cli.query('SELECT id, titulo, status FROM memes WHERE id = $1 FOR UPDATE', [id]);
    if (!antes) return null;

    if (antes.status === 'removido') {
      throw new ErroArgumento('meme removido só o painel reativa');
    }

    if (antes.status === 'oculto') {
      return { antes, novo: antes, sem_mudanca: true };
    }

    const { rows: [novo] } = await cli.query(
      `UPDATE memes SET status = 'oculto' WHERE id = $1 RETURNING id, titulo, status`,
      [id]
    );
    return { antes, novo, sem_mudanca: false };
  });

  if (!resultado) {
    throw new ErroArgumento('meme não encontrado');
  }

  if (resultado.sem_mudanca) {
    return {
      ok: true,
      sem_mudanca: true,
      meme: { id: resultado.novo.id, titulo: resultado.novo.titulo, status: resultado.novo.status }
    };
  }

  await auditar({ ...ctx, pool }, 'meme.editar', 'memes:' + id, {
    campos: { status: { de: resultado.antes.status, para: resultado.novo.status } }
  });

  return {
    ok: true,
    meme: { id: resultado.novo.id, titulo: resultado.novo.titulo, status: resultado.novo.status }
  };
}

export async function criar_carta(pool, args = {}, ctx = {}) {
  validarChavesConhecidas(args, ['colecao_id', 'nome', 'raridade', 'emoji', 'meme_id']);

  const { colecao_id, ...resto } = args;
  if (!colecao_id || typeof colecao_id !== 'string' || !ID_CARTA.test(colecao_id)) {
    throw new ErroArgumento('campo "colecao_id" obrigatório');
  }

  const lido = lerCampos(resto, ESQUEMA_CARTA, ['nome', 'raridade']);
  if (Object.keys(lido.erros).length > 0) {
    const primeiroCampo = Object.keys(lido.erros)[0];
    throw new ErroArgumento(`campo "${primeiroCampo}" inválido: ${lido.erros[primeiroCampo]}`);
  }

  const d = lido.dados;

  try {
    const nova = await emTransacao(pool, async (cli) => {
      const { rows: [c] } = await cli.query('SELECT id FROM colecoes WHERE id = $1 FOR UPDATE', [colecao_id]);
      if (!c) {
        throw new ErroArgumento('coleção não encontrada');
      }

      if (d.meme_id) {
        const { rows: [m] } = await cli.query('SELECT id FROM memes WHERE id = $1', [d.meme_id]);
        if (!m) {
          throw new ErroArgumento('meme_id não encontrado');
        }
      }

      const { rows: [{ prox }] } = await cli.query(
        'SELECT COALESCE(max(numero), 0) + 1 AS prox FROM cartas WHERE colecao_id = $1',
        [colecao_id]
      );

      const cartaId = `${colecao_id}-${prox - 1}`;
      const { rows: [x] } = await cli.query(
        `INSERT INTO cartas (id, colecao_id, numero, nome, emoji, raridade, meme_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, colecao_id, numero, nome, emoji, raridade, meme_id`,
        [cartaId, colecao_id, prox, d.nome, d.emoji ?? null, d.raridade, d.meme_id ?? null]
      );
      return x;
    });

    await auditar({ ...ctx, pool }, 'carta.criar', 'cartas:' + nova.id, {
      nome: corta(nova.nome),
      raridade: nova.raridade
    });

    return {
      ok: true,
      carta: nova
    };
  } catch (e) {
    if (e.code === '23503') {
      throw new ErroArgumento('referência inexistente (coleção ou meme)');
    }
    if (e.code === '23505') {
      throw new ErroArgumento('já existe uma carta com esse id ou número na coleção');
    }
    throw e;
  }
}
