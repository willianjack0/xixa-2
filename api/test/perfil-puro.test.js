// Perfil (PATCH /api/eu): validadores e rotas que respondem ANTES de tocar no banco. Sem banco: rodam no CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarAvatarGato, validarApelido, OPCOES_GATO, ErroPerfil } from '../auth/perfil.js';
import { servidor } from './helpers.js';

const GATO = { fur: 1, pat: 0, eye: 2, acc: 3, clo: 0, bg: 4 };
const poolFalso = { query: async () => { throw new Error('não deveria tocar no banco'); }, connect: async () => { throw new Error('não deveria abrir transação'); } };
const logado = async () => ({ id: 7, apelido: 'ana', banido: false, via: 'stub' });

test('lista fechada do gato bate com as opções do criador de gato em common.js', async () => {
  // extrai os tamanhos das listas SG.* do common.js (sem alterá-lo) e compara com OPCOES_GATO
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const src = readFileSync(fileURLToPath(new URL('../../common.js', import.meta.url)), 'utf8');
  const bloco = src.slice(src.indexOf('const SG={'), src.indexOf('};', src.indexOf('const SG={')) + 2);
  // eslint-disable-next-line no-new-func
  const SG = new Function(bloco + '; return SG;')();
  for (const k of ['fur', 'pat', 'eye', 'acc', 'clo', 'bg']) assert.equal(OPCOES_GATO[k], SG[k].length, k);
});

test('avatar_gato: aceita todas as faixas válidas, inclusive os limites', () => {
  assert.deepEqual(validarAvatarGato(GATO), GATO);
  assert.deepEqual(validarAvatarGato({ fur: 0, pat: 0, eye: 0, acc: 0, clo: 0, bg: 0 }), { fur: 0, pat: 0, eye: 0, acc: 0, clo: 0, bg: 0 });
  assert.deepEqual(validarAvatarGato({ fur: 9, pat: 4, eye: 4, acc: 8, clo: 7, bg: 7 }), { fur: 9, pat: 4, eye: 4, acc: 8, clo: 7, bg: 7 });
  // devolve cópia normalizada na ordem fixa (não o objeto do cliente)
  const entrada = { bg: 4, clo: 0, acc: 3, eye: 2, pat: 0, fur: 1 };
  const saida = validarAvatarGato(entrada);
  assert.notEqual(saida, entrada); assert.deepEqual(Object.keys(saida), ['fur', 'pat', 'eye', 'acc', 'clo', 'bg']);
});

test('avatar_gato: recusa fora da faixa, tipo errado, chave faltando ou sobrando (422, campo avatar_gato)', () => {
  const ruins = [
    { ...GATO, fur: 10 }, { ...GATO, pat: 5 }, { ...GATO, eye: 5 }, { ...GATO, acc: 9 }, { ...GATO, clo: 8 }, { ...GATO, bg: 8 },
    { ...GATO, fur: -1 }, { ...GATO, fur: 1.5 }, { ...GATO, fur: '1' }, { ...GATO, fur: null }, { ...GATO, fur: true }, { ...GATO, fur: NaN },
    { ...GATO, fur: Infinity }, { ...GATO, fur: [1] }, { ...GATO, fur: { v: 1 } }, { ...GATO, fur: 1e9 },
    { fur: 1, pat: 0, eye: 2, acc: 3, clo: 0 },                           // falta bg
    {}, { ...GATO, extra: 1 }, { ...GATO, avatar_url: 'https://evil.com' }, { ...GATO, __proto__x: 1 },
    JSON.parse('{"fur":1,"pat":0,"eye":2,"acc":3,"clo":0,"bg":4,"__proto__":{"x":1}}'), // chave __proto__ própria
    null, undefined, 'gato', 5, [], [1, 2, 3, 4, 5, 6], true
  ];
  for (const v of ruins) {
    assert.throws(() => validarAvatarGato(v), (e) => e instanceof ErroPerfil && e.status === 422 && e.campo === 'avatar_gato', JSON.stringify(v));
  }
});

test('apelido: mesma regra do CHECK do banco (3 a 20 de A-Z a-z 0-9 _ . -), com trim', () => {
  for (const ok of ['Ana', 'abc', 'a.b-c_d', 'Zeca', 'x'.repeat(20), '  Ana  ']) assert.equal(validarApelido(ok), ok.trim());
  for (const ruim of ['ab', 'x'.repeat(21), 'com espaço', 'Zé', 'a/b', 'a@b', '<b>', '', '   ', 'ab\n', '日本語', 'a\u0000b']) {
    assert.throws(() => validarApelido(ruim), (e) => e.status === 422 && e.campo === 'apelido', JSON.stringify(ruim));
  }
  for (const nao of [null, undefined, 42, {}, [], true]) assert.throws(() => validarApelido(nao), (e) => e.status === 422 && e.campo === 'apelido');
});

test('PATCH /api/eu sem login: 401', async () => {
  const s = await servidor(poolFalso, { autenticar: async () => null });
  assert.equal((await s.patch('/api/eu', { apelido: 'Ana' })).status, 401);
  await s.fechar();
});

test('PATCH /api/eu: corpo inválido responde 400/422 sem tocar no banco', async () => {
  const s = await servidor(poolFalso, { autenticar: logado });
  const ok = (status, corpo, campo) => async () => {
    const r = await s.patch('/api/eu', corpo);
    assert.equal(r.status, status, JSON.stringify(corpo));
    assert.equal(typeof r.json.erro, 'string');
    if (campo) assert.equal(r.json.campo, campo);
  };
  await ok(400, {})();
  await ok(400, [])();
  await ok(400, 'texto')();
  await ok(400, null)();
  await ok(400, { avatar_url: 'https://evil.com/x.png' })();           // nunca aceito do cliente
  await ok(400, { apelido: 'Ana', id: 1 })();                          // chave desconhecida
  await ok(400, { apelido: 'Ana', usuario_id: 9 })();
  await ok(400, { xp: 99999 })();
  await ok(400, { cadastro_completo_em: '2020-01-01' })();
  await ok(422, { apelido: 'a' }, 'apelido')();
  await ok(422, { apelido: 123 }, 'apelido')();
  await ok(422, { usar_foto: 'sim' }, 'usar_foto')();
  await ok(422, { usar_foto: 1 }, 'usar_foto')();
  await ok(422, { usar_foto: null }, 'usar_foto')();
  await ok(422, { avatar_gato: { ...GATO, fur: 99 } }, 'avatar_gato')();
  await ok(422, { avatar_gato: 'gato' }, 'avatar_gato')();
  await ok(422, { apelido: 'Ana', avatar_gato: { ...GATO, bg: -1 } }, 'avatar_gato')();   // um campo ruim derruba o pedido todo
  const r = await fetch(s.base + '/api/eu', { method: 'PATCH', body: '{nao-json' });
  assert.equal(r.status, 400);
  await s.fechar();
});

test('GET /api/pacotes/tipos sem login: 401', async () => {
  const s = await servidor(poolFalso, { autenticar: async () => null });
  assert.equal((await s.get('/api/pacotes/tipos')).status, 401);
  await s.fechar();
});
