// Memepédia: textos iniciais escritos pela equipe a partir de pesquisa (cada um com a fonte).
// Entram como aprovados, assinados por "acervo_naosalvo", SÓ quando o meme existe e ninguém publicou aquele campo ainda.
// Não sobrescrevem a comunidade e não voltam se a moderação recusar ou apagar (a linha do acervo continua lá).
// Rodado no início da API (depois das migrações) e no seed. Novos lotes: acrescentar aqui.
export const AUTOR_ACERVO = 'acervo_naosalvo';

const F = {
  lagoinhaYt: 'https://www.youtube.com/watch?v=zbnwWlrN5mo',
  binUai: 'https://www.uai.com.br/app/noticia/musica/2016/02/08/noticias-musica,176856/ta-tranquilo-ta-favoravel-cinco-coisas-que-voce-nao-sabia-sobre-mc-b.shtml',
  binRa: 'https://it.ra.co/reviews/21022',
  binWiki: 'https://en.wikipedia.org/wiki/MC_Bin_Laden',
  binBand: 'https://www.band.com.br/entretenimento/gorillaz-lanca-parceria-com-mc-bin-laden-em-versao-deluxe-do-cracker-island-16586094',
  pfsWiki: 'https://en.wikipedia.org/wiki/Puta_falta_de_sacanagem',
  pfsKym: 'https://knowyourmeme.com/memes/puta-falta-de-sacanagem-fcking-lack-of-immorality',
  pfsDaily: 'https://dailydot.com/6-brazil-weird-memes-mamilos-tenso',
  celsoBand: 'https://www.band.com.br/entretenimento/o-que-celso-portiolli-tem-a-ver-com-os-atentados-de-11-de-setembro-16631500',
  celsoCnn: 'https://www.cnnbrasil.com.br/pop/por-que-celso-portiolli-e-associado-ao-ataque-de-11-de-setembro/',
  celsoCb: 'https://www.correiobraziliense.com.br/diversao-e-arte/2023/09/5124388-celso-portiolli-fala-sobre-relacao-com-o-11-de-setembro-entenda.html',
  imaFox: 'https://www.foxnews.com/health/brazils-magnet-boy-seems-to-attract-metal-objects',
  imaWeek: 'https://theweek.com/articles/483337/brazils-magnet-boy-really-magnetic',
  imaGv: 'https://www.gamevicio.com/?p=37229',
  tacaSbt: 'https://sbtnews.sbt.com.br/noticia/brasil/narrador-do-meme-taca-le-pau-nesse-carrinho-compra-caminhao-para-seguir-profissao-do-pai',
  tacaNsc: 'https://www.nsctotal.com.br/cotidiano/marco-veio-vira-pai-e-refaz-video-de-meme-historico-ao-lado-da-filha-em-sc',
  tacaF1: 'https://carzin.com.br/videos/viral-taca-le-pau-vira-propaganda-gp-brasil.html',
  fornoMg: 'https://www.maisgoias.com.br/entretenimento/eita-geovanna-meme-do-forninho-caiu-faz-10-anos-veja-como-estao-as-primas/',
  fornoViva: 'https://viva.com.br/cultura-e-lazer/6-memes-famosos-no-brasil-marcaram-geracoes.html',
  fornoCatraca: 'https://catracalivre.com.br/entretenimento/ai-misericordia-video-da-vez-e-tao-bom-quanto-eita-giovana/',
  alegriaIstoe: 'https://istoe.com.br/meme-para-nossa-alegria-faz-10-anos-veja-como-estao-os-irmaos',
  alegriaMega: 'https://www.megacurioso.com.br/memes/21174--para-nossa-alegria-o-novo-meme-da-internet.htm',
  alegriaRs: 'https://rollingstone.com.br/noticia/volta-do-meme-para-nossa-alegria-irmaos-recriam-cena-8-anos-depois-assista/',
  alegriaUai: 'https://www.uai.com.br/app/noticia/mexerico/2016/06/09/noticias-mexerico,180683/amp.html',
  taubFolhape: 'https://www.folhape.com.br/noticias/10-anos-da-gravida-de-taubate-a-historia-da-falsa-gravidez-que/212107/',
  taubPopular: 'https://opopular.com.br/cidades/justica-livra-falsa-gravida-de-processo-por-estelionato-1.733907',
  taubCorreio: 'https://www.correio24horas.com.br/em-alta/gravida-de-taubate-quebra-o-silencio-e-revela-os-bastidores-da-farsa-que-enganou-o-brasil-0225'
};

