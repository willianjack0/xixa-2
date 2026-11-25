/* Admin · Não Salvo. Tela real: fala com /api/eu e /api/admin/*, /api/mod/*. O servidor confere tudo de novo; aqui só se esconde.
   Regra: nada de innerHTML com dado vindo da API; tudo por DOM/textContent. */
(function () {
"use strict";

// ---------- utilidades ----------
const PROPS = new Set(["value", "checked", "disabled", "hidden", "selected", "required", "maxLength", "textContent"]);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  const poe = (k) => { const v = props[k]; if (v == null || v === false) return;
    if (k === "class") el.className = v;
    else if (k === "on") for (const [e, f] of Object.entries(v)) el.addEventListener(e, f);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v)); };
  const adiar = [];
  if (props) for (const k of Object.keys(props)) { if (k === "value") adiar.push(k); else poe(k); }
  const poeKids = (list) => { for (const k of list) { if (k == null || k === false) continue; if (Array.isArray(k)) poeKids(k); else el.append(k instanceof Node ? k : document.createTextNode(String(k))); } };
  poeKids(kids);
  adiar.forEach(poe); // value de <select> só vale depois das <option>
  return el;
}
const $ = (s, r) => (r || document).querySelector(s);
const trocar = (el, ...kids) => { el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false)); };
let _u = 0; const uid = (p) => p + (++_u);
const quando = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); };
const seguro = (u) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; } };
const PAPEL = { usuario: "Usuário", moderador: "Moderador", admin: "Admin" };
const RARIDADES_CARTA = ["Comum", "Relevante", "Raro", "Relíquia", "Lendário", "Mítico"];
const RARIDADES_MEME = [...RARIDADES_CARTA, "Clássico"];
const STATUS_MEME = { publicado: "Publicado", oculto: "Oculto", removido: "Removido" };
const norm = (v) => (v == null ? "" : String(v));

let eu = null;           // resposta de /api/eu
const app = $("#app");

// ---------- avisos (aria-live) ----------
function aviso(msg, tipo) {
  const erro = tipo === "erro";
  const caixa = $(erro ? "#av-erro" : "#av-ok");
  const el = h("div", { class: "aviso " + (erro ? "erro" : "ok") }, h("span", null, msg),
    h("button", { type: "button", "aria-label": "Fechar aviso", on: { click: () => el.remove() } }, "Fechar"));
  caixa.append(el);
  setTimeout(() => el.remove(), erro ? 15000 : 6000);
}

// ---------- API ----------
async function api(metodo, caminho, corpo) {
  const o = { method: metodo, credentials: "same-origin", headers: {} };
  if (metodo !== "GET") { o.headers["X-CSRF"] = (eu && eu.csrf) || ""; o.headers["Content-Type"] = "application/json"; }
  if (corpo !== undefined) o.body = JSON.stringify(corpo);
  let r;
  try { r = await fetch(caminho, o); } catch (e) { return { ok: false, status: 0, data: {} }; }
  let data = null; try { data = await r.json(); } catch (e) { /* sem corpo JSON */ }
  if (r.status === 401 && caminho !== "/api/eu") sessaoExpirou();
  return { ok: r.ok, status: r.status, data: data || {} };
}
function msgErro(r) {
  const d = r.data || {};
  if (r.status === 0) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  if (typeof d.erro === "string" && d.erro) return d.erro;
  if (typeof d.error === "string" && d.error) return d.error;
  if (r.status === 401) return "Sua sessão expirou. Entre de novo.";
  if (r.status === 403) return "Você não tem permissão para isso.";
  if (r.status === 404) return "Não encontrado.";
  if (r.status === 409) return "Conflito: o item mudou ou já foi tratado.";
  if (r.status === 429) return "Muitas ações em pouco tempo. Aguarde um instante e tente de novo.";
  return "Algo deu errado (código " + r.status + ").";
}

// ---------- estados ----------
const carregando = (t) => h("div", { class: "estado", role: "status" }, h("span", { class: "spin", "aria-hidden": "true" }), t || "Carregando…");
const vazio = (t) => h("div", { class: "estado" }, t);
const erroEstado = (t, retry) => h("div", { class: "estado erro", role: "alert" }, t, retry ? h("div", null, h("button", { class: "b", type: "button", on: { click: retry } }, "Tentar de novo")) : null);
const chip = (t, cls) => h("span", { class: "chip" + (cls ? " " + cls : "") }, t);

// ---------- diálogos ----------
function fecharDialogos() { document.querySelectorAll("dialog[open]").forEach((d) => d.close()); }
function abrirDialogo(dlg) { document.body.append(dlg); dlg.addEventListener("close", () => dlg.remove()); dlg.showModal(); }

/** Confirmação. opts: {titulo, texto, ok, perigo, motivo:{rotulo,max}}. Resolve null (cancelou) ou {motivo}. */
function confirmar(opts) {
  return new Promise((resolve) => {
    let feito = false;
    const idT = uid("dt"), idM = uid("dm");
    const motivo = opts.motivo ? h("textarea", { id: idM, maxLength: opts.motivo.max, rows: 3 }) : null;
    const dlg = h("dialog", { "aria-labelledby": idT, role: "alertdialog" },
      h("form", { class: "dlg", on: { submit: (e) => { e.preventDefault(); feito = true; resolve({ motivo: motivo ? motivo.value.trim() : "" }); dlg.close(); } } },
        h("header", null, h("h2", { id: idT }, opts.titulo)),
        h("div", { class: "corpo" }, h("p", null, opts.texto),
          motivo ? h("div", { class: "campo" }, h("label", { for: idM }, opts.motivo.rotulo), motivo) : null),
        h("footer", null,
          h("button", { class: "b", type: "button", on: { click: () => dlg.close() } }, "Cancelar"),
          h("button", { class: "b " + (opts.perigo ? "bad" : "pri"), type: "submit" }, opts.ok || "Confirmar"))));
    dlg.addEventListener("close", () => { if (!feito) resolve(null); });
    abrirDialogo(dlg);
    $("footer .b", dlg).focus();
  });
}

/** Formulário em diálogo. campos: [{n,r,t:'texto|area|num|data|sel|lista|midias',ops,max,dica,req,nulo,ro}] */
function formulario({ titulo, intro, campos, valores, ok, salvar }) {
  valores = valores || {};
  return new Promise((resolve) => {
    let feito = false;
    const idT = uid("dt"), refs = {};
    const geral = h("p", { class: "erro-geral", role: "alert" });
    const corpo = h("div", { class: "corpo" }, intro ? h("p", { class: "mini" }, intro) : null);
    let linhaDupla = null;
    for (const c of campos) {
      const id = uid("f-" + c.n + "-");
      const erro = h("p", { class: "erro", id: id + "-e" });
      const dicaEl = c.dica ? h("p", { class: "dica", id: id + "-d" }, c.dica) : null;
      let entrada, ler;
      const desc = [dicaEl ? id + "-d" : null, id + "-e"].filter(Boolean).join(" ");
      const v0 = valores[c.n];
      if (c.t === "area") { entrada = h("textarea", { id, maxLength: c.max, value: norm(v0), "aria-describedby": desc, rows: 5 }); ler = () => { const v = entrada.value.trim(); return v === "" && c.nulo ? null : v; }; }
      else if (c.t === "sel") { entrada = h("select", { id, value: norm(v0), "aria-describedby": desc }, (c.ops || []).map((o) => { const [v, r] = Array.isArray(o) ? o : [o, o]; return h("option", { value: v }, r); })); ler = () => entrada.value; }
      else if (c.t === "num") { entrada = h("input", { id, type: "number", inputmode: "numeric", value: norm(v0), "aria-describedby": desc }); ler = () => (entrada.value.trim() === "" ? (c.nulo ? null : undefined) : Number(entrada.value)); }
      else if (c.t === "data") { entrada = h("input", { id, type: "date", value: norm(v0), "aria-describedby": desc }); ler = () => entrada.value || null; }
      else if (c.t === "lista") { entrada = h("input", { id, type: "text", value: (v0 || []).join(", "), "aria-describedby": desc }); ler = () => entrada.value.split(",").map((s) => s.trim()).filter(Boolean); }
      else if (c.t === "midias") { const ed = editorMidias(v0 || [], id, desc); entrada = ed.el; ler = ed.ler; }
      else { entrada = h("input", { id, type: "text", maxLength: c.max, value: norm(v0), disabled: !!c.ro, "aria-describedby": desc }); ler = () => { const v = entrada.value.trim(); return v === "" && c.nulo ? null : v; }; }
      if (c.req && c.t !== "midias") entrada.setAttribute("aria-required", "true");
      refs[c.n] = { entrada, erro, ler };
      const bloco = h("div", { class: "campo" }, c.t === "midias" ? h("span", { class: "rot", id: id + "-l" }, c.r) : h("label", { for: id }, c.r + (c.req ? " (obrigatório)" : "")), entrada, dicaEl, erro);
      if (c.meia) { if (!linhaDupla) { linhaDupla = h("div", { class: "duas" }); corpo.append(linhaDupla); } linhaDupla.append(bloco); }
      else { linhaDupla = null; corpo.append(bloco); }
    }
    corpo.append(geral);
    const salvarBtn = h("button", { class: "b pri", type: "submit" }, ok || "Salvar");
    const dlg = h("dialog", { "aria-labelledby": idT },
      h("form", { class: "dlg", novalidate: true, on: { submit: async (e) => {
        e.preventDefault();
        for (const r of Object.values(refs)) { r.erro.textContent = ""; r.entrada.removeAttribute("aria-invalid"); }
        geral.textContent = "";
        const v = {}; for (const c of campos) v[c.n] = refs[c.n].ler();
        salvarBtn.disabled = true;
        const r = await salvar(v);
        salvarBtn.disabled = false;
        if (r && r.ok) { feito = true; resolve(r); dlg.close(); return; }
        if (!r) return;
        const cs = (r.data && r.data.campos) || {}; let primeiro = null;
        for (const [k, m] of Object.entries(cs)) {
          if (refs[k]) { refs[k].erro.textContent = String(m); refs[k].entrada.setAttribute("aria-invalid", "true"); primeiro = primeiro || refs[k].entrada; }
        }
        const soltos = Object.keys(cs).filter((k) => !refs[k]).map((k) => k + ": " + cs[k]);
        const extra = ((r.data && r.data.desconhecidos) || []).length ? "Campos não aceitos: " + r.data.desconhecidos.join(", ") : "";
        geral.textContent = [primeiro ? "Corrija os campos marcados." : msgErro(r), ...soltos, extra].filter(Boolean).join(" ");
        (primeiro && primeiro.focus && primeiro.focus());
      } } },
        h("header", null, h("h2", { id: idT }, titulo)), corpo,
        h("footer", null, h("button", { class: "b", type: "button", on: { click: () => dlg.close() } }, "Cancelar"), salvarBtn)));
    dlg.addEventListener("close", () => { if (!feito) resolve(null); });
    abrirDialogo(dlg);
    const primeiro = $("input:not([disabled]),textarea,select", corpo); if (primeiro) primeiro.focus();
  });
}

