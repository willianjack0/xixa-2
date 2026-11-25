// Carga do acervo: lê o data.js do protótipo e preenche memes, midias, eras, categorias, colecoes, cartas,
// patentes, pacotes_tipo e regras_economia. Idempotente (upsert): pode rodar de novo sem duplicar.
//
// Uso (da raiz do repositório, com as migrações já aplicadas):
//   DB_HOST=... DB_NAME=naosalvo_dev DB_USER=naosalvo DB_PASSWORD=... node api/seed/acervo.js
//   (ou DB_PASSWORD_FILE=/caminho/do/secret)
// Opção: --data=caminho/do/data.js (padrão: ../../data.js)
// O banco é a fonte da verdade do acervo (editado pelo admin): se `memes` já tem linhas, o seed NÃO sobrescreve categorias, eras,
// memes, mídias, coleções e cartas. Para recarregar tudo do data.js (apaga as edições do admin nesses itens): --forcar.
// Patentes, pacotes e regras seguem a regra de sempre (patentes e pacotes são atualizados; regras só criadas).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { criarPoolDoAmbiente, migrar } from '../migrate.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const arg = process.argv.find((a) => a.startsWith('--data='));
const ARQ_DATA = arg ? resolve(arg.slice(7)) : resolve(aqui, '../../data.js');

// ---- fonte: data.js (script de navegador com const MEMES / YEAR_INFO / COLLECTIONS) ----
function lerDataJs(arquivo) {
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(arquivo, 'utf8') + '\n;this.MEMES=MEMES;this.YEAR_INFO=YEAR_INFO;this.COLLECTIONS=COLLECTIONS;', ctx, { filename: arquivo });
  const { MEMES, YEAR_INFO, COLLECTIONS } = ctx;
  if (!Array.isArray(MEMES) || !Array.isArray(COLLECTIONS) || !YEAR_INFO) throw new Error('data.js não tem MEMES, YEAR_INFO e COLLECTIONS');
  return { MEMES, YEAR_INFO, COLLECTIONS };
}

// ---- dados que hoje vivem em common.js / index.html / album.html (espelhados aqui; ver comentários) ----
// index.html: CAT_IC e CAT_EMO
const CATEGORIAS = [
  ['Vídeos', 'video', '🎞️'], ['TV', 'tv', '📺'], ['Música', 'music', '🎵'], ['Cultura', 'culture', '🌐'],
  ['Zoeira', 'zoeira', '🤡'], ['Fotos', 'photo', '📸'], ['Esportes', 'sports', '⚽']
];

// common.js: RANKS. Permissões acumulam: cada patente herda as da anterior (ver exigePatente na Fase 2).
const PATENTES = [
  ['discado', 'Discado', 0, '#9aa3b2', 'Navega no acervo, abre pacotes e coleciona cartas.', ['acervo.ver', 'album.usar', 'voto.dar', 'comentario.escrever']],
  ['banda_larga', 'Banda larga', 150, '#2fbf5b', 'Pode enviar vídeos para o acervo.', ['envio.criar']],
  ['colaborador', 'Colaborador', 500, '#2f86ff', 'Pode salvar o link de virais antigos que estão sem vídeo.', ['link.salvar']],
  ['moderador', 'Moderador', 1500, '#a855f7', 'Modera envios de quem tem patente menor.', ['mod.fila', 'mod.edicoes', 'mod.remocoes', 'admin.feedback', 'admin.contribuidores', 'admin.comentarios', 'admin.log']],
  ['dono', 'Dono de comunidade', 4000, '#f5b70a', 'Selo dourado no perfil e voto de minerva na moderação.', ['mod.desempate', 'admin.usuarios']],
  ['lenda', 'Lenda da internet', 10000, '#ff3b47', 'Selo vermelho de lenda. Respeito máximo.', ['admin.regras']]
];

// common.js: ODDS, DUP_VALUE, REWARD, XP_GAIN, PACK_SIZE · album.html: PACKS, GOLD_ODDS
const ODDS = { Comum: 44, Relevante: 26, Raro: 15, 'Relíquia': 9, 'Lendário': 5, 'Mítico': 1 };
const GOLD_ODDS = { Comum: 0, Relevante: 30, Raro: 38, 'Relíquia': 19, 'Lendário': 10, 'Mítico': 3 };
const PACOTES = [
  // id, nome, preço, chances, garantia, escopo, limite, ícone, gradiente, descrição
  ['diario', 'Pacote Diário', 0, ODDS, null, 'todas', null, 'pack', 'linear-gradient(160deg,#25aae3,#0b4f6e)', '1 grátis por dia em que você entra no site (acumula até 7).'],
  ['boas', 'Boas-vindas', 0, ODDS, 'Raro', 'todas', 1, 'cat', 'linear-gradient(160deg,#2a6bff,#0a1a50)', 'Só uma vez. Garante 1 carta Rara ou melhor.'],
  ['classico', 'Pacote Clássico', 150, ODDS, null, 'todas', null, 'star', 'linear-gradient(160deg,#8a1d5a,#2a0618)', '5 cartas de todas as coleções, com as chances padrão.'],
  ['colecao', 'Pacote da Coleção', 200, ODDS, null, 'colecao', null, 'collections', 'linear-gradient(160deg,#1d6e5a,#06241d)', '5 cartas só da coleção que você escolher. Bom pra fechar uma página.'],
  ['ouro', 'Pacote Ouro', 450, GOLD_ODDS, 'Relíquia', 'todas', null, 'ranking', 'linear-gradient(160deg,#c98a00,#3a2600)', 'Sem Comuns. Garante 1 Relíquia ou melhor.']
];
const PACK_SIZE = 5;
const REGRAS = [
  ['valor_repetida', { Comum: 5, Relevante: 10, Raro: 20, 'Relíquia': 40, 'Lendário': 80, 'Mítico': 150 }, 'Moedas que uma carta repetida vale, por raridade'],
  ['recompensa_moedas', { envio_aprovado: 25, link_antigo: 5, colecao_completa: 100 }, 'Moedas por ação'],
  ['xp_ganho', { visita: 10, pacote: 5, envio_aprovado: 50, link_antigo: 10, colecao_completa: 100, carta_nova: { Comum: 2, Relevante: 4, Raro: 8, 'Relíquia': 15, 'Lendário': 30, 'Mítico': 60 } }, 'XP por ação']
];

