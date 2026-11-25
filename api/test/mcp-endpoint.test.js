// Testes do endpoint /mcp (JSON-RPC 2.0 sobre Streamable HTTP) e das ferramentas de leitura.
// Banco real descartável (pulado sem TEST_DB_NAME).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servidor, bancoDeTeste, semBanco } from './helpers.js';
import { criarAutenticadorStub } from '../auth-stub.js';
import { normalizarTexto, extrairPalavras, calcularJaccard } from '../mcp/ferramentas.js';

// ---- testes de unidade puros ----
test('similaridade de palavras (Jaccard e normalização)', () => {
  assert.equal(normalizarTexto('Havaianas de Pau!!'), 'havaianas de pau');
  const p1 = extrairPalavras('Havaianas de Pau');
  assert.deepEqual([...p1].sort(), ['havaianas', 'pau']); // 'de' tem 2 letras, ignorada

  const p2 = extrairPalavras('Havaianas de Pau Oficial');
  // intersecção = {havaianas, pau} (2), união = {havaianas, pau, oficial} (3) => 2/3 = 0.666...
  const j = calcularJaccard(p1, p2);
  assert.ok(j >= 0.6, 'jaccard deve ser >= 0.6: ' + j);

  const p3 = extrairPalavras('Totalmente Diferente');
  assert.equal(calcularJaccard(p1, p3), 0);
});

// ---- testes com banco ----
const skip = semBanco();
let db, s;
const como = (apelido) => ({ headers: { 'X-Test-User': apelido } });
const q = async (sql, v = []) => (await db.pool.query(sql, v)).rows;

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

async function criarAdmin(apelido = 'adminMcp') {
  await s.get('/api/eu', como(apelido));
  const [{ id }] = await q('SELECT id FROM usuarios WHERE lower(apelido) = lower($1)', [apelido]);
  await q("UPDATE usuarios SET papel = 'admin' WHERE id = $1", [id]);
  return Number(id);
}

async function criarChave(adminApelido, escopos = ['ler', 'escrever']) {
  const r = await s.post('/api/admin/mcp/chaves', { nome: 'Chave Teste', escopos }, como(adminApelido));
  assert.equal(r.status, 201, 'criação de chave falhou');
  return { chave: r.json.chave, item: r.json.item };
}

const authHeader = (chave) => ({ Authorization: 'Bearer ' + chave });

test('GET /mcp responde 405 Method Not Allowed com header Allow: POST', { skip }, async () => {
  const r = await s.get('/mcp');
  assert.equal(r.status, 405);
  assert.equal(r.headers.get('allow'), 'POST');
});

test('POST /mcp: 401 sem chave, com formato inválido, inexistente, expirada, revogada ou dono sem admin (com WWW-Authenticate)', { skip }, async () => {
  const rSem = await s.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' });
  assert.equal(rSem.status, 401);
  assert.equal(rSem.headers.get('www-authenticate'), 'Bearer');
  assert.deepEqual(rSem.json, { erro: 'chave inválida, expirada ou revogada' });

  const rFormato = await s.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: { Authorization: 'Bearer chave_invalida' } });
  assert.equal(rFormato.status, 401);
  assert.equal(rFormato.headers.get('www-authenticate'), 'Bearer');

  await criarAdmin('admCheck');
  const { chave, item } = await criarChave('admCheck');

  // Chave válida funciona
  const rOk = await s.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: authHeader(chave) });
  assert.equal(rOk.status, 200);

  // Expira chave
  await q("UPDATE chaves_api SET expira_em = now() - interval '1 day' WHERE id = $1", [item.id]);
  const rExp = await s.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: authHeader(chave) });
  assert.equal(rExp.status, 401);
  assert.equal(rExp.headers.get('www-authenticate'), 'Bearer');

  // Restaura e revoga
  await q("UPDATE chaves_api SET expira_em = now() + interval '10 days' WHERE id = $1", [item.id]);
  await s.del('/api/admin/mcp/chaves/' + item.id, como('admCheck'));
  const rRev = await s.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: authHeader(chave) });
  assert.equal(rRev.status, 401);

  // Nova chave, depois rebaixa o dono
  const { chave: chave2 } = await criarChave('admCheck');
  await q("UPDATE usuarios SET papel = 'usuario' WHERE lower(apelido) = 'admcheck'");
  const rReb = await s.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: authHeader(chave2) });
  assert.equal(rReb.status, 401);

  // Restaura dono para outros testes
  await q("UPDATE usuarios SET papel = 'admin' WHERE lower(apelido) = 'admcheck'");
});

