// Valida tags de SEO, canonical, Open Graph e Twitter card nas 6 páginas principais:
// index.html, album.html, linha-do-tempo.html, memepedia.html, perfil.html, 404.html.
// Também confere correção de "Moletom" no criador de gato em common.js.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");
const PAGINAS = ["index.html", "album.html", "linha-do-tempo.html", "memepedia.html", "perfil.html", "404.html"];

test("SEO: todas as 6 páginas têm title, description, canonical, Open Graph e Twitter Card válidos", () => {
  for (const pag of PAGINAS) {
    const html = fs.readFileSync(path.join(RAIZ, pag), "utf8");

    // Title
    const mTitle = /<title>([^<]+)<\/title>/i.exec(html);
    assert.ok(mTitle, `${pag} deve ter tag <title>`);
    assert.ok(mTitle[1].trim().length > 5, `${pag} title deve ter conteúdo`);

    // Meta description
    const mDesc = /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i.exec(html);
    assert.ok(mDesc, `${pag} deve ter <meta name="description">`);
    assert.ok(mDesc[1].trim().length >= 20, `${pag} description deve ter pelo menos 20 caracteres`);

    // Canonical
    const mCanon = /<link\s+rel=["']canonical["']\s+href=["'](https:\/\/naosalvo\.fishlab\.com\.br\/[^"']*)["']/i.exec(html);
    assert.ok(mCanon, `${pag} deve ter <link rel="canonical"> apontando para https://naosalvo.fishlab.com.br/`);

    // Open Graph
    const mOgLocale = /<meta\s+property=["']og:locale["']\s+content=["']pt_BR["']/i.exec(html);
    assert.ok(mOgLocale, `${pag} deve ter og:locale com pt_BR`);

    const mOgType = /<meta\s+property=["']og:type["']\s+content=["']([^"']+)["']/i.exec(html);
    assert.ok(mOgType, `${pag} deve ter og:type`);

    const mOgTitle = /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i.exec(html);
    assert.ok(mOgTitle, `${pag} deve ter og:title`);
    assert.ok(mOgTitle[1].trim().length > 0, `${pag} og:title não pode ser vazio`);

    const mOgDesc = /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i.exec(html);
    assert.ok(mOgDesc, `${pag} deve ter og:description`);
    assert.ok(mOgDesc[1].trim().length > 0, `${pag} og:description não pode ser vazio`);

    const mOgUrl = /<meta\s+property=["']og:url["']\s+content=["'](https:\/\/naosalvo\.fishlab\.com\.br\/[^"']*)["']/i.exec(html);
    assert.ok(mOgUrl, `${pag} deve ter og:url`);

    const mOgImage = /<meta\s+property=["']og:image["']\s+content=["']https:\/\/naosalvo\.fishlab\.com\.br\/([^"']+)["']/i.exec(html);
    assert.ok(mOgImage, `${pag} deve ter og:image apontando para imagem em https://naosalvo.fishlab.com.br/`);
    const imgCaminho = path.join(RAIZ, mOgImage[1]);
    assert.ok(fs.existsSync(imgCaminho), `${pag} og:image (${mOgImage[1]}) deve existir no disco`);

    // Twitter Card
    const mTwCard = /<meta\s+name=["']twitter:card["']\s+content=["']summary_large_image["']/i.exec(html);
    assert.ok(mTwCard, `${pag} deve ter twitter:card summary_large_image`);

    const mTwTitle = /<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i.exec(html);
    assert.ok(mTwTitle, `${pag} deve ter twitter:title`);

    const mTwDesc = /<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["']/i.exec(html);
    assert.ok(mTwDesc, `${pag} deve ter twitter:description`);

    const mTwImage = /<meta\s+name=["']twitter:image["']\s+content=["']https:\/\/naosalvo\.fishlab\.com\.br\/([^"']+)["']/i.exec(html);
    assert.ok(mTwImage, `${pag} deve ter twitter:image`);
    const twImgCaminho = path.join(RAIZ, mTwImage[1]);
    assert.ok(fs.existsSync(twImgCaminho), `${pag} twitter:image (${mTwImage[1]}) deve existir no disco`);

    // Sem dados pessoais
    assert.ok(!html.includes("@gmail.com") && !html.includes("cpf"), `${pag} não deve conter dados pessoais`);
  }
});

test("criador de gato: 'Moletom' corrigido em SG.clo mantendo ordem e índices", () => {
  const common = fs.readFileSync(path.join(RAIZ, "common.js"), "utf8");
  assert.ok(common.includes('["Moletom","#cfc7b4"]'), "deve conter ['Moletom','#cfc7b4']");
  assert.ok(!common.includes('["Maletom","#cfc7b4"]'), "não deve conter Maletom");

  const bloco = common.slice(common.indexOf('const SG={'), common.indexOf('};', common.indexOf('const SG={')) + 2);
  const SG = new Function(bloco + '; return SG;')();
  assert.equal(SG.clo[3][0], "Moletom", "índice 3 deve ser Moletom");
  assert.equal(SG.clo[3][1], "#cfc7b4", "cor do moletom mantida");
  assert.equal(SG.clo.length, 14, "tamanho de clo mantido");
});