function editorMidias(inicial, id, desc) {
  const raiz = h("div", { class: "campo", role: "group", "aria-labelledby": id + "-l", "aria-describedby": desc });
  const lista = h("div", { class: "campo" }); const linhas = [];
  function nova(m) {
    m = m || {};
    const k = uid("m");
    const f = (nome, rot, val, max) => { const e = h("input", { id: k + nome, type: "text", maxLength: max, value: norm(val) }); return [e, h("div", { class: "campo" }, h("label", { for: k + nome }, rot), e)]; };
    const tipo = h("select", { id: k + "t", value: m.tipo || "imagem" }, h("option", { value: "imagem" }, "Imagem"), h("option", { value: "video_arquivo" }, "Vídeo (arquivo)"));
    const [cam, camB] = f("c", "Caminho no site (ex.: memes/arquivo.jpg)", m.caminho, 200);
    const [ori, oriB] = f("o", "Link de origem (opcional)", m.origem_url, 500);
    const [cpor, cporB] = f("p", "Crédito: quem (opcional)", m.credito_por, 120);
    const [curl, curlB] = f("u", "Crédito: link (opcional)", m.credito_url, 500);
    const larg = h("input", { id: k + "w", type: "number", inputmode: "numeric", value: norm(m.largura) });
    const alt = h("input", { id: k + "a", type: "number", inputmode: "numeric", value: norm(m.altura) });
    const el = h("div", { class: "midia" },
      h("div", { class: "duas" }, h("div", { class: "campo" }, h("label", { for: k + "t" }, "Tipo"), tipo), camB),
      oriB, h("div", { class: "duas" }, cporB, curlB),
      h("div", { class: "duas" }, h("div", { class: "campo" }, h("label", { for: k + "w" }, "Largura (px)"), larg), h("div", { class: "campo" }, h("label", { for: k + "a" }, "Altura (px)"), alt)),
      h("div", null, h("button", { class: "b bad peq", type: "button", on: { click: () => { el.remove(); linhas.splice(linhas.indexOf(l), 1); } } }, "Remover esta mídia")));
    const nul = (e) => (e.value.trim() === "" ? null : e.value.trim());
    const l = { el, ler: () => ({ tipo: tipo.value, caminho: cam.value.trim(), origem_url: nul(ori), credito_por: nul(cpor), credito_url: nul(curl), largura: larg.value.trim() === "" ? null : Number(larg.value), altura: alt.value.trim() === "" ? null : Number(alt.value) }) };
    linhas.push(l); lista.append(el); return l;
  }
  inicial.forEach(nova);
  raiz.append(lista, h("div", null, h("button", { class: "b peq", type: "button", on: { click: () => nova().el.querySelector("input").focus() } }, "Adicionar mídia")));
  return { el: raiz, ler: () => linhas.map((l) => l.ler()) };
}

// ---------- lista paginada (cursor ou offset) ----------
function listaPaginada(box, { buscar, desenhar, vazio: txtVazio, resumo }) {
  let cursor = null, ul = null, resumoEl = null, mais = null, ocupado = false;
  async function carregar(reset) {
    if (ocupado) return; ocupado = true;
    if (reset) { cursor = null; trocar(box, carregando()); } else mais.disabled = true;
    const r = await buscar(cursor);
    ocupado = false;
    if (!r.ok) { if (reset) trocar(box, erroEstado(msgErro(r), () => carregar(true))); else { mais.disabled = false; aviso(msgErro(r), "erro"); } return; }
    if (reset) {
      if (!r.itens.length) { trocar(box, vazio(txtVazio)); return; }
      ul = h("ul", { class: "lista" }); resumoEl = h("p", { class: "mini", role: "status" });
      mais = h("button", { class: "b", type: "button", on: { click: () => carregar(false) } }, "Carregar mais");
      trocar(box, resumoEl, ul, h("div", { class: "pager" }, mais));
    }
    r.itens.forEach((i) => ul.append(desenhar(i)));
    cursor = r.proximo;
    mais.parentNode.hidden = cursor == null; mais.disabled = false;
    resumoEl.textContent = resumo ? resumo(r, ul.children.length) : ul.children.length + " itens carregados.";
  }
  carregar(true);
  return { recarregar: () => carregar(true) };
}

// ---------- navegação por abas ----------
const ABAS = [
  { id: "visao", nome: "Visão geral", papeis: ["admin"], montar: abaVisao, sempre: true },
  { id: "moderacao", nome: "Moderação", papeis: ["moderador", "admin"], montar: abaMod, sempre: true },
  { id: "usuarios", nome: "Usuários", papeis: ["admin"], montar: abaUsuarios },
  { id: "memes", nome: "Memes", papeis: ["admin"], montar: abaMemes },
  { id: "cartas", nome: "Cartas e coleções", papeis: ["admin"], montar: abaCartas },
  { id: "eras", nome: "Eras", papeis: ["admin"], montar: abaEras },
  { id: "comunidade", nome: "Comunidade", papeis: ["admin"], montar: abaComunidade },
  { id: "log", nome: "Log", papeis: ["admin"], montar: abaLog },
  { id: "mcp", nome: "MCP", papeis: ["admin"], montar: abaMcp }
];

function painel() {
  const visiveis = ABAS.filter((a) => a.papeis.includes(eu.papel));
  const tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "Seções do painel" });
  const paineis = h("div");
  const mapa = {};
  for (const a of visiveis) {
    const b = h("button", { class: "tab", type: "button", role: "tab", id: "t-" + a.id, "aria-controls": "p-" + a.id, "aria-selected": "false", tabindex: "-1" }, a.nome);
    const p = h("section", { role: "tabpanel", id: "p-" + a.id, "aria-labelledby": "t-" + a.id, hidden: true, tabindex: "0" });
    b.addEventListener("click", () => { if (location.hash !== "#" + a.id) location.hash = a.id; else ativar(a.id); });
    tabs.append(b); paineis.append(p); mapa[a.id] = { a, b, p, montado: false };
  }
  tabs.addEventListener("keydown", (e) => {
    const ids = Object.keys(mapa); const i = ids.findIndex((k) => mapa[k].b === document.activeElement);
    if (i < 0) return; let j = null;
    if (e.key === "ArrowRight") j = (i + 1) % ids.length; else if (e.key === "ArrowLeft") j = (i - 1 + ids.length) % ids.length;
    else if (e.key === "Home") j = 0; else if (e.key === "End") j = ids.length - 1;
    if (j == null) return; e.preventDefault(); mapa[ids[j]].b.focus(); location.hash = ids[j];
  });
  function ativar(id) {
    if (!mapa[id]) id = visiveis[0].id;
    for (const [k, t] of Object.entries(mapa)) { const on = k === id; t.b.setAttribute("aria-selected", on); t.b.tabIndex = on ? 0 : -1; t.p.hidden = !on; }
    const t = mapa[id];
    if (!t.montado || t.a.sempre) { t.montado = true; trocar(t.p); t.a.montar(t.p); }
  }
  window.addEventListener("hashchange", () => { if ($("#p-" + (location.hash.slice(1) || "x")) || !location.hash) ativar(location.hash.slice(1)); });
  trocar(app, tabs, paineis);
  ativar(location.hash.slice(1));
}

