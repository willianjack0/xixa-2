// Memepédia no MCP:
// 1. obter_memepedia (ler): campos publicados, pendentes com id, campos que faltam, meme inexistente
// 2. escrever_memepedia (escrever): entra pendente e não aparece no site; publicar=true exige o escopo e sai em GET /api/memepedia; validações; limite de pendentes
// 3. moderar_memepedia (publicar): aprova (passa a aparecer), recusa, sem mudança, escopo, edição inexistente; auditoria com via=mcp
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';

const skip = semBanco();
let db, s;
const como = (apelido) => ({ headers: { 'X-Test-User': apelido } });
const q = async (sql, v = []) => (await db.pool.query(sql, v)).rows;
const authHeader = (chave) => ({ Authorization: 'Bearer ' + chave });
const MEME = 'havaianas-de-pau';
let CHAVE_LER = '', CHAVE_ESCREVER = '', CHAVE_PUBLICAR = '';

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, {
    autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test_mempedia' }),
    adminToken: 'segredo',
    auth: { origemSite: 'https://naosalvo.teste' }
  });
  await s.get('/api/eu', como('adminMemp'));
  await q("UPDATE usuarios SET papel = 'admin' WHERE lower(apelido) = 'adminmemp'");
  const nova = async (nome, escopos) => (await s.post('/api/admin/mcp/chaves', { nome, escopos }, como('adminMemp'))).json.chave;
  CHAVE_LER = await nova('M-Ler', ['ler']);
  CHAVE_ESCREVER = await nova('M-Esc', ['ler', 'escrever']);
  CHAVE_PUBLICAR = await nova('M-Pub', ['ler', 'escrever', 'publicar']);
});

after(async () => {
  if (skip) return;
  if (s) await s.fechar();
  await db.fechar();
});

async function chamar(chave, name, args = {}) {
  const r = await s.post('/mcp',
    { jsonrpc: '2.0', id: 'r-' + Math.random().toString(36).slice(2, 8), method: 'tools/call', params: { name, arguments: args } },
    { headers: authHeader(chave) });
  const res = r.json.result;
  return { erro: res?.isError ?? true, texto: res?.content?.[0]?.text, dados: res && !res.isError ? JSON.parse(res.content[0].text) : null };
}

const TEXTO = 'Texto de teste da Memepédia escrito pelo MCP com mais de dez caracteres.';

test('escrever_memepedia: entra pendente, não aparece no site e obter_memepedia mostra na fila', { skip }, async () => {
  const w = await chamar(CHAVE_ESCREVER, 'escrever_memepedia', { id: MEME, campo: 'origem', texto: TEXTO, fonte: 'https://exemplo.com/fonte' });
  assert.equal(w.erro, false, w.texto);
  assert.equal(w.dados.status, 'pendente');
  assert.equal(w.dados.publicado, false);

  const site = await s.get('/api/memepedia?id=' + MEME);
  assert.equal(site.json[MEME]?.origem, undefined, 'pendente não aparece no site');

  const o = await chamar(CHAVE_LER, 'obter_memepedia', { id: MEME });
  assert.equal(o.erro, false, o.texto);
  assert.equal(o.dados.meme.id, MEME);
  const pend = o.dados.pendentes.find((p) => p.id === w.dados.edicao_id);
  assert.ok(pend, 'na fila');
  assert.equal(pend.texto, TEXTO);
  assert.equal(pend.fonte, 'https://exemplo.com/fonte');
  assert.ok(o.dados.faltando.includes('origem'));
  assert.equal(pend.autor, 'adminMemp');
});

test('moderar_memepedia: aprovar publica, recusar não, repetir não muda, escopo e inexistente', { skip }, async () => {
  const w = await chamar(CHAVE_ESCREVER, 'escrever_memepedia', { id: MEME, campo: 'porque', texto: TEXTO });
  const id = w.dados.edicao_id;

  const semEscopo = await chamar(CHAVE_ESCREVER, 'moderar_memepedia', { edicao_id: id, status: 'aprovado' });
  assert.equal(semEscopo.erro, true);
  assert.match(semEscopo.texto, /escopo publicar/);

  const ok = await chamar(CHAVE_PUBLICAR, 'moderar_memepedia', { edicao_id: id, status: 'aprovado' });
  assert.equal(ok.erro, false, ok.texto);
  assert.equal(ok.dados.status, 'aprovado');
  const site = await s.get('/api/memepedia?id=' + MEME);
  assert.equal(site.json[MEME].porque.texto, TEXTO);

  const igual = await chamar(CHAVE_PUBLICAR, 'moderar_memepedia', { edicao_id: id, status: 'aprovado' });
  assert.equal(igual.dados.sem_mudanca, true);

  const w2 = await chamar(CHAVE_ESCREVER, 'escrever_memepedia', { id: MEME, campo: 'hoje', texto: TEXTO });
  await chamar(CHAVE_PUBLICAR, 'moderar_memepedia', { edicao_id: w2.dados.edicao_id, status: 'recusado' });
  const site2 = await s.get('/api/memepedia?id=' + MEME);
  assert.equal(site2.json[MEME].hoje, undefined, 'recusado não aparece');

  const nao = await chamar(CHAVE_PUBLICAR, 'moderar_memepedia', { edicao_id: 999999, status: 'aprovado' });
  assert.equal(nao.erro, true);
  assert.match(nao.texto, /não encontrada/);
  const ruim = await chamar(CHAVE_PUBLICAR, 'moderar_memepedia', { edicao_id: id, status: 'x' });
  assert.equal(ruim.erro, true);

  const [log] = await q("SELECT detalhe FROM log_auditoria WHERE acao = 'memepedia.moderar' ORDER BY id DESC LIMIT 1");
  assert.equal(log.detalhe.via, 'mcp');
  assert.equal(log.detalhe.para, 'recusado');
});

