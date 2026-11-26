// Cliente da API (economia e sessão). Carregado no <head>, depois de gate.js, antes de common.js.
// - fetch com cookie de sessão (same-origin), JSON e header X-CSRF vindo de GET /api/eu (em cache; renova em 403).
// - erros normalizados: a promessa rejeita com { status, erro } (status 0 = sem conexão).
// - 401: manda para /entrar.html?voltar=<página>, EXCETO no modo convidado (localStorage.ns_convidado="1"): aí não redireciona
//   (sem laço) e o chamador decide o que mostrar. 402, 429 e 503 mostram um aviso (toast) claro.
// - sessão válida em GET /api/eu apaga a marca de convidado (quem logou volta ao fluxo normal).
// Passe { silencioso: true } no último argumento para não mostrar o aviso (o erro continua sendo lançado).
(function () {
  var csrf = null;
  var redirecionando = false;

  function aviso(msg) { if (typeof toast === 'function') toast(msg, 3600); }

  function convidado() { try { return localStorage.getItem('ns_convidado') === '1'; } catch (e) { return false; } }
  function limparConvidado() { try { localStorage.removeItem('ns_convidado'); } catch (e) { /* sem storage */ } }

  function irParaEntrar() {
    if (convidado() || redirecionando) return;
    redirecionando = true;
    var vai = location.pathname + location.search + location.hash;
    location.replace('/entrar.html?voltar=' + encodeURIComponent(vai));
  }

  function erro(status, texto) { return { status: status, erro: texto || 'erro inesperado' }; }

  async function bruto(metodo, caminho, corpo, comCsrf) {
    var headers = { Accept: 'application/json' };
    var arquivo = typeof Blob !== 'undefined' && corpo instanceof Blob; // imagem enviada como corpo binário (envio de arte de carta)
    if (corpo !== undefined) headers['Content-Type'] = arquivo ? corpo.type : 'application/json';
    if (comCsrf && csrf) headers['X-CSRF'] = csrf;
    var r;
    try {
      r = await fetch(caminho, {
        method: metodo, credentials: 'same-origin', cache: 'no-store', headers: headers,
        body: corpo === undefined ? undefined : arquivo ? corpo : JSON.stringify(corpo)
      });
    } catch (e) { throw erro(0, 'sem conexão'); }
    var json = null;
    try { json = await r.json(); } catch (e) { /* corpo vazio ou não-JSON */ }
    return { status: r.status, ok: r.ok, json: json };
  }

  async function pedir(metodo, caminho, corpo, opcoes) {
    var escrita = metodo !== 'GET';
    if (escrita && csrf === null) await eu({ silencioso: true });
    var r = await bruto(metodo, caminho, corpo, escrita);
    if (r.status === 403 && escrita) { // token de CSRF velho: renova e tenta uma vez
      csrf = null;
      await eu({ silencioso: true });
      r = await bruto(metodo, caminho, corpo, true);
    }
    if (r.ok) return r.json;
    var texto = (r.json && (r.json.erro || r.json.error)) || '';
    var e = erro(r.status, texto);
    if (r.json && typeof r.json.campo === 'string') e.campo = r.json.campo; // 422 do PATCH /api/eu: qual campo falhou
    if (r.json && r.json.campos && typeof r.json.campos === 'object') e.campos = r.json.campos; // 422 de envio/remoção: qual campo falhou
    if (r.json && typeof r.json.tente_em_segundos === 'number') e.tente_em_segundos = r.json.tente_em_segundos; // 429 do apelido: quanto falta
    var quieto = opcoes && opcoes.silencioso;
    if (r.status === 401) { irParaEntrar(); throw e; }
    if (!quieto) {
      if (r.status === 402) aviso('Moedas insuficientes.');
      else if (r.status === 429) aviso('Calma! Muitas ações em pouco tempo. Tente de novo daqui a pouco.');
      else if (r.status === 503) aviso('Serviço indisponível no momento. Tente de novo em instantes.');
    }
    throw e;
  }

  async function eu(opcoes) {
    var r = await bruto('GET', '/api/eu', undefined, false);
    if (r.status === 401) { irParaEntrar(); throw erro(401, (r.json && r.json.erro) || 'não autenticado'); }
    if (!r.ok) {
      var e = erro(r.status, (r.json && (r.json.erro || r.json.error)) || '');
      if (!(opcoes && opcoes.silencioso) && r.status === 503) aviso('Serviço indisponível no momento. Tente de novo em instantes.');
      throw e;
    }
    if (r.json && r.json.csrf) csrf = r.json.csrf;
    limparConvidado();
    return r.json;
  }

  window.Api = {
    convidado: convidado,
    eu: eu,
    carteira: function (o) { return pedir('GET', '/api/carteira', undefined, o); },
    album: function (o) { return pedir('GET', '/api/album', undefined, o); },
    visita: function (o) { return pedir('POST', '/api/visita', {}, o); },
    jujuba: function (o) { return pedir('POST', '/api/jujuba', {}, o); },
    tipos: function (o) { return pedir('GET', '/api/pacotes/tipos', undefined, o); },
    comprar: function (p, o) { return pedir('POST', '/api/pacotes/comprar', p, o); },
    abrir: function (p, o) { return pedir('POST', '/api/pacotes/abrir', p, o); },
    perfil: function (p, o) { return pedir('PATCH', '/api/eu', p, o); },
    reciclar: function (p, o) { return pedir('POST', '/api/album/reciclar', p, o); },
    // votos: um por pessoa e por meme (POST exige login); meusVotos marca o botão de curtir/as estrelas
    votar: function (p, o) { return pedir('POST', '/api/votos', p, o); },
    // envio de meme para a moderação (patente Banda larga+); o pedido de remoção é público e usa fetch direto (common.js)
    enviar: function (p, o) { return pedir('POST', '/api/envios', p, o); },
    meusVotos: function (ids, o) { return pedir('GET', '/api/votos/meus?ids=' + encodeURIComponent((ids || []).join(',')), undefined, o); },
    // perfil público e recados (perfil.html)
    perfilDe: function (apelido, o) { return pedir('GET', '/api/perfil/' + encodeURIComponent(apelido), undefined, o); },
    recados: function (apelido, o) { return pedir('GET', '/api/perfil/' + encodeURIComponent(apelido) + '/recados', undefined, o); },
    recadar: function (apelido, texto, o) { return pedir('POST', '/api/perfil/' + encodeURIComponent(apelido) + '/recados', { texto: texto }, o); },
    apagarRecado: function (id, o) { return pedir('DELETE', '/api/recados/' + encodeURIComponent(id), undefined, o); },
    publicar: function (p, o) { return pedir('POST', '/api/publicacoes', p, o); },
    apagarPublicacao: function (id, o) { return pedir('DELETE', '/api/publicacoes/' + encodeURIComponent(id), undefined, o); },
    // envio de arte de carta (enviar-arte.html): lista das cartas sem arte, envio da imagem (Blob) e meus envios
    arteCartas: function (qs, o) { return pedir('GET', '/api/arte/cartas' + (qs ? '?' + qs : ''), undefined, o); },
    arteEnviar: function (cartaId, arquivo, o) { return pedir('POST', '/api/arte/envios?carta=' + encodeURIComponent(cartaId), arquivo, o); },
    arteMeus: function (o) { return pedir('GET', '/api/arte/meus', undefined, o); },
    arteCancelar: function (id, o) { return pedir('DELETE', '/api/arte/envios/' + encodeURIComponent(id), undefined, o); },
    // moderação das artes (seppzone): fila, aprovar e rejeitar
    arteFila: function (status, o) { return pedir('GET', '/api/mod/arte/envios?status=' + encodeURIComponent(status || 'pendente'), undefined, o); },
    arteAprovar: function (id, o) { return pedir('POST', '/api/mod/arte/envios/' + encodeURIComponent(id) + '/aprovar', {}, o); },
    arteRejeitar: function (id, motivo, o) { return pedir('POST', '/api/mod/arte/envios/' + encodeURIComponent(id) + '/rejeitar', { motivo: motivo }, o); },
    ranking: function (metrica, limite, o) {
      return pedir('GET', '/api/ranking?metrica=' + encodeURIComponent(metrica || 'xp') + '&limite=' + encodeURIComponent(limite || 50), undefined, o);
    }
  };
})();
