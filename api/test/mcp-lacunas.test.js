// Testes das 3 ferramentas que fecham lacunas do MCP:
// 1. obter_meme (ler): com mídias ordenadas, inexistente, removido
// 2. ocultar_meme (publicar): publicado -> oculto, já oculto sem logar, escopo insuficiente pelo /mcp, removido erro, sumiço em GET /api/memes público
// 3. remover_midia (escrever): feliz apaga linha e arquivo no S3 falso, mídia em uso por outra carta/meme NÃO apaga arquivo, mídia de outro meme recusada, meme removido recusado, log
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { obter_meme } from '../mcp/ferramentas.js';
import { ocultar_meme } from '../mcp/escrita.js';
import { fazerRemoverMidia } from '../mcp/midias.js';

const skip = semBanco();
let db, s;
const como = (apelido) => ({ headers: { 'X-Test-User': apelido } });
const q = async (sql, v = []) => (await db.pool.query(sql, v)).rows;
const authHeader = (chave) => ({ Authorization: 'Bearer ' + chave });

function s3Falso() {
  const removes = [];
  return {
    removes,
    async remove(chave) { removes.push(chave); }
  };
}

let ADMIN_ID = 0;
let CHAVE_LER = '';
let CHAVE_ESCREVER = '';
let CHAVE_PUBLICAR = '';
let CHAVE_PUB_ID = 0;
let CHAVE_ESC_ID = 0;

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, {
    autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test_farol' }),
    adminToken: 'segredo',
    auth: { origemSite: 'https://naosalvo.teste' }
  });

  // Criar admin
  await s.get('/api/eu', como('adminFarol'));
  const [{ id }] = await q("SELECT id FROM usuarios WHERE lower(apelido) = 'adminfarol'");
  ADMIN_ID = Number(id);
  await q("UPDATE usuarios SET papel = 'admin' WHERE id = $1", [ADMIN_ID]);

  // Chaves com escopos diferentes
  const rLer = await s.post('/api/admin/mcp/chaves', { nome: 'K-Ler', escopos: ['ler'] }, como('adminFarol'));
  CHAVE_LER = rLer.json.chave;

  const rEsc = await s.post('/api/admin/mcp/chaves', { nome: 'K-Esc', escopos: ['ler', 'escrever'] }, como('adminFarol'));
  CHAVE_ESCREVER = rEsc.json.chave;
  CHAVE_ESC_ID = rEsc.json.item.id;

  const rPub = await s.post('/api/admin/mcp/chaves', { nome: 'K-Pub', escopos: ['ler', 'escrever', 'publicar'] }, como('adminFarol'));
  CHAVE_PUBLICAR = rPub.json.chave;
  CHAVE_PUB_ID = rPub.json.item.id;
});

after(async () => {
  if (skip) return;
  if (s) await s.fechar();
  await db.fechar();
});

async function callMcp(chave, name, args = {}) {
  const r = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 'req-' + Math.random().toString(36).slice(2, 8),
      method: 'tools/call',
      params: { name, arguments: args }
    },
    { headers: authHeader(chave) }
  );
  return r;
}

// ===================== 1. obter_meme =====================
test('obter_meme: devolve meme completo com mídias ordenadas (por ordem, id)', { skip }, async () => {
  // Meme do seed havaianas-de-pau tem mídias
  const r = await callMcp(CHAVE_LER, 'obter_meme', { id: 'havaianas-de-pau' });
  assert.equal(r.status, 200);
  assert.equal(r.json.result.isError, false);
  const m = JSON.parse(r.json.result.content[0].text);
  assert.equal(m.id, 'havaianas-de-pau');
  assert.equal(m.titulo, 'Havaianas de Pau');
  assert.equal(m.ano, 2004);
  assert.equal(m.categoria, 'Vídeos');
  assert.equal(m.status, 'publicado');
  assert.ok('descricao' in m);
  assert.ok('autor' in m);
  assert.ok('duracao' in m);
  assert.ok('data' in m);
  assert.ok(Array.isArray(m.midias));
  assert.ok(m.midias.length >= 1);
  assert.equal(m.midias[0].url_publica, '/' + m.midias[0].caminho);

  // Inserir outro meme com 2 mídias em ordens específicas para conferir ordenação
  await q("INSERT INTO memes (id, titulo, ano, categoria, raridade, status) VALUES ('meme-ordem', 'Meme Ordem', 2020, 'Vídeos', 'Comum', 'publicado')");
  await q("INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ('meme-ordem', 'imagem', 'midias/b.webp', 2), ('meme-ordem', 'imagem', 'midias/a.webp', 1)");

  const rOrdem = await callMcp(CHAVE_LER, 'obter_meme', { id: 'meme-ordem' });
  const mOrdem = JSON.parse(rOrdem.json.result.content[0].text);
  assert.equal(mOrdem.midias.length, 2);
  assert.equal(mOrdem.midias[0].caminho, 'midias/a.webp');
  assert.equal(mOrdem.midias[0].ordem, 1);
  assert.equal(mOrdem.midias[1].caminho, 'midias/b.webp');
  assert.equal(mOrdem.midias[1].ordem, 2);
});

