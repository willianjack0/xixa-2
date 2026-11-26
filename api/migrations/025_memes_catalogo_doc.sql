-- 025: itens do "Catálogo Completo - Acervo e Figurinhas" que faltavam no site.
--  1) figurinhas novas no fim da coleção YouTube Raiz (id "youtube-<índice>", igual ao data.js);
--  2) memes novos com o vídeo original achado no YouTube.
-- Só roda em banco que já tem o acervo (num banco vazio quem carrega é o seed). Idempotente, não sobrescreve nada.
INSERT INTO cartas (id, colecao_id, numero, nome, emoji, raridade)
SELECT v.id, 'youtube', v.numero, v.nome, v.emoji, v.raridade FROM (VALUES
  ('youtube-73', 74, 'Taciele Alcolea', '💄', 'Raro'),
  ('youtube-74', 75, 'Niina Secrets', '💋', 'Raro'),
  ('youtube-75', 76, 'Camila Coelho', '✨', 'Raro'),
  ('youtube-76', 77, 'Desimpedidos', '⚽', 'Raro'),
  ('youtube-77', 78, 'Gabi Luthai e Mariana Nolasco', '🎸', 'Raro'),
  ('youtube-78', 79, 'Canal Canalha e Tirullipa', '🎶', 'Raro'),
  ('youtube-79', 80, 'MC Daleste e KondZilla', '🎧', 'Raro'),
  ('youtube-80', 81, 'Batalha do Tank, da Aldeia e do Museu', '🎤', 'Raro'),
  ('youtube-81', 82, 'Boca Rosa', '👄', 'Comum'),
  ('youtube-82', 83, 'Mari Maria e Franciny Ehlke', '🎨', 'Comum')
) AS v(id, numero, nome, emoji, raridade)
WHERE EXISTS (SELECT 1 FROM memes) AND EXISTS (SELECT 1 FROM colecoes WHERE id = 'youtube')
ON CONFLICT DO NOTHING;