// ---------- Visão geral ----------
function abaVisao(p) {
  const cartao = (titulo, aba, carregar) => {
    const num = h("p", { class: "num", "aria-live": "polite" }, "…"), mini = h("p", { class: "mini" });
    const corpo = h("div", { class: "card" }, h("h2", null, titulo), num, mini, h("p", { class: "acts" }, h("a", { class: "b peq", href: "#" + aba }, "Abrir " + titulo.toLowerCase())));
    const ir = async () => {
      num.textContent = "…"; num.classList.remove("alerta"); mini.textContent = "Carregando…";
      try { const r = await carregar(); num.textContent = r.valor; mini.textContent = r.texto || ""; if (r.alerta) num.classList.add("alerta"); }
      catch (e) { num.textContent = "—"; mini.textContent = ""; mini.append(e.msg || "Não foi possível carregar. ", h("button", { class: "b peq", type: "button", on: { click: ir } }, "Tentar de novo")); }
    };
    ir(); return corpo;
  };
  const ok = (r) => { if (!r.ok) throw { msg: r.status === 404 ? "Indisponível ainda neste servidor." : msgErro(r) + " " }; return r.data; };
  trocar(p, h("div", { class: "grid g4" },
    cartao("Memes", "memes", async () => {
      const [a, b, c] = await Promise.all(["publicado", "oculto", "removido"].map((s) => api("GET", "/api/admin/memes?limite=1&status=" + s)));
      return { valor: ok(a).total, texto: "publicados · " + ok(b).total + " ocultos · " + ok(c).total + " removidos" };
    }),
    cartao("Moderação", "moderacao", async () => {
      const f = ok(await api("GET", "/api/mod/fila")).itens || [];
      return { valor: f.length, texto: "envios na fila · " + f.filter((x) => !x.meu_voto).length + " esperando seu voto" };
    }),
    cartao("Remoções", "moderacao", async () => {
      const f = (ok(await api("GET", "/api/mod/remocoes")).itens || []).filter((x) => x.status === "aberta");
      const atr = f.filter((x) => x.atrasada).length;
      return { valor: f.length, texto: "pedidos abertos" + (atr ? " · " + atr + " atrasados" : ""), alerta: atr > 0 };
    }),
    cartao("Links sugeridos", "comunidade", async () => {
      const n = (ok(await api("GET", "/api/admin/links")).items || []).filter((x) => x.status === "pendente").length;
      return { valor: n, texto: "esperando aprovação" };
    }),
    cartao("Feedback", "comunidade", async () => ({ valor: (ok(await api("GET", "/api/admin/feedback")).items || []).length, texto: "mensagens recebidas" }))
  ));
}

// ---------- Moderação ----------
const VOTOS = { aprovado: "Aprovar", rejeitado: "Rejeitar", ajuste: "Pedir ajuste", duplicado: "Duplicado" };
const VOTO_PASSADO = { aprovado: "Aprovado", rejeitado: "Rejeitado", ajuste: "Ajuste pedido", duplicado: "Duplicado" };
let contadores = [];
setInterval(() => { contadores = contadores.filter((c) => c.el.isConnected); contadores.forEach(pintaPrazo); }, 30000);
function textoPrazo(iso) {
  const ms = new Date(iso) - Date.now();
  if (isNaN(ms)) return { t: "prazo indisponível", atrasado: false };
  const abs = Math.abs(ms), hh = Math.floor(abs / 36e5), mm = Math.floor((abs % 36e5) / 6e4);
  const t = hh + " h " + String(mm).padStart(2, "0") + " min";
  return ms < 0 ? { t: "atrasada há " + t, atrasado: true } : { t: "faltam " + t, atrasado: false };
}
function pintaPrazo(c) { const r = textoPrazo(c.prazo); c.el.textContent = "Prazo de 72 h: " + r.t; c.el.classList.toggle("bad", r.atrasado || c.forcaAtraso); }

function abaMod(p) {
  contadores = [];
  const fila = h("div"), rem = h("div");
  trocar(p, h("div", { class: "sec" }, h("h2", null, "Fila de envios"), fila), h("div", { class: "sec" }, h("h2", null, "Pedidos de remoção"), rem));
  carregarFila(fila); carregarRemocoes(rem);
}

async function carregarFila(box) {
  trocar(box, carregando("Carregando a fila…"));
  const r = await api("GET", "/api/mod/fila");
  if (r.status === 404) return trocar(box, vazio("A fila de envios ainda não está disponível neste servidor."));
  if (!r.ok) return trocar(box, erroEstado(msgErro(r), () => carregarFila(box)));
  const itens = r.data.itens || [];
  if (!itens.length) return trocar(box, vazio("Nenhum envio esperando votos. Bom trabalho!"));
  trocar(box, h("p", { class: "mini" }, "Voto cego: você vê só quantos votos o envio já tem, nunca os votos dos outros. Dois votos iguais fecham o envio; se dividir, um admin desempata."),
    h("ul", { class: "lista" }, itens.map((i) => cartaoEnvio(i, box))));
}

function cartaoEnvio(i, box) {
  const idM = uid("motivo"), url = seguro(i.url);
  const motivo = h("textarea", { id: idM, maxLength: 300, rows: 2 });
  const botoes = Object.entries(VOTOS).map(([v, rot]) => h("button", { class: "b " + (v === "aprovado" ? "ok" : v === "rejeitado" ? "bad" : ""), type: "button", on: { click: () => votar(v) } }, rot));
  async function votar(v) {
    botoes.forEach((b) => (b.disabled = true));
    const corpo = { voto: v }; if (motivo.value.trim()) corpo.motivo = motivo.value.trim();
    const r = await api("POST", "/api/mod/fila/" + encodeURIComponent(i.id) + "/voto", corpo);
    if (!r.ok) { aviso(msgErro(r), "erro"); if (r.status === 409) carregarFila(box); else botoes.forEach((b) => (b.disabled = false)); return; }
    const d = r.data;
    if (d.decidido) aviso("Decidido: " + (VOTO_PASSADO[d.decidido] || d.decidido).toLowerCase() + (d.por === "desempate" ? " (desempate)" : " (consenso)") + (d.meme_id ? ". Meme criado: " + d.meme_id : "."), "ok");
    else aviso("Voto registrado (" + (VOTO_PASSADO[v]).toLowerCase() + "). Aguardando mais votos ou o desempate de um admin.", "ok");
    carregarFila(box);
  }
  return h("li", { class: "item" },
    h("div", { class: "item-h" }, h("h3", null, i.titulo), i.ano ? chip(i.ano) : null, i.categoria ? chip(i.categoria) : null,
      i.meu_voto ? chip("Seu voto: " + (VOTO_PASSADO[i.meu_voto] || i.meu_voto).toLowerCase(), "info") : null),
    h("div", { class: "meta" }, h("span", null, "Enviado por " + (i.autor || "—") + " · " + quando(i.criado_em)), h("span", null, (i.votos || 0) + (i.votos === 1 ? " voto" : " votos"))),
    url ? h("p", null, h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, url)) : (i.url ? h("p", { class: "mini" }, "Link inválido: " + i.url) : null),
    i.descricao ? h("p", { class: "txt" }, i.descricao) : null,
    i.meu_voto ? h("p", { class: "mini" }, "Você já votou neste envio. Aguardando os outros votos.")
      : h("div", null, h("div", { class: "campo" }, h("label", { for: idM }, "Motivo (opcional, até 300 caracteres)"), motivo), h("div", { class: "acts" }, botoes)));
}

async function carregarRemocoes(box) {
  trocar(box, carregando("Carregando pedidos de remoção…"));
  const r = await api("GET", "/api/mod/remocoes");
  if (r.status === 404) return trocar(box, vazio("Os pedidos de remoção ainda não estão disponíveis neste servidor."));
  if (!r.ok) return trocar(box, erroEstado(msgErro(r), () => carregarRemocoes(box)));
  const todos = r.data.itens || [];
  const idF = uid("rf");
  const sel = h("select", { id: idF, value: "aberta" }, h("option", { value: "aberta" }, "Abertas"), h("option", { value: "" }, "Todas"), h("option", { value: "atendida" }, "Atendidas"), h("option", { value: "negada" }, "Negadas"));
  const area = h("div");
  function desenhar() {
    contadores = [];
    const lista = todos.filter((x) => !sel.value || x.status === sel.value).sort((a, b) => (a.status === "aberta" ? 0 : 1) - (b.status === "aberta" ? 0 : 1) || new Date(a.prazo_em) - new Date(b.prazo_em));
    if (!lista.length) return trocar(area, vazio(sel.value === "aberta" ? "Nenhum pedido de remoção aberto." : "Nenhum pedido neste filtro."));
    trocar(area, h("ul", { class: "lista" }, lista.map((x) => cartaoRemocao(x, box))));
  }
  sel.addEventListener("change", desenhar);
  trocar(box, h("div", { class: "filtros" }, h("div", { class: "campo" }, h("label", { for: idF }, "Mostrar"), sel)), area);
  desenhar();
}

function cartaoRemocao(x, box) {
  const aberta = x.status === "aberta";
  const cd = h("span", { class: "cd", role: "timer" });
  const atrasada = aberta && (x.atrasada || textoPrazo(x.prazo_em).atrasado);
  if (aberta) { const c = { el: cd, prazo: x.prazo_em, forcaAtraso: !!x.atrasada }; contadores.push(c); pintaPrazo(c); }
  async function decidir(dec) {
    const c = await confirmar(dec === "atendida"
      ? { titulo: "Atender o pedido?", texto: "O meme \"" + (x.meme_titulo || x.meme_id) + "\" sai do site. Confirme só se o pedido é legítimo.", ok: "Atender e tirar do site", perigo: true }
      : { titulo: "Negar o pedido?", texto: "O meme \"" + (x.meme_titulo || x.meme_id) + "\" continua no site e o pedido fica como negado.", ok: "Negar pedido" });
    if (!c) return;
    const r = await api("POST", "/api/mod/remocoes/" + encodeURIComponent(x.id), { decisao: dec });
    if (!r.ok) { aviso(msgErro(r), "erro"); return; }
    aviso(dec === "atendida" ? "Pedido atendido: o meme saiu do site." : "Pedido negado.", "ok");
    carregarRemocoes(box);
  }
  return h("li", { class: "item" + (atrasada ? " atrasada" : "") },
    h("div", { class: "item-h" }, h("h3", null, x.meme_titulo || x.meme_id), x.meme_id ? h("span", { class: "chip cod" }, x.meme_id) : null,
      chip(aberta ? (atrasada ? "Aberta · atrasada" : "Aberta") : x.status === "atendida" ? "Atendida" : "Negada", aberta ? (atrasada ? "bad" : "warn") : x.status === "atendida" ? "ok" : "")),
    h("div", { class: "meta" }, h("span", null, "Pedido por " + (x.solicitante || "—")), x.contato ? h("span", null, "Contato: " + x.contato) : null, h("span", null, "Recebido em " + quando(x.criado_em))),
    x.motivo ? h("p", { class: "txt" }, x.motivo) : null,
    aberta ? h("p", null, cd) : h("p", { class: "mini" }, x.respondido_em ? "Respondido em " + quando(x.respondido_em) : ""),
    aberta ? h("div", { class: "acts" }, h("button", { class: "b bad", type: "button", on: { click: () => decidir("atendida") } }, "Atender (tirar do site)"), h("button", { class: "b", type: "button", on: { click: () => decidir("negada") } }, "Negar")) : null);
}