test('obter_meme: inexistente vira ErroArgumento / isError', { skip }, async () => {
  const r = await callMcp(CHAVE_LER, 'obter_meme', { id: 'meme-fantasma' });
  assert.equal(r.status, 200);
  assert.equal(r.json.result.isError, true);
  assert.match(r.json.result.content[0].text, /meme não encontrado/);

  // Chamada direta
  await assert.rejects(
    () => obter_meme(db.pool, { id: 'meme-fantasma' }),
    /meme não encontrado/
  );
});

test('obter_meme: meme removido é retornado com status removido', { skip }, async () => {
  await q("INSERT INTO memes (id, titulo, ano, categoria, raridade, status) VALUES ('meme-rem-teste', 'Meme Removido', 2021, 'Vídeos', 'Comum', 'removido')");
  const r = await callMcp(CHAVE_LER, 'obter_meme', { id: 'meme-rem-teste' });
  assert.equal(r.status, 200);
  assert.equal(r.json.result.isError, false);
  const m = JSON.parse(r.json.result.content[0].text);
  assert.equal(m.id, 'meme-rem-teste');
  assert.equal(m.status, 'removido');
});

// ===================== 2. ocultar_meme =====================
test('ocultar_meme: publicado -> oculto com log, já oculto sem log, escopo insuficiente, removido erro e some da API pública', { skip }, async () => {
  await q("INSERT INTO memes (id, titulo, ano, categoria, raridade, status) VALUES ('meme-ocultar', 'Meme Para Ocultar', 2022, 'Vídeos', 'Comum', 'publicado')");

  // Confere que aparece na API pública inicialmente
  const pubAntes = await s.get('/api/memes/meme-ocultar');
  assert.equal(pubAntes.status, 200);

  // Sem escopo publicar dá isError pelo /mcp
  const rSemEscopo = await callMcp(CHAVE_ESCREVER, 'ocultar_meme', { id: 'meme-ocultar' });
  assert.equal(rSemEscopo.status, 200);
  assert.equal(rSemEscopo.json.result.isError, true);
  assert.match(rSemEscopo.json.result.content[0].text, /falta o escopo publicar/);

  // Com escopo publicar: sucesso
  const rOk = await callMcp(CHAVE_PUBLICAR, 'ocultar_meme', { id: 'meme-ocultar' });
  assert.equal(rOk.status, 200);
  assert.equal(rOk.json.result.isError, false);
  const dOk = JSON.parse(rOk.json.result.content[0].text);
  assert.equal(dOk.ok, true);
  assert.equal(dOk.meme.status, 'oculto');

  // Some da API pública
  const pubDepois = await s.get('/api/memes/meme-ocultar');
  assert.equal(pubDepois.status, 404);

  // Confere log de auditoria
  const [log] = await q("SELECT usuario_id, acao, alvo, detalhe FROM log_auditoria WHERE alvo = 'memes:meme-ocultar' AND acao = 'meme.editar' ORDER BY id DESC LIMIT 1");
  assert.equal(Number(log.usuario_id), ADMIN_ID);
  assert.equal(log.detalhe.via, 'mcp');
  assert.equal(Number(log.detalhe.chave_id), CHAVE_PUB_ID);
  assert.deepEqual(log.detalhe.campos, { status: { de: 'publicado', para: 'oculto' } });

  // Já oculto: { ok: true, sem_mudanca: true } e NÃO loga novamente
  const totalLogsAntes = (await q("SELECT count(*)::int AS n FROM log_auditoria WHERE alvo = 'memes:meme-ocultar'"))[0].n;
  const rSemMudanca = await callMcp(CHAVE_PUBLICAR, 'ocultar_meme', { id: 'meme-ocultar' });
  assert.equal(rSemMudanca.status, 200);
  assert.equal(rSemMudanca.json.result.isError, false);
  const dSemMudanca = JSON.parse(rSemMudanca.json.result.content[0].text);
  assert.equal(dSemMudanca.ok, true);
  assert.equal(dSemMudanca.sem_mudanca, true);
  const totalLogsDepois = (await q("SELECT count(*)::int AS n FROM log_auditoria WHERE alvo = 'memes:meme-ocultar'"))[0].n;
  assert.equal(totalLogsDepois, totalLogsAntes);

  // Meme removido: erro
  await q("UPDATE memes SET status = 'removido' WHERE id = 'meme-ocultar'");
  const rRem = await callMcp(CHAVE_PUBLICAR, 'ocultar_meme', { id: 'meme-ocultar' });
  assert.equal(rRem.status, 200);
  assert.equal(rRem.json.result.isError, true);
  assert.match(rRem.json.result.content[0].text, /removido/);
});

