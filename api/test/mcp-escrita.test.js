// Testes das ferramentas de escrita do MCP (/mcp): criar_meme, editar_meme, publicar_meme, criar_carta.
// Banco real descartável (pulado sem TEST_DB_NAME).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { atorDe } from '../lib/auditoria.js';

// ---- teste unitário puro de auditoria com ator MCP ----
test('auditoria: atorDe reconhece ctx.mcp e devolve { usuario_id, via: "mcp", chave_id }', () => {
  const ctxMcp = { mcp: { chave_id: 12, usuario_id: 99, apelido: 'agente' } };
  assert.deepEqual(atorDe(ctxMcp), { usuario_id: 99, via: 'mcp', chave_id: 12 });

  const ctxAdmin = { adminPorSessao: { id: 5 } };
  assert.deepEqual(atorDe(ctxAdmin), { usuario_id: 5, via: 'sessao' });

  const ctxUser = { usuario: { id: 7 } };
  assert.deepEqual(atorDe(ctxUser), { usuario_id: 7, via: 'sessao' });

  const ctxToken = {};
  assert.deepEqual(atorDe(ctxToken), { usuario_id: null, via: 'token' });
});

// ---- testes com banco real ----
const skip = semBanco();
let db, s;
const como = (apelido) => ({ headers: { 'X-Test-User': apelido } });
const q = async (sql, v = []) => (await db.pool.query(sql, v)).rows;
const T = { headers: { Authorization: 'Bearer segredo' } };
const authHeader = (chave) => ({ Authorization: 'Bearer ' + chave });

before(async () => {
  if (skip) return;
  db = await bancoDeTeste({ seed: true });
  s = await servidor(db.pool, {
    autenticar: criarAutenticadorStub({ AUTH_STUB: '1', DB_NAME: 'naosalvo_test' }),
    adminToken: 'segredo',
    auth: { origemSite: 'https://naosalvo.teste' }
  });
});
after(async () => {
  if (skip) return;
  await s.fechar();
  await db.fechar();
});

async function criarAdmin(apelido = 'adminEscrita') {
  await s.get('/api/eu', como(apelido));
  const [{ id }] = await q('SELECT id FROM usuarios WHERE lower(apelido) = lower($1)', [apelido]);
  await q("UPDATE usuarios SET papel = 'admin' WHERE id = $1", [id]);
  return Number(id);
}

async function criarChave(adminApelido, escopos = ['ler', 'escrever']) {
  const r = await s.post('/api/admin/mcp/chaves', { nome: 'Chave ' + escopos.join('+'), escopos }, como(adminApelido));
  assert.equal(r.status, 201, 'criação de chave falhou');
  return { chave: r.json.chave, item: r.json.item };
}

async function callTool(chave, name, args = {}) {
  const r = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 'test-' + Math.random().toString(36).slice(2, 7),
      method: 'tools/call',
      params: { name, arguments: args }
    },
    { headers: authHeader(chave) }
  );
  return r;
}

test('tools/list traz 13 ferramentas para chave com 3 escopos e 5 ferramentas para chave só ler', { skip }, async () => {
  await criarAdmin('admList');
  const { chave: kLer } = await criarChave('admList', ['ler']);
  const { chave: kTudo } = await criarChave('admList', ['ler', 'escrever', 'publicar']);

  const rLer = await s.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { headers: authHeader(kLer) });
  assert.equal(rLer.status, 200);
  assert.equal(rLer.json.result.tools.length, 6);

  const rTudo = await s.post('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { headers: authHeader(kTudo) });
  assert.equal(rTudo.status, 200);
  assert.equal(rTudo.json.result.tools.length, 16);
  const nomesTudo = rTudo.json.result.tools.map((t) => t.name).sort();
  assert.deepEqual(nomesTudo, [
    'anexar_midia', 'buscar_cartas', 'buscar_memes', 'conferir_duplicado', 'criar_carta', 'criar_meme',
    'editar_carta', 'editar_meme', 'escrever_memepedia', 'listar_referencias', 'moderar_memepedia', 'obter_meme', 'obter_memepedia', 'ocultar_meme', 'publicar_meme', 'remover_midia'
  ]);
});

