// Login com Discord (OAuth2, scope identify). Funções puras + chamadas HTTP injetáveis (fetch) para teste sem rede.
// Segredos só por arquivo (*_FILE); nada daqui é logado: nem client secret, nem code, nem access token.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { segredo } from '../lib/config.js';
import { stubPermitido } from '../auth-stub.js';

const API = 'https://discord.com/api/v10';
export const AUTORIZAR = 'https://discord.com/oauth2/authorize';
const TIMEOUT_MS = 8000;

/**
 * Lê a configuração. Devolve null se faltar client id/secret/redirect (rotas respondem 503, o resto da API segue).
 *  DISCORD_CLIENT_ID_FILE, DISCORD_CLIENT_SECRET_FILE (obrigatórios), DISCORD_GUILD_ID_FILE (opcional).
 *  O client secret SÓ vem de arquivo (*_FILE) fora de dev/test: a variável DISCORD_CLIENT_SECRET é ignorada em produção
 *  (aparece em `docker inspect` e em dumps de ambiente). Em dev/test (allowlist do auth-stub) a variável vale, por conveniência.
 *  DISCORD_REDIRECT_URI (env), DISCORD_EXIGIR_MEMBRO=1 (opcional: só entra quem está no servidor do guild; pede o scope guilds).
 */
