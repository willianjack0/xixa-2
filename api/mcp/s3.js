// Cliente S3 mínimo (MinIO/S3, URL no estilo path) com assinatura AWS SigV4, só com node:crypto e fetch (sem SDK).
// Operações: put, remove, head. As chaves vêm de Docker secrets (S3_ACCESS_KEY_FILE / S3_SECRET_KEY_FILE) e nunca são logadas.
import { createHash, createHmac } from 'node:crypto';
import { segredo } from '../lib/config.js';

const sha256 = (d) => createHash('sha256').update(d).digest('hex');
const hmac = (chave, dado) => createHmac('sha256', chave).update(dado).digest();
// codifica cada segmento do caminho como o S3 pede (RFC 3986, "/" fica)
const codifica = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// decodifica entidades XML comuns (&amp;, &lt;, &gt;, &quot;, &#39;)
function decodificaXml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseListObjectsV2(xml) {
  const itens = [];
  const contentsRe = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match;
  while ((match = contentsRe.exec(xml)) !== null) {
    const bloco = match[1];
    const keyMatch = /<Key>([\s\S]*?)<\/Key>/.exec(bloco);
    const sizeMatch = /<Size>(\d+)<\/Size>/.exec(bloco);
    const modMatch = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(bloco);
    if (keyMatch) {
      itens.push({
        chave: decodificaXml(keyMatch[1].trim()),
        tamanho: sizeMatch ? Number(sizeMatch[1]) : 0,
        modificado: modMatch ? new Date(modMatch[1].trim()) : new Date(0)
      });
    }
  }
  const isTruncatedMatch = /<IsTruncated>(true|false)<\/IsTruncated>/i.exec(xml);
  const truncado = isTruncatedMatch ? isTruncatedMatch[1].toLowerCase() === 'true' : false;
  const tokenMatch = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml);
  const proximoToken = tokenMatch ? decodificaXml(tokenMatch[1].trim()) : null;
  return { itens, truncado, proximoToken };
}

export function assinar({ metodo, url, regiao, acesso, segredoChave, hashCorpo, agora = new Date(), extras = {} }) {
  const u = new URL(url);
  const amz = agora.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20261125T201500Z
  const dia = amz.slice(0, 8);
  const cab = { host: u.host, 'x-amz-content-sha256': hashCorpo, 'x-amz-date': amz, ...extras };
  const nomes = Object.keys(cab).sort(); // todos os nomes de cabeçalho em minúsculas
  const canonCab = nomes.map((k) => `${k}:${String(cab[k]).trim()}\n`).join('');
  const caminho = u.pathname.split('/').map((seg) => codifica(decodeURIComponent(seg))).join('/');
  const queryChaves = [...u.searchParams.keys()].sort();
  const canonQuery = queryChaves.map((k) => `${codifica(k)}=${codifica(u.searchParams.get(k))}`).join('&');
  const canonico = [metodo, caminho, canonQuery, canonCab, nomes.join(';'), hashCorpo].join('\n');
  const escopo = `${dia}/${regiao}/s3/aws4_request`;
  const aAssinar = ['AWS4-HMAC-SHA256', amz, escopo, sha256(canonico)].join('\n');
  const chave = hmac(hmac(hmac(hmac('AWS4' + segredoChave, dia), regiao), 's3'), 'aws4_request');
  const assinatura = createHmac('sha256', chave).update(aAssinar).digest('hex');
  return {
    ...cab,
    authorization: `AWS4-HMAC-SHA256 Credential=${acesso}/${escopo}, SignedHeaders=${nomes.join(';')}, Signature=${assinatura}`
  };
}