test('POST /mcp: validação de Origin (403 se diferente de auth.origemSite, sucesso se bater ou sem Origin)', { skip }, async () => {
  await criarAdmin('admOrigin');
  const { chave } = await criarChave('admOrigin');

  // Origin inválido -> 403
  const rErr = await s.post(
    '/mcp',
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    { headers: { ...authHeader(chave), Origin: 'https://site-malicioso.com' } }
  );
  assert.equal(rErr.status, 403);
  assert.deepEqual(rErr.json, { erro: 'origem não permitida' });

  // Origin correto -> 200
  const rCerto = await s.post(
    '/mcp',
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    { headers: { ...authHeader(chave), Origin: 'https://naosalvo.teste' } }
  );
  assert.equal(rCerto.status, 200);

  // Sem Origin (cliente CLI padrão) -> 200
  const rSem = await s.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: authHeader(chave) });
  assert.equal(rSem.status, 200);
});

test('POST /mcp: JSON-RPC initialize, ping, notificação (202) e métodos desconhecidos (-32601)', { skip }, async () => {
  await criarAdmin('admProto');
  const { chave } = await criarChave('admProto');

  // initialize
  const rInit = await s.post(
    '/mcp',
    { jsonrpc: '2.0', id: 'init-1', method: 'initialize', params: {} },
    { headers: authHeader(chave) }
  );
  assert.equal(rInit.status, 200);
  assert.equal(rInit.json.jsonrpc, '2.0');
  assert.equal(rInit.json.id, 'init-1');
  assert.equal(rInit.json.result.protocolVersion, '2025-03-26');
  assert.equal(rInit.json.result.serverInfo.name, 'naosalvo-mcp');
  assert.ok(rInit.json.result.instructions.includes('conferir_duplicado'));

  // ping
  const rPing = await s.post(
    '/mcp',
    { jsonrpc: '2.0', id: 42, method: 'ping' },
    { headers: authHeader(chave) }
  );
  assert.equal(rPing.status, 200);
  assert.deepEqual(rPing.json, { jsonrpc: '2.0', id: 42, result: {} });

  // notificação (sem id) -> HTTP 202 sem corpo
  const rNotif = await s.post(
    '/mcp',
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { headers: authHeader(chave) }
  );
  assert.equal(rNotif.status, 202);
  assert.equal(rNotif.json, '');

  // método desconhecido -> erro -32601
  const rDesc = await s.post(
    '/mcp',
    { jsonrpc: '2.0', id: 99, method: 'metodo_fantasma' },
    { headers: authHeader(chave) }
  );
  assert.equal(rDesc.status, 200);
  assert.equal(rDesc.json.error.code, -32601);
});

test('POST /mcp: erros de protocolo (JSON inválido -32700, batch -32600, corpo não-objeto)', { skip }, async () => {
  await criarAdmin('admProtoErr');
  const { chave } = await criarChave('admProtoErr');

  // Batch (array) -> -32600
  const rBatch = await s.post(
    '/mcp',
    [{ jsonrpc: '2.0', id: 1, method: 'ping' }],
    { headers: authHeader(chave) }
  );
  assert.equal(rBatch.status, 200);
  assert.equal(rBatch.json.error.code, -32600);

  // JSON quebrado via raw fetch
  const resRaw = await fetch(s.base + '/mcp', {
    method: 'POST',
    headers: { ...authHeader(chave), 'Content-Type': 'application/json' },
    body: '{"jsonrpc": "2.0", id: '
  });
  const jsonRaw = await resRaw.json();
  assert.equal(resRaw.status, 200);
  assert.equal(jsonRaw.error.code, -32700);

  // Corpo primitivo (ex: número ou string json)
  const resPrim = await fetch(s.base + '/mcp', {
    method: 'POST',
    headers: { ...authHeader(chave), 'Content-Type': 'application/json' },
    body: '123'
  });
  const jsonPrim = await resPrim.json();
  assert.equal(resPrim.status, 200);
  assert.equal(jsonPrim.error.code, -32600);
});