export function lerConfigDiscord(env = process.env) {
  const devOuTeste = stubPermitido(env);
  if (!env.DISCORD_CLIENT_SECRET_FILE && env.DISCORD_CLIENT_SECRET && !devOuTeste) {
    console.warn('DISCORD_CLIENT_SECRET por variável de ambiente é ignorado fora de dev/test: use DISCORD_CLIENT_SECRET_FILE (Docker secret)');
  }
  const clientId = segredo('DISCORD_CLIENT_ID', env);
  const clientSecret = env.DISCORD_CLIENT_SECRET_FILE || devOuTeste ? segredo('DISCORD_CLIENT_SECRET', env) : '';
  const redirectUri = String(env.DISCORD_REDIRECT_URI || '').trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  let u; try { u = new URL(redirectUri); } catch { return null; }
  if (u.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return null; // https obrigatório fora de localhost
  const guildId = segredo('DISCORD_GUILD_ID', env) || null;
  return { clientId, clientSecret, redirectUri, guildId, exigirMembro: env.DISCORD_EXIGIR_MEMBRO === '1' && !!guildId };
}

// ---- redirect de volta: só caminhos relativos do próprio site ----
const CONTROLE = /[\u0000-\u0020\u007f-\u009f\u2028\u2029]/; // controle, espaço, CR/LF, NEL, separadores de linha

function decodificar(s) { try { return decodeURIComponent(s); } catch { return null; } }

/**
 * Devolve o MESMO valor se for um caminho relativo do próprio site; senão `padrao` ("/").
 * Nunca devolve uma versão "normalizada": o que não é inequívoco é recusado.
 * Recusa: o que não começa com um "/" só; "//" em qualquer ponto do caminho (inclusive depois de decodificar %2f);
 * segmentos "." e ".." (inclusive %2e); barra invertida (inclusive %5c); espaço, controle e CR/LF (inclusive %0d%0a);
 * esquema/host; valores > 300 caracteres. A decodificação é conferida em até 2 níveis (%252f).
 */
export function caminhoSeguro(valor, padrao = '/') {
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > 300) return padrao;
  if (!valor.startsWith('/') || valor.startsWith('//')) return padrao;
  const bruto = valor.split(/[?#]/, 1)[0]; // caminho sem query e hash
  let nivel = valor;
  let nivelCaminho = bruto;
  for (let n = 0; n < 3; n++) {  // bruto, decodificado 1x, decodificado 2x
    if (nivel.includes('\\') || CONTROLE.test(nivel)) return padrao;
    if (nivelCaminho.includes('//')) return padrao;
    if (nivelCaminho.split('/').some((seg) => seg === '.' || seg === '..')) return padrao;
    if (!nivelCaminho.startsWith('/')) return padrao;
    const proximo = decodificar(nivel), proximoCaminho = decodificar(nivelCaminho);
    if (proximo === null || proximoCaminho === null) return n === 0 ? padrao : valor; // %-inválido no 1º nível = recusa
    if (proximo === nivel) break;
    nivel = proximo; nivelCaminho = proximoCaminho;
  }
  try {
    const u = new URL(valor, 'https://site.invalid');
    if (u.origin !== 'https://site.invalid') return padrao;
    if (u.pathname !== bruto && u.pathname !== encodeURI(decodificar(bruto) ?? bruto)) return padrao; // o navegador reescreveria o caminho
  } catch { return padrao; }
  return valor;
}

/** Acrescenta ?chave=valor a um caminho já validado e REVALIDA o resultado; se não passar, cai em "/?chave=valor". */
export function comParametro(caminho, chave, valor) {
  const u = new URL(caminhoSeguro(caminho), 'https://site.invalid');
  u.searchParams.set(chave, valor);
  const montado = u.pathname + u.search + u.hash;
  return caminhoSeguro(montado, null) ?? `/?${new URLSearchParams({ [chave]: valor })}`;
}

// ---- state anti-CSRF: cookie ns_oauth = "<state>.<voltar b64>.<emitido em s>.<hmac>" ----
// O cookie é assinado com HMAC-SHA256 (chave derivada do client secret) e carrega a hora de emissão: o servidor
// recusa adulteração e cookie com mais de 10 minutos, mesmo que o navegador o mantenha.
export const VALIDADE_STATE_S = 600;
export const chaveDoState = (cfg) => createHmac('sha256', cfg.clientSecret).update('ns-oauth-state').digest();
export const novoState = () => randomBytes(16).toString('base64url');
const assinar = (chave, corpo) => createHmac('sha256', chave).update(corpo).digest('base64url');

export function empacotarState(state, voltar, chave, agoraMs = Date.now()) {
  const corpo = `${state}.${Buffer.from(voltar).toString('base64url')}.${Math.floor(agoraMs / 1000)}`;
  return `${corpo}.${assinar(chave, corpo)}`;
}

/** { state, voltar } ou null (formato ruim, assinatura inválida, expirado ou vindo do futuro). */
export function desempacotarState(valor, chave, agoraMs = Date.now()) {
  const partes = String(valor || '').split('.');
  if (partes.length !== 4) return null;
  const [state, voltarB64, ts, mac] = partes;
  if (!state || !/^\d{1,12}$/.test(ts)) return null;
  const esperado = Buffer.from(assinar(chave, `${state}.${voltarB64}.${ts}`)), recebido = Buffer.from(mac);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;
  const idade = Math.floor(agoraMs / 1000) - Number(ts);
  if (idade > VALIDADE_STATE_S || idade < -60) return null;
  try { return { state, voltar: Buffer.from(voltarB64, 'base64url').toString('utf8') }; } catch { return null; }
}

export function stateConfere(esperado, recebido) {
  const a = Buffer.from(String(esperado || '')), b = Buffer.from(String(recebido || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function urlDeAutorizacao(cfg, state) {
  const p = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code',
    scope: cfg.exigirMembro ? 'identify guilds' : 'identify', state
  });
  return `${AUTORIZAR}?${p}`;
}

// ---- chamadas ao Discord (fetchFn injetável) ----
export class ErroDiscord extends Error {}

async function chamar(fetchFn, url, opcoes, o) {
  let r;
  try { r = await fetchFn(url, { ...opcoes, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
  catch (e) { throw new ErroDiscord(`${o}: sem resposta (${e.name})`); }
  if (!r.ok) throw new ErroDiscord(`${o}: HTTP ${r.status}`); // só o status; o corpo pode ter dados sensíveis
  try { return await r.json(); } catch { throw new ErroDiscord(`${o}: resposta inválida`); }
}

export async function trocarCodigo(cfg, code, fetchFn = fetch) {
  const j = await chamar(fetchFn, `${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64') },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri })
  }, 'troca do código');
  if (typeof j.access_token !== 'string' || !j.access_token) throw new ErroDiscord('troca do código: sem access_token');
  return j.access_token;
}

// ---- foto de perfil: URL montada AQUI, só de id e hash validados ----
const ID_DISCORD = /^[0-9]{5,25}$/;
const HASH_AVATAR = /^[a-f0-9_]{1,64}$/;
/** https://cdn.discordapp.com/avatars/<id>/<hash>.png?size=128, ou null (sem foto, id ou hash fora do formato). Sempre png, nunca o avatar padrão. */
export function urlDoAvatar(id, hash) {
  if (typeof id !== 'string' || typeof hash !== 'string') return null;
  if (!ID_DISCORD.test(id) || !HASH_AVATAR.test(hash)) return null;
  return `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128`;
}

export async function buscarPerfil(accessToken, fetchFn = fetch) {
  const j = await chamar(fetchFn, `${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } }, 'perfil');
  if (!/^\d{5,25}$/.test(String(j.id || ''))) throw new ErroDiscord('perfil: id inválido');
  const id = String(j.id);
  return { id, username: String(j.username || ''), global_name: j.global_name ? String(j.global_name) : null, avatar_url: urlDoAvatar(id, j.avatar) };
}

export async function ehMembro(accessToken, guildId, fetchFn = fetch) {
  const lista = await chamar(fetchFn, `${API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${accessToken}` } }, 'servidores');
  return Array.isArray(lista) && lista.some((g) => String(g.id) === String(guildId));
}

// ---- usuário: apelido único e gato inicial ----
/** Apelido válido (3 a 20 de [A-Za-z0-9_.-]) derivado do nome do Discord; sufixo numérico quando já existe. */
import { ehReservado } from './apelidos.js';

// Reservado não se resolve com número (variantes com número no fim também são reservadas): ganha o sufixo "_gato".
const fugirDeReservado = (n) => (ehReservado(n) ? n.slice(0, 15).replace(/[_.-]+$/, '') + '_gato' : n);

export function gerarApelido(base, tentativa = 0) {
  let b = String(base || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^[_.-]+|[_.-]+$/g, '').replace(/_{2,}/g, '_');
  if (b.length < 3) b = (b + 'gato').slice(0, 8);
  b = fugirDeReservado(b.slice(0, 20));
  if (tentativa === 0) return b;
  const sufixo = tentativa < 100 ? String(tentativa + 1) : String(Math.floor(1000 + Math.random() * 9000));
  return fugirDeReservado(b.slice(0, 20 - sufixo.length) + sufixo);
}

/** Gato inicial: determinístico pelo id do Discord, mesmas faixas do criador de gato (common.js / álbum). */
export function gatoInicial(discordId) {
  const h = createHash('sha256').update('gato:' + discordId).digest();
  return { fur: h[0] % 10, pat: h[1] % 5, eye: h[2] % 5, acc: h[3] % 9, clo: h[4] % 7, bg: h[5] % 8 };
}

/** Acha ou cria o usuário do Discord. Devolve { id, apelido, banido, novo }. Não mexe em sessão. */
export async function acharOuCriarUsuario(pool, perfil) {
  const nomeExibicao = (perfil.global_name || perfil.username || '').slice(0, 64) || null;
  for (let tentativa = 0; tentativa < 30; tentativa++) {
    const { rows: ex } = await pool.query(
      `SELECT u.id, u.apelido, u.banido FROM contas_oauth c JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.provedor = 'discord' AND c.provedor_id = $1`, [perfil.id]);
    if (ex.length) {
      // um único UPDATE (atômico): nome e foto acompanham o Discord a cada login (a pessoa pode ter trocado)
      await pool.query("UPDATE contas_oauth SET nome_exibicao = $2, avatar_url = $3 WHERE provedor = 'discord' AND provedor_id = $1", [perfil.id, nomeExibicao, perfil.avatar_url ?? null]);
      if (!ex[0].banido) await pool.query('UPDATE usuarios SET ultimo_acesso = now() WHERE id = $1', [ex[0].id]);
      return { id: Number(ex[0].id), apelido: ex[0].apelido, banido: ex[0].banido, novo: false };
    }
    const cli = await pool.connect();
    try {
      await cli.query('BEGIN');
      const { rows: [u] } = await cli.query(
        'INSERT INTO usuarios (apelido, avatar_gato, ultimo_acesso) VALUES ($1,$2,now()) RETURNING id, apelido',
        [gerarApelido(perfil.global_name || perfil.username, tentativa), JSON.stringify(gatoInicial(perfil.id))]);
      await cli.query(
        "INSERT INTO contas_oauth (usuario_id, provedor, provedor_id, nome_exibicao, avatar_url) VALUES ($1,'discord',$2,$3,$4)", [u.id, perfil.id, nomeExibicao, perfil.avatar_url ?? null]);
      await cli.query('COMMIT');
      return { id: Number(u.id), apelido: u.apelido, banido: false, novo: true };
    } catch (e) {
      await cli.query('ROLLBACK').catch(() => {});
      if (e.code !== '23505') throw e; // apelido já existe (tenta outro) ou login simultâneo da mesma conta (relê no próximo laço)
    } finally { cli.release(); }
  }
  throw new Error('não foi possível gerar apelido único');
}
