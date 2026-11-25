// Monta a aplicação HTTP: roteador + módulos de rotas por assunto (api/routes/).
// Separado do server.js para os testes subirem a API com um pool próprio, sem migrar nem abrir a porta 3000.
import http from 'node:http';
import { criarRouter } from './lib/router.js';
import saude from './routes/saude.js';
import acervo from './routes/acervo.js';
import contribuidores from './routes/contribuidores.js';
import votos from './routes/votos.js';
import feedback from './routes/feedback.js';
import comentarios from './routes/comentarios.js';
import links from './routes/links.js';
import yt from './routes/yt.js';
import admin from './routes/admin.js';
import adminUsuarios from './routes/admin-usuarios.js';
import adminAcervo from './routes/admin-acervo.js';
import envios from './routes/envios.js';
import adminMcp from './routes/admin-mcp.js';
import economia from './routes/economia.js';
import authRotas from './routes/auth.js';
import sobedesce from './routes/sobedesce.js';
import memepedia from './routes/memepedia.js';
import perfis from './routes/perfis.js';

// auth = { discord: config | null, fetch, cookieSecure, origemSite }  (ver routes/auth.js e auth/discord.js)
export function criarApp({ pool, adminToken = '', ytKey = '', autenticar = null, auth = {} } = {}) {
  const cfgAuth = { discord: null, fetch: globalThis.fetch, cookieSecure: true, origemSite: '', ...auth };
  const router = criarRouter({ pool, adminToken, autenticar, extras: { ytKey, auth: cfgAuth } });
  for (const modulo of [saude, acervo, contribuidores, votos, feedback, comentarios, links, yt, authRotas, economia, sobedesce, memepedia, perfis, admin, adminUsuarios, adminAcervo, envios, adminMcp]) modulo(router);
  return { router, server: http.createServer((req, res) => router.tratar(req, res)) };
}
