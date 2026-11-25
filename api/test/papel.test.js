// Papéis (usuario < moderador < admin): exigePapel, /api/admin/* por sessão de admin e token de emergência. Sem banco real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { servidor } from './helpers.js';
import { papelAtinge, nivelDoPapel } from '../lib/papel.js';

// pool falso: a consulta de papel devolve o papel do usuário 7; o resto devolve vazio
const poolCom = (papel) => ({
  query: async (sql) => (/SELECT papel FROM usuarios/.test(sql) ? { rows: papel ? [{ papel }] : [], rowCount: papel ? 1 : 0 } : { rows: [], rowCount: 0 })
});
const logado = (extra = {}) => async (req) => (req.headers['x-test-user'] ? { id: 7, apelido: 'fulano', banido: false, via: 'stub', ...extra } : null);

test('hierarquia: usuario < moderador < admin; papel desconhecido vale usuario', () => {
  assert.equal(papelAtinge('admin', 'moderador'), true);
  assert.equal(papelAtinge('moderador', 'admin'), false);
  assert.equal(papelAtinge('usuario', 'usuario'), true);
  assert.equal(nivelDoPapel('qualquer'), 0);
});

test('/api/admin/*: usuário comum e moderador logados recebem 401 (só admin entra)', async () => {
  for (const papel of ['usuario', 'moderador']) {
    const s = await servidor(poolCom(papel), { autenticar: logado() });
    const r = await s.get('/api/admin/feedback', { headers: { 'X-Test-User': 'fulano' } });
    assert.equal(r.status, 401, papel);
    await s.fechar();
  }
});

test('/api/admin/*: sem login 401; admin logado passa; token de emergência continua valendo', async () => {
  const s = await servidor(poolCom('admin'), { autenticar: logado(), adminToken: 'segredo' });
  assert.equal((await s.get('/api/admin/feedback')).status, 401);
  assert.equal((await s.get('/api/admin/feedback', { headers: { 'X-Test-User': 'fulano' } })).status, 200);
  assert.equal((await s.get('/api/admin/feedback', { headers: { Authorization: 'Bearer segredo' } })).status, 200);
  assert.equal((await s.get('/api/admin/feedback', { headers: { Authorization: 'Bearer errado', 'X-Test-User': 'fulano' } })).status, 401, 'token errado não cai para a sessão');
  await s.fechar();
});

test('/api/admin/*: admin banido não entra', async () => {
  const s = await servidor(poolCom('admin'), { autenticar: logado({ banido: true }) });
  assert.equal((await s.get('/api/admin/feedback', { headers: { 'X-Test-User': 'fulano' } })).status, 401);
  await s.fechar();
});

test('sessão de admin com cookie: método que altera dados exige CSRF', async () => {
  const s = await servidor(poolCom('admin'), { autenticar: logado({ via: 'sessao', csrf: 'tok' }) });
  const r = await s.del('/api/admin/comentarios/1', { headers: { 'X-Test-User': 'fulano' } });
  assert.equal(r.status, 401, 'sem X-CSRF/Origin não passa');
  await s.fechar();
});

test('exigePapel numa rota: 401 sem login, 403 com papel menor, passa com o papel', async () => {
  for (const [papel, esperado] of [['usuario', 403], ['moderador', 200], ['admin', 200]]) {
    const s = await servidor(poolCom(papel), { autenticar: logado() });
    s.router.get('/api/teste-papel', async ({ res }) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); }, { papel: 'moderador' });
    assert.equal((await s.get('/api/teste-papel')).status, 401);
    const r = await s.get('/api/teste-papel', { headers: { 'X-Test-User': 'fulano' } });
    assert.equal(r.status, esperado, papel);
    if (esperado === 403) assert.equal(r.json.papel_atual, papel);
    await s.fechar();
  }
});
