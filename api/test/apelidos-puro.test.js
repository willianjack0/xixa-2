// Apelidos reservados e apelido gerado no 1º login. Sem banco: rodam no CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESERVADOS, normalizarApelido, ehReservado } from '../auth/apelidos.js';
import { gerarApelido } from '../auth/discord.js';
import { validarApelido } from '../auth/perfil.js';
import { servidor } from './helpers.js';

const BASES = ['admin', 'administrador', 'mod', 'moderador', 'moderacao', 'suporte', 'staff', 'nao salvo', 'naosalvo', 'xet', 'sistema', 'system', 'root', 'discord', 'oficial'];

test('normalização: minúsculas, sem acento, sem espaço . _ - e sem números no fim', () => {
  assert.equal(normalizarApelido('Moderação'), 'moderacao');
  assert.equal(normalizarApelido('A.D.M.I.N'), 'admin');
  assert.equal(normalizarApelido('Nao_Salvo-2'), 'naosalvo');
  assert.equal(normalizarApelido('admin 1 2'), 'admin');
  assert.equal(normalizarApelido('root_007'), 'root');
  assert.equal(normalizarApelido('ad2min'), 'ad2min');      // número no meio não some
  assert.equal(normalizarApelido('123'), '');
  assert.equal(normalizarApelido(null), '');
});

test('toda a lista reservada, e as variantes, são reservadas', () => {
  assert.deepEqual([...RESERVADOS].sort(), [...BASES].sort());
  for (const b of BASES) {
    const colado = b.replace(/ /g, '');
    const variantes = [b, colado, colado.toUpperCase(), colado[0].toUpperCase() + colado.slice(1), colado + '1', colado + '2024', colado + '_7', colado + '.99',
      colado + '-1', '_' + colado, colado.split('').join('.'), colado.split('').join('_'), colado.split('').join('-') + '3', b.replace(/ /g, '_'), b.replace(/ /g, '-'), b.replace(/ /g, '.') + '_1'];
    for (const v of variantes) assert.equal(ehReservado(v), true, JSON.stringify(v));
  }
  assert.equal(ehReservado('Moderação'), true);
  assert.equal(ehReservado('MODERAÇÃO_2'), true);
  assert.equal(ehReservado('Administrador99'), true);
});

test('nomes parecidos mas legítimos NÃO são reservados', () => {
  for (const ok of ['Modesto', 'admin_joao', 'rootbeer', 'systematic', 'discordia', 'staffan', 'xeta', 'oficina', 'sistemas', 'suportes', 'ad2min', 'Ana', 'zeca_77', 'gato123', 'naosalvo_fan', 'o_xet', 'mod_ana', 'x3t']) {
    assert.equal(ehReservado(ok), false, ok);
  }
});

test('validarApelido recusa reservado com 422 e campo apelido; aceita o resto', () => {
  for (const r of ['admin', 'Admin', 'ADMIN_2', 'a.d.m.i.n', 'Nao-Salvo', 'xet99', 'root', 'Moderador', 'suporte_1', 'oficial.']) {
    assert.throws(() => validarApelido(r), (e) => e.status === 422 && e.campo === 'apelido' && /reservado/.test(e.message), r);
  }
  assert.equal(validarApelido('Modesto'), 'Modesto');
  assert.equal(validarApelido('  Ana_Lu  '), 'Ana_Lu');
});

test('gerarApelido (1º login) nunca produz reservado: bases reservadas, com número, acentos e todas as tentativas', () => {
  const bases = [...BASES, ...BASES.map((b) => b.toUpperCase()), 'Admin123', 'Moderação', 'Nao Salvo', 'A.d.m.i.n', 'root_1', 'Sistema 2', 'XET', 'Discord', 'Oficial!!',
    'ad', 'xe', 'mo', 'Zé', '😀', 'x'.repeat(40), 'administrador'.repeat(3), 'Fulano'];
  for (const base of bases) {
    for (let t = 0; t < 40; t++) {
      const a = gerarApelido(base, t);
      assert.match(a, /^[A-Za-z0-9_.\-]{3,20}$/, `${base}#${t} -> ${a}`);
      assert.equal(ehReservado(a), false, `${base}#${t} -> ${a}`);
    }
  }
  // sufixo numérico não resolve reservado (admin2 também é reservado): usa _gato
  assert.equal(gerarApelido('admin'), 'admin_gato');
  assert.equal(gerarApelido('Admin', 1), 'Admin_gato2');
  assert.equal(gerarApelido('Nao Salvo'), 'Nao_Salvo_gato');
  assert.equal(gerarApelido('Admin123'), 'Admin123_gato');
  // nome comum segue como antes
  assert.equal(gerarApelido('Fulano'), 'Fulano'); assert.equal(gerarApelido('Fulano', 1), 'Fulano2'); assert.equal(gerarApelido('Zé Fulano'), 'Ze_Fulano');
});

test('gerarApelido: fuzz de bases aleatórias nunca gera reservado nem apelido inválido', () => {
  const pedacos = ['admin', 'mod', 'root', 'xet', 'sistema', 'system', 'oficial', 'discord', 'staff', 'suporte', '_', '.', '-', ' ', '1', '23', 'é', 'ã', 'a', 'Z', 'naosalvo', 'nao', 'salvo', 'moderacao'];
  let i = 7;
  const rnd = () => (i = (i * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 20000; k++) {
    let base = ''; const n = 1 + Math.floor(rnd() * 5);
    for (let j = 0; j < n; j++) base += pedacos[Math.floor(rnd() * pedacos.length)];
    const t = Math.floor(rnd() * 120);
    const a = gerarApelido(base, t);
    assert.match(a, /^[A-Za-z0-9_.\-]{3,20}$/, `${JSON.stringify(base)}#${t} -> ${a}`);
    assert.equal(ehReservado(a), false, `${JSON.stringify(base)}#${t} -> ${a}`);
  }
});

test('PATCH /api/eu com apelido reservado: 422 {erro, campo: apelido} antes de tocar no banco', async () => {
  const poolFalso = { query: async () => { throw new Error('não deveria tocar no banco'); }, connect: async () => { throw new Error('não deveria abrir transação'); } };
  const s = await servidor(poolFalso, { autenticar: async () => ({ id: 7, apelido: 'ana', banido: false, via: 'stub' }) });
  for (const apelido of ['admin', 'Admin', 'ADMIN_2', 'Nao_Salvo', 'moderação'.replace('ç', 'c').replace('ã', 'a'), 'xet', 'root1', 'o.f.i.c.i.a.l']) {
    const r = await s.patch('/api/eu', { apelido });
    assert.equal(r.status, 422, apelido); assert.equal(r.json.campo, 'apelido'); assert.match(r.json.erro, /reservado/);
  }
  await s.fechar();
});