// ---------- Usuários ----------
function abaUsuarios(p) {
  const idB = uid("ub"), idP = uid("up"), idN = uid("un");
  const busca = h("input", { id: idB, type: "search", maxLength: 20, autocomplete: "off", "aria-describedby": idB + "e" });
  const erroB = h("p", { class: "erro", id: idB + "e" });
  const papel = h("select", { id: idP }, h("option", { value: "" }, "Todos"), Object.entries(PAPEL).map(([v, r]) => h("option", { value: v }, r)));
  const ban = h("select", { id: idN }, h("option", { value: "" }, "Todos"), h("option", { value: "0" }, "Não banidos"), h("option", { value: "1" }, "Banidos"));
  const box = h("div"); let lp = null;
  const form = h("form", { class: "filtros", role: "search", on: { submit: (e) => { e.preventDefault(); filtrar(); } } },
    h("div", { class: "campo larg" }, h("label", { for: idB }, "Apelido contém"), busca, erroB),
    h("div", { class: "campo" }, h("label", { for: idP }, "Papel"), papel), h("div", { class: "campo" }, h("label", { for: idN }, "Situação"), ban),
    h("button", { class: "b pri", type: "submit" }, "Filtrar"));
  function filtrar() {
    erroB.textContent = ""; busca.removeAttribute("aria-invalid");
    const b = busca.value.trim();
    if (b && !/^[A-Za-z0-9_.-]{1,20}$/.test(b)) { erroB.textContent = "Use só letras sem acento, números, ponto, hífen e sublinhado (até 20)."; busca.setAttribute("aria-invalid", "true"); busca.focus(); return; }
    lp = listaPaginada(box, {
      vazio: "Nenhum usuário encontrado com esses filtros.",
      buscar: async (antes) => {
        const q = new URLSearchParams({ limite: "50" }); if (b) q.set("busca", b); if (papel.value) q.set("papel", papel.value); if (ban.value) q.set("banido", ban.value); if (antes) q.set("antes", antes);
        const r = await api("GET", "/api/admin/usuarios?" + q); return { ...r, itens: r.data.items || [], proximo: r.data.proximo || null };
      },
      desenhar: linhaUsuario, resumo: (r, n) => n + " usuários carregados."
    });
  }
  trocar(p, form, box); filtrar();
}

function linhaUsuario(u) {
  const eleMesmo = eu.usuario && String(eu.usuario.id) === String(u.id);
  const idS = uid("papel");
  const sel = h("select", { id: idS, value: u.papel, disabled: eleMesmo, "aria-label": "Papel de " + u.apelido }, Object.entries(PAPEL).map(([v, r]) => h("option", { value: v }, r)));
  const li = h("li", { class: "item" },
    h("div", { class: "item-h" }, h("h3", null, u.apelido || "(sem apelido)"), eleMesmo ? chip("você", "info") : null, chip(PAPEL[u.papel] || u.papel, u.papel === "admin" ? "warn" : u.papel === "moderador" ? "info" : ""), u.banido ? chip("Banido", "bad") : null),
    h("div", { class: "meta" }, h("span", null, "ID " + u.id), h("span", null, u.xp + " XP"), h("span", null, u.moedas + " moedas"), h("span", null, "Criado em " + quando(u.criado_em)), h("span", null, "Último acesso: " + (u.ultimo_acesso ? quando(u.ultimo_acesso) : "nunca"))),
    eleMesmo ? h("p", { class: "mini" }, "Esta é a sua conta: não dá para alterá-la aqui.")
      : h("div", { class: "acts" }, h("label", { for: idS }, "Papel"), sel,
        h("button", { class: "b " + (u.banido ? "" : "bad"), type: "button", on: { click: banir } }, u.banido ? "Desbanir" : "Banir")));
  const troca = (novo) => { const n = linhaUsuario(novo); li.replaceWith(n); const f = $("select,button", n.querySelector(".acts") || n); if (f) f.focus(); };
  sel.addEventListener("change", async () => {
    const novo = sel.value;
    const c = await confirmar({ titulo: "Mudar o papel?", texto: "Mudar o papel de " + u.apelido + " para " + PAPEL[novo] + "?", ok: "Mudar papel" });
    if (!c) { sel.value = u.papel; return; }
    const r = await api("POST", "/api/admin/usuarios/" + encodeURIComponent(u.id) + "/papel", { papel: novo });
    if (!r.ok) { sel.value = u.papel; aviso(msgErro(r), "erro"); return; }
    aviso("Papel de " + u.apelido + " agora é " + PAPEL[novo] + ".", "ok"); troca(r.data.usuario || { ...u, papel: novo });
  });
  async function banir() {
    const banindo = !u.banido;
    const c = await confirmar(banindo
      ? { titulo: "Banir " + u.apelido + "?", texto: "A pessoa perde o acesso na hora e as sessões dela caem.", ok: "Banir", perigo: true, motivo: { rotulo: "Motivo (opcional, até 200 caracteres)", max: 200 } }
      : { titulo: "Desbanir " + u.apelido + "?", texto: "A pessoa volta a poder entrar no site.", ok: "Desbanir" });
    if (!c) return;
    const corpo = { banido: banindo }; if (banindo && c.motivo) corpo.motivo = c.motivo;
    const r = await api("POST", "/api/admin/usuarios/" + encodeURIComponent(u.id) + "/banir", corpo);
    if (!r.ok) { aviso(msgErro(r), "erro"); return; }
    aviso(u.apelido + (banindo ? " foi banido(a)." : " foi desbanido(a)."), "ok"); troca(r.data.usuario || { ...u, banido: banindo });
  }
  return li;
}

// ---------- Log ----------
const ACOES = ["meme.criar", "meme.editar", "carta.criar", "carta.editar", "colecao.editar", "era.editar", "usuario.papel", "usuario.banir", "usuario.desbanir", "envio.decidir", "link.aprovar", "link.recusar", "feedback.excluir", "comentario.excluir", "contribuidor.excluir"];
const fmt = (v) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
function detalheLinhas(d) {
  if (d == null || d === "") return null;
  if (typeof d !== "object") return h("ul", { class: "det" }, h("li", null, String(d)));
  const itens = [];
  const campos = d.campos && typeof d.campos === "object" ? d.campos : null;
  if (campos) for (const [k, v] of Object.entries(campos)) {
    itens.push(v && typeof v === "object" && ("de" in v || "para" in v)
      ? h("li", null, h("b", null, k + ": "), h("span", { class: "de" }, fmt(v.de)), " → ", h("span", { class: "para" }, fmt(v.para)))
      : h("li", null, h("b", null, k + ": "), fmt(v)));
  }
  for (const [k, v] of Object.entries(d)) {
    if (k === "campos" && campos) continue;
    itens.push(k === "de" && "para" in d ? null : k === "para" && "de" in d ? h("li", null, h("span", { class: "de" }, fmt(d.de)), " → ", h("span", { class: "para" }, fmt(d.para))) : h("li", null, h("b", null, k + ": "), fmt(v)));
  }
  const f = itens.filter(Boolean);
  return f.length ? h("ul", { class: "det" }, f) : null;
}

function abaLog(p) {
  const idA = uid("la"), idU = uid("lu");
  const acao = h("input", { id: idA, type: "text", list: idA + "l", maxLength: 60, autocomplete: "off" });
  const usu = h("input", { id: idU, type: "text", inputmode: "numeric", maxLength: 18, autocomplete: "off" });
  const erroU = h("p", { class: "erro", id: idU + "e" });
  const box = h("div");
  function filtrar() {
    erroU.textContent = ""; usu.removeAttribute("aria-invalid");
    const a = acao.value.trim(), u = usu.value.trim();
    if (u && !/^\d{1,18}$/.test(u)) { erroU.textContent = "Digite só o número do ID."; usu.setAttribute("aria-invalid", "true"); usu.focus(); return; }
    listaPaginada(box, {
      vazio: "Nenhum registro no log com esses filtros.",
      buscar: async (antes) => { const q = new URLSearchParams({ limite: "50" }); if (a) q.set("acao", a); if (u) q.set("usuario_id", u); if (antes) q.set("antes", antes);
        const r = await api("GET", "/api/admin/log?" + q); return { ...r, itens: r.data.items || [], proximo: r.data.proximo || null }; },
      desenhar: (l) => h("li", { class: "item" },
        h("div", { class: "item-h" }, chip(l.acao, "info"), h("span", { class: "chip cod" }, l.alvo || "—"), h("span", { class: "mini" }, quando(l.criado_em))),
        h("div", { class: "meta" }, h("span", null, "Por " + (l.apelido || "token de emergência / sistema") + (l.usuario_id ? " (ID " + l.usuario_id + ")" : ""))), detalheLinhas(l.detalhe)),
      resumo: (r, n) => n + " registros carregados (do mais novo ao mais antigo)."
    });
  }
  trocar(p, h("form", { class: "filtros", role: "search", on: { submit: (e) => { e.preventDefault(); filtrar(); } } },
    h("div", { class: "campo larg" }, h("label", { for: idA }, "Ação (ex.: meme.editar)"), acao, h("datalist", { id: idA + "l" }, ACOES.map((a) => h("option", { value: a })))),
    h("div", { class: "campo" }, h("label", { for: idU }, "ID do usuário"), usu, erroU), h("button", { class: "b pri", type: "submit" }, "Filtrar")), box);
  filtrar();
}