// [meme_id, campo, texto, fonte]
export const TEXTOS_ACERVO = [
  // ---- lote 1 (nov/2026) ----
  ['aonde-e-que-eu-to-sertaozinho', 'origem', 'O vídeo mais antigo que encontramos com a frase é “onde e que eu tô? Será que tô na Lagoinha? meme”, publicado no YouTube pelo canal VicBR memes em 26 de dezembro de 2020. A gravação original e quem aparece nela ainda não foram identificados: se você sabe, escreva aqui.', F.lagoinhaYt],
  ['aonde-e-que-eu-to-sertaozinho', 'curiosidades', 'É o meme da página de erro 404 do Não Salvo: quando alguém cai num endereço que não existe, o gatinho do GPS pergunta “Onde é que eu tô? Será que tô na Lagoinha?”.', F.lagoinhaYt],

  ['ta-tranquilo-ta-favoravel', 'origem', 'É o funk “Tá Tranquilo, Tá Favorável”, de MC Bin Laden (Jefferson Cristian dos Santos Lima), da zona leste de São Paulo. A música é de 2015 e estourou no Brasil inteiro no fim daquele ano.', F.binUai],
  ['ta-tranquilo-ta-favoravel', 'porque', 'Refrão grudento, clipe na praia (sem camisa, com espumante e óculos escuros) e o “famoso sinal do Ronaldinho” pedido na letra: virou dancinha fácil de copiar, antes mesmo do TikTok.', F.binRa],
  ['ta-tranquilo-ta-favoravel', 'hoje', 'Em fevereiro de 2016 cantou no Encontro com Fátima Bernardes e, em março, subiu ao palco do Lollapalooza Brasil com Skrillex e Diplo (Jack Ü). Anos depois gravou com o Gorillaz e entrou no BBB 24.', F.binWiki],
  ['ta-tranquilo-ta-favoravel', 'curiosidades', 'Em 2016 a música ganhou versão com sertanejo, “Tranquilo e Favorável”, com Lucas Lucco.', F.binWiki],

  ['puta-falta-de-sacanagem', 'origem', 'Em 28 de abril de 2010, uma sessão de autógrafos da banda Restart em São Paulo foi cancelada. Na reportagem, a fã Georgia Massa, nervosa e chorando, misturou “puta sacanagem” com “falta de respeito”.', F.pfsKym],
  ['puta-falta-de-sacanagem', 'usos', 'Virou sinônimo de “injusto”: serve para reclamar de qualquer coisa que deu errado. Junto com ele ficou famoso o “vou xingar muito no Twitter”.', F.pfsDaily],
  ['puta-falta-de-sacanagem', 'curiosidades', 'O bordão foi indicado a Hit da Web no VMB 2010 da MTV, e a própria Restart tocou uma música em homenagem ao episódio com Marcelo Adnet. Há quem diga que o meme ajudou a banda a ficar ainda mais famosa.', F.pfsWiki],

  ['celso-portiolli-11-setembro', 'origem', 'A piada parte de uma montagem que coloca Celso Portiolli dentro de um avião, com as Torres Gêmeas ao fundo. Em 2019, a página de Facebook “Celso Portiolli não teve nada a ver com o 11 de setembro” espalhou a brincadeira, que volta todo ano.', F.celsoBand],
  ['celso-portiolli-11-setembro', 'rede', 'Facebook, com a página de 2019, e Twitter/X, onde o nome do apresentador entra nos assuntos mais comentados todo 11 de setembro.', F.celsoCnn],
  ['celso-portiolli-11-setembro', 'curiosidades', 'Segundo o próprio Celso, tudo começou com um humorista de Portugal. No começo ele ficou bravo, depois passou a levar na esportiva. Para ele, a data também é pessoal: foi num 11 de setembro que perdeu o pai.', F.celsoCb],

  ['menino-ima', 'origem', 'Em julho de 2011, a TV Globo mostrou Paulo David Amorim, de 11 anos, de Mossoró (RN), com colheres, garfos e outros objetos de metal grudados no peito, na barriga e nas costas.', F.imaFox],
  ['menino-ima', 'rede', 'Rodou o mundo: sites como Fox News e The Week publicaram o vídeo e perguntaram se o “menino ímã” era magnético mesmo.', F.imaWeek],
  ['menino-ima', 'curiosidades', 'Céticos lembram que pele lisa e jovem, junto com a curvatura do corpo, segura objetos lisos sem magnetismo nenhum. Antes dele, um menino croata de 6 anos já tinha viralizado com o mesmo “poder”.', F.imaGv],

  ['taca-le-pau-marcos', 'origem', 'Gravado em 2014 em Taió (SC), no Vale do Itajaí: Leandro Beninca filma e narra o primo Marcos Joaquim Martinelli, o “Marco Véio”, descendo de carrinho de rolimã o morro da vó Salvelina.', F.tacaSbt],
  ['taca-le-pau-marcos', 'porque', 'Menos de 30 segundos de narração empolgada, com o sotaque do interior catarinense e o “taca-le pau” repetido sem parar. Simples e espontâneo.', F.tacaSbt],
  ['taca-le-pau-marcos', 'hoje', 'Marcos virou programador e já desceu o morro com a filha. Leandro comprou o primeiro caminhão aos 19 anos, em 2024, para seguir a profissão do pai.', F.tacaNsc],
  ['taca-le-pau-marcos', 'curiosidades', 'O vídeo virou propaganda oficial da Fórmula 1 para o Grande Prêmio do Brasil.', F.tacaF1],

  ['giovana-forninho', 'origem', 'Vídeo caseiro de 2014 gravado por Wanessa: a prima Geovanna dança em cima da mesa apoiada num forninho, que cai em cima dela. Wanessa grita “Eita, Geovanna! O forninho caiu!” e corre contar para a mãe.', F.fornoMg],
  ['giovana-forninho', 'usos', 'Serve para qualquer azar inesperado e virou montagem comparando outros desastres ao forninho.', F.fornoViva],
  ['giovana-forninho', 'hoje', 'Dez anos depois, Geovanna, discreta nas redes, ainda se apresenta como “Geovanna do forninho”.', F.fornoMg],
  ['giovana-forninho', 'curiosidades', 'O nome certo é Geovanna, mas a internet consagrou “Giovana”. Em 2017, o vídeo “Ai, misericórdia” foi chamado de sucessor do forninho.', F.fornoCatraca],

  ['para-nossa-alegria', 'origem', 'Em março de 2012, os irmãos Jefferson e Suellen Barbosa gravaram com a mãe, Mara, um ensaio da música gospel “Galhos Secos” para cantar na igreja. O vídeo era só para os amigos.', F.alegriaIstoe],
  ['para-nossa-alegria', 'porque', 'Em menos de uma semana, quase 10 milhões de pessoas tinham visto o vídeo, e o “para nossa alegria” virou comentário obrigatório no Facebook e no Twitter, com paródias até na MTV.', F.alegriaMega],
  ['para-nossa-alegria', 'hoje', 'Os irmãos gravaram comerciais, foram ao Mais Você e ao Esquenta, lançaram CD e, em 2020, recriaram a cena no Encontro.', F.alegriaRs],
  ['para-nossa-alegria', 'curiosidades', 'Até três dias antes da gravação, os irmãos nem conheciam a música. E, segundo Jefferson, a mãe não ficou brava: foi para a cozinha cantarolando, trecho que ficou fora do vídeo.', F.alegriaUai],

  ['gravida-de-taubate', 'origem', 'Em janeiro de 2012, a professora Maria Verônica Aparecida César Santos, de Taubaté (SP), foi a programas de TV dizendo esperar quadrigêmeas e recebeu doações. No dia 20 daquele mês, a farsa foi revelada.', F.taubFolhape],
  ['gravida-de-taubate', 'porque', 'O tamanho da barriga, os nomes das quatro meninas anunciados ao vivo e o apresentador Edu Guedes chorando na TV.', F.taubFolhape],
  ['gravida-de-taubate', 'hoje', 'Respondeu a processo por estelionato, encerrado por acordo. Em 2025 voltou às redes pedindo para ser chamada de Maria Verônica e deu entrevista ao Domingo Legal contando a sua versão.', F.taubPopular],
  ['gravida-de-taubate', 'curiosidades', 'Quem desconfiou primeiro foi a jornalista Chris Flores, então na Record. Em 2025, Maria Verônica contou que a barriga era feita de panos.', F.taubCorreio]
];

/** Publica os textos do acervo que ainda faltam. Devolve quantos entraram. Nunca derruba quem chamou. */
export async function semearMemepedia(pool, { log = console.log } = {}) {
  let n = 0;
  try {
    for (const [meme, campo, texto, fonte] of TEXTOS_ACERVO) {
      const r = await pool.query(
        `INSERT INTO memepedia_edicoes (meme_id, campo, texto, fonte, autor, status, revisado_em)
         SELECT $1, $2, $3, $4, $5, 'aprovado', now()
          WHERE EXISTS (SELECT 1 FROM memes WHERE id = $1)
            AND NOT EXISTS (SELECT 1 FROM memepedia_edicoes WHERE meme_id = $1 AND campo = $2 AND (status = 'aprovado' OR autor = $5))`,
        [meme, campo, texto, fonte, AUTOR_ACERVO]);
      n += r.rowCount;
    }
    if (n) log(`memepédia: ${n} texto(s) do acervo publicados`);
  } catch (e) { log('memepédia: não consegui publicar os textos do acervo: ' + e.message); }
  return n;
}