test('POST /mcp: tools/list lista apenas ferramentas ativas que a chave tem escopo para usar', { skip }, async () => {
  await criarAdmin('admToolsList');
  const { chave: chaveLer } = await criarChave('admToolsList', ['ler']);

  const r = await s.post(
    '/mcp',
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { headers: authHeader(chaveLer) }
  );
  assert.equal(r.status, 200);
  const tools = r.json.result.tools;
  assert.equal(tools.length, 5);
  const nomes = tools.map((t) => t.name).sort();
  assert.deepEqual(nomes, ['buscar_cartas', 'buscar_memes', 'conferir_duplicado', 'listar_referencias', 'obter_meme']);

  for (const t of tools) {
    assert.ok(t.description);
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(t.inputSchema.additionalProperties, false);
    assert.ok(typeof t.inputSchema.properties === 'object');
  }
});

test('POST /mcp: tools/call listar_referencias retorna categorias, eras, coleções, raridades e limites', { skip }, async () => {
  await criarAdmin('admRef');
  const { chave } = await criarChave('admRef', ['ler']);

  const r = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 'call-ref',
      method: 'tools/call',
      params: { name: 'listar_referencias', arguments: {} }
    },
    { headers: authHeader(chave) }
  );
  assert.equal(r.status, 200);
  assert.equal(r.json.result.isError, false);
  const dados = JSON.parse(r.json.result.content[0].text);
  assert.ok(Array.isArray(dados.categorias) && dados.categorias.length >= 7);
  assert.ok(Array.isArray(dados.eras) && dados.eras.length >= 5);
  assert.ok(Array.isArray(dados.colecoes) && dados.colecoes.length >= 8);
  assert.deepEqual(dados.raridades_meme, ['Comum', 'Relevante', 'Raro', 'Relíquia', 'Lendário', 'Mítico', 'Clássico']);
  assert.deepEqual(dados.raridades_carta, ['Comum', 'Relevante', 'Raro', 'Relíquia', 'Lendário', 'Mítico']);
  assert.deepEqual(dados.status_meme, ['publicado', 'oculto', 'removido']);
  assert.equal(dados.limites.titulo, 200);
});

test('POST /mcp: tools/call buscar_memes acha havaianas-de-pau, filtra por ano e categoria, e escapa % e _', { skip }, async () => {
  await criarAdmin('admBusca');
  const { chave } = await criarChave('admBusca', ['ler']);

  // Busca simples por substring
  const rHavaianas = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'buscar_memes', arguments: { busca: 'havaianas' } }
    },
    { headers: authHeader(chave) }
  );
  assert.equal(rHavaianas.status, 200);
  const dH = JSON.parse(rHavaianas.json.result.content[0].text);
  assert.ok(dH.total >= 1);
  const memeH = dH.itens.find((m) => m.id === 'havaianas-de-pau');
  assert.ok(memeH);
  assert.equal(memeH.ano, 2004);
  assert.equal(memeH.youtube_id, 'I8MC6-BuU28');

  // Filtro por ano e categoria
  const rFiltro = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'buscar_memes', arguments: { ano: 2004, categoria: 'Vídeos' } }
    },
    { headers: authHeader(chave) }
  );
  const dF = JSON.parse(rFiltro.json.result.content[0].text);
  assert.ok(dF.itens.every((m) => m.ano === 2004 && m.categoria === 'Vídeos'));

  // Caracteres % e _ não funcionam como curingas
  const rCuringa = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'buscar_memes', arguments: { busca: 'Hava_anas%Pau' } }
    },
    { headers: authHeader(chave) }
  );
  const dC = JSON.parse(rCuringa.json.result.content[0].text);
  assert.equal(dC.total, 0);

  // limite acima de 50 vira isError
  const rLimiteErr = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'buscar_memes', arguments: { limite: 51 } }
    },
    { headers: authHeader(chave) }
  );
  assert.equal(rLimiteErr.status, 200);
  assert.equal(rLimiteErr.json.result.isError, true);
  assert.match(rLimiteErr.json.result.content[0].text, /limite/);
});