const nulo = (v) => (v === undefined || v === '' ? null : v);

export async function carregarAcervo(pool, { arquivo = ARQ_DATA, log = console.log, forcar = process.argv.includes('--forcar') } = {}) {
  const { MEMES, YEAR_INFO, COLLECTIONS } = lerDataJs(arquivo);
  const ids = new Set(MEMES.map((m) => m.id));
  if (ids.size !== MEMES.length) throw new Error('data.js tem ids de meme repetidos');
  const cartasTotal = COLLECTIONS.reduce((s, c) => s + c.cards.length, 0);
  const cats = new Set(CATEGORIAS.map((c) => c[0]));
  for (const m of MEMES) if (!cats.has(m.c)) throw new Error(`Meme ${m.id}: categoria "${m.c}" não está na lista de categorias do seed`);
  for (const c of COLLECTIONS) for (const x of c.cards) if (x.meme && !ids.has(x.meme)) throw new Error(`Carta "${x.name}" aponta para meme inexistente: ${x.meme}`);

  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const acervoJaCarregado = !forcar && +(await cli.query('SELECT count(*)::int AS n FROM memes')).rows[0].n > 0;
    if (acervoJaCarregado) log('acervo já tem memes: mantendo as edições do banco (use --forcar para recarregar do data.js)');
    if (!acervoJaCarregado) {

    for (const [i, [nome, icone, emoji]] of CATEGORIAS.entries()) {
      await cli.query(
        `INSERT INTO categorias (nome, icone, emoji, ordem) VALUES ($1,$2,$3,$4)
         ON CONFLICT (nome) DO UPDATE SET icone = EXCLUDED.icone, emoji = EXCLUDED.emoji, ordem = EXCLUDED.ordem`, [nome, icone, emoji, i]);
    }

    const rotulos = Object.keys(YEAR_INFO).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)); // chaves numéricas vêm antes no JS
    for (const [rotulo, e] of Object.entries(YEAR_INFO)) {
      const ano = parseInt(rotulo, 10);                  // "1995–1999" -> 1995, "2020+" -> 2020
      const faixa = rotulo.match(/[–-](\d{4})$/);         // "1995–1999": termina em 1999
      const fim = faixa ? Number(faixa[1]) : (rotulo.endsWith('+') || rotulo === rotulos[rotulos.length - 1]) ? null : ano;
      await cli.query(
        `INSERT INTO eras (ano, ano_fim, rotulo, lema, texto) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (ano) DO UPDATE SET ano_fim = EXCLUDED.ano_fim, rotulo = EXCLUDED.rotulo, lema = EXCLUDED.lema, texto = EXCLUDED.texto`,
        [ano, fim, e.rot || rotulo, e.lema, e.txt]);
    }

    for (const m of MEMES) {
      await cli.query(
        `INSERT INTO memes (id, titulo, ano, data, categoria, tipo, raridade, emoji, descricao, autor, duracao, youtube_id, adicionado_em, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'publicado')
         ON CONFLICT (id) DO UPDATE SET titulo = EXCLUDED.titulo, ano = EXCLUDED.ano, data = EXCLUDED.data, categoria = EXCLUDED.categoria,
           tipo = EXCLUDED.tipo, raridade = EXCLUDED.raridade, emoji = EXCLUDED.emoji, descricao = EXCLUDED.descricao, autor = EXCLUDED.autor,
           duracao = EXCLUDED.duracao, youtube_id = EXCLUDED.youtube_id, adicionado_em = EXCLUDED.adicionado_em`,
        [m.id, m.t, m.y, nulo(m.date), m.c, m.tipo === 'foto' ? 'foto' : 'video', m.r, nulo(m.e), nulo(m.d), nulo(m.by),
          Number.isFinite(m.dur) ? m.dur : null, nulo(m.yt), nulo(m.added)]);

      // mídias: recria as do meme (a fonte é o data.js); credito só vale para a imagem
      await cli.query('DELETE FROM midias WHERE meme_id = $1', [m.id]);
      if (m.img) {
        await cli.query(
          `INSERT INTO midias (meme_id, tipo, caminho, origem_url, credito_por, credito_url, ordem) VALUES ($1,'imagem',$2,$3,$4,$5,0)`,
          [m.id, m.img, nulo(m.srcImg), nulo(m.credit && m.credit.by), nulo(m.credit && m.credit.url)]);
      }
      if (m.vid) {
        await cli.query(`INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ($1,'video_arquivo',$2,1)`, [m.id, m.vid]);
      }
    }

    for (const [ci, c] of COLLECTIONS.entries()) {
      await cli.query(
        `INSERT INTO colecoes (id, nome, icone, cor, cores_fundo, sobre, ordem) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, icone = EXCLUDED.icone, cor = EXCLUDED.cor,
           cores_fundo = EXCLUDED.cores_fundo, sobre = EXCLUDED.sobre, ordem = EXCLUDED.ordem`,
        [c.id, c.n, nulo(c.ic), nulo(c.c), c.bg || [], nulo(c.about), ci]);
      for (const [i, x] of c.cards.entries()) {
        await cli.query(
          `INSERT INTO cartas (id, colecao_id, numero, nome, emoji, raridade, meme_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET colecao_id = EXCLUDED.colecao_id, numero = EXCLUDED.numero, nome = EXCLUDED.nome,
             emoji = EXCLUDED.emoji, raridade = EXCLUDED.raridade, meme_id = EXCLUDED.meme_id`,
          [`${c.id}-${i}`, c.id, i + 1, x.name, nulo(x.e), x.r, nulo(x.meme)]);
      }
    }

    }

    for (const [id, nome, xp, cor, descricao, permissoes] of PATENTES) {
      await cli.query(
        `INSERT INTO patentes (id, nome, xp_minimo, cor, descricao, permissoes) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, xp_minimo = EXCLUDED.xp_minimo, cor = EXCLUDED.cor,
           descricao = EXCLUDED.descricao, permissoes = EXCLUDED.permissoes`, [id, nome, xp, cor, descricao, permissoes]);
    }

    for (const [i, [id, nome, preco, chances, garantia, escopo, limite, icone, grad, desc]] of PACOTES.entries()) {
      await cli.query(
        `INSERT INTO pacotes_tipo (id, nome, descricao, preco, cartas, chances, garantia, escopo, limite_por_usuario, icone, gradiente, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, preco = EXCLUDED.preco, cartas = EXCLUDED.cartas,
           chances = EXCLUDED.chances, garantia = EXCLUDED.garantia, escopo = EXCLUDED.escopo, limite_por_usuario = EXCLUDED.limite_por_usuario,
           icone = EXCLUDED.icone, gradiente = EXCLUDED.gradiente, ordem = EXCLUDED.ordem`,
        [id, nome, desc, preco, PACK_SIZE, JSON.stringify(chances), garantia, escopo, limite, icone, grad, i]);
    }

    // regras de economia: só cria; se o admin já editou um valor, o seed não sobrescreve
    for (const [chave, valor, desc] of REGRAS) {
      await cli.query(
        `INSERT INTO regras_economia (chave, valor, descricao) VALUES ($1,$2,$3) ON CONFLICT (chave) DO NOTHING`,
        [chave, JSON.stringify(valor), desc]);
    }

    // comentários antigos podem citar memes que só agora existem: valida a FK deixada NOT VALID na migração 005
    // (se houver comentário órfão, não derruba o seed: avisa e deixa a FK só para linhas novas)
    await cli.query('SAVEPOINT validar_fk');
    try {
      await cli.query('ALTER TABLE comentarios VALIDATE CONSTRAINT comentarios_meme_fk');
    } catch (e) {
      await cli.query('ROLLBACK TO SAVEPOINT validar_fk');
      const { rows } = await cli.query('SELECT count(*)::int AS n FROM comentarios c WHERE NOT EXISTS (SELECT 1 FROM memes m WHERE m.id = c.meme_id)');
      log(`AVISO: ${rows[0].n} comentário(s) apontam para meme que não existe no acervo; FK segue sem validar (${e.message})`);
    }

    const conta = async (t) => +(await cli.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
    const total = { memes: await conta('memes'), cartas: await conta('cartas') };
    if (!acervoJaCarregado && (total.memes < MEMES.length || total.cartas < cartasTotal)) throw new Error(`Contagem não bate: ${JSON.stringify(total)}`);
    await cli.query('COMMIT');
    log(`seed ok: ${total.memes} memes, ${total.cartas} cartas, ${COLLECTIONS.length} coleções, ${Object.keys(YEAR_INFO).length} eras, ${CATEGORIAS.length} categorias, ${PATENTES.length} patentes, ${PACOTES.length} tipos de pacote`);
    return total;
  } catch (e) {
    await cli.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cli.release();
  }
}

// execução direta
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = criarPoolDoAmbiente();
  try {
    await migrar(pool); // garante o esquema antes de carregar
    await carregarAcervo(pool);
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { await pool.end(); }
}