// ---------- MCP: chaves de API e llms.txt ----------
const ESCOPOS_MCP = [
  ["ler", "Ler", "Buscar memes, conferir duplicados e listar valores válidos. Não altera nada."],
  ["escrever", "Escrever", "Criar e editar memes como rascunho oculto, anexar mídias e criar cartas."],
  ["publicar", "Publicar", "Publicar direto, sem passar pelo painel. Use só em chave de confiança."]
];
const ROTULO_ESCOPO = { ler: "Ler", escrever: "Escrever", publicar: "Publicar" };
const ESTADO_CHAVE = { ativa: ["Ativa", "ok"], expirada: ["Expirada", "warn"], revogada: ["Revogada", "bad"] };

function copiarTexto(texto, ok) {
  const fim = () => aviso(ok || "Copiado.", "ok");
  const falha = () => aviso("Não consegui copiar. Selecione o texto e copie à mão.", "erro");
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(fim, falha); else falha();
}

function linhaChave(c, recarregar) {
  const [rotEstado, clsEstado] = ESTADO_CHAVE[c.estado] || [c.estado, ""];
  const revogar = async () => {
    const r = await confirmar({ titulo: "Revogar a chave?", texto: `A chave "${c.nome}" (ns_mcp_${c.prefixo}…) para de funcionar na hora e não dá para reativar.`, ok: "Revogar", perigo: true });
    if (!r) return;
    const x = await api("DELETE", "/api/admin/mcp/chaves/" + c.id);
    if (x.ok) { aviso("Chave revogada.", "ok"); recarregar(); } else aviso(msgErro(x), "erro");
  };
  return h("li", { class: "item" + (c.estado === "ativa" ? "" : " feito") },
    h("div", { class: "item-h" }, h("h3", null, c.nome), chip(rotEstado, clsEstado), c.minha ? chip("Minha", "info") : null),
    h("div", { class: "meta" },
      h("span", { class: "cod" }, "ns_mcp_" + c.prefixo + "…"),
      h("span", null, "Dono: " + c.dono),
      h("span", null, "Escopos: " + (c.escopos || []).map((e) => ROTULO_ESCOPO[e] || e).join(", "))),
    h("div", { class: "meta" },
      h("span", null, "Criada: " + quando(c.criada_em)),
      h("span", null, "Expira: " + quando(c.expira_em)),
      h("span", null, "Último uso: " + (c.ultimo_uso_em ? quando(c.ultimo_uso_em) : "nunca"))),
    c.estado === "ativa" ? h("div", { class: "acts" }, h("button", { class: "b bad", type: "button", on: { click: revogar } }, "Revogar")) : null);
}

function abaMcp(p) {
  const lista = h("div"), segredoBox = h("div");
  const idN = uid("mn"), idV = uid("mv");
  const nome = h("input", { id: idN, type: "text", maxLength: 60, autocomplete: "off", required: true, "aria-describedby": idN + "e" });
  const erroNome = h("p", { class: "erro", id: idN + "e" });
  const validade = h("select", { id: idV, value: "90" }, [30, 90, 180, 365].map((d) => h("option", { value: String(d) }, d + " dias")));
  const caixas = {};
  const escopoCampos = ESCOPOS_MCP.map(([v, rot, dica]) => {
    const id = uid("me-" + v + "-");
    const cx = h("input", { id, type: "checkbox", checked: v !== "publicar", disabled: v === "ler" });
    caixas[v] = cx;
    return h("label", { class: "opc", for: id }, cx, h("span", null, h("b", null, rot), h("span", { class: "dica" }, " " + dica)));
  });
  const geral = h("p", { class: "erro", role: "alert" });
  const enviar = h("button", { class: "b pri", type: "submit" }, "Criar chave");

  async function criar(e) {
    e.preventDefault();
    erroNome.textContent = ""; geral.textContent = ""; nome.removeAttribute("aria-invalid");
    const n = nome.value.trim();
    if (!n) { erroNome.textContent = "Dê um nome para reconhecer a chave (ex.: Notebook do Xet)."; nome.setAttribute("aria-invalid", "true"); nome.focus(); return; }
    enviar.disabled = true;
    const escopos = ESCOPOS_MCP.map(([v]) => v).filter((v) => v === "ler" || caixas[v].checked);
    const r = await api("POST", "/api/admin/mcp/chaves", { nome: n, escopos, dias: Number(validade.value) });
    enviar.disabled = false;
    if (!r.ok) {
      const c = r.data && r.data.campos;
      if (c && c.nome) { erroNome.textContent = c.nome; nome.setAttribute("aria-invalid", "true"); nome.focus(); } else geral.textContent = msgErro(r);
      return;
    }
    nome.value = "";
    mostrarSegredo(r.data.chave, r.data.item);
    carregar();
  }

  function mostrarSegredo(chave, item) {
    const cmd = 'claude mcp add --transport http naosalvo ' + location.origin + '/mcp --header "Authorization: Bearer ' + chave + '"';
    const idS = uid("ms");
    const campo = h("input", { id: idS, class: "cod", type: "text", readOnly: false, value: chave, "aria-label": "Chave criada", spellcheck: "false", autocomplete: "off" });
    campo.readOnly = true;
    trocar(segredoBox, h("section", { class: "card segredo", role: "status" },
      h("h2", null, "Chave criada: copie agora"),
      h("p", { class: "txt" }, "Esta é a única vez que a chave aparece. Guarde num gerenciador de senhas. Se perder, revogue e crie outra."),
      h("div", { class: "chave-linha" }, campo, h("button", { class: "b pri", type: "button", on: { click: () => copiarTexto(chave, "Chave copiada.") } }, "Copiar chave")),
      h("p", { class: "mini" }, `Nome: ${item.nome} · escopos: ${item.escopos.map((e) => ROTULO_ESCOPO[e]).join(", ")} · expira em ${quando(item.expira_em)}`),
      h("p", { class: "txt" }, "Para conectar o Claude Code:"),
      h("pre", { class: "llms" }, cmd),
      h("div", { class: "acts" },
        h("button", { class: "b", type: "button", on: { click: () => copiarTexto(cmd, "Comando copiado.") } }, "Copiar comando"),
        h("button", { class: "b", type: "button", on: { click: () => { trocar(segredoBox); nome.focus(); } } }, "Já guardei, fechar"))));
    campo.focus(); campo.select();
  }

  async function carregar() {
    trocar(lista, carregando("Carregando as chaves…"));
    const r = await api("GET", "/api/admin/mcp/chaves");
    if (!r.ok) return trocar(lista, erroEstado(msgErro(r), carregar));
    const itens = r.data.items || [];
    if (!itens.length) return trocar(lista, vazio("Nenhuma chave criada ainda."));
    trocar(lista, h("ul", { class: "lista" }, itens.map((c) => linhaChave(c, carregar))));
  }

  // llms.txt: texto para a IA, com as habilidades e o modo de uso (gerado pelo servidor a partir do registro de ferramentas)
  const llmsBox = h("div");
  let llmsTexto = "";
  async function carregarLlms() {
    trocar(llmsBox, carregando("Carregando o llms.txt…"));
    let r;
    try { r = await fetch("/api/admin/mcp/llms.txt", { credentials: "same-origin" }); } catch (e) { return trocar(llmsBox, erroEstado("Sem conexão com o servidor.", carregarLlms)); }
    if (!r.ok) return trocar(llmsBox, erroEstado("Não consegui carregar o llms.txt (código " + r.status + ").", carregarLlms));
    llmsTexto = await r.text();
    trocar(llmsBox,
      h("div", { class: "acts" },
        h("button", { class: "b", type: "button", on: { click: () => copiarTexto(llmsTexto, "llms.txt copiado.") } }, "Copiar"),
        h("button", { class: "b", type: "button", on: { click: () => {
          const a = h("a", { href: URL.createObjectURL(new Blob([llmsTexto], { type: "text/plain;charset=utf-8" })), download: "llms.txt" });
          document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
        } } }, "Baixar llms.txt")),
      h("pre", { class: "llms", tabindex: "0", "aria-label": "Conteúdo do llms.txt" }, llmsTexto));
  }

  trocar(p,
    h("section", { class: "sec" }, h("h2", null, "Criar chave de API"),
      h("p", { class: "mini" }, "Cada admin cria a sua. A chave age como você: se você deixar de ser admin, ela para de valer. Máximo de 5 chaves ativas por admin."),
      h("form", { class: "card form-chave", on: { submit: criar }, novalidate: true },
        h("div", { class: "campo" }, h("label", { for: idN }, "Nome da chave"), nome, erroNome),
        h("fieldset", { class: "escopos" }, h("legend", null, "O que a chave pode fazer"), escopoCampos),
        h("div", { class: "campo" }, h("label", { for: idV }, "Validade"), validade),
        geral, h("div", { class: "acts" }, enviar)),
      segredoBox),
    h("section", { class: "sec" }, h("h2", null, "Chaves"), lista),
    h("section", { class: "sec" }, h("h2", null, "llms.txt: habilidades e uso"),
      h("p", { class: "mini" }, "Texto para colar no assistente de IA (ou deixar o cliente MCP ler). É gerado a partir das ferramentas do servidor, então acompanha o que está ativo."), llmsBox));
  carregar(); carregarLlms();
}