test('escrever_memepedia publicar=true: exige o escopo publicar e já sai no site, substituindo o campo', { skip }, async () => {
  const sem = await chamar(CHAVE_ESCREVER, 'escrever_memepedia', { id: MEME, campo: 'curiosidades', texto: TEXTO, publicar: true });
  assert.equal(sem.erro, true);
  assert.match(sem.texto, /escopo publicar/);

  const a = await chamar(CHAVE_PUBLICAR, 'escrever_memepedia', { id: MEME, campo: 'curiosidades', texto: TEXTO + ' A', publicar: true });
  assert.equal(a.erro, false, a.texto);
  assert.equal(a.dados.status, 'aprovado');
  await new Promise((r) => setTimeout(r, 15));
  await chamar(CHAVE_PUBLICAR, 'escrever_memepedia', { id: MEME, campo: 'curiosidades', texto: TEXTO + ' B', publicar: true });
  const site = await s.get('/api/memepedia?id=' + MEME);
  assert.equal(site.json[MEME].curiosidades.texto, TEXTO + ' B', 'o último aprovado vale');

  const [log] = await q("SELECT detalhe FROM log_auditoria WHERE acao = 'memepedia.direto' ORDER BY id DESC LIMIT 1");
  assert.equal(log.detalhe.via, 'mcp');
});

test('escrever_memepedia: validações e limite de pendentes', { skip }, async () => {
  const falha = async (args, re) => {
    const r = await chamar(CHAVE_ESCREVER, 'escrever_memepedia', args);
    assert.equal(r.erro, true, JSON.stringify(args));
    assert.match(r.texto, re, JSON.stringify(args));
  };
  await falha({ id: 'Meme Ruim', campo: 'origem', texto: TEXTO }, /"id"/);
  await falha({ id: MEME, campo: 'abc', texto: TEXTO }, /"campo"/);
  await falha({ id: MEME, campo: 'origem', texto: 'curto' }, /10 caracteres/);
  await falha({ id: MEME, campo: 'origem', texto: 'x'.repeat(2001) }, /2000/);
  await falha({ id: MEME, campo: 'origem', texto: TEXTO, fonte: 'javascript:alert(1)' }, /"fonte"/);
  await falha({ id: MEME, campo: 'origem', texto: TEXTO, publicar: 'sim' }, /booleano/);
  await falha({ id: MEME, campo: 'origem', texto: TEXTO, extra: 1 }, /campo desconhecido/);
  await falha({ id: 'meme-que-nao-existe', campo: 'origem', texto: TEXTO }, /não encontrado/);

  for (let i = 0; i < 2; i++) assert.equal((await chamar(CHAVE_ESCREVER, 'escrever_memepedia', { id: MEME, campo: 'rede', texto: TEXTO + i })).erro, false);
  const antes = (await q("SELECT count(*)::int AS n FROM memepedia_edicoes WHERE meme_id = $1 AND campo = 'rede' AND status = 'pendente'", [MEME]))[0].n;
  for (let i = antes; i < 3; i++) await chamar(CHAVE_ESCREVER, 'escrever_memepedia', { id: MEME, campo: 'rede', texto: TEXTO + 'z' + i });
  await falha({ id: MEME, campo: 'rede', texto: TEXTO + 'excedente' }, /pendentes/);
});

test('obter_memepedia: meme inexistente e chave sem escopo ler não existe (ler é o mínimo)', { skip }, async () => {
  const r = await chamar(CHAVE_LER, 'obter_memepedia', { id: 'meme-fantasma' });
  assert.equal(r.erro, true);
  assert.match(r.texto, /não encontrado/);
  const escrever = await chamar(CHAVE_LER, 'escrever_memepedia', { id: MEME, campo: 'origem', texto: TEXTO });
  assert.equal(escrever.erro, true);
  assert.match(escrever.texto, /escopo escrever/);
});
