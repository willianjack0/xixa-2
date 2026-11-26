// Teste da rota de comentários (POST e GET /api/comentarios).
// Exige autenticação no POST, define autor pelo apelido da conta no banco,
// recusa tentativa de falsificar autor no corpo, mantém honeypot e rate limit por IP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';

const skip = semBanco();
let db, s;

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, {
    autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test_c' })
  });
});

after(async () => {
  if (s) await s.fechar();
  if (db) await db.fechar();
});

test('POST /api/comentarios: sem login retorna 401', { skip }, async () => {
  const r = await s.post('/api/comentarios', { id: 'havaianas-de-pau', texto: 'Comentário sem login' });
  assert.equal(r.status, 401);
  assert.equal(r.json.erro, 'login necessário');
});

test('POST /api/comentarios: autor no corpo é recusado com 422', { skip }, async () => {
  const r = await s.post('/api/comentarios', {
    id: 'havaianas-de-pau',
    autor: 'hacker',
    texto: 'Tentando falsificar autor'
  }, { headers: { 'X-Test-User': 'vitima' } });
  assert.equal(r.status, 422);
  assert.match(r.json.erro, /O autor é definido pela conta logada/);
});

test('POST /api/comentarios: grava comentário com o apelido da sessão no banco', { skip }, async () => {
  const r = await s.post('/api/comentarios', {
    id: 'havaianas-de-pau',
    texto: 'Comentário legítimo com a conta autenticada'
  }, { headers: { 'X-Test-User': 'usuario_autenticado' } });

  assert.equal(r.status, 201);
  assert.equal(r.json.autor, 'usuario_autenticado');
  assert.equal(r.json.texto, 'Comentário legítimo com a conta autenticada');
  assert.ok(typeof r.json.id === 'number');

  // Confere que no GET o comentário aparece com o autor correto
  const lista = await s.get('/api/comentarios?id=havaianas-de-pau');
  assert.equal(lista.status, 200);
  const encontrado = lista.json.itens.find((c) => c.id === r.json.id);
  assert.ok(encontrado);
  assert.equal(encontrado.autor, 'usuario_autenticado');
  assert.equal(encontrado.texto, 'Comentário legítimo com a conta autenticada');
});

test('POST /api/comentarios: honeypot bot-field finge sucesso (201 ok)', { skip }, async () => {
  const r = await s.post('/api/comentarios', {
    id: 'havaianas-de-pau',
    texto: 'Sou um bot',
    'bot-field': 'spam'
  }, { headers: { 'X-Test-User': 'usuario_bot' } });

  assert.equal(r.status, 201);
  assert.deepEqual(r.json, { ok: true });
});

test('POST /api/comentarios: validação de meme inexistente e texto vazio', { skip }, async () => {
  const rVazio = await s.post('/api/comentarios', {
    id: 'havaianas-de-pau',
    texto: '   '
  }, { headers: { 'X-Test-User': 'usuario_teste' } });
  assert.equal(rVazio.status, 422);

  const rMemeInexistente = await s.post('/api/comentarios', {
    id: 'meme-que-nao-existe',
    texto: 'Comentário válido'
  }, { headers: { 'X-Test-User': 'usuario_teste' } });
  assert.equal(rMemeInexistente.status, 404);
  assert.equal(rMemeInexistente.json.erro, 'meme não encontrado');
});