/** { endpoint, bucket, regiao, acesso, segredoChave } do ambiente, ou null se o armazenamento não estiver configurado. */
export function configDoAmbiente(env = process.env) {
  const endpoint = String(env.S3_ENDPOINT || '').replace(/\/+$/, '');
  const bucket = String(env.S3_BUCKET || '');
  const acesso = segredo('S3_ACCESS_KEY', env), segredoChave = segredo('S3_SECRET_KEY', env);
  if (!endpoint || !bucket || !acesso || !segredoChave) return null;
  if (!/^https?:\/\/[^/\s]+$/.test(endpoint) || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return null;
  return { endpoint, bucket, regiao: env.S3_REGION || 'us-east-1', acesso, segredoChave };
}

export function criarS3(cfg, { fetchImpl = fetch, agora = () => new Date() } = {}) {
  const urlDe = (chave) => `${cfg.endpoint}/${cfg.bucket}/${chave.split('/').map(codifica).join('/')}`;
  async function chamar(metodo, chave, corpo, tipo) {
    const buf = corpo || Buffer.alloc(0);
    const hashCorpo = sha256(buf);
    const url = urlDe(chave);
    const cab = assinar({ metodo, url, regiao: cfg.regiao, acesso: cfg.acesso, segredoChave: cfg.segredoChave, hashCorpo, agora: agora() });
    const headers = { 'x-amz-content-sha256': cab['x-amz-content-sha256'], 'x-amz-date': cab['x-amz-date'], authorization: cab.authorization };
    if (tipo) headers['content-type'] = tipo; // fora da assinatura: não afeta a validade
    const r = await fetchImpl(url, { method: metodo, headers, body: metodo === 'PUT' ? buf : undefined, signal: AbortSignal.timeout(15_000) });
    return r;
  }
  return {
    /** Grava o objeto. Lança erro (sem expor credenciais) se o S3 recusar. */
    async put(chave, buf, tipo = 'application/octet-stream') {
      const r = await chamar('PUT', chave, buf, tipo);
      if (!r.ok) throw new Error(`s3 put ${r.status}`);
    },
    /** Baixa o objeto como Buffer (até max bytes). null se 404; lança para outros erros. */
    async get(chave, { max = 10 * 1024 * 1024 } = {}) {
      const r = await chamar('GET', chave);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`s3 get ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > max) throw new Error('s3 get: objeto maior que o limite');
      return buf;
    },
    async remove(chave) {
      const r = await chamar('DELETE', chave);
      if (!r.ok && r.status !== 404) throw new Error(`s3 delete ${r.status}`);
    },
    /** true se existe, false se 404; lança para outros erros. */
    async head(chave) {
      const r = await chamar('HEAD', chave);
      if (r.status === 404) return false;
      if (!r.ok) throw new Error(`s3 head ${r.status}`);
      return true;
    },
    /** Lista objetos pelo prefixo até max (padrão 10000). Devolve [{ chave, tamanho, modificado }] */
    async list(prefixo = '', { max = 10000 } = {}) {
      const resultado = [];
      let token = null;
      while (resultado.length < max) {
        const u = new URL(`${cfg.endpoint}/${cfg.bucket}`);
        u.searchParams.set('list-type', '2');
        if (prefixo) u.searchParams.set('prefix', prefixo);
        const restante = max - resultado.length;
        const pageLimit = Math.min(1000, restante);
        u.searchParams.set('max-keys', String(pageLimit));
        if (token) u.searchParams.set('continuation-token', token);

        const hashCorpo = sha256(Buffer.alloc(0));
        const cab = assinar({ metodo: 'GET', url: u.toString(), regiao: cfg.regiao, acesso: cfg.acesso, segredoChave: cfg.segredoChave, hashCorpo, agora: agora() });
        const headers = { 'x-amz-content-sha256': cab['x-amz-content-sha256'], 'x-amz-date': cab['x-amz-date'], authorization: cab.authorization };

        const r = await fetchImpl(u.toString(), { method: 'GET', headers, signal: AbortSignal.timeout(15_000) });
        if (!r.ok) throw new Error(`s3 list ${r.status}`);
        const xml = await r.text();
        const { itens, truncado, proximoToken } = parseListObjectsV2(xml);
        for (const item of itens) {
          resultado.push(item);
          if (resultado.length >= max) break;
        }
        if (!truncado || !proximoToken || resultado.length >= max) break;
        token = proximoToken;
      }
      return resultado;
    }
  };
}
