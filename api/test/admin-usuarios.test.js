// Admin · usuários: listar, mudar papel, banir. Regras de quem pode mexer em quem. Sem banco real (pool falso com 3 contas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { servidor } from './helpers.js';

const base = () => ({
  7: { id: 7, apelido: 'adm', papel: 'admin', xp: 0, moedas: 0, banido: false },
  8: { id: 8, apelido: 'outro_adm', papel: 'admin', xp: 0, moedas: 0, banido: false },
  9: { id: 9, apelido: 'zeca', papel: 'usuario', xp: 5, moedas: 1, banido: false }
});
const pool = (usuarios = base()) => {
  const chamadas = [];
  return {
    chamadas, usuarios,
    query: async (sql, val) => {
      chamadas.push({ sql, val });
      if (/SELECT papel FROM usuarios/.test(sql)) return { rows: [{ papel: usuarios[val[0]]?.papel || 'usuario' }], rowCount: 1 };
      if (/^SELECT .* FROM usuarios WHERE id = \$1/.test(sql)) { const u = usuarios[val[0]]; return { rows: u ? [{ ...u }] : [], rowCount: u ? 1 : 0 }; }
      let m;
      if ((m = /^UPDATE usuarios SET papel = \$2 WHERE id = \$1/.exec(sql))) { usuarios[val[0]].papel = val[1]; return { rows: [{ ...usuarios[val[0]] }], rowCount: 1 }; }
      if ((m = /^UPDATE usuarios SET banido = \$2 WHERE id = \$1/.exec(sql))) { usuarios[val[0]].banido = val[1]; return { rows: [{ ...usuarios[val[0]] }], rowCount: 1 }; }
      if (/FROM usuarios/.test(sql)) return { rows: Object.values(usuarios), rowCount: 3 };
      return { rows: [], rowCount: 1 };
    }
  };
};
const comoAdm = async (req) => (req.headers['x-test-user'] ? { id: 7, apelido: 'adm', banido: false, via: 'stub' } : null);
const H = { 'X-Test-User': 'adm' };
const T = { Authorization: 'Bearer segredo' };
const log = (p) => p.chamadas.filter((c) => /INSERT INTO log_auditoria/.test(c.sql));

test('listar: só admin; busca e filtros viram parâmetros, entrada inválida é ignorada', async () => {
  const p = pool(); const s = await servidor(p, { autenticar: comoAdm });
  assert.equal((await s.get('/api/admin/usuarios')).status, 401);
  const r = await s.get('/api/admin/usuarios?busca=ze_ca&papel=admin&banido=0&antes=50&limite=2', { headers: H });
  assert.equal(r.status, 200); assert.equal(r.json.items.length, 2); assert.equal(r.json.proximo, 8);
  const q = p.chamadas.find((c) => /FROM usuarios ORDER|FROM usuarios WHERE/.test(c.sql) && /LIMIT/.test(c.sql));
  assert.deepEqual(q.val, ['%ze\\_ca%', 'admin', false, '50', 3]);
  const p2 = pool(); const s2 = await servidor(p2, { autenticar: comoAdm });
  await s2.get("/api/admin/usuarios?busca=x'; DROP TABLE usuarios;--&papel=root&banido=talvez&antes=abc&limite=9999", { headers: H });
  const q2 = p2.chamadas.find((c) => /LIMIT/.test(c.sql));
  assert.deepEqual(q2.val, [201]); assert.doesNotMatch(q2.sql, /DROP/);
  await s.fechar(); await s2.fechar();
});

test('papel: admin de sessão promove usuário comum e a ação vai para o log', async () => {
  const p = pool(); const s = await servidor(p, { autenticar: comoAdm });
  const r = await s.post('/api/admin/usuarios/9/papel', { papel: 'moderador' }, { headers: H });
  assert.equal(r.status, 200); assert.equal(r.json.usuario.papel, 'moderador');
  const [l] = log(p); assert.equal(l.val[1], 'usuario.papel'); assert.equal(l.val[2], 'usuarios:9');
  assert.deepEqual({ de: 'usuario', para: 'moderador' }, (({ de, para }) => ({ de, para }))(JSON.parse(l.val[3])));
  await s.fechar();
});

test('papel: valida corpo, papel e id; mesmo papel não regrava; usuário inexistente 404', async () => {
  const p = pool(); const s = await servidor(p, { autenticar: comoAdm });
  assert.equal((await s.post('/api/admin/usuarios/9/papel', { papel: 'root' }, { headers: H })).status, 400);
  assert.equal((await s.post('/api/admin/usuarios/9/papel', { papel: 'usuario' }, { headers: H })).json.sem_mudanca, true);
  assert.equal((await s.post('/api/admin/usuarios/999/papel', { papel: 'moderador' }, { headers: H })).status, 404);
  assert.equal(log(p).length, 0);
  await s.fechar();
});

test('ninguém muda o próprio papel nem se bane; admin de sessão não mexe em outro admin', async () => {
  const p = pool(); const s = await servidor(p, { autenticar: comoAdm });
  assert.equal((await s.post('/api/admin/usuarios/7/papel', { papel: 'usuario' }, { headers: H })).status, 403);
  assert.equal((await s.post('/api/admin/usuarios/7/banir', { banido: true }, { headers: H })).status, 403);
  assert.equal((await s.post('/api/admin/usuarios/8/papel', { papel: 'usuario' }, { headers: H })).status, 403);
  assert.equal((await s.post('/api/admin/usuarios/8/banir', { banido: true }, { headers: H })).status, 403);
  assert.equal(p.usuarios[8].papel, 'admin'); assert.equal(p.usuarios[7].banido, false);
  await s.fechar();
});

test('token de emergência pode rebaixar outro admin', async () => {
  const p = pool(); const s = await servidor(p, { adminToken: 'segredo' });
  const r = await s.post('/api/admin/usuarios/8/papel', { papel: 'usuario' }, { headers: T });
  assert.equal(r.status, 200); assert.equal(p.usuarios[8].papel, 'usuario');
  assert.equal(JSON.parse(log(p)[0].val[3]).via, 'token');
  await s.fechar();
});

test('banir: marca banido, apaga as sessões, grava motivo cortado em 200; desbanir não apaga sessão', async () => {
  const p = pool(); const s = await servidor(p, { autenticar: comoAdm });
  const r = await s.post('/api/admin/usuarios/9/banir', { banido: true, motivo: 'x'.repeat(500) }, { headers: H });
  assert.equal(r.status, 200); assert.equal(p.usuarios[9].banido, true);
  assert.ok(p.chamadas.some((c) => /^DELETE FROM sessoes WHERE usuario_id = \$1/.test(c.sql) && c.val[0] === 9));
  const [l] = log(p); assert.equal(l.val[1], 'usuario.banir'); assert.equal(JSON.parse(l.val[3]).motivo.length, 200);
  const antes = p.chamadas.filter((c) => /DELETE FROM sessoes/.test(c.sql)).length;
  await s.post('/api/admin/usuarios/9/banir', { banido: false }, { headers: H });
  assert.equal(p.usuarios[9].banido, false);
  assert.equal(p.chamadas.filter((c) => /DELETE FROM sessoes/.test(c.sql)).length, antes);
  assert.equal(log(p).at(-1).val[1], 'usuario.desbanir');
  assert.equal((await s.post('/api/admin/usuarios/9/banir', { banido: 'sim' }, { headers: H })).status, 400);
  await s.fechar();
});