// ---------- Memes ----------
let categorias = null;
async function carregaCategorias() {
  if (categorias) return categorias;
  const r = await api("GET", "/api/categorias");
  categorias = r.ok ? (r.data.itens || []).map((c) => c.nome) : [];
  return categorias;
}
const dia = (d) => (d ? String(d).slice(0, 10) : "");

function camposMeme(criando) {
  return (cats) => [
    ...(criando ? [{ n: "id", r: "Identificador (slug)", t: "texto", req: true, max: 80, dica: "Letras minúsculas, números e hífen (ex.: nyan-cat). Não dá para mudar depois." }] : []),
    { n: "titulo", r: "Título", t: "texto", req: true, max: 200 },
    { n: "ano", r: "Ano", t: "num", req: true, meia: true }, { n: "data", r: "Data (opcional)", t: "data", meia: true },
    { n: "categoria", r: "Categoria", t: "sel", req: true, ops: cats, meia: true }, { n: "raridade", r: "Raridade", t: "sel", req: true, ops: RARIDADES_MEME, meia: true },
    { n: "tipo", r: "Tipo", t: "sel", ops: [["video", "Vídeo"], ["foto", "Foto"]], meia: true }, { n: "status", r: "Situação", t: "sel", ops: Object.entries(STATUS_MEME), meia: true },
    { n: "emoji", r: "Emoji", t: "texto", nulo: true, max: 16, meia: true }, { n: "autor", r: "Autor", t: "texto", nulo: true, max: 80, meia: true },
    { n: "duracao", r: "Duração (segundos)", t: "num", nulo: true, meia: true }, { n: "youtube_id", r: "ID do YouTube", t: "texto", nulo: true, max: 11, dica: "11 caracteres, o que vem depois de v= no link.", meia: true },
    { n: "descricao", r: "Descrição", t: "area", nulo: true, max: 2000 },
    { n: "midias", r: "Mídias (substituem a lista inteira ao salvar)", t: "midias" }
  ];
}
const CAMPOS_SIMPLES = ["titulo", "ano", "data", "categoria", "raridade", "tipo", "status", "emoji", "autor", "duracao", "youtube_id", "descricao"];

async function abrirMeme(m, aoSalvar) {
  const criando = !m;
  const cats = await carregaCategorias();
  let orig = null;
  if (!criando) {
    const r = await api("GET", "/api/admin/memes/" + encodeURIComponent(m.id));
    if (!r.ok) { aviso(msgErro(r), "erro"); return; }
    orig = { ...r.data, data: dia(r.data.data), midias: r.data.midias || [] };
  }
  const lista = (v) => { const s = [...cats]; if (v && !s.includes(v)) s.unshift(v); return s; };
  const campos = camposMeme(criando)(lista(orig && orig.categoria));
  const r = await formulario({
    titulo: criando ? "Novo meme" : "Editar meme: " + orig.titulo, campos, ok: criando ? "Criar meme" : "Salvar meme",
    valores: criando ? { tipo: "video", status: "publicado", categoria: cats[0] || "", raridade: "Comum", midias: [] } : orig,
    salvar: async (v) => {
      if (criando) { const corpo = { id: v.id }; for (const k of CAMPOS_SIMPLES) if (v[k] !== undefined && v[k] !== null && v[k] !== "") corpo[k] = v[k]; if (v.midias.length) corpo.midias = v.midias; return api("POST", "/api/admin/memes", corpo); }
      const corpo = {}; for (const k of CAMPOS_SIMPLES) if (norm(v[k]) !== norm(orig[k])) corpo[k] = v[k] === undefined ? null : v[k];
      if (JSON.stringify(v.midias) !== JSON.stringify(orig.midias.map(({ id, ...x }) => x))) corpo.midias = v.midias;
      if (!Object.keys(corpo).length) return { ok: true, data: { semMudanca: true } };
      return api("PATCH", "/api/admin/memes/" + encodeURIComponent(m.id), corpo);
    }
  });
  if (!r) return;
  if (r.data.semMudanca) { aviso("Nada mudou.", "ok"); return; }
  aviso(criando ? "Meme criado." : "Meme salvo.", "ok"); aoSalvar(r.data.meme);
}

function abaMemes(p) {
  const idB = uid("mb"), idA = uid("ma"), idC = uid("mc"), idS = uid("ms");
  const busca = h("input", { id: idB, type: "search", maxLength: 60, autocomplete: "off" });
  const ano = h("input", { id: idA, type: "text", inputmode: "numeric", maxLength: 4, autocomplete: "off" });
  const cat = h("select", { id: idC }, h("option", { value: "" }, "Todas"));
  const st = h("select", { id: idS }, h("option", { value: "" }, "Todas"), Object.entries(STATUS_MEME).map(([v, r]) => h("option", { value: v }, r)));
  const box = h("div"); const erroA = h("p", { class: "erro", id: idA + "e" });
  let lp = null;
  function filtrar() {
    erroA.textContent = ""; ano.removeAttribute("aria-invalid");
    const a = ano.value.trim(); if (a && !/^\d{4}$/.test(a)) { erroA.textContent = "Digite o ano com 4 dígitos."; ano.setAttribute("aria-invalid", "true"); ano.focus(); return; }
    lp = listaPaginada(box, {
      vazio: "Nenhum meme encontrado com esses filtros.",
      buscar: async (off) => { off = off || 0; const q = new URLSearchParams({ limite: "50", offset: String(off) });
        if (busca.value.trim()) q.set("busca", busca.value.trim()); if (a) q.set("ano", a); if (cat.value) q.set("categoria", cat.value); if (st.value) q.set("status", st.value);
        const r = await api("GET", "/api/admin/memes?" + q); const it = r.data.itens || []; return { ...r, itens: it, proximo: off + it.length < (r.data.total || 0) ? off + it.length : null, total: r.data.total }; },
      desenhar: linhaMeme, resumo: (r, n) => n + " de " + (r.total != null ? r.total : n) + " memes."
    });
  }
  function linhaMeme(m) {
    const li = h("li", { class: "item" + (m.status !== "publicado" ? " feito" : "") },
      h("div", { class: "item-h" }, h("h3", null, (m.emoji ? m.emoji + " " : "") + m.titulo), chip(STATUS_MEME[m.status] || m.status, m.status === "publicado" ? "ok" : m.status === "oculto" ? "warn" : "bad")),
      h("div", { class: "meta" }, chip(m.ano), chip(m.categoria), chip(m.raridade), h("span", { class: "chip cod" }, m.id)),
      h("div", { class: "acts" }, h("button", { class: "b", type: "button", on: { click: () => abrirMeme(m, (novo) => troca(novo)) } }, "Editar"),
        m.status !== "publicado" ? h("button", { class: "b ok", type: "button", on: { click: () => mudar("publicado") } }, "Publicar") : null,
        m.status === "publicado" ? h("button", { class: "b", type: "button", on: { click: () => mudar("oculto") } }, "Ocultar") : null,
        m.status !== "removido" ? h("button", { class: "b bad", type: "button", on: { click: () => mudar("removido") } }, "Remover") : null));
    const troca = (novo) => { const n = linhaMeme({ ...m, ...novo }); li.replaceWith(n); const b = $("button", n); if (b) b.focus(); };
    async function mudar(s) {
      const c = await confirmar({ titulo: s === "publicado" ? "Publicar de novo?" : s === "oculto" ? "Ocultar o meme?" : "Remover o meme do site?", texto: "O meme \"" + m.titulo + "\" " + (s === "publicado" ? "volta a aparecer no site." : "sai do site. Ele não é apagado: dá para publicar de novo depois."), ok: s === "publicado" ? "Publicar" : s === "oculto" ? "Ocultar" : "Remover", perigo: s === "removido" });
      if (!c) return;
      const r = await api("PATCH", "/api/admin/memes/" + encodeURIComponent(m.id), { status: s });
      if (!r.ok) { aviso(msgErro(r), "erro"); return; }
      aviso("Meme agora está " + STATUS_MEME[s].toLowerCase() + ".", "ok"); troca(r.data.meme || { status: s });
    }
    return li;
  }
  trocar(p, h("form", { class: "filtros", role: "search", on: { submit: (e) => { e.preventDefault(); filtrar(); } } },
    h("div", { class: "campo larg" }, h("label", { for: idB }, "Título contém"), busca),
    h("div", { class: "campo" }, h("label", { for: idA }, "Ano"), ano, erroA), h("div", { class: "campo" }, h("label", { for: idC }, "Categoria"), cat), h("div", { class: "campo" }, h("label", { for: idS }, "Situação"), st),
    h("button", { class: "b pri", type: "submit" }, "Filtrar"),
    h("button", { class: "b", type: "button", on: { click: () => abrirMeme(null, () => filtrar()) } }, "Novo meme")), box);
  carregaCategorias().then((cs) => cs.forEach((c) => cat.append(h("option", { value: c }, c))));
  filtrar();
}

