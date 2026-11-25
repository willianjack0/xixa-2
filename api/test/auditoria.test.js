// Log de auditoria: ações do admin gravam em log_auditoria (quem, ação, alvo) e GET /api/admin/log lê. Sem banco real (pool falso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { servidor } from './helpers.js';

// pool falso que registra as consultas; papel do usuário 7 = admin; rowCount configurável para os DELETE/UPDATE
const pool = ({ afetadas = 1, falhaLog = false, linhasLog = [] } = {}) => {
  const chamadas = [];
  return {
    chamadas,
    query: async (sql, val) => {
      chamadas.push({ sql, val });
      if (/SELECT papel FROM usuarios/.test(sql)) return { rows: [{ papel: 'admin' }], rowCount: 1 };
      if (/INSERT INTO log_auditoria/.test(sql)) { if (falhaLog) throw new Error('banco fora'); return { rows: [], rowCount: 1 }; }
      if (/FROM log_auditoria/.test(sql)) return { rows: linhasLog, rowCount: linhasLog.length };
      if (/^(DELETE|UPDATE)/.test(sql)) return { rows: [], rowCount: afetadas };
      return { rows: [], rowCount: 0 };
    }
  };
};
const admin = async (req) => (req.headers['x-test-user'] ? { id: 7, apelido: 'adm', banido: false, via: 'stub' } : null);
const H = { 'X-Test-User': 'adm' };
const inserts = (p) => p.chamadas.filter((c) => /INSERT INTO log_auditoria/.test(c.sql));

test('excluir comentário como admin de sessão grava no log com o usuário e o alvo', async () => {
  const p = pool(); const s = await servidor(p, { autenticar: admin });
  assert.equal((await s.del('/api/admin/comentarios/12', { headers: H })).status, 200);
  const [ins] = inserts(p);
  assert.equal(ins.val[0], 7); assert.equal(ins.val[1], 'comentario.excluir'); assert.equal(ins.val[2], 'comentarios:12');
  assert.equal(JSON.parse(ins.val[3]).via, 'sessao');
  await s.fechar();
});

test('token de emergência também audita, com usuario_id nulo e via=token', async () => {
  const p = pool(); const s = await servidor(p, { adminToken: 'segredo' });
  assert.equal((await s.del('/api/admin/feedback/3', { headers: { Authorization: 'Bearer segredo' } })).status, 200);
  const [ins] = inserts(p);
  assert.equal(ins.val[0], null); assert.equal(ins.val[1], 'feedback.excluir');
  assert.equal(JSON.parse(ins.val[3]).via, 'token');
  await s.fechar();
});

test('ação que não afetou linha (404) não grava log', async () => {
  const p = pool({ afetadas: 0 }); const s = await servidor(p, { autenticar: admin });
  assert.equal((await s.del('/api/admin/contribuidores/99', { headers: H })).status, 404);
  assert.equal(inserts(p).length, 0);
  await s.fechar();
});

test('decidir link grava link.aprovar / link.recusar', async () => {
  for (const [status, acao] of [['aprovado', 'link.aprovar'], ['recusado', 'link.recusar']]) {
    const p = pool(); const s = await servidor(p, { autenticar: admin, adminToken: 'segredo' });
    assert.equal((await s.post('/api/admin/links/5', { status }, { headers: { Authorization: 'Bearer segredo' } })).status, 200);
    assert.equal(inserts(p)[0].val[1], acao);
    await s.fechar();
  }
});

test('falha ao gravar o log não derruba a ação já feita', async () => {
  const p = pool({ falhaLog: true }); const s = await servidor(p, { autenticar: admin });
  assert.equal((await s.del('/api/admin/comentarios/1', { headers: H })).status, 200);
  await s.fechar();
});

test('GET /api/admin/log: só admin; limite máximo 200; filtros validados; cursor proximo', async () => {
  const linhas = Array.from({ length: 3 }, (_, i) => ({ id: 30 - i, usuario_id: 7, apelido: 'adm', acao: 'x', alvo: null, detalhe: {}, criado_em: new Date() }));
  const p = pool({ linhasLog: linhas }); const s = await servidor(p, { autenticar: admin });
  assert.equal((await s.get('/api/admin/log')).status, 401);
  const r = await s.get('/api/admin/log?limite=2&acao=comentario.excluir&usuario_id=7&antes=99', { headers: H });
  assert.equal(r.status, 200); assert.equal(r.json.items.length, 2); assert.equal(r.json.proximo, 29);
  const q = p.chamadas.find((c) => /FROM log_auditoria/.test(c.sql));
  assert.deepEqual(q.val, ['comentario.excluir', '7', '99', 3]);
  // entrada inválida é ignorada (não vira SQL) e o limite é limitado
  const p2 = pool(); const s2 = await servidor(p2, { autenticar: admin });
  await s2.get("/api/admin/log?limite=9999&acao=x'; DROP TABLE usuarios;--&usuario_id=abc", { headers: H });
  const q2 = p2.chamadas.find((c) => /FROM log_auditoria/.test(c.sql));
  assert.deepEqual(q2.val, [201]); assert.doesNotMatch(q2.sql, /DROP/);
  await s.fechar(); await s2.fechar();
});