INSERT INTO memes (id, titulo, ano, data, categoria, tipo, raridade, emoji, descricao, youtube_id, adicionado_em, status)
SELECT v.id, v.titulo, v.ano, v.data::date, v.categoria, 'video', v.raridade, v.emoji, v.descricao, v.yt, v.adicionado::date, 'publicado' FROM (VALUES
  ('seu-madruga-will-go-on', 'Seu Madruga Will Go On (YTPBR)', 2009, '2009-01-01', 'Vídeos', 'Lendário', '🎻', 'O YouTube Poop do Mestre3224 que fez Seu Madruga cantar “My Heart Will Go On” e virou o clássico do YTPBR.', 'ettaeKZHAwA', '2026-11-25'),
  ('alborghetti-cadeia-neles', 'Alborghetti: Cadeia Neles!', 1999, '1999-01-01', 'TV', 'Lendário', '🚔', 'Luiz Carlos Alborghetti, com o porrete na mão, gritando “cadeia neles!” contra a bandidagem no programa Cadeia.', 'd4UzlOvM4cQ', '2026-11-25'),
  ('danca-do-quadrado', 'Dança do Quadrado', 2008, '2008-01-01', 'Música', 'Lendário', '⬛', '“Pegue o seu quadrado e quem pisar na linha vai pagar”: a música de Sharon Acioly virou febre nacional em 2008.', '5F2OpXCnzpo', '2026-11-25'),
  ('pedala-robinho', 'Pedala, Robinho!', 2005, '2005-01-01', 'TV', 'Relíquia', '🚲', 'O quadro do Pânico na TV com o “Pedala, Robinho!” e os tapinhas na nuca que viraram bordão de toda pelada.', 'RHJ1wFUzHaM', '2026-11-25'),
  ('galvao-e-tetra', 'Galvão Bueno: É Tetra!', 1994, '1994-07-17', 'Esportes', 'Relíquia', '🏆', '“É tetra! É tetra!” A narração de Galvão Bueno no fim do jejum de 24 anos sem Copa virou trilha de qualquer vitória.', 'mof63nznckE', '2026-11-25'),
  ('tartaruga-da-brahma', 'Tartaruga da Brahma', 2001, '2001-01-01', 'TV', 'Relíquia', '🐢', 'A tartaruguinha dos comerciais da Brahma, lenta para tudo menos para a cerveja, marcou a TV do começo dos anos 2000.', 'O6R_5HeytJI', '2026-11-25'),
  ('caco-antibes-horror-a-pobre', 'Caco Antibes: Eu Tenho Horror a Pobre!', 1996, '1996-01-01', 'TV', 'Relíquia', '🎩', 'O bordão do personagem de Miguel Falabella no Sai de Baixo virou a resposta irônica para qualquer pão-durismo.', 'x4hmmEFcqog', '2026-11-25'),
  ('vera-verao-epa-bicha-nao', 'Vera Verão: Epa, Bicha Não!', 1997, '1997-01-01', 'TV', 'Relíquia', '💃', 'O grito de Jorge Lafond como Vera Verão na Praça É Nossa virou GIF e bordão eterno da internet.', 'Dyk_uhVMBew', '2026-11-25'),
  ('poupancudos-da-caixa', 'Poupançudos da Caixa', 2009, '2009-11-01', 'TV', 'Relíquia', '🐷', 'Os cofrinhos animados da Caixa voltaram em 2009 e viraram mania de coleção (e de meme) por todo o país.', 'nt_DWDpF9Sg', '2026-11-25'),
  ('luxemburgo-voce-e-moleque', 'Luxemburgo x Marcelinho: Você É Moleque!', 2007, '2007-01-01', 'Esportes', 'Raro', '⚽', 'O bate-boca ao vivo entre Vanderlei Luxemburgo e Marcelinho Carioca no programa do Datena virou clássico das tretas da TV.', 'jh_OyaIT-K0', '2026-11-25'),
  ('ronaldo-copa-com-hospital', 'Ronaldo: Não Se Faz Copa com Hospital', 2011, '2011-11-01', 'Esportes', 'Raro', '🏥', 'A frase de Ronaldo Fenômeno defendendo os gastos com estádios virou meme e símbolo dos protestos contra a Copa de 2014.', 'RKdQavGLvXU', '2026-11-25'),
  ('valeu-natalina', 'Valeu, Natalina!', 2021, '2021-12-01', 'Vídeos', 'Comum', '🎄', 'O vídeo dos meninos agradecendo a “Natalina” espalhado por Diogo Defante virou o bordão do Natal de 2021.', '0YbwuCyX1OM', '2026-11-25'),
  ('luva-de-pedreiro-receba', 'Luva de Pedreiro: Receba!', 2022, '2022-01-01', 'Esportes', 'Comum', '🧤', 'Iran Ferreira, o Luva de Pedreiro, chutando com a luva e gritando “Receba! Obrigado, meu Deus!”, virou fenômeno mundial.', 'ppLyDJsI6o0', '2026-11-25'),
  ('bozena-la-em-pato-branco', 'Bozena: Lá em Pato Branco...', 2007, '2007-01-01', 'TV', 'Relíquia', '🦆', 'Alessandra Maestrini como Bozena no Toma Lá, Dá Cá, começando toda história absurda com “lá em Pato Branco...”.', 'oodMuQ6rq-8', '2026-11-25'),
  ('paulinho-gogo-conta-historia', 'Paulinho Gogó: Quem Não Tem Dinheiro Conta História', 2004, '2004-01-01', 'TV', 'Raro', '🗣️', 'O malandro de Maurício Manfrini na Praça É Nossa, com seus causos “fato venérico” e o bordão que todo mundo repete.', 'MYzlWBH6diU', '2026-11-25'),
  ('cabrito-tevez-la-pergunta', 'Cabrito Tevez: La Pergunta?', 2007, '2007-02-22', 'TV', 'Raro', '🐐', 'O “argentino” de Alexandre Porpetone na Praça É Nossa, misturando portunhol e perguntando “la pergunta?” a cada frase.', '9skpqmE1n9I', '2026-11-25'),
  ('nego-ney', 'Nego Ney', 2019, '2019-01-01', 'Vídeos', 'Comum', '🎤', 'Nego Ney e suas falas sem pé nem cabeça viraram figurinha de reação e meme em todo grupo de WhatsApp.', 'TcSKCo1oRGw', '2026-11-25'),
  ('acorda-pedrinho', 'Acorda, Pedrinho!', 2022, '2022-03-21', 'Música', 'Comum', '⏰', 'O hit do Jovem Dionísio que estourou no TikTok em 2022: “Acorda, Pedrinho, que hoje tem campeonato!”.', 'ukPO8UtBAIk', '2026-11-25'),
  ('bruno-henrique-oto-patamar', 'Bruno Henrique: Otô Patamar', 2019, '2019-01-01', 'Esportes', 'Comum', '🚀', 'O atacante do Flamengo de 2019 dizendo que o time estava em “otô patamar” e o bordão grudou em toda a torcida.', '-3eGe6azSOA', '2026-11-25'),
  ('hoje-tem-gol-do-ribamar', 'Hoje Tem Gol do Ribamar', 2020, '2020-01-01', 'Esportes', 'Comum', '⚽', 'O funk de MC Nandinho para o atacante do Vasco virou hino irônico da internet: “Hoje tem gol do Ribamar!”.', 'M1n0s60dL44', '2026-11-25'),
  ('o-pai-ta-on', 'O Pai Tá On', 2020, '2020-08-01', 'Esportes', 'Comum', '😎', 'O grito de Neymar no PSG em agosto de 2020 virou bordão de qualquer um que chega confiante: “o pai tá on!”.', '4UGBvNHcOm4', '2026-11-25'),
  ('poderoso-castiga', 'Poderoso Castiga: Mais ou Menos', 2012, '2012-01-01', 'TV', 'Relíquia', '🥈', 'O personagem prateado de Eduardo Sterblitch no Pânico, que respondia tudo com “mais ou menos... aaah, mais ou menos”.', 'tFBMDHlPpHc', '2026-11-25'),
  ('mendigo-do-panico', 'Mendigo do Pânico', 2004, '2004-01-01', 'TV', 'Relíquia', '🎒', 'Carlinhos, o Mendigo do Pânico, invadindo eventos e até arriscando um rap com Netinho de Paula no “Fim de Semana no Parque”.', 'jBv3tGKsbp0', '2026-11-25'),
  ('freddie-mercury-prateado', 'Freddie Mercury Prateado', 2009, '2009-11-29', 'TV', 'Relíquia', '🎤', 'O sósia prateado do Pânico que dançava sem dizer nada (a não ser “Uhuuul!”), aqui na Dança da Águia da Portela.', 'fz0eH3tilkY', '2026-11-25'),
  ('lady-kate-to-pagando', 'Lady Kate: Tô Pagando!', 2009, '2009-01-01', 'TV', 'Relíquia', '💸', 'A emergente de Katiúscia Canoro no Zorra Total que resolvia tudo na base do “tô pagando!”.', 'MUSYpLp1kas', '2026-11-25'),
  ('bessias', 'Bessias: Só Usa em Caso de Necessidade', 2016, '2016-03-16', 'Vídeos', 'Raro', '📄', 'O grampo de Dilma avisando Lula que mandava o “Bessias” com o termo de posse virou meme instantâneo em 2016.', 'tpSbNME66jI', '2026-11-25'),
  ('eduardo-jorge-debates', 'Eduardo Jorge nos Debates de 2014', 2014, '2014-08-26', 'Vídeos', 'Raro', '🌿', 'O candidato do PV roubou a cena nos debates de 2014 com respostas sinceras e sem filtro, virando o “mito dos debates”.', 'ezjLXQc0bD4', '2026-11-25'),
  ('valeria-to-bandida', 'Valéria: Ai, Como Eu Tô Bandida!', 2011, '2011-01-01', 'TV', 'Relíquia', '💅', 'Rodrigo Sant’Anna como Valéria no metrô do Zorra Total: “Ai, como eu tô bandida!” virou funk e bordão nacional.', 'eW_FCIpjJtI', '2026-11-25'),
  ('carminha-me-serve-vadia', 'Carminha: Me Serve, Vadia!', 2012, '2012-10-01', 'TV', 'Raro', '🍷', 'A virada de Nina contra Carminha em Avenida Brasil parou o país e o “me serve, vadia” virou funk e meme.', 's_F6O91r4u4', '2026-11-25'),
  ('dunga-xinga-escobar', 'Dunga x Alex Escobar', 2010, '2010-06-20', 'Esportes', 'Raro', '😤', 'Na Copa de 2010, Dunga xingou o repórter Alex Escobar ao vivo na coletiva e a treta virou meme da Copa.', '7iTV4nANPSI', '2026-11-25'),
  ('piscininha-amor', 'Piscininha, Amor!', 2019, '2019-01-01', 'Esportes', 'Comum', '🏊', 'O lateral Egídio, do Cruzeiro, mostrando a “piscininha” para a esposa nas férias virou hit do verão de 2019.', '1nselGb719o', '2026-11-25'),
  ('oracao-para-pneu', 'Hino para o Pneu', 2022, '2022-11-02', 'Vídeos', 'Comum', '🛞', 'Manifestantes cantando o Hino Nacional para um pneu em 2022 renderam um dos memes mais surreais da política.', 'mgNIqM77Llo', '2026-11-25'),
  ('karol-conka-bbb21', 'Karol Conká no BBB 21', 2021, '2021-02-01', 'TV', 'Comum', '🎭', 'A “Jaque Patombá” do BBB 21: “qualquer coisa me bota no paredão”, língua de chicote e a rejeição recorde.', 'GQNjWRBGOxw', '2026-11-25'),
  ('narcisa-ai-que-loucura', 'Narcisa: Ai, Que Loucura!', 2012, '2012-01-01', 'TV', 'Comum', '🥂', 'Narcisa Tamborindeguy e seus “ai, que loucura!”, “ai, que badalo!” viraram bordões eternos da internet.', 'CVkPaEXxq1s', '2026-11-25'),
  ('marcia-sensitiva-para-de-ser-doida', 'Márcia Sensitiva: Para de Ser Doida!', 2016, '2016-01-01', 'TV', 'Comum', '🔮', 'A sensitiva Márcia Fernandes dando bronca nos telespectadores com o “para de ser doida!” virou meme.', 'CmLs1lz7QCI', '2026-11-25'),
  ('vai-lacraia', 'Vai, Lacraia!', 2003, '2003-01-01', 'Música', 'Relíquia', '🐛', 'Lacraia dançando com MC Serginho e o grito de “vai, Lacraia!” tomaram os bailes e a TV no começo dos anos 2000.', 'nJPX1wf9ohY', '2026-11-25'),
  ('galvao-e-penta', 'Galvão Bueno: É Penta!', 2002, '2002-06-30', 'Esportes', 'Relíquia', '🏆', '“É penta! É penta!” A narração de Galvão Bueno no título de 2002 contra a Alemanha.', '56gq3Y-YenE', '2026-11-25'),
  ('nao-e-assim-uma-brastemp', 'Não É Assim uma Brastemp', 1992, '1992-01-01', 'TV', 'Relíquia', '🧊', 'Os comerciais da Brastemp que transformaram “não é assim uma Brastemp” em sinônimo de coisa meia-boca.', '0oD-dJlb1DA', '2026-11-25'),
  ('cqc-proteste-ja', 'CQC: Proteste Já!', 2010, '2010-03-22', 'TV', 'Relíquia', '📢', 'O quadro do CQC que corria atrás de prefeitos com microfone e câmera, como no famoso caso de Barueri.', '82_Rmr1XJkY', '2026-11-25'),
  ('coffin-dance', 'Coffin Dance (Dança do Caixão)', 2020, '2020-04-01', 'Vídeos', 'Comum', '⚰️', 'Os carregadores de caixão de Gana dançando ao som de Astronomia viraram o meme do “deu ruim” em 2020.', 'PP2NhP-p5yE', '2026-11-25'),
  ('japones-da-federal', 'Japonês da Federal', 2016, '2016-01-01', 'Vídeos', 'Raro', '🕶️', 'O agente Newton Ishii nas prisões da Lava Jato virou marchinha de carnaval: “ai, meu Deus, me dei mal...”.', 'JGryh0XXvaU', '2026-11-25'),
  ('lumena-nao-autorizei', 'Lumena: Não Autorizei', 2021, '2021-02-01', 'TV', 'Comum', '✋', 'O vocabulário da Lumena no BBB 21 (“não autorizei”, “fenotipicamente”, “ressignificar”) virou dicionário de meme.', 'wPNtaaQ-2zs', '2026-11-25'),
  ('gil-gomes-aqui-agora', 'Gil Gomes no Aqui Agora', 1992, '1992-01-01', 'TV', 'Lendário', '🎙️', 'O repórter policial com a voz e os gestos mais dramáticos da TV brasileira, no Aqui Agora do SBT.', '7zmhwkRv2d8', '2026-11-25'),
  ('vovo-vida-loka', 'Vovó Vida Loka', 2013, '2013-01-01', 'TV', 'Relíquia', '👵', 'A avó da Penha que viralizou reprovando o corte de cabelo do neto e virou atração fixa do Pânico na Band.', 'CbT1BriiFfQ', '2026-11-25'),
  ('christian-pior', 'Christian Pior', 2013, '2013-03-03', 'TV', 'Relíquia', '💇', 'O “consultor de moda” de Evandro Santo no Pânico, detonando os looks dos famosos com o maior deboche.', 'j-WjW9XjK04', '2026-11-25'),
  ('marcelo-rezende-corta-pra-mim', 'Marcelo Rezende: Corta pra Mim!', 2013, '2013-02-19', 'TV', 'Raro', '🚨', '“Corta pra mim!”, “põe exclusivo, minha filha, que dá trabalho pra fazer!”: os bordões do Cidade Alerta.', 'pgx9JftODCQ', '2026-11-25'),
  ('velho-da-lancha', 'Velho da Lancha', 2019, '2019-01-01', 'Música', 'Comum', '🚤', 'O tiozão grisalho de lancha, óculos escuros e moça bonita do lado virou personagem e até música.', '_KYO52TApzA', '2026-11-25'),
  ('gil-do-vigor-basculho', 'Gil do Vigor: Basculho!', 2021, '2021-02-16', 'TV', 'Comum', '📣', '“Eu não vim do lixo pra perder pra basculho!” A treta de Gil com Pocah no BBB 21 virou bordão do Brasil.', 'pj3anzFmomc', '2026-11-25'),
  ('richarlison-danca-do-pombo', 'Richarlison: Dança do Pombo', 2022, '2022-11-24', 'Esportes', 'Comum', '🐦', 'Os golaços contra a Sérvia na Copa de 2022 e a dancinha do Pombo que até o Tite fez.', 'iiVDAIcsOdQ', '2026-11-25'),
  ('neymar-rolando', 'Neymar Rolando', 2018, '2018-07-02', 'Esportes', 'Comum', '🌀', 'As quedas e rolamentos de Neymar na Copa de 2018 viraram o “Neymar Challenge” pelo mundo inteiro.', 'PTWUx2rVEwU', '2026-11-25'),
  ('rodrigo-faro-danca-gatinho', 'Rodrigo Faro: Dança, Gatinho!', 2009, '2009-01-01', 'TV', 'Comum', '🕺', 'O quadro em que Rodrigo Faro se transforma em cantores e dança seus hits, aqui virando Gretchen na “Conga”.', 'T_Dh3Q0bKhE', '2026-11-25'),
  ('aguardem-72-horas', 'Aguardem Mais 72 Horas', 2022, '2022-11-15', 'Vídeos', 'Comum', '⏳', 'O prazo eterno dos acampamentos de 2022: tudo ia acontecer “em 72 horas”, e o meme se renovava a cada três dias.', 'UKSeyFp9CCs', '2026-11-25'),
  ('gretchen-toca-o-sino', 'Gretchen Toca o Sino', 2012, '2012-07-07', 'TV', 'Raro', '🔔', 'Gretchen desistindo de A Fazenda 5 e tocando o sino virou GIF de quem larga tudo e vai embora.', 'lbW8ne75l54', '2026-11-25'),
  ('fatima-bernardes-dancando', 'Fátima Bernardes Dançando no Encontro', 2012, '2012-01-01', 'TV', 'Comum', '💃', 'A ex-âncora do Jornal Nacional aprendendo passinho de funk e axé ao vivo virou meme de toda manhã.', '8Akhl4Kj5es', '2026-11-25'),
  ('tite-cai-na-copa', 'Tite Cai na Comemoração', 2018, '2018-06-22', 'Esportes', 'Comum', '🤸', 'Na Copa de 2018, Tite foi comemorar o gol de Coutinho e levou um tombo na beira do campo.', '-6up-2y5Aqc', '2026-11-25'),
  ('hoje-tem-gol-do-gabigol', 'Hoje Tem Gol do Gabigol', 2019, '2019-01-01', 'Esportes', 'Comum', '🔥', 'Na fase artilheira do Flamengo de 2019, “hoje tem gol do Gabigol” virou grito, plaquinha e paródia.', 'Z8qFOLmA8BM', '2026-11-25'),
  ('lu-do-magalu', 'Lu do Magalu', 2018, '2018-01-01', 'Vídeos', 'Comum', '🛍️', 'A assistente virtual do Magazine Luiza virou influenciadora, celebridade da internet e personagem de meme.', 'uYlkZfJgGkU', '2026-11-25'),
  ('fernanda-torres-a-vida-presta', 'Fernanda Torres: A Vida Presta!', 2025, '2025-01-05', 'Cultura', 'Comum', '🏆', 'A campanha de Ainda Estou Aqui, o Globo de Ouro e o “a vida presta!” de Fernanda Torres mobilizaram a internet.', 'b7pXupS6T9c', '2026-11-25'),
  ('desenrola-bate-joga-de-ladin', 'Desenrola, Bate, Joga de Ladin', 2022, '2022-01-01', 'Música', 'Comum', '🌺', 'O funk de L7NNON e Os Hawaianos com a dancinha que tomou o TikTok e os estádios em 2022.', '273pasBKH18', '2026-11-25'),
  ('casas-bahia-quer-pagar-quanto', 'Casas Bahia: Quer Pagar Quanto?', 2003, '2003-01-01', 'TV', 'Raro', '💰', 'O garoto-propaganda da Casas Bahia e o “quer pagar quanto?” que ecoou por anos nos intervalos da TV.', 'djRwLxivrNs', '2026-11-25'),
  ('jo-suado', 'Jô Suado', 2011, '2011-04-24', 'TV', 'Relíquia', '🥵', 'A paródia de Carioca do programa do Jô no Pânico, entrevistando sósias de famosos com muito suor.', '4P-vhJpE1NA', '2026-11-25'),
  ('boris-casoy-isso-e-uma-vergonha', 'Boris Casoy: Isso É uma Vergonha!', 1990, '1990-01-01', 'TV', 'Relíquia', '📺', 'O bordão indignado de Boris Casoy no telejornal virou meme e foi imitado à exaustão (inclusive no Pânico).', '0aA0jCp1VRo', '2026-11-25'),
  ('tucano-huck', 'Tucano Huck', 2013, '2013-06-23', 'TV', 'Relíquia', '🦜', 'Daniel Zukerman imitando Luciano Huck no Pânico na Band, invadindo festas globais com o Vesgo.', '8xuiT9cDLOo', '2026-11-25'),
  ('impostor-do-panico', 'Impostor do Pânico', 2013, '2013-02-24', 'TV', 'Relíquia', '🎭', 'Daniel Zukerman, o Impostor, entrando sem convite em lugares como o tapete vermelho do Oscar.', 'EhcTJWP-bx0', '2026-11-25')
) AS v(id, titulo, ano, data, categoria, raridade, emoji, descricao, yt, adicionado)
WHERE EXISTS (SELECT 1 FROM memes)
ON CONFLICT (id) DO NOTHING;
