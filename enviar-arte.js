// Página temporária enviar-arte.html: lista as cartas sem arte aprovada, valida o arquivo no navegador (o servidor valida de novo,
// pelos bytes) e envia a imagem como corpo binário (Api.arteEnviar, com sessão + CSRF). Todo texto vindo da API entra por textContent.
(function (raiz) {
  'use strict';
  // mesmas regras do servidor (api/routes/arte-carta.js); o servidor é quem decide
  var LIMITES = { maxBytes: 5 * 1024 * 1024, minLado: 400, propMin: 0.5, propMax: 2, tipos: ['image/png', 'image/jpeg', 'image/webp'] };

  /** Mensagem de erro (pt-BR) ou '' se o arquivo serve. info = { tipo, bytes, largura, altura }. Função pura. */
  function validarArquivo(info) {
    if (!info || LIMITES.tipos.indexOf(info.tipo) < 0) return 'Use uma imagem PNG, JPEG ou WebP (SVG e GIF não são aceitos).';
    if (!(info.bytes > 0)) return 'O arquivo está vazio.';
    if (info.bytes > LIMITES.maxBytes) return 'A imagem passa de 5 MB. Reduza o arquivo e tente de novo.';
    if (!(info.largura > 0 && info.altura > 0)) return 'Não consegui ler as dimensões da imagem.';
    if (info.largura < LIMITES.minLado || info.altura < LIMITES.minLado) return 'Imagem pequena demais: o menor lado precisa ter pelo menos ' + LIMITES.minLado + ' px (a sua tem ' + info.largura + ' × ' + info.altura + ').';
    var p = info.largura / info.altura;
    if (p < LIMITES.propMin || p > LIMITES.propMax) return 'Proporção fora do aceito: a imagem não pode ser mais de 2 vezes mais larga que alta, nem o contrário.';
    return '';
  }

  /** Texto do erro de uma resposta da API, sem expor nada técnico. */
  function mensagemDeErro(e) {
    if (!e) return 'Não consegui enviar agora. Tente de novo.';
    if (e.status === 0) return 'Sem conexão. Tente de novo.';
    if (e.status === 413) return 'A imagem passa de 5 MB.';
    if (e.status === 503 || e.status === 502) return 'Serviço indisponível. Tente de novo em instantes.';
    return e.erro || 'Não consegui enviar agora. Tente de novo.';
  }

  var api = { LIMITES: LIMITES, validarArquivo: validarArquivo, mensagemDeErro: mensagemDeErro };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------------------------- interface ----------------------------
  var $ = function (id) { return document.getElementById(id); };
  var estado = { pagina: 1, total: 0, busca: '', colecao: '', carregando: false, token: 0, sel: null, arquivo: null, url: null, colecoesOk: false, pronto: false };
  var itens = {}; // id da carta -> dados (para atualizar o "pendentes" sem recarregar)

  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; }
  function dizer(id, texto, tipo) { var n = $(id); n.textContent = texto || ''; n.className = 'ea-estado' + (tipo ? ' ' + tipo : ''); }

  function mostrar(logado) {
    $('logado').hidden = !logado; $('entrar').hidden = logado;
    if (logado && !estado.pronto) { estado.pronto = true; carregarCartas(true); carregarMeus(); }
  }

  function cartaBotao(c) {
    var li = el('li'), b = el('button', 'ea-carta'), md = el('span', 'md');
    b.type = 'button'; b.dataset.id = c.id; b.setAttribute('aria-pressed', estado.sel && estado.sel.id === c.id ? 'true' : 'false');
    b.append(el('span', 'emo', c.emoji || '🃏'), el('span', 'nm', c.nome));
    md.append(el('span', null, c.colecao_nome + ' · #' + c.numero), el('span', 'ea-chip', c.raridade));
    if (c.pendentes > 0) md.append(el('span', 'ea-chip', c.pendentes === 1 ? '1 arte esperando' : c.pendentes + ' artes esperando'));
    if (c.meu_pendente) md.append(el('span', 'ea-chip eu', 'Você já enviou'));
    b.append(md);
    b.addEventListener('click', function () { escolher(c.id); });
    li.append(b); return li;
  }

  function desenhar(lista, anexar) {
    var ul = $('cartas'); if (!anexar) ul.textContent = '';
    lista.forEach(function (c) { itens[c.id] = c; ul.append(cartaBotao(c)); });
  }

  async function carregarCartas(reset) {
    if (reset) { estado.pagina = 1; itens = {}; }
    var meu = ++estado.token; estado.carregando = true;
    $('btMais').hidden = true;
    dizer('cartasEstado', 'Carregando as cartas…');
    var qs = 'limite=24&pagina=' + estado.pagina + (estado.busca ? '&busca=' + encodeURIComponent(estado.busca) : '') + (estado.colecao ? '&colecao_id=' + encodeURIComponent(estado.colecao) : '');
    var r;
    try { r = await Api.arteCartas(qs, { silencioso: true }); } catch (e) {
      if (meu !== estado.token) return;
      estado.carregando = false; dizer('cartasEstado', mensagemDeErro(e), 'bad'); return;
    }
    if (meu !== estado.token) return;
    estado.carregando = false; estado.total = r.total;
    if (!estado.colecoesOk && r.colecoes) {
      estado.colecoesOk = true;
      var sel = $('colecao');
      r.colecoes.forEach(function (k) { var o = el('option', null, k.nome + ' (' + k.sem_arte + ')'); o.value = k.id; sel.append(o); });
    }
    desenhar(r.itens, !reset);
    var mostradas = $('cartas').children.length;
    dizer('cartasEstado', r.total === 0 ? (estado.busca || estado.colecao ? 'Nenhuma carta sem arte com esse filtro.' : 'Nenhuma carta está sem arte agora. Obrigado!') : mostradas + ' de ' + r.total + ' cartas sem arte');
    $('btMais').hidden = mostradas >= r.total;
  }

  function atualizarSelecao() {
    var c = estado.sel, caixa = $('selecao'), arq = $('arquivo');
    if (!c) { caixa.textContent = 'Nenhuma carta escolhida ainda. Escolha uma no passo 2.'; caixa.className = 'ea-sel'; arq.disabled = true; $('btEnviar').disabled = true; return; }
    caixa.className = 'ea-sel on';
    caixa.textContent = 'Carta escolhida: ' + c.nome + ' (' + c.colecao_nome + ' #' + c.numero + ')' + (c.meu_pendente ? '. Você já tem uma arte esperando a moderação para esta carta.' : '');
    arq.disabled = !!c.meu_pendente;
    $('btEnviar').disabled = !!c.meu_pendente || !estado.arquivo;
  }

  function escolher(id) {
    var c = itens[id]; if (!c) return;
    estado.sel = c;
    [].forEach.call($('cartas').querySelectorAll('.ea-carta'), function (b) { b.setAttribute('aria-pressed', b.dataset.id === id ? 'true' : 'false'); });
    atualizarSelecao(); dizer('envioEstado', '');
    var alvo = $('enviar'); if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var arq = $('arquivo'); if (!arq.disabled) arq.focus({ preventScroll: true });
  }

  function limparPreview() {
    if (estado.url) { URL.revokeObjectURL(estado.url); estado.url = null; }
    $('exemplos').classList.remove('tem-arte');
    [].forEach.call(document.querySelectorAll('[data-arte-img]'), function (i) { i.hidden = true; i.removeAttribute('src'); });
    $('exTxt').textContent = 'Exemplo com uma arte de modelo. Escolha o arquivo no passo 3 e estes quadros passam a mostrar a sua imagem.';
  }

  function lerDimensoes(arquivo) {
    return new Promise(function (ok) {
      var u = URL.createObjectURL(arquivo), i = new Image();
      i.onload = function () { ok({ url: u, largura: i.naturalWidth, altura: i.naturalHeight }); };
      i.onerror = function () { URL.revokeObjectURL(u); ok(null); };
      i.src = u;
    });
  }

  async function aoEscolherArquivo() {
    var f = $('arquivo').files[0], erro = $('arqErro');
    estado.arquivo = null; erro.textContent = ''; limparPreview();
    if (!f) { atualizarSelecao(); return; }
    var info = { tipo: f.type, bytes: f.size, largura: 0, altura: 0 }, d = null;
    var msg = validarArquivo(Object.assign({}, info, { largura: LIMITES.minLado, altura: LIMITES.minLado })); // tipo e peso primeiro, sem decodificar
    if (!msg) {
      d = await lerDimensoes(f);
      if (!d) msg = 'Não consegui abrir essa imagem. O arquivo pode estar corrompido.';
      else { info.largura = d.largura; info.altura = d.altura; msg = validarArquivo(info); }
    }
    if (msg) { if (d) URL.revokeObjectURL(d.url); erro.textContent = msg; $('arquivo').setAttribute('aria-invalid', 'true'); atualizarSelecao(); return; }
    $('arquivo').removeAttribute('aria-invalid');
    estado.arquivo = f; estado.url = d.url;
    [].forEach.call(document.querySelectorAll('[data-arte-img]'), function (i) { i.src = d.url; i.hidden = false; });
    $('exemplos').classList.add('tem-arte');
    $('exTxt').textContent = 'Assim a sua arte fica na carta do álbum, na figurinha colada, no perfil e na miniatura (' + d.largura + ' × ' + d.altura + ' px).';
    atualizarSelecao();
  }

  async function enviar(ev) {
    ev.preventDefault();
    var c = estado.sel, f = estado.arquivo;
    if (!c) return dizer('envioEstado', 'Escolha uma carta no passo 2.', 'bad');
    if (!f) return dizer('envioEstado', 'Escolha o arquivo da imagem.', 'bad');
    var bt = $('btEnviar'); bt.disabled = true; dizer('envioEstado', 'Enviando…');
    try {
      await Api.arteEnviar(c.id, f, { silencioso: true });
    } catch (e) {
      if (e && e.status === 401) return;
      bt.disabled = false;
      if (e && e.status === 409 && /pendente/.test(e.erro || '')) { c.meu_pendente = true; atualizarSelecao(); }
      return dizer('envioEstado', mensagemDeErro(e), 'bad');
    }
    c.meu_pendente = true; c.pendentes = (c.pendentes || 0) + 1;
    var antigo = $('cartas').querySelector('[data-id="' + (window.CSS && CSS.escape ? CSS.escape(c.id) : c.id) + '"]');
    if (antigo) antigo.closest('li').replaceWith(cartaBotao(c));
    $('arquivo').value = ''; estado.arquivo = null; limparPreview(); atualizarSelecao();
    dizer('envioEstado', 'Arte enviada! Ela vai para a moderação. A carta continua na lista até uma arte ser aprovada.', 'ok');
    if (typeof toast === 'function') toast('Arte enviada para a moderação!');
    carregarMeus();
  }

  async function cancelar(x, botao) {
    botao.disabled = true;
    try { await Api.arteCancelar(x.id, { silencioso: true }); } catch (e) {
      if (e && e.status === 401) return;
      botao.disabled = false;
      if (e && (e.status === 404 || e.status === 409)) { await carregarMeus(); return dizer('meusEstado', mensagemDeErro(e), 'bad'); }
      return dizer('meusEstado', mensagemDeErro(e), 'bad');
    }
    var c = itens[x.carta_id];
    if (c) { c.meu_pendente = false; c.pendentes = Math.max(0, (c.pendentes || 1) - 1); var b = $('cartas').querySelector('[data-id="' + (window.CSS && CSS.escape ? CSS.escape(c.id) : c.id) + '"]'); if (b) b.closest('li').replaceWith(cartaBotao(c)); if (estado.sel && estado.sel.id === c.id) atualizarSelecao(); }
    await carregarMeus();
    dizer('meusEstado', 'Envio cancelado. Você pode mandar outra arte para essa carta.', 'ok');
  }

  var SITUACAO = { pendente: 'Aguardando moderação', aprovado: 'Aprovada', rejeitado: 'Rejeitada' };
  async function carregarMeus() {
    var ul = $('meus'); ul.textContent = ''; dizer('meusEstado', 'Carregando…');
    var r;
    try { r = await Api.arteMeus({ silencioso: true }); } catch (e) { return dizer('meusEstado', mensagemDeErro(e), 'bad'); }
    if (!r.itens.length) return dizer('meusEstado', 'Você ainda não enviou nenhuma arte.');
    dizer('meusEstado', '');
    r.itens.forEach(function (x) {
      var li = el('li');
      li.append(el('span', 'nm', x.carta_nome), el('span', 'st ' + x.status, SITUACAO[x.status] || x.status));
      if (x.motivo) li.append(el('span', 'mo', (x.status === 'rejeitado' ? 'Motivo: ' : '') + x.motivo));
      if (x.status === 'pendente') {
        var bc = el('button', 'cancelar', 'Cancelar envio');
        bc.type = 'button'; bc.setAttribute('aria-label', 'Cancelar o envio da arte de ' + x.carta_nome);
        bc.addEventListener('click', function () { cancelar(x, bc); });
        li.append(bc);
      }
      ul.append(li);
    });
  }

  function iniciar() {
    $('btEntrar').addEventListener('click', function () { if (typeof openLogin === 'function') openLogin('Entre para enviar arte de carta.'); });
    var t = null;
    $('busca').addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { estado.busca = $('busca').value.trim(); carregarCartas(true); }, 300); });
    $('colecao').addEventListener('change', function () { estado.colecao = $('colecao').value; carregarCartas(true); });
    $('fBusca').addEventListener('submit', function (e) { e.preventDefault(); });
    $('btMais').addEventListener('click', function () { estado.pagina++; carregarCartas(false); });
    $('arquivo').addEventListener('change', aoEscolherArquivo);
    $('fEnvio').addEventListener('submit', enviar);
    // quem manda é a economia (common.js): sessão pronta = logado; convidado marcado = pede login. Sem marca, o cliente redireciona para /entrar.html.
    var vezes = 0, espera = setInterval(function () {
      vezes++;
      if (typeof nsLogado === 'function' && nsLogado()) { clearInterval(espera); mostrar(true); }
      else if (typeof ECO !== 'undefined' && ECO.convidado) { clearInterval(espera); mostrar(false); }
      else if (vezes > 40) { clearInterval(espera); dizer('cartasEstado', 'Não consegui falar com o servidor. Recarregue a página.', 'bad'); $('logado').hidden = false; }
    }, 250);
  }

  api.iniciar = iniciar;
  raiz.EnviarArte = api;
})(typeof window !== 'undefined' ? window : globalThis);