// ---------- Cartas e coleções ----------
const corValida = (c) => { try { return !!c && CSS.supports("color", c); } catch (e) { return false; } };
function abaCartas(p) {
  const idC = uid("cc"), sel = h("select", { id: idC });
  const topo = h("div"), cartas = h("div"); let colecoes = [];
  async function carregarColecoes(manter) {
    trocar(topo, carregando("Carregando coleções…")); trocar(cartas);
    const r = await api("GET", "/api/admin/colecoes");
    if (!r.ok) return trocar(topo, erroEstado(msgErro(r), () => carregarColecoes(manter)));
    colecoes = r.data.itens || [];
    if (!colecoes.length) return trocar(topo, vazio("Nenhuma coleção cadastrada."));
    trocar(sel, colecoes.map((c) => h("option", { value: c.id }, c.nome + " (" + c.cartas + ")")));
    if (manter && colecoes.some((c) => c.id === manter)) sel.value = manter;
    trocar(topo, h("div", { class: "filtros" }, h("div", { class: "campo larg" }, h("label", { for: idC }, "Coleção"), sel)), h("div", { id: "col-det" }));
    mostrar();
  }
  const atual = () => colecoes.find((c) => c.id === sel.value);
  function mostrar() {
    const c = atual(); if (!c) return;
    const det = $("#col-det", topo);
    trocar(det, h("div", { class: "card" },
      h("div", { class: "item-h" }, h("h3", null, (c.icone ? c.icone + " " : "") + c.nome), chip("ordem " + c.ordem), chip(c.cartas + " cartas")),
      h("div", { class: "meta" }, c.cor ? h("span", null, h("span", { class: "cor" }), "Cor: " + c.cor) : null, (c.cores_fundo || []).length ? h("span", null, "Fundo: ", (c.cores_fundo || []).map((k) => h("span", { class: "chip cod" }, k))) : null),
      c.sobre ? h("p", { class: "txt" }, c.sobre) : null,
      h("div", { class: "acts" }, h("button", { class: "b", type: "button", on: { click: editarColecao } }, "Editar coleção"))));
    pintaCor(det, c);
    carregarCartas();
  }
  function pintaCor(det, c) { const sw = $(".cor", det); if (sw) sw.style.background = corValida(c.cor) ? c.cor : "transparent"; }
  async function editarColecao() {
    const c = atual();
    const r = await formulario({ titulo: "Editar coleção: " + c.nome, ok: "Salvar coleção", valores: c,
      campos: [{ n: "nome", r: "Nome", t: "texto", req: true, max: 80 }, { n: "icone", r: "Ícone", t: "texto", nulo: true, max: 40, meia: true }, { n: "cor", r: "Cor", t: "texto", nulo: true, max: 20, meia: true, dica: "Ex.: #25aae3" },
        { n: "ordem", r: "Ordem", t: "num", req: true, meia: true }, { n: "cores_fundo", r: "Cores de fundo (até 6, separadas por vírgula)", t: "lista", dica: "Ex.: #0b3a5c, #25aae3" },
        { n: "sobre", r: "Sobre", t: "area", nulo: true, max: 2000 }],
      salvar: async (v) => { const corpo = {}; for (const k of ["nome", "icone", "cor", "sobre", "ordem"]) if (norm(v[k]) !== norm(c[k])) corpo[k] = v[k]; if (v.cores_fundo.join() !== (c.cores_fundo || []).join()) corpo.cores_fundo = v.cores_fundo;
        if (!Object.keys(corpo).length) return { ok: true, data: { semMudanca: true } }; return api("PATCH", "/api/admin/colecoes/" + encodeURIComponent(c.id), corpo); } });
    if (!r) return; if (r.data.semMudanca) return aviso("Nada mudou.", "ok");
    aviso("Coleção salva.", "ok"); carregarColecoes(c.id);
  }
  const camposCarta = [{ n: "nome", r: "Nome", t: "texto", req: true, max: 80 }, { n: "emoji", r: "Emoji", t: "texto", nulo: true, max: 16, meia: true }, { n: "raridade", r: "Raridade", t: "sel", req: true, ops: RARIDADES_CARTA, meia: true },
    { n: "meme_id", r: "Meme ligado (identificador, opcional)", t: "texto", nulo: true, max: 80, dica: "Deixe vazio se a carta não tem meme." }];
  async function cartaForm(carta) {
    const c = atual(), criando = !carta;
    const r = await formulario({ titulo: criando ? "Nova carta em " + c.nome : "Editar carta: " + carta.nome, ok: criando ? "Criar carta" : "Salvar carta", campos: camposCarta, valores: carta || { raridade: "Comum" },
      salvar: async (v) => { if (criando) { const corpo = { colecao_id: c.id, nome: v.nome, raridade: v.raridade }; if (v.emoji) corpo.emoji = v.emoji; if (v.meme_id) corpo.meme_id = v.meme_id; return api("POST", "/api/admin/cartas", corpo); }
        const corpo = {}; for (const k of ["nome", "emoji", "raridade", "meme_id"]) if (norm(v[k]) !== norm(carta[k])) corpo[k] = v[k];
        if (!Object.keys(corpo).length) return { ok: true, data: { semMudanca: true } }; return api("PATCH", "/api/admin/cartas/" + encodeURIComponent(carta.id), corpo); } });
    if (!r) return; if (r.data.semMudanca) return aviso("Nada mudou.", "ok");
    aviso(criando ? "Carta criada na próxima posição." : "Carta salva.", "ok"); criando ? carregarColecoes(c.id) : carregarCartas();
  }
  async function carregarCartas() {
    const c = atual(); trocar(cartas, carregando("Carregando cartas…"));
    const r = await api("GET", "/api/admin/cartas?colecao=" + encodeURIComponent(c.id));
    if (!r.ok) return trocar(cartas, erroEstado(msgErro(r), carregarCartas));
    const it = r.data.itens || [];
    trocar(cartas, h("div", { class: "sec" }, h("h2", null, "Cartas", h("button", { class: "b pri peq", type: "button", on: { click: () => cartaForm(null) } }, "Nova carta")),
      it.length ? h("ul", { class: "lista" }, it.map((x) => h("li", { class: "item" },
        h("div", { class: "item-h" }, h("h3", null, "#" + x.numero + " " + (x.emoji ? x.emoji + " " : "") + x.nome), chip(x.raridade)),
        h("div", { class: "meta" }, h("span", { class: "chip cod" }, x.id), x.meme_id ? h("span", null, "Meme: " + x.meme_id) : h("span", null, "Sem meme ligado")),
        h("div", { class: "acts" }, h("button", { class: "b", type: "button", on: { click: () => cartaForm(x) } }, "Editar"))))) : vazio("Esta coleção ainda não tem cartas.")));
  }
  sel.addEventListener("change", mostrar);
  trocar(p, topo, cartas); carregarColecoes();
}

// ---------- Eras ----------
function abaEras(p) {
  const box = h("div");
  async function carregar() {
    trocar(box, carregando("Carregando eras…"));
    const r = await api("GET", "/api/eras");
    if (!r.ok) return trocar(box, erroEstado(msgErro(r), carregar));
    const it = r.data.itens || [];
    if (!it.length) return trocar(box, vazio("Nenhuma era cadastrada."));
    trocar(box, h("ul", { class: "lista" }, it.map((e) => h("li", { class: "item" },
      h("div", { class: "item-h" }, h("h3", null, e.rotulo), chip(e.ano + (e.ano_fim ? "–" + e.ano_fim : ""))),
      e.lema ? h("p", { class: "txt" }, h("b", null, e.lema)) : null, e.texto ? h("p", { class: "txt" }, e.texto) : null,
      h("div", { class: "acts" }, h("button", { class: "b", type: "button", on: { click: () => editar(e) } }, "Editar"))))));
  }
  async function editar(e) {
    const r = await formulario({ titulo: "Editar era " + e.ano, ok: "Salvar era", valores: e,
      campos: [{ n: "rotulo", r: "Rótulo", t: "texto", req: true, max: 20 }, { n: "lema", r: "Lema", t: "texto", req: true, max: 120 }, { n: "texto", r: "Texto", t: "area", req: true, max: 2000 }],
      salvar: async (v) => { const corpo = {}; for (const k of ["rotulo", "lema", "texto"]) if (norm(v[k]) !== norm(e[k])) corpo[k] = v[k];
        if (!Object.keys(corpo).length) return { ok: true, data: { semMudanca: true } }; return api("PATCH", "/api/admin/eras/" + encodeURIComponent(e.ano), corpo); } });
    if (!r) return; if (r.data.semMudanca) return aviso("Nada mudou.", "ok");
    aviso("Era salva.", "ok"); carregar();
  }
  trocar(p, box); carregar();
}

