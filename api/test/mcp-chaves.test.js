// Chaves de API do MCP: formato, hash, regras de criação/revogação (só sessão de admin), verificação e llms.txt.
// Banco real descartável (pulado sem TEST_DB_NAME). Login = auth-stub (X-Test-User); papel dado direto no banco.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { gerarChave, hashDe, chaveDoCabecalho, verificarChave, estadoDaChave } from '../mcp/chaves.js';
import { gerarLlmsTxt } from '../mcp/llms.js';
import { FERRAMENTAS } from '../mcp/registro.js';

// ---- partes puras ----
test('gerarChave: formato ns_mcp_ + 43 base64url, prefixo de 8, hash sha256; duas chaves nunca iguais', () => {
  const a = gerarChave(), b = gerarChave();
  assert.match(a.chave, /^ns_mcp_[A-Za-z0-9_-]{43}$/);
  assert.equal(a.prefixo, a.chave.slice(7, 15)); assert.equal(a.prefixo.length, 8);
  assert.equal(a.hash, hashDe(a.chave)); assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(a.chave, b.chave); assert.notEqual(a.hash, b.hash);
});

test('chaveDoCabecalho: só Bearer com o formato certo', () => {
  const k = gerarChave().chave;
  assert.equal(chaveDoCabecalho({ headers: { authorization: 'Bearer ' + k } }), k);
  assert.equal(chaveDoCabecalho({ headers: { authorization: 'bearer ' + k } }), k);
  for (const ruim of ['', 'Bearer', 'Bearer abc', 'Basic ' + k, 'Bearer ' + k + 'x', 'Bearer ns_mcp_curta', k]) assert.equal(chaveDoCabecalho({ headers: { authorization: ruim } }), null, ruim);
  assert.equal(chaveDoCabecalho({ headers: {} }), null);
});

test('estadoDaChave: ativa, expirada, revogada (revogada vence expirada)', () => {
  const agora = new Date('2026-06-01T00:00:00Z');
  assert.equal(estadoDaChave({ expira_em: '2026-07-01T00:00:00Z', revogada_em: null }, agora), 'ativa');
  assert.equal(estadoDaChave({ expira_em: '2026-05-01T00:00:00Z', revogada_em: null }, agora), 'expirada');
  assert.equal(estadoDaChave({ expira_em: '2026-05-01T00:00:00Z', revogada_em: '2026-04-01T00:00:00Z' }, agora), 'revogada');
});