test('POST /mcp: tools/call conferir_duplicado acha youtube_id I8MC6-BuU28 (youtu.be), envios abertos e títulos parecidos', { skip }, async () => {
  await criarAdmin('admDup');
  const { chave } = await criarChave('admDup', ['ler']);

  // Detecta meme existente pelo youtube_id mesmo com link youtu.be
  const rYt = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'conferir_duplicado', arguments: { url: 'https://youtu.be/I8MC6-BuU28' } }
    },
    { headers: authHeader(chave) }
  );
  assert.equal(rYt.status, 200);
  const dYt = JSON.parse(rYt.json.result.content[0].text);
  assert.equal(dYt.duplicado, true);
  const motYt = dYt.motivos.find((m) => m.tipo === 'mesmo_video');
  assert.ok(motYt);
  assert.equal(motYt.meme_id, 'havaianas-de-pau');

  // Insere um envio aberto para testar checagem de envio
  const adminId = await criarAdmin('admEnv');
  await q(
    `INSERT INTO envios (usuario_id, titulo, ano, categoria, url, url_normalizada, status)
     VALUES ($1, 'Dança do Quadrado Original', 2008, 'Música', 'https://exemplo.com/danca', 'exemplo.com/danca', 'aberto')`,
    [adminId]
  );

  // Checa mesmo link de envio
  const rEnvLink = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'conferir_duplicado', arguments: { url: 'https://exemplo.com/danca' } }
    },
    { headers: authHeader(chave) }
  );
  const dEnvLink = JSON.parse(rEnvLink.json.result.content[0].text);
  assert.equal(dEnvLink.duplicado, true);
  assert.ok(dEnvLink.motivos.some((m) => m.tipo === 'mesmo_link'));

  // Checa título parecido (Jaccard >= 0.6)
  // "Dança do Quadrado Oficial" vs "Dança do Quadrado Original"
  // palavras com 3+ letras: {danca, quadrado, oficial} vs {danca, quadrado, original} => 2/4 = 0.5 (não dá 0.6)
  // Mas "Dança do Quadrado": {danca, quadrado} vs {danca, quadrado, original} => 2/3 = 0.666... (dá >= 0.6)
  const rParecido = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'conferir_duplicado', arguments: { titulo: 'Dança do Quadrado' } }
    },
    { headers: authHeader(chave) }
  );
  const dPar = JSON.parse(rParecido.json.result.content[0].text);
  assert.equal(dPar.duplicado, true);
  assert.ok(dPar.motivos.some((m) => m.tipo === 'titulo_parecido'));

  // Título idêntico (sem acento, minúsculas)
  const rIgual = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'conferir_duplicado', arguments: { titulo: 'danca do quadrado original' } }
    },
    { headers: authHeader(chave) }
  );
  const dIgual = JSON.parse(rIgual.json.result.content[0].text);
  assert.equal(dIgual.duplicado, true);
  assert.ok(dIgual.motivos.some((m) => m.tipo === 'titulo_igual'));
});

test('POST /mcp: validação de argumentos inválidos vira isError; ferramenta inexistente/inativa vira -32602', { skip }, async () => {
  await criarAdmin('admArgs');
  const { chave } = await criarChave('admArgs', ['ler']);

  // Campo desconhecido
  const rDesconhecido = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'listar_referencias', arguments: { campo_fantasma: 123 } }
    },
    { headers: authHeader(chave) }
  );
  assert.equal(rDesconhecido.status, 200);
  assert.equal(rDesconhecido.json.result.isError, true);
  assert.match(rDesconhecido.json.result.content[0].text, /campo desconhecido/);

  // Tipo errado
  const rTipo = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'buscar_memes', arguments: { ano: 'dois mil e quatro' } }
    },
    { headers: authHeader(chave) }
  );
  assert.equal(rTipo.status, 200);
  assert.equal(rTipo.json.result.isError, true);
  assert.match(rTipo.json.result.content[0].text, /ano/);

  // Ferramenta inexistente -> -32602
  const rInexistente = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'ferramenta_que_nao_existe', arguments: {} }
    },
    { headers: authHeader(chave) }
  );
  assert.equal(rInexistente.status, 200);
  assert.equal(rInexistente.json.error.code, -32602);

  // Ferramenta inativa ou inexistente -> -32602 (hoje todas as do registro estão ativas: usa um nome que não existe)
  const rInativa = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'ferramenta_inativa_xyz', arguments: {} }
    },
    { headers: authHeader(chave) }
  );
  assert.equal(rInativa.status, 200);
  assert.equal(rInativa.json.error.code, -32602);
});