// ---------- Comunidade (contribuidores, feedback, comentários, links) ----------
const TIPOS_FB = { ideia: "Ideia", bug: "Bug", elogio: "Elogio", remocao: "Remoção" };
const ST_LINK = { pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado" };
function abaComunidade(p) {
  const segs = [
    { id: "contribuidores", nome: "Contribuidores", cfg: cfgContribuidores }, { id: "feedback", nome: "Feedback", cfg: cfgFeedback },
    { id: "comentarios", nome: "Comentários", cfg: cfgComentarios }, { id: "links", nome: "Links sugeridos", cfg: cfgLinks }
  ];
  const corpo = h("div"); const bar = h("div", { class: "sub", role: "group", "aria-label": "Tipo de item" });
  const botoes = segs.map((s) => h("button", { type: "button", "aria-pressed": "false", on: { click: () => ir(s) } }, s.nome));
  bar.append(...botoes);
  function ir(s) { botoes.forEach((b, i) => b.setAttribute("aria-pressed", segs[i] === s)); listaCliente(corpo, s.cfg()); }
  trocar(p, bar, corpo); ir(segs[0]);
}

function listaCliente(box, cfg) {
  let itens = []; const area = h("div"), cont = h("p", { class: "mini", role: "status" });
  const idB = uid("cb"), busca = h("input", { id: idB, type: "search", autocomplete: "off" });
  const idT = uid("ct"), tipo = cfg.filtro ? h("select", { id: idT, value: cfg.filtro.padrao || "" }) : null;
  const filtros = h("div", { class: "filtros" }, h("div", { class: "campo larg" }, h("label", { for: idB }, "Buscar"), busca),
    tipo ? h("div", { class: "campo" }, h("label", { for: idT }, cfg.filtro.rotulo), tipo) : null, cfg.extra ? cfg.extra() : null);
  const ctx = {
    async apagar(item, txt) {
      const c = await confirmar({ titulo: "Excluir?", texto: txt + " Não dá para desfazer.", ok: "Excluir", perigo: true }); if (!c) return;
      const r = await api("DELETE", cfg.url + "/" + encodeURIComponent(item.id));
      if (!r.ok) return aviso(msgErro(r), "erro");
      itens = itens.filter((x) => x !== item); aviso("Excluído.", "ok"); desenhar();
    },
    async decidir(item, status) {
      const r = await api("POST", cfg.url + "/" + encodeURIComponent(item.id), { status });
      if (!r.ok) return aviso(msgErro(r), "erro");
      item.status = status; aviso("Link " + status + ".", "ok"); desenhar();
    }
  };
  function desenhar() {
    const q = busca.value.trim().toLowerCase();
    const lista = itens.filter((i) => (!tipo || !tipo.value || cfg.filtro.valor(i) === tipo.value) && (!q || cfg.texto(i).toLowerCase().includes(q)));
    cont.textContent = lista.length + " de " + itens.length + " " + cfg.rotulo + ".";
    if (!itens.length) return trocar(area, vazio(cfg.vazio));
    if (!lista.length) return trocar(area, vazio("Nada encontrado com esse filtro."));
    trocar(area, h("ul", { class: "lista" }, lista.map((i) => cfg.desenhar(i, ctx))));
  }
  async function carregar() {
    trocar(area, carregando());
    const r = await api("GET", cfg.url);
    if (!r.ok) return trocar(area, erroEstado(msgErro(r), carregar));
    itens = r.data.items || [];
    if (tipo) { const atual = tipo.value; trocar(tipo, h("option", { value: "" }, "Todos"), [...new Set(itens.map(cfg.filtro.valor))].map((v) => h("option", { value: v }, cfg.filtro.nome(v)))); tipo.value = [...tipo.options].some((o) => o.value === atual) ? atual : (cfg.filtro.padrao && [...tipo.options].some((o) => o.value === cfg.filtro.padrao) ? cfg.filtro.padrao : ""); }
    desenhar();
  }
  busca.addEventListener("input", desenhar); if (tipo) tipo.addEventListener("change", desenhar);
  trocar(box, filtros, cont, area); carregar();
}

const cfgContribuidores = () => ({
  url: "/api/admin/contribuidores", rotulo: "cadastros", vazio: "Ninguém se cadastrou como contribuidor ainda.",
  texto: (i) => [i.nome, i.nick, i.discord, (i.areas || []).join(" "), i.area_outros, i.ferramentas, i.experiencia].join(" "),
  extra: () => h("button", { class: "b", type: "button", on: { click: exportarCsv } }, "Exportar CSV"),
  desenhar: (i, c) => h("li", { class: "item" },
    h("div", { class: "item-h" }, h("h3", null, i.nome), h("span", { class: "mini" }, quando(i.criado_em))),
    h("div", { class: "meta" }, h("span", null, "@" + i.nick), h("span", null, "Discord: " + i.discord), h("span", null, i.horas_semana + " h por semana")),
    h("div", { class: "meta" }, (i.areas || []).map((a) => chip(a)), i.area_outros ? chip("Outros: " + i.area_outros) : null),
    i.experiencia ? h("p", { class: "txt" }, "Experiência: " + i.experiencia) : null, i.ferramentas ? h("p", { class: "txt" }, "Ferramentas: " + i.ferramentas) : null,
    i.mensagem ? h("p", { class: "txt" }, "“" + i.mensagem + "”") : null,
    h("div", { class: "acts" }, h("button", { class: "b bad", type: "button", on: { click: () => c.apagar(i, "Excluir o cadastro de " + i.nome + "?") } }, "Excluir"))) });
async function exportarCsv() {
  try {
    const r = await fetch("/api/admin/contribuidores.csv", { credentials: "same-origin" });
    if (r.status === 401) return sessaoExpirou();
    if (!r.ok) return aviso("Não foi possível exportar (código " + r.status + ").", "erro");
    const url = URL.createObjectURL(await r.blob()); const a = h("a", { href: url, download: "contribuidores.csv" }); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    aviso("Arquivo contribuidores.csv baixado.", "ok");
  } catch (e) { aviso("Sem conexão com o servidor. Tente exportar de novo.", "erro"); }
}
const cfgFeedback = () => ({
  url: "/api/admin/feedback", rotulo: "mensagens", vazio: "Nenhum feedback recebido ainda.", texto: (i) => [i.msg, i.contato, i.pagina].join(" "),
  filtro: { rotulo: "Tipo", valor: (i) => i.tipo, nome: (v) => TIPOS_FB[v] || v },
  desenhar: (i, c) => h("li", { class: "item" },
    h("div", { class: "item-h" }, chip(TIPOS_FB[i.tipo] || i.tipo, "info"), h("span", { class: "mini" }, quando(i.criado_em))),
    h("p", { class: "txt" }, i.msg), h("div", { class: "meta" }, h("span", null, "Contato: " + (i.contato || "—")), h("span", null, "Página: " + (i.pagina || "—"))),
    h("div", { class: "acts" }, h("button", { class: "b bad", type: "button", on: { click: () => c.apagar(i, "Excluir esta mensagem de feedback?") } }, "Excluir"))) });
const cfgComentarios = () => ({
  url: "/api/admin/comentarios", rotulo: "comentários", vazio: "Nenhum comentário ainda.", texto: (i) => [i.texto, i.autor, i.meme_id].join(" "),
  desenhar: (i, c) => h("li", { class: "item" },
    h("div", { class: "item-h" }, h("h3", null, i.autor || "—"), h("span", { class: "chip cod" }, i.meme_id), h("span", { class: "mini" }, quando(i.criado_em))),
    h("p", { class: "txt" }, i.texto), h("div", { class: "acts" }, h("button", { class: "b bad", type: "button", on: { click: () => c.apagar(i, "Excluir este comentário?") } }, "Excluir"))) });
const cfgLinks = () => ({
  url: "/api/admin/links", rotulo: "links", vazio: "Nenhum link sugerido ainda.", texto: (i) => [i.meme_id, i.yt, i.autor].join(" "),
  filtro: { rotulo: "Situação", valor: (i) => i.status, nome: (v) => ST_LINK[v] || v, padrao: "pendente" },
  desenhar: (i, c) => { const yt = "https://www.youtube.com/watch?v=" + encodeURIComponent(i.yt); return h("li", { class: "item" },
    h("div", { class: "item-h" }, h("h3", null, i.meme_id), chip(ST_LINK[i.status] || i.status, i.status === "aprovado" ? "ok" : i.status === "recusado" ? "bad" : "warn"), h("span", { class: "mini" }, quando(i.criado_em))),
    h("div", { class: "meta" }, h("a", { href: yt, target: "_blank", rel: "noopener noreferrer" }, "youtu.be/" + i.yt), h("span", null, "Enviado por " + (i.autor || "—"))),
    h("div", { class: "acts" }, i.status === "pendente"
      ? [h("button", { class: "b ok", type: "button", on: { click: () => c.decidir(i, "aprovado") } }, "Aprovar"), h("button", { class: "b bad", type: "button", on: { click: () => c.decidir(i, "recusado") } }, "Recusar")]
      : h("button", { class: "b", type: "button", on: { click: () => c.decidir(i, i.status === "aprovado" ? "recusado" : "aprovado") } }, i.status === "aprovado" ? "Mudar para recusado" : "Mudar para aprovado"))); } });

// ---------- telas de acesso e inicialização ----------
function sessaoExpirou() {
  if (!eu) return; eu = null; fecharDialogos(); mostraQuem();
  telaEntrar("Sua sessão expirou. Entre de novo para continuar.");
}
function telaEntrar(msg) {
  eu = null; mostraQuem();
  trocar(app, h("div", { class: "estado" }, h("h2", null, "Entre para acessar"), h("p", null, msg || "O painel é só para a equipe do Não Salvo. Entre com o Discord para continuar."),
    h("p", null, h("a", { class: "b pri", href: "/entrar.html?voltar=/seppzone/" }, "Entrar"))));
  app.querySelector("h2").tabIndex = -1; app.querySelector("h2").focus();
}
function mostraQuem() {
  const q = $("#quem");
  trocar(q, eu && eu.usuario ? [h("span", null, eu.usuario.apelido || "Você"), chip(PAPEL[eu.papel] || eu.papel, eu.papel === "admin" ? "warn" : "info")] : null);
}
async function boot() {
  trocar(app, carregando("Verificando seu acesso…"));
  const r = await api("GET", "/api/eu");
  if (r.status === 401) return telaEntrar();
  if (!r.ok) return trocar(app, erroEstado(msgErro(r), boot));
  eu = r.data; mostraQuem();
  if (eu.papel !== "admin" && eu.papel !== "moderador") {
    trocar(app, h("div", { class: "estado erro", role: "alert" }, h("h2", null, "Acesso negado"), h("p", null, "Sua conta não tem permissão para usar o painel."), h("p", null, h("a", { class: "b", href: "/" }, "Voltar ao site"))));
    return;
  }
  painel();
}

const temaB = $("#tema");
const pintaTema = () => { const d = document.documentElement.dataset.theme === "dark"; temaB.setAttribute("aria-checked", d); temaB.textContent = d ? "Tema: escuro" : "Tema: claro"; };
temaB.addEventListener("click", () => { const n = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = n; try { localStorage.setItem("ns_theme", n); } catch (e) { /* sem storage */ } pintaTema(); });
pintaTema();
boot();
})();