// ===================== 3. remover_midia =====================
test('remover_midia: apaga linha e arquivo do S3 falso, e loga com via mcp', { skip }, async () => {
  await q("INSERT INTO memes (id, titulo, ano, categoria, raridade, status) VALUES ('meme-midia-del', 'Meme Del', 2023, 'Vídeos', 'Comum', 'publicado')");
  const [{ id: midId }] = await q("INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ('meme-midia-del', 'imagem', 'midias/del-1.webp', 0) RETURNING id");

  const s3 = s3Falso();
  const remover = fazerRemoverMidia({ s3 });

  const ctx = { pool: db.pool, mcp: { chave_id: CHAVE_ESC_ID, usuario_id: ADMIN_ID } };
  const r = await remover(db.pool, { id: 'meme-midia-del', midia_id: Number(midId) }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.removida, true);
  assert.equal(r.midia_id, Number(midId));

  // Linha no banco foi apagada
  const linhas = await q('SELECT id FROM midias WHERE id = $1', [midId]);
  assert.equal(linhas.length, 0);

  // Arquivo no S3 foi removido
  assert.deepEqual(s3.removes, ['midias/del-1.webp']);

  // Log gravado
  const [log] = await q("SELECT usuario_id, acao, alvo, detalhe FROM log_auditoria WHERE alvo = 'memes:meme-midia-del' AND acao = 'meme.midia' ORDER BY id DESC LIMIT 1");
  assert.equal(Number(log.usuario_id), ADMIN_ID);
  assert.equal(log.detalhe.via, 'mcp');
  assert.equal(Number(log.detalhe.chave_id), CHAVE_ESC_ID);
  assert.equal(log.detalhe.removida, true);
  assert.equal(log.detalhe.caminho, 'midias/del-1.webp');
});

test('remover_midia: mídia em uso por outro meme ou carta NÃO apaga arquivo do S3', { skip }, async () => {
  await q("INSERT INTO memes (id, titulo, ano, categoria, raridade, status) VALUES ('meme-uso-1', 'M1', 2020, 'Vídeos', 'Comum', 'publicado'), ('meme-uso-2', 'M2', 2020, 'Vídeos', 'Comum', 'publicado')");
  const [{ id: mid1 }] = await q("INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ('meme-uso-1', 'imagem', 'midias/compartilhada.webp', 0) RETURNING id");
  await q("INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ('meme-uso-2', 'imagem', 'midias/compartilhada.webp', 0)");

  const s3 = s3Falso();
  const remover = fazerRemoverMidia({ s3 });
  const ctx = { pool: db.pool, mcp: { chave_id: CHAVE_ESC_ID, usuario_id: ADMIN_ID } };

  await remover(db.pool, { id: 'meme-uso-1', midia_id: Number(mid1) }, ctx);
  // Não apagou do S3 porque meme-uso-2 ainda usa
  assert.equal(s3.removes.length, 0);

  // Agora testa caso compartilhado com carta
  const [{ id: midCarta }] = await q("INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ('meme-uso-1', 'imagem', 'midias/carta-compartilhada.webp', 0) RETURNING id");
  const [{ id: colId }] = await q('SELECT id FROM colecoes LIMIT 1');
  await q("INSERT INTO cartas (id, colecao_id, numero, nome, raridade, imagem) VALUES ('carta-teste-uso', $1, 999, 'Carta Uso', 'Comum', 'midias/carta-compartilhada.webp')", [colId]);

  await remover(db.pool, { id: 'meme-uso-1', midia_id: Number(midCarta) }, ctx);
  // Não apagou do S3 porque a carta ainda usa
  assert.equal(s3.removes.length, 0);
});

test('remover_midia: mídia de outro meme recusada, meme removido recusado, validação', { skip }, async () => {
  await q("INSERT INTO memes (id, titulo, ano, categoria, raridade, status) VALUES ('meme-a', 'A', 2020, 'Vídeos', 'Comum', 'publicado'), ('meme-b', 'B', 2020, 'Vídeos', 'Comum', 'publicado'), ('meme-rem-mid', 'R', 2020, 'Vídeos', 'Comum', 'removido')");
  const [{ id: midA }] = await q("INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ('meme-a', 'imagem', 'midias/a.webp', 0) RETURNING id");
  const [{ id: midRem }] = await q("INSERT INTO midias (meme_id, tipo, caminho, ordem) VALUES ('meme-rem-mid', 'imagem', 'midias/rem.webp', 0) RETURNING id");

  // Tentativa de remover midia de meme-a passando id de meme-b
  const rOutro = await callMcp(CHAVE_ESCREVER, 'remover_midia', { id: 'meme-b', midia_id: Number(midA) });
  assert.equal(rOutro.status, 200);
  assert.equal(rOutro.json.result.isError, true);
  assert.match(rOutro.json.result.content[0].text, /mídia não encontrada para este meme/);

  // Tentativa de remover mídia de meme removido
  const rRem = await callMcp(CHAVE_ESCREVER, 'remover_midia', { id: 'meme-rem-mid', midia_id: Number(midRem) });
  assert.equal(rRem.status, 200);
  assert.equal(rRem.json.result.isError, true);
  assert.match(rRem.json.result.content[0].text, /removido/);

  // Validação: midia_id não inteiro
  const rVal = await callMcp(CHAVE_ESCREVER, 'remover_midia', { id: 'meme-a', midia_id: 'um' });
  assert.equal(rVal.status, 200);
  assert.equal(rVal.json.result.isError, true);
  assert.match(rVal.json.result.content[0].text, /midia_id/);
});
