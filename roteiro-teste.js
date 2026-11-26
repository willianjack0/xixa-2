// Página temporária roteiro-teste.html: checklist do roteiro de teste, com progresso salvo no aparelho (localStorage).
// Remover junto com roteiro-teste.html e roteiro-teste.css quando o teste acabar.
(function (raiz) {
  "use strict";
  var BLOCOS = [
    { n: 1, t: "Entrada", passos: [
      "Abra o site sem estar logado. Você deve ver a tela de entrada, com “Continuar com Discord” e “Continuar sem login”.",
      "Clique em “Continuar sem login”. Dá para navegar? Ranking, Álbum, Moderação e Enviar meme aparecem no menu? (Não deveriam aparecer.)",
      "Volte e clique em “Continuar com Discord”, autorize e entre. Você volta ao site já logado, com seu apelido no canto?",
      "Atualize a página (F5). Você continua logado?"
    ]},
    { n: 2, t: "Perfil e gatinho", aviso: "Foi aqui que apareceu o erro ao salvar. Escolha opções variadas, incluindo as últimas de cada lista.", passos: [
      "Abra seu perfil pelo seu nome no canto superior. Tudo carrega?",
      "Clique no lápis do avatar (“Editar gatinho e apelido”).",
      "Troque pelo, padrão, olhos, acessório, roupa e fundo. Escolha de tudo um pouco, inclusive as últimas opções de cada lista (pelo Prata, padrão “Peludo”, olhos “Heterocromia”).",
      "Clique em “Salvar”. Aparece “Perfil salvo!”? O gato muda no perfil e no topo do site?",
      "Recarregue a página. O gato continua como você deixou?",
      "Teste “Embaralhar tudo” umas 5 vezes e salve em algumas delas.",
      "Troque o apelido e salve (só uma vez). Tente trocar de novo logo em seguida: o site deve avisar que é preciso esperar.",
      "Clique em “Trocar visual” e escolha outro visual do perfil. Salve e confira.",
      "Troque a carta favorita (“Curtiu”). Ela aparece no perfil?",
      "Clique em “Copiar link” e cole em outra aba. Abre o seu perfil?"
    ]},
    { n: 3, t: "Álbum e pacotes", passos: [
      "Abra o “Álbum de figurinhas”. As coleções e as cartas aparecem?",
      "Abra o pacote diário (ou o de boas-vindas, se aparecer). A revelação das cartas funciona, sem mostrar o resultado antes da hora?",
      "Suas moedas e figurinhas, no topo e no perfil, mudaram de acordo?",
      "Clique numa carta. O detalhe abre e fecha direito?",
      "No celular, use “Expandir álbum” e “Voltar ao site”. Funcionam? Dá para rolar as coleções de lado?",
      "Tente abrir de novo o pacote que já abriu hoje. O site impede e explica?"
    ]},
    { n: 4, t: "Linha do tempo e página inicial", passos: [
      "Abra a “Linha do tempo”. Troque de década e de ano. Tudo aparece? (Os anos 2000 a 2003 aparecem separados.)",
      "Abra um meme. O vídeo ou a imagem carrega? O botão de compartilhar funciona?",
      "Abra um vídeo de 2005 (4:3) no computador. O vídeo fica à esquerda e as informações ao lado, tudo visível sem rolar?",
      "Na página inicial, use as abas de década. Elas funcionam com o teclado (Tab e Enter) no computador?",
      "Dê “Gostei” ou estrelas em um meme. Recarregue: o voto ficou? Troque o voto: ele troca?"
    ]},
    { n: 5, t: "Memepédia", passos: [
      "Abra a “Memepédia” e leia dois textos.",
      "Se houver opção de sugerir ou editar, envie uma sugestão curta."
    ]},
    { n: 6, t: "Enviar meme", passos: [
      "Clique em “Enviar meme”. Preencha com um meme de teste e envie.",
      "Aparece a confirmação? Tente enviar sem preencher um campo obrigatório: o aviso é claro?"
    ]},
    { n: 7, t: "Enviar arte de carta", aviso: "Página temporária. Use uma imagem sua ou de teste (PNG, JPEG ou WebP, até 5 MB).", passos: [
      "No rodapé de qualquer página, clique em “Enviar arte de carta”. A página abre?",
      "Leia o guia de tamanhos e margens. Os exemplos de como a arte fica na carta, na figurinha e na miniatura estão claros?",
      "Busque uma carta pelo nome e filtre por coleção. Só aparecem cartas sem imagem?",
      "Escolha uma carta, selecione o arquivo e veja a prévia nos exemplos. A sua imagem aparece nos quadros?",
      "Envie. Aparece a confirmação e o envio entra em “Seus envios” como pendente?",
      "Tente enviar um arquivo que não seja imagem, ou uma imagem muito pequena. O aviso explica o motivo?",
      "Cancele o seu envio pendente em “Seus envios”. Ele some da lista?"
    ]},
    { n: 8, t: "Ranking", passos: [
      "Abra o “Ranking”. A lista aparece? Você está nela?",
      "Alterne entre as métricas (XP e cartas)."
    ]},
    { n: 9, t: "Páginas legais e rodapé", passos: [
      "No rodapé, abra “Política de Privacidade” e “Termos de Uso”. Os textos aparecem inteiros e legíveis?",
      "Troque entre tema claro e escuro (botão no topo). Alguma parte fica ilegível ou estranha?",
      "No rodapé, use o formulário de feedback e mande uma mensagem de teste."
    ]},
    { n: 10, t: "Celular", nota: "Repita os blocos principais no telefone e responda:", passos: [
      "Os botões e links são fáceis de tocar, sem acertar o errado?",
      "Algum texto está pequeno demais ou cortado?",
      "Algum conteúdo ultrapassa a tela e obriga a rolar de lado (fora do que deveria rolar)?",
      "Gire o celular (retrato e paisagem). Quebra alguma coisa?"
    ]},
    { n: 11, t: "Sair e voltar", passos: [
      "Clique em “Sair”. Você volta para a tela de entrada?",
      "Entre de novo com o Discord. Tudo continua como estava (gato, moedas, cartas)?"
    ]}
  ];

  var KEY = "roteiro-ns-v1";
  var idDoPasso = function (bloco, i) { return bloco.n + "." + (i + 1); };
  var totalDePassos = function () { return BLOCOS.reduce(function (s, b) { return s + b.passos.length; }, 0); };

  function iniciar() {
    var doc = raiz.document, feitos = {}, total = totalDePassos(), tToast;
    try { feitos = JSON.parse(raiz.localStorage.getItem(KEY) || "{}") || {}; } catch (e) { feitos = {}; }
    var salvar = function () { try { raiz.localStorage.setItem(KEY, JSON.stringify(feitos)); } catch (e) {} };
    var $ = function (id) { return doc.getElementById(id); };
    var el = function (tag, cls, texto) { var n = doc.createElement(tag); if (cls) n.className = cls; if (texto != null) n.textContent = texto; return n; };

    function atualizar() {
      var n = Object.keys(feitos).length, pct = total ? Math.round((n / total) * 100) : 0;
      $("rtCount").textContent = n + " de " + total;
      $("rtFill").style.width = pct + "%";
      $("rtTrack").setAttribute("aria-valuenow", String(pct));
    }
    function aviso(msg) {
      var t = $("rtToast"); t.textContent = msg; t.classList.add("on");
      raiz.clearTimeout(tToast); tToast = raiz.setTimeout(function () { t.classList.remove("on"); }, 1800);
    }

    // o cabeçalho do site é fixo no topo: a barra de progresso gruda logo abaixo dele
    var ajustarBarra = function () {
      var hd = doc.querySelector("header.hd"), barra = $("rtBar");
      if (barra) barra.style.top = (hd ? hd.offsetHeight : 0) + "px";
    };
    ajustarBarra(); raiz.addEventListener("resize", ajustarBarra);

    var cont = $("rtBlocos");
    BLOCOS.forEach(function (b) {
      var sec = el("section", "rt-bloco"), h = el("h2");
      h.append(el("span", "rt-n", b.n + "."), doc.createTextNode(b.t));
      sec.append(h);
      if (b.nota) sec.append(el("p", "rt-nota", b.nota));
      if (b.aviso) sec.append(el("p", "rt-aviso", b.aviso));
      var ol = el("ol", "rt-passos");
      b.passos.forEach(function (texto, i) {
        var id = idDoPasso(b, i), li = el("li"), lab = el("label", "rt-passo"), cb = el("input");
        cb.type = "checkbox"; cb.id = "p-" + id.replace(".", "-"); cb.checked = !!feitos[id];
        cb.addEventListener("change", function () { if (cb.checked) feitos[id] = 1; else delete feitos[id]; salvar(); atualizar(); });
        var t = el("span", "rt-txt"); t.append(el("span", "rt-id", id), doc.createTextNode(texto));
        lab.append(cb, t); li.append(lab); ol.append(li);
      });
      sec.append(ol); cont.append(sec);
    });
    atualizar();

    $("rtReset").addEventListener("click", function () {
      feitos = {}; salvar();
      doc.querySelectorAll(".rt-passo input").forEach(function (c) { c.checked = false; });
      atualizar(); aviso("Passos desmarcados");
    });
    $("rtCopy").addEventListener("click", function () {
      var tpl = $("rtTpl");
      var plano = function () {
        var r = doc.createRange(); r.selectNodeContents(tpl);
        var s = raiz.getSelection(); s.removeAllRanges(); s.addRange(r);
        aviso("Texto selecionado: copie com Ctrl+C");
      };
      if (raiz.navigator && raiz.navigator.clipboard && raiz.navigator.clipboard.writeText) {
        raiz.navigator.clipboard.writeText(tpl.textContent).then(function () { aviso("Modelo copiado"); }, plano);
      } else plano();
    });
  }

  var api = { BLOCOS: BLOCOS, totalDePassos: totalDePassos, idDoPasso: idDoPasso, iniciar: iniciar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.RoteiroTeste = api;
})(typeof window !== "undefined" ? window : globalThis);
