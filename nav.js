// Analytics de navegação, sem cookie e sem dado pessoal: manda 1 visualização por página e o tempo com a aba visível.
// A origem é só o domínio de quem trouxe a pessoa (guardado na sessão da aba); o servidor agrupa em nomes conhecidos.
(function () {
  try { if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return; } catch (e) { /* segue */ }
  var P = location.pathname;
  if (/^\/(seppzone|admin|dashboard|docs)(\/|$)/.test(P)) return;
  var nova = true, ref = "";
  try {
    var S = window.sessionStorage;
    if (S.getItem("ns_nav")) { nova = false; ref = S.getItem("ns_nav_ref") || ""; }
    else {
      try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) { ref = ""; }
      S.setItem("ns_nav", "1"); S.setItem("ns_nav_ref", ref);
    }
  } catch (e) { try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e2) { ref = ""; } }

  function enviar(corpo) {
    var json = JSON.stringify(corpo);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/api/nav", new Blob([json], { type: "application/json" }))) return;
    } catch (e) { /* tenta o fetch */ }
    try { fetch("/api/nav", { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true }).catch(function () {}); } catch (e) { /* ignora */ }
  }
  enviar({ t: "pv", p: P, r: ref, n: nova });

  var inicio = document.visibilityState === "hidden" ? 0 : Date.now();
  function descarregar() {
    if (!inicio) return;
    var s = Math.round((Date.now() - inicio) / 1000);
    inicio = Date.now();
    while (s > 0) { var parte = Math.min(s, 300); enviar({ t: "tempo", p: P, r: ref, s: parte }); s -= parte; }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { descarregar(); inicio = 0; }
    else if (!inicio) inicio = Date.now();
  });
  window.addEventListener("pagehide", descarregar);
  setInterval(function () { if (document.visibilityState === "visible") descarregar(); }, 15000); // batida a cada 15 s: se o navegador perder o envio ao sair, no máximo 15 s ficam sem contar
})();
