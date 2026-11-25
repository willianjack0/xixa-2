// API do Não Salvo — Node puro + pg. Segredos via *_FILE (Docker secrets).
// Rotas por assunto em routes/, roteador em lib/router.js, montagem em app.js.
import { migrar, segredo, criarPoolDoAmbiente } from './migrate.js';
import { criarApp } from './app.js';
import { criarAutenticadorStub } from './auth-stub.js';
import { criarAutenticador } from './auth/autenticador.js';
import { lerConfigDiscord } from './auth/discord.js';
import { limparExpiradas } from './auth/sessao.js';
import { agendarLimpezaEventosIp } from './lib/limpeza.js';

// falha ANTES de tocar no banco se o stub estiver ligado fora da allowlist (ver auth-stub.js)
const stub = criarAutenticadorStub();

const pool = criarPoolDoAmbiente();

// esquema do banco: migrações numeradas em api/migrations/ (executor em migrate.js)
await migrar(pool);

// login com Discord: segredos só por arquivo (DISCORD_CLIENT_ID_FILE, DISCORD_CLIENT_SECRET_FILE, DISCORD_GUILD_ID_FILE)
const discord = lerConfigDiscord();
const cookieSecure = process.env.COOKIE_SECURE !== '0'; // só desligue em teste/local sem HTTPS
const origemSite = process.env.SITE_ORIGIN || (discord ? new URL(discord.redirectUri).origin : '');
console.log(discord ? `login Discord: configurado (callback ${discord.redirectUri})` : 'login Discord: NÃO configurado (rotas /api/auth/discord respondem 503)');

// sessões expiradas: limpa na subida e a cada hora (a leitura já ignora as expiradas)
const limpar = () => limparExpiradas(pool).then((n) => n && console.log(`sessões expiradas removidas: ${n}`)).catch((e) => console.error('limpeza de sessões falhou:', e.message));
await limpar();
setInterval(limpar, 3_600_000).unref();

const { server } = criarApp({
  pool,
  adminToken: segredo('ADMIN_TOKEN'),
  ytKey: segredo('YT_API_KEY'), // opcional: sem chave, /api/yt-stats devolve {}
  autenticar: criarAutenticador({ stub, cookieSecure }), // sessão do login Discord; o stub só existe em dev/teste (allowlist)
  auth: { discord, cookieSecure, origemSite }
});
agendarLimpezaEventosIp(pool); // apaga eventos_meme_ip antigos: já no boot e a cada 6h
server.listen(3000, () => console.log('naosalvo-api :3000'));