test('llms.txt: sem ferramentas ativas avisa; com ferramentas lista nome, escopo e parâmetros; nunca cita ferramenta inativa', () => {
  const vazio = gerarLlmsTxt();
  assert.match(vazio, /^# Não Salvo · MCP do acervo/); assert.match(vazio, /Nenhuma ferramenta está ativa ainda/);
  for (const f of FERRAMENTAS.filter((x) => !x.ativa)) assert.ok(!vazio.includes('### ' + f.nome), 'ferramenta inativa não aparece: ' + f.nome);
  const com = gerarLlmsTxt({ base: 'https://exemplo.test', ferramentas: [{ nome: 'buscar_memes', escopo: 'ler', resumo: 'Busca.', params: { busca: { tipo: 'texto', obrigatorio: true, descricao: 'trecho' } } }] });
  assert.match(com, /### buscar_memes {2}\(escopo: ler\)/); assert.match(com, /- busca \(texto, obrigatório\): trecho/);
  assert.match(com, /https:\/\/exemplo\.test\/mcp/); assert.ok(!/Nenhuma ferramenta/.test(com));
  assert.match(com, /## Escopos da chave/); assert.match(com, /publicar:/); assert.match(com, /## Fluxo recomendado/);
});

// ---- com banco ----
const skip = semBanco();
let db, s;
const como = (apelido) => ({ headers: { 'X-Test-User': apelido } });
const q = async (sql, v = []) => (await db.pool.query(sql, v)).rows;
const T = { headers: { Authorization: 'Bearer segredo' } };

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, { autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' }), adminToken: 'segredo', auth: { origemSite: 'https://naosalvo.teste' } });
});
after(async () => { if (skip) return; await s.fechar(); await db.fechar(); });

async function pessoa(apelido, papel = 'usuario') {
  await s.get('/api/eu', como(apelido));
  const [{ id }] = await q('SELECT id FROM usuarios WHERE lower(apelido) = lower($1)', [apelido]);
  if (papel !== 'usuario') await q('UPDATE usuarios SET papel = $2 WHERE id = $1', [id, papel]);
  return Number(id);
}
const criar = (corpo, u) => s.post('/api/admin/mcp/chaves', corpo, como(u));

test('acesso: sem login 401; usuário comum e moderador 401; token de emergência 403 (não cria nem lista chave)', { skip }, async () => {
  await pessoa('admA', 'admin'); await pessoa('comum'); await pessoa('modzinho', 'moderador');
  assert.equal((await s.get('/api/admin/mcp/chaves')).status, 401);
  for (const u of ['comum', 'modzinho']) { assert.equal((await s.get('/api/admin/mcp/chaves', como(u))).status, 401, u); assert.equal((await criar({ nome: 'x' }, u)).status, 401, u); }
  assert.equal((await s.get('/api/admin/mcp/chaves', T)).status, 403);
  assert.equal((await s.post('/api/admin/mcp/chaves', { nome: 'x' }, T)).status, 403);
  assert.equal((await s.get('/api/admin/mcp/llms.txt', T)).status, 403);
  assert.equal((await s.del('/api/admin/mcp/chaves/1', T)).status, 403);
  assert.equal((await q('SELECT count(*)::int AS n FROM chaves_api'))[0].n, 0);
});

test('criar: devolve o segredo uma vez, guarda só o hash, padrão ler+escrever 90 dias, no-store e log sem segredo', { skip }, async () => {
  const r = await criar({ nome: 'Notebook do Xet' }, 'admA');
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.match(r.json.chave, /^ns_mcp_[A-Za-z0-9_-]{43}$/); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(r.json.item.escopos, ['ler', 'escrever']); assert.equal(r.json.item.prefixo, r.json.chave.slice(7, 15)); assert.equal(r.json.item.minha, true);
  const dias = (new Date(r.json.item.expira_em) - Date.now()) / 86400000; assert.ok(dias > 89 && dias < 90.01, 'validade ' + dias);
  const [linha] = await q('SELECT hash, prefixo FROM chaves_api WHERE id = $1', [r.json.item.id]);
  assert.equal(linha.hash, hashDe(r.json.chave)); assert.ok(!JSON.stringify(linha).includes(r.json.chave));
  const [l] = await q("SELECT detalhe FROM log_auditoria WHERE acao = 'mcp.chave.criar' ORDER BY id DESC LIMIT 1");
  assert.equal(l.detalhe.nome, 'Notebook do Xet'); assert.ok(!JSON.stringify(l.detalhe).includes(r.json.chave) && !JSON.stringify(l.detalhe).includes(linha.hash));
  const lista = await s.get('/api/admin/mcp/chaves', como('admA'));
  assert.equal(lista.status, 200); assert.ok(!JSON.stringify(lista.json).includes(r.json.chave) && !JSON.stringify(lista.json).includes(linha.hash), 'lista não vaza segredo nem hash');
  assert.equal(lista.json.items[0].estado, 'ativa'); assert.equal(lista.json.items[0].dono, 'admA');
});

test('criar: escopos (publicar/escrever incluem ler), validade, nome e corpo inválidos', { skip }, async () => {
  const p = await criar({ nome: 'só publicar', escopos: ['publicar'], dias: 30 }, 'admA');
  assert.equal(p.status, 201); assert.deepEqual(p.json.item.escopos, ['ler', 'publicar']);
  const t = await criar({ nome: 'tudo', escopos: ['publicar', 'escrever', 'ler', 'ler'], dias: 365 }, 'admA');
  assert.deepEqual(t.json.item.escopos, ['ler', 'escrever', 'publicar']);
  for (const [corpo, campo] of [[{ nome: '' }, 'nome'], [{ nome: 'x'.repeat(61) }, 'nome'], [{ nome: 'a', escopos: ['apagar'] }, 'escopos'], [{ nome: 'a', escopos: [] }, 'escopos'], [{ nome: 'a', escopos: 'ler' }, 'escopos'], [{ nome: 'a', dias: 7 }, 'dias'], [{ nome: 'a', dias: '90' }, 'dias']]) {
    const r = await criar(corpo, 'admA'); assert.equal(r.status, 422, JSON.stringify(corpo)); assert.ok(campo in r.json.campos, campo);
  }
  assert.equal((await s.post('/api/admin/mcp/chaves', [], como('admA'))).status, 400);
});

test('limite de 5 chaves ativas por admin; revogar libera vaga; já revogada 409; inexistente 404; log da revogação', { skip }, async () => {
  await pessoa('admB', 'admin');
  const ids = [];
  for (let i = 0; i < 5; i++) { const r = await criar({ nome: 'k' + i }, 'admB'); assert.equal(r.status, 201); ids.push(r.json.item.id); }
  assert.equal((await criar({ nome: 'sexta' }, 'admB')).status, 409);
  assert.equal((await s.del('/api/admin/mcp/chaves/' + ids[0], como('admB'))).status, 200);
  assert.equal((await criar({ nome: 'sexta' }, 'admB')).status, 201, 'vaga liberada');
  assert.equal((await s.del('/api/admin/mcp/chaves/' + ids[0], como('admB'))).status, 409);
  assert.equal((await s.del('/api/admin/mcp/chaves/999999', como('admB'))).status, 404);
  const [l] = await q("SELECT alvo, detalhe FROM log_auditoria WHERE acao = 'mcp.chave.revogar' ORDER BY id DESC LIMIT 1");
  assert.equal(l.alvo, 'chaves_api:' + ids[0]);
});

test('lista mostra as chaves de todos os admins com a flag "minha"; um admin pode revogar a chave de outro', { skip }, async () => {
  const lista = (await s.get('/api/admin/mcp/chaves', como('admA'))).json.items;
  assert.ok(lista.some((c) => c.dono === 'admA' && c.minha)); assert.ok(lista.some((c) => c.dono === 'admB' && !c.minha));
  const deB = lista.find((c) => c.dono === 'admB' && c.estado === 'ativa');
  assert.equal((await s.del('/api/admin/mcp/chaves/' + deB.id, como('admA'))).status, 200);
  assert.equal((await q('SELECT revogada_em FROM chaves_api WHERE id = $1', [deB.id]))[0].revogada_em !== null, true);
});

test('verificarChave: válida passa e registra o uso; revogada, expirada, desconhecida, dono rebaixado ou banido não passam', { skip }, async () => {
  const idA = await pessoa('admA', 'admin');
  const r = await criar({ nome: 'verificar', escopos: ['ler'] }, 'admA');
  const chave = r.json.chave, id = r.json.item.id;
  const ok = await verificarChave(db.pool, chave, { ip: '203.0.113.9' });
  assert.deepEqual(ok, { chave_id: id, usuario_id: idA, apelido: 'admA', escopos: ['ler'] });
  const [uso] = await q('SELECT ultimo_uso_em, ultimo_ip FROM chaves_api WHERE id = $1', [id]);
  assert.ok(uso.ultimo_uso_em); assert.equal(uso.ultimo_ip, '203.0.113.9');
  assert.equal(await verificarChave(db.pool, gerarChave().chave), null, 'desconhecida');
  assert.equal(await verificarChave(db.pool, 'ns_mcp_curta'), null); assert.equal(await verificarChave(db.pool, undefined), null);
  await q("UPDATE usuarios SET papel = 'moderador' WHERE id = $1", [idA]);
  assert.equal(await verificarChave(db.pool, chave), null, 'dono deixou de ser admin');
  await q("UPDATE usuarios SET papel = 'admin', banido = true WHERE id = $1", [idA]);
  assert.equal(await verificarChave(db.pool, chave), null, 'dono banido');
  await q('UPDATE usuarios SET banido = false WHERE id = $1', [idA]);
  assert.ok(await verificarChave(db.pool, chave), 'volta a valer quando o dono volta ao normal');
  await q("UPDATE chaves_api SET expira_em = now() - interval '1 minute' WHERE id = $1", [id]);
  assert.equal(await verificarChave(db.pool, chave), null, 'expirada');
  await q('UPDATE chaves_api SET expira_em = now() + interval \'1 day\' WHERE id = $1', [id]);
  assert.equal((await s.del('/api/admin/mcp/chaves/' + id, como('admA'))).status, 200);
  assert.equal(await verificarChave(db.pool, chave), null, 'revogada');
});

test('verificarChave grava o último uso no máximo uma vez por minuto', { skip }, async () => {
  const r = await criar({ nome: 'uso' }, 'admA'); const id = r.json.item.id;
  await verificarChave(db.pool, r.json.chave, { ip: '198.51.100.1' });
  const [a] = await q('SELECT ultimo_uso_em FROM chaves_api WHERE id = $1', [id]);
  await verificarChave(db.pool, r.json.chave, { ip: '198.51.100.2' });
  const [b] = await q('SELECT ultimo_uso_em, ultimo_ip FROM chaves_api WHERE id = $1', [id]);
  assert.equal(String(a.ultimo_uso_em), String(b.ultimo_uso_em)); assert.equal(b.ultimo_ip, '198.51.100.1');
});

test('llms.txt: texto puro, no-store, base vinda da configuração do servidor (não do cliente)', { skip }, async () => {
  const r = await s.get('/api/admin/mcp/llms.txt', { headers: { 'X-Test-User': 'admA', Origin: 'https://atacante.example' } });
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /^text\/plain/); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(r.json, /https:\/\/naosalvo\.teste\/mcp/); assert.ok(!String(r.json).includes('atacante.example'));
  assert.equal((await s.get('/api/admin/mcp/llms.txt', como('comum'))).status, 401);
});