test('POST /mcp: falta de escopo devolve isError HTTP 200 com "falta o escopo X" (não erro de protocolo)', { skip }, async () => {
  await criarAdmin('admEscopo');
  // Chave sem escopo 'ler' (apenas 'escrever', embora no admin 'escrever' inclua 'ler', vamos forçar no banco)
  const { chave, item } = await criarChave('admEscopo', ['ler']);
  await q("UPDATE chaves_api SET escopos = '{\"escrever\"}'::text[] WHERE id = $1", [item.id]);

  const r = await s.post(
    '/mcp',
    {
      jsonrpc: '2.0',
      id: 'no-scope',
      method: 'tools/call',
      params: { name: 'buscar_memes', arguments: {} }
    },
    { headers: authHeader(chave) }
  );
  assert.equal(r.status, 200);
  assert.equal(r.json.result.isError, true);
  assert.equal(r.json.result.content[0].text, 'falta o escopo ler');
});

test('POST /mcp: corpo maior que 1 MB responde HTTP 413', { skip }, async () => {
  await criarAdmin('admLarge');
  const { chave } = await criarChave('admLarge', ['ler']);

  const payloadGigante = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'ping',
    lixo: 'x'.repeat(1_050_000)
  });

  // O servidor recusa pelo Content-Length sem ler o corpo e fecha a conexão: dependendo de quanto o cliente já enviou,
  // ele recebe o 413 ou um "connection reset". Os dois valem como recusa; o que importa é não processar e continuar de pé.
  let recusado = false;
  try {
    const res = await fetch(s.base + '/mcp', {
      method: 'POST',
      headers: { ...authHeader(chave), 'Content-Type': 'application/json' },
      body: payloadGigante
    });
    assert.equal(res.status, 413);
    assert.equal((await res.json()).erro, 'corpo da requisição grande demais');
    recusado = true;
  } catch (e) {
    if (e instanceof assert.AssertionError) throw e;
    recusado = /fetch failed|ECONNRESET|socket/i.test(String(e && (e.cause || e)));
  }
  assert.ok(recusado, 'corpo grande deve ser recusado (413 ou conexão encerrada)');
  const vivo = await s.post('/mcp', { jsonrpc: '2.0', id: 9, method: 'ping' }, { headers: authHeader(chave) });
  assert.equal(vivo.status, 200, 'o servidor segue atendendo depois da recusa');
});

test('POST /mcp: rate limit 429 após mais de 600 chamadas na mesma chave', { skip }, async () => {
  await criarAdmin('admRate');
  const { chave, item } = await criarChave('admRate', ['ler']);

  // Realiza requisições até passar o limite
  // Para ser rápido e evitar 600 chamadas de rede lentas, simulamos preenchendo o rate limiter ou executando
  const { limited } = await import('../lib/http.js');
  for (let i = 0; i < 600; i++) {
    limited('mcp:' + item.id, 600);
  }

  const r = await s.post(
    '/mcp',
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    { headers: authHeader(chave) }
  );
  assert.equal(r.status, 429);
  assert.deepEqual(r.json, { erro: 'limite de uso da chave, espere e tente de novo' });
});

test('POST /mcp: segredo da chave nunca aparece em nenhuma resposta', { skip }, async () => {
  await criarAdmin('admSegredo');
  const { chave } = await criarChave('admSegredo', ['ler']);

  const rPing = await s.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: authHeader(chave) });
  assert.ok(!JSON.stringify(rPing.json).includes(chave));

  const rRef = await s.post(
    '/mcp',
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'listar_referencias', arguments: {} } },
    { headers: authHeader(chave) }
  );
  assert.ok(!JSON.stringify(rRef.json).includes(chave));
});

test('POST /mcp: chave inválida repetida do mesmo IP leva a 429 (limite de falhas, sem martelar o banco)', { skip }, async () => {
  const { limited } = await import('../lib/http.js');
  // 127.0.0.1 é o IP do teste; enche a janela de falhas e confere o 429 na próxima chave errada
  for (let i = 0; i < 60; i++) limited('mcpfalha:127.0.0.1', 60);
  const r = await s.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { headers: { Authorization: 'Bearer ns_mcp_' + 'A'.repeat(43) } });
  assert.equal(r.status, 429);
  assert.match(r.json.erro, /muitas tentativas com chave inválida/);
});