test('criar_meme: chave só ler recebe isError por falta de escopo escrever', { skip }, async () => {
  await criarAdmin('admSemEscopo');
  const { chave: kLer } = await criarChave('admSemEscopo', ['ler']);

  const r = await callTool(kLer, 'criar_meme', {
    id: 'meme-sem-escopo',
    titulo: 'Meme Sem Escopo',
    ano: 2010,
    categoria: 'Vídeos',
    raridade: 'Comum'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.result.isError, true);
  assert.match(r.json.result.content[0].text, /falta o escopo escrever/);
});

test('criar_meme: rascunho (status oculto) não aparece no acervo público mas aparece no admin com token', { skip }, async () => {
  const adminId = await criarAdmin('admCriaRascunho');
  const { chave: kEscrita, item } = await criarChave('admCriaRascunho', ['ler', 'escrever']);

  const r = await callTool(kEscrita, 'criar_meme', {
    id: 'meu-rascunho-1',
    titulo: 'Meu Rascunho Único',
    ano: 2015,
    categoria: 'Vídeos',
    raridade: 'Raro',
    descricao: 'Teste de rascunho'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.result.isError, false);
  const dados = JSON.parse(r.json.result.content[0].text);
  assert.equal(dados.ok, true);
  assert.equal(dados.meme.id, 'meu-rascunho-1');
  assert.equal(dados.meme.status, 'oculto');
  assert.match(dados.aviso, /rascunho/);

  // Não aparece no público
  const rPub = await s.get('/api/memes/meu-rascunho-1');
  assert.equal(rPub.status, 404);

  // Aparece no admin com token
  const rAdm = await s.get('/api/admin/memes/meu-rascunho-1', T);
  assert.equal(rAdm.status, 200);
  assert.equal(rAdm.json.id, 'meu-rascunho-1');
  assert.equal(rAdm.json.status, 'oculto');

  // Log de auditoria gravou usuario_id do admin, via='mcp' e chave_id
  const [log] = await q("SELECT usuario_id, acao, alvo, detalhe FROM log_auditoria WHERE alvo = 'memes:meu-rascunho-1'");
  assert.equal(Number(log.usuario_id), adminId);
  assert.equal(log.acao, 'meme.criar');
  assert.equal(log.detalhe.via, 'mcp');
  assert.equal(Number(log.detalhe.chave_id), item.id);
  assert.equal(log.detalhe.publicado, false);
});

test('criar_meme: publicar:true sem escopo publicar dá isError e NADA é gravado; com escopo publica direto', { skip }, async () => {
  await criarAdmin('admPubCheck');
  const { chave: kEscrita } = await criarChave('admPubCheck', ['ler', 'escrever']);
  const { chave: kPub } = await criarChave('admPubCheck', ['ler', 'escrever', 'publicar']);

  // Sem escopo publicar
  const rErr = await callTool(kEscrita, 'criar_meme', {
    id: 'meme-pub-sem-escopo',
    titulo: 'Meme Pub Sem Escopo',
    ano: 2016,
    categoria: 'Vídeos',
    raridade: 'Comum',
    publicar: true
  });
  assert.equal(rErr.status, 200);
  assert.equal(rErr.json.result.isError, true);
  assert.match(rErr.json.result.content[0].text, /falta o escopo publicar/);
  assert.equal((await q("SELECT count(*)::int AS n FROM memes WHERE id = 'meme-pub-sem-escopo'"))[0].n, 0);

  // Com escopo publicar
  const rOk = await callTool(kPub, 'criar_meme', {
    id: 'meme-pub-direto',
    titulo: 'Meme Publicado Direto',
    ano: 2017,
    categoria: 'Vídeos',
    raridade: 'Lendário',
    publicar: true
  });
  assert.equal(rOk.status, 200);
  assert.equal(rOk.json.result.isError, false);
  const dados = JSON.parse(rOk.json.result.content[0].text);
  assert.equal(dados.meme.status, 'publicado');
  assert.equal(dados.aviso, null);

  // Já aparece no público
  const rPub = await s.get('/api/memes/meme-pub-direto');
  assert.equal(rPub.status, 200);
  assert.equal(rPub.json.titulo, 'Meme Publicado Direto');
});

test('criar_meme: checagem de duplicado (vídeo I8MC6-BuU28 e título igual) barra salvo forcar:true', { skip }, async () => {
  await criarAdmin('admDupMeme');
  const { chave: kEscrita } = await criarChave('admDupMeme', ['ler', 'escrever']);

  // Mesma URL/vídeo de havaianas-de-pau
  const rDupYt = await callTool(kEscrita, 'criar_meme', {
    id: 'havaianas-fake',
    titulo: 'Havaianas de Madeira',
    ano: 2004,
    categoria: 'Vídeos',
    raridade: 'Comum',
    youtube_id: 'I8MC6-BuU28'
  });
  assert.equal(rDupYt.status, 200);
  assert.equal(rDupYt.json.result.isError, true);
  assert.match(rDupYt.json.result.content[0].text, /duplicado/);

  // Mesmo título de havaianas-de-pau
  const rDupTit = await callTool(kEscrita, 'criar_meme', {
    id: 'havaianas-fake-2',
    titulo: 'Havaianas de Pau',
    ano: 2004,
    categoria: 'Vídeos',
    raridade: 'Comum'
  });
  assert.equal(rDupTit.status, 200);
  assert.equal(rDupTit.json.result.isError, true);
  assert.match(rDupTit.json.result.content[0].text, /duplicado/);

  // Com forcar: true grava normalmente
  const rForcado = await callTool(kEscrita, 'criar_meme', {
    id: 'havaianas-forcado',
    titulo: 'Havaianas de Pau',
    ano: 2004,
    categoria: 'Vídeos',
    raridade: 'Comum',
    forcar: true
  });
  assert.equal(rForcado.status, 200);
  assert.equal(rForcado.json.result.isError, false);

  const [log] = await q("SELECT detalhe FROM log_auditoria WHERE alvo = 'memes:havaianas-forcado'");
  assert.equal(log.detalhe.forcado, true);
});

test('criar_meme: validações (id repetido, categoria inexistente, campos desconhecidos, tipos errados)', { skip }, async () => {
  await criarAdmin('admValCria');
  const { chave: kEscrita } = await criarChave('admValCria', ['ler', 'escrever']);

  // Id repetido
  const rRepetido = await callTool(kEscrita, 'criar_meme', {
    id: 'havaianas-de-pau',
    titulo: 'Outro Título',
    ano: 2004,
    categoria: 'Vídeos',
    raridade: 'Comum',
    forcar: true
  });
  assert.equal(rRepetido.status, 200);
  assert.equal(rRepetido.json.result.isError, true);
  assert.match(rRepetido.json.result.content[0].text, /já existe/);

  // Categoria inexistente
  const rCat = await callTool(kEscrita, 'criar_meme', {
    id: 'meme-cat-ruim',
    titulo: 'Meme Cat Ruim',
    ano: 2020,
    categoria: 'Categoria Inexistente No Acervo',
    raridade: 'Comum'
  });
  assert.equal(rCat.status, 200);
  assert.equal(rCat.json.result.isError, true);
  assert.match(rCat.json.result.content[0].text, /categoria/i);

  // Campo desconhecido
  const rDesc = await callTool(kEscrita, 'criar_meme', {
    id: 'meme-campo-desc',
    titulo: 'Meme Invalido',
    ano: 2020,
    categoria: 'Vídeos',
    raridade: 'Comum',
    campo_fantasma: 'invalido'
  });
  assert.equal(rDesc.status, 200);
  assert.equal(rDesc.json.result.isError, true);
  assert.match(rDesc.json.result.content[0].text, /campo desconhecido/);

  // Tipo errado de ano
  const rAno = await callTool(kEscrita, 'criar_meme', {
    id: 'meme-ano-ruim',
    titulo: 'Meme Ano Ruim',
    ano: 'dois mil e vinte',
    categoria: 'Vídeos',
    raridade: 'Comum'
  });
  assert.equal(rAno.status, 200);
  assert.equal(rAno.json.result.isError, true);
  assert.match(rAno.json.result.content[0].text, /ano/);
});

test('editar_meme: rejeita status e midias, edita campos, grava diff no log e não loga se nada mudou', { skip }, async () => {
  const adminId = await criarAdmin('admEditaMeme');
  const { chave: kEscrita, item } = await criarChave('admEditaMeme', ['ler', 'escrever']);

  // Cria meme para editar
  await callTool(kEscrita, 'criar_meme', {
    id: 'meme-para-editar',
    titulo: 'Título Antes',
    ano: 2011,
    categoria: 'Vídeos',
    raridade: 'Comum'
  });

  // Rejeita status
  const rStatus = await callTool(kEscrita, 'editar_meme', {
    id: 'meme-para-editar',
    status: 'publicado'
  });
  assert.equal(rStatus.status, 200);
  assert.equal(rStatus.json.result.isError, true);
  assert.match(rStatus.json.result.content[0].text, /publicar_meme/);

  // Rejeita midias
  const rMidias = await callTool(kEscrita, 'editar_meme', {
    id: 'meme-para-editar',
    midias: []
  });
  assert.equal(rMidias.status, 200);
  assert.equal(rMidias.json.result.isError, true);
  assert.match(rMidias.json.result.content[0].text, /mídias/i);

  // Edita título e ano
  const rEd = await callTool(kEscrita, 'editar_meme', {
    id: 'meme-para-editar',
    titulo: 'Título Depois',
    ano: 2012
  });
  assert.equal(rEd.status, 200);
  assert.equal(rEd.json.result.isError, false);
  const dados = JSON.parse(rEd.json.result.content[0].text);
  assert.equal(dados.meme.titulo, 'Título Depois');

  const [logEd] = await q("SELECT usuario_id, acao, detalhe FROM log_auditoria WHERE alvo = 'memes:meme-para-editar' AND acao = 'meme.editar'");
  assert.equal(Number(logEd.usuario_id), adminId);
  assert.equal(logEd.detalhe.via, 'mcp');
  assert.equal(Number(logEd.detalhe.chave_id), item.id);
  assert.deepEqual(logEd.detalhe.campos, {
    titulo: { de: 'Título Antes', para: 'Título Depois' },
    ano: { de: 2011, para: 2012 }
  });

  // Se nada mudou, não gera novo registro de log
  const totalLogsAntes = (await q("SELECT count(*)::int AS n FROM log_auditoria WHERE alvo = 'memes:meme-para-editar' AND acao = 'meme.editar'"))[0].n;
  const rMesmo = await callTool(kEscrita, 'editar_meme', {
    id: 'meme-para-editar',
    titulo: 'Título Depois'
  });
  assert.equal(rMesmo.status, 200);
  assert.equal(rMesmo.json.result.isError, false);
  const totalLogsDepois = (await q("SELECT count(*)::int AS n FROM log_auditoria WHERE alvo = 'memes:meme-para-editar' AND acao = 'meme.editar'"))[0].n;
  assert.equal(totalLogsDepois, totalLogsAntes);
});

test('editar_meme: não edita meme com status removido', { skip }, async () => {
  await criarAdmin('admEditRemovido');
  const { chave: kEscrita } = await criarChave('admEditRemovido', ['ler', 'escrever']);

  await q("INSERT INTO memes (id, titulo, ano, categoria, raridade, tipo, status) VALUES ('meme-removido', 'Removido', 2000, 'Vídeos', 'Comum', 'video', 'removido')");

  const r = await callTool(kEscrita, 'editar_meme', {
    id: 'meme-removido',
    titulo: 'Tentativa de Edição'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.result.isError, true);
  assert.match(r.json.result.content[0].text, /removido/);
});

test('publicar_meme: requer escopo publicar, muda oculto->publicado, já publicado retorna sem_mudanca, removido dá erro', { skip }, async () => {
  const adminId = await criarAdmin('admPubMeme');
  const { chave: kEscrita } = await criarChave('admPubMeme', ['ler', 'escrever']);
  const { chave: kPub, item } = await criarChave('admPubMeme', ['ler', 'escrever', 'publicar']);

  await callTool(kEscrita, 'criar_meme', {
    id: 'meme-para-publicar',
    titulo: 'Meme Para Publicar',
    ano: 2018,
    categoria: 'Vídeos',
    raridade: 'Comum'
  });

  // Sem escopo publicar
  const rSem = await callTool(kEscrita, 'publicar_meme', { id: 'meme-para-publicar' });
  assert.equal(rSem.status, 200);
  assert.equal(rSem.json.result.isError, true);
  assert.match(rSem.json.result.content[0].text, /falta o escopo publicar/);

  // Com escopo publicar
  const rPub = await callTool(kPub, 'publicar_meme', { id: 'meme-para-publicar' });
  assert.equal(rPub.status, 200);
  assert.equal(rPub.json.result.isError, false);
  const dPub = JSON.parse(rPub.json.result.content[0].text);
  assert.equal(dPub.meme.status, 'publicado');

  const [logPub] = await q("SELECT usuario_id, acao, detalhe FROM log_auditoria WHERE alvo = 'memes:meme-para-publicar' AND acao = 'meme.publicar'");
  assert.equal(Number(logPub.usuario_id), adminId);
  assert.equal(logPub.detalhe.via, 'mcp');
  assert.equal(Number(logPub.detalhe.chave_id), item.id);

  // Já publicado: sem_mudanca: true
  const rJaPub = await callTool(kPub, 'publicar_meme', { id: 'meme-para-publicar' });
  assert.equal(rJaPub.status, 200);
  assert.equal(rJaPub.json.result.isError, false);
  const dJa = JSON.parse(rJaPub.json.result.content[0].text);
  assert.equal(dJa.sem_mudanca, true);

  // Removido dá erro
  await q("UPDATE memes SET status = 'removido' WHERE id = 'meme-para-publicar'");
  const rRem = await callTool(kPub, 'publicar_meme', { id: 'meme-para-publicar' });
  assert.equal(rRem.status, 200);
  assert.equal(rRem.json.result.isError, true);
  assert.match(rRem.json.result.content[0].text, /removido/);
});

test('criar_carta: cria na próxima posição, valida coleção e meme_id, e grava no log', { skip }, async () => {
  const adminId = await criarAdmin('admCriaCarta');
  const { chave: kEscrita, item } = await criarChave('admCriaCarta', ['ler', 'escrever']);

  // Coleção existente do seed: 'ouro' ou a primeira de colecoes
  const [{ id: colId }] = await q('SELECT id FROM colecoes ORDER BY ordem LIMIT 1');

  const rCarta = await callTool(kEscrita, 'criar_carta', {
    colecao_id: colId,
    nome: 'Carta MCP Teste',
    raridade: 'Raro',
    meme_id: 'havaianas-de-pau'
  });
  assert.equal(rCarta.status, 200);
  assert.equal(rCarta.json.result.isError, false);
  const dCarta = JSON.parse(rCarta.json.result.content[0].text);
  assert.equal(dCarta.ok, true);
  assert.equal(dCarta.carta.nome, 'Carta MCP Teste');
  assert.equal(dCarta.carta.colecao_id, colId);

  const [logCarta] = await q(`SELECT usuario_id, acao, detalhe FROM log_auditoria WHERE alvo = 'cartas:${dCarta.carta.id}'`);
  assert.equal(Number(logCarta.usuario_id), adminId);
  assert.equal(logCarta.acao, 'carta.criar');
  assert.equal(logCarta.detalhe.via, 'mcp');
  assert.equal(Number(logCarta.detalhe.chave_id), item.id);

  // Coleção inexistente
  const rColErr = await callTool(kEscrita, 'criar_carta', {
    colecao_id: 'colecao-fantasma-xyz',
    nome: 'Outra Carta',
    raridade: 'Comum'
  });
  assert.equal(rColErr.status, 200);
  assert.equal(rColErr.json.result.isError, true);
  assert.match(rColErr.json.result.content[0].text, /coleção/i);

  // Meme_id inexistente
  const rMemeErr = await callTool(kEscrita, 'criar_carta', {
    colecao_id: colId,
    nome: 'Outra Carta',
    raridade: 'Comum',
    meme_id: 'meme-fantasma-123'
  });
  assert.equal(rMemeErr.status, 200);
  assert.equal(rMemeErr.json.result.isError, true);
  assert.match(rMemeErr.json.result.content[0].text, /meme/i);
});

test('escrita MCP: limite de 60 escritas por chave (rate limit extra), e chave revogada dá 401', { skip }, async () => {
  await criarAdmin('admRateEscrita');
  const { chave: kEscrita, item } = await criarChave('admRateEscrita', ['ler', 'escrever']);

  const { limited } = await import('../lib/http.js');
  for (let i = 0; i < 60; i++) {
    limited('mcpw:' + item.id, 60);
  }

  const rLim = await callTool(kEscrita, 'criar_meme', {
    id: 'meme-limite-escrita',
    titulo: 'Meme Limite',
    ano: 2020,
    categoria: 'Vídeos',
    raridade: 'Comum'
  });
  assert.equal(rLim.status, 200);
  assert.equal(rLim.json.result.isError, true);
  assert.match(rLim.json.result.content[0].text, /limite de escritas/);

  // Revoga chave -> próxima escrita dá 401
  await s.del('/api/admin/mcp/chaves/' + item.id, como('admRateEscrita'));
  const rRev = await callTool(kEscrita, 'criar_meme', {
    id: 'meme-pos-revogada',
    titulo: 'Meme Revogado',
    ano: 2020,
    categoria: 'Vídeos',
    raridade: 'Comum'
  });
  assert.equal(rRev.status, 401);
});

test('segredo da chave nunca aparece em log nem resposta das ferramentas de escrita', { skip }, async () => {
  await criarAdmin('admSegredoEscrita');
  const { chave: kEscrita } = await criarChave('admSegredoEscrita', ['ler', 'escrever']);

  const r = await callTool(kEscrita, 'criar_meme', {
    id: 'meme-segredo-teste',
    titulo: 'Meme Sem Segredo',
    ano: 2021,
    categoria: 'Vídeos',
    raridade: 'Comum'
  });
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(r.json).includes(kEscrita));

  const [log] = await q("SELECT detalhe FROM log_auditoria WHERE alvo = 'memes:meme-segredo-teste'");
  assert.ok(!JSON.stringify(log.detalhe).includes(kEscrita));
});
