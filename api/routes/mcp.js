// Endpoint MCP ("Streamable HTTP", JSON-RPC 2.0): POST /mcp e GET /mcp (405).
// Autenticação por Bearer ns_mcp_... com verificação de chave de API em cada chamada.
import { send, readBody, limited, ipDe } from '../lib/http.js';
import { chaveDoCabecalho, verificarChave } from '../mcp/chaves.js';
import { FERRAMENTAS, schemaDe } from '../mcp/registro.js';
import { FERRAMENTAS_MAP } from '../mcp/ferramentas.js';

const MCP_INSTRUCTIONS =
  'Use conferir_duplicado antes de criar qualquer meme. Consulte o llms.txt na aba MCP do painel para regras completas.';

function jsonRpcErro(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return {
    jsonrpc: '2.0',
    id: id !== undefined ? id : null,
    error: err
  };
}

function jsonRpcSucesso(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

export default function registrar(r) {
  // GET /mcp: 405 Method Not Allowed com Allow: POST (sem SSE)
  r.get('/mcp', async (ctx) => {
    send(ctx.res, 405, 'Method Not Allowed', { Allow: 'POST' });
  });

  // POST /mcp: MCP JSON-RPC 2.0
  r.post('/mcp', async (ctx) => {
    const { req, res, pool } = ctx;

    // 1) Origin check
    const origin = req.headers.origin;
    if (origin) {
      const origemEsperada = ctx.auth?.origemSite || '';
      if (origin !== origemEsperada) {
        return send(res, 403, { erro: 'origem não permitida' });
      }
    }

    // 2) Autenticação por chave MCP
    const chave = chaveDoCabecalho(req);
    const ip = ipDe(req);
    const autenticado = chave ? await verificarChave(pool, chave, { ip }) : null;

    if (!autenticado) {
      if (limited('mcpfalha:' + ip, 60)) {
        return send(res, 429, { erro: 'muitas tentativas com chave inválida, espere e tente de novo' });
      }
      return send(
        res,
        401,
        { erro: 'chave inválida, expirada ou revogada' },
        { 'WWW-Authenticate': 'Bearer' }
      );
    }

    // 3) Limite de uso por chave (600 requisições / 10 min = ~60/min)
    if (limited('mcp:' + autenticado.chave_id, 600)) {
      return send(res, 429, { erro: 'limite de uso da chave, espere e tente de novo' });
    }

    // 4) Leitura do corpo (JSON até 1 MB). Com Content-Length grande demais responde 413 sem ler nada.
    const MAX_CORPO = 1_000_000;
    const declarado = Number(req.headers['content-length'] || 0);
    if (declarado > MAX_CORPO) {
      return send(res, 413, { erro: 'corpo da requisição grande demais' }, { Connection: 'close' });
    }
    let rawBody;
    try {
      rawBody = await readBody(req, MAX_CORPO);
    } catch (e) {
      if (e.message === 'too-large') {
        // sem Content-Length (chunked): readBody já encerrou a conexão; a resposta é só de cortesia
        try { return send(res, 413, { erro: 'corpo da requisição grande demais' }, { Connection: 'close' }); } catch { return undefined; }
      }
      return send(res, 200, jsonRpcErro(null, -32700, 'Parse error: corpo inválido'));
    }

    let rpc;
    try {
      rpc = JSON.parse(rawBody);
    } catch {
      return send(res, 200, jsonRpcErro(null, -32700, 'Parse error: JSON inválido'));
    }

    // Batch não é suportado: erro -32600
    if (Array.isArray(rpc)) {
      return send(res, 200, jsonRpcErro(null, -32600, 'Invalid Request: batch não suportado'));
    }

    if (!rpc || typeof rpc !== 'object') {
      return send(res, 200, jsonRpcErro(null, -32600, 'Invalid Request: corpo deve ser objeto'));
    }

    const { id, method, params } = rpc;

    // Notificação JSON-RPC (sem id), como notifications/initialized: 202 sem corpo
    if (id === undefined) {
      res.writeHead(202, { 'Cache-Control': 'no-store' });
      return res.end();
    }

    // Métodos JSON-RPC
    switch (method) {
      case 'initialize': {
        const resultado = {
          protocolVersion: '2025-03-26',
          capabilities: {
            tools: { listChanged: false }
          },
          serverInfo: {
            name: 'naosalvo-mcp',
            version: '1.0.0'
          },
          instructions: MCP_INSTRUCTIONS
        };
        return send(res, 200, jsonRpcSucesso(id, resultado));
      }

      case 'ping': {
        return send(res, 200, jsonRpcSucesso(id, {}));
      }

      case 'tools/list': {
        const escopos = autenticado.escopos || [];
        const lista = FERRAMENTAS.filter((f) => f.ativa && escopos.includes(f.escopo)).map((f) => ({
          name: f.nome,
          description: f.resumo,
          inputSchema: schemaDe(f)
        }));
        return send(res, 200, jsonRpcSucesso(id, { tools: lista }));
      }

      case 'tools/call': {
        if (!params || typeof params !== 'object' || Array.isArray(params)) {
          return send(res, 200, jsonRpcErro(id, -32602, 'Invalid params: esperado objeto com { name, arguments }'));
        }

        const { name, arguments: args } = params;
        if (typeof name !== 'string') {
          return send(res, 200, jsonRpcErro(id, -32602, 'Invalid params: "name" deve ser texto'));
        }

        const def = FERRAMENTAS.find((f) => f.nome === name);
        if (!def || !def.ativa) {
          return send(res, 200, jsonRpcErro(id, -32602, `ferramenta inexistente ou inativa: ${name}`));
        }

        // Verifica escopo
        const escopos = autenticado.escopos || [];
        if (!escopos.includes(def.escopo)) {
          const resultado = {
            content: [{ type: 'text', text: `falta o escopo ${def.escopo}` }],
            isError: true
          };
          return send(res, 200, jsonRpcSucesso(id, resultado));
        }

        // Limite extra para ferramentas de escrita (escopo !== 'ler'): 60 escritas / 10 min
        if (def.escopo !== 'ler' && limited('mcpw:' + autenticado.chave_id, 60)) {
          const resultado = {
            content: [{ type: 'text', text: 'limite de escritas da chave, espere e tente de novo' }],
            isError: true
          };
          return send(res, 200, jsonRpcSucesso(id, resultado));
        }

        const fn = FERRAMENTAS_MAP[name];
        if (!fn) {
          return send(res, 200, jsonRpcErro(id, -32602, `ferramenta não implementada: ${name}`));
        }

        try {
          const toolCtx = {
            pool,
            mcp: {
              chave_id: autenticado.chave_id,
              usuario_id: autenticado.usuario_id,
              apelido: autenticado.apelido,
              escopos: autenticado.escopos
            }
          };
          const dados = await fn(pool, args || {}, toolCtx);
          const resultado = {
            content: [{ type: 'text', text: JSON.stringify(dados) }],
            isError: false
          };
          return send(res, 200, jsonRpcSucesso(id, resultado));
        } catch (e) {
          if (e.name === 'ErroArgumento') {
            const resultado = {
              content: [{ type: 'text', text: e.message }],
              isError: true
            };
            return send(res, 200, jsonRpcSucesso(id, resultado));
          }
          // Erro interno não vaza stack nem detalhes de banco
          return send(res, 200, jsonRpcErro(id, -32603, 'Internal error'));
        }
      }

      default: {
        return send(res, 200, jsonRpcErro(id, -32601, `Method not found: ${method}`));
      }
    }
  });
}
