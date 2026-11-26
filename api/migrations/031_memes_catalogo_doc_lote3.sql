-- 031: os 21 memes do "Catálogo Completo" que foram acrescentados à 025 DEPOIS de ela já estar aplicada em produção.
-- A 025 voltou ao conteúdo aplicado (checksum igual ao do banco) e estes memes vêm aqui. Migração já aplicada não pode ser
-- editada: o migrate.js recusa o checksum diferente e a API não sobe (foi o que travou os deploys depois de 25/11/2026).
-- Só roda em banco que já tem o acervo (num banco vazio quem carrega é o seed). Idempotente, não sobrescreve nada.
INSERT INTO memes (id, titulo, ano, data, categoria, tipo, raridade, emoji, descricao, youtube_id, adicionado_em, status)
SELECT v.id, v.titulo, v.ano, v.data::date, v.categoria, 'video', v.raridade, v.emoji, v.descricao, v.yt, v.adicionado::date, 'publicado' FROM (VALUES
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
