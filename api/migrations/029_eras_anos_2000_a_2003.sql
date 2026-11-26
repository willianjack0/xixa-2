-- 029: os anos 2000–2003 eram uma era só ("2000–03") e agora cada ano tem a sua página na linha do tempo.
-- A era de 2000 deixa de ir até 2003 e ganham-se 2001, 2002 e 2003 (mesmos textos do data.js).
-- Se o banco não tiver a era de 2000 (o de produção começa em 2004), ela entra junto.
-- Só mexe em banco que já tem eras (o seed cria do data.js) e não sobrescreve texto editado no painel.
UPDATE eras SET ano_fim = 2000, rotulo = '2000', lema = 'Bug do milênio e internet grátis',
  texto = 'O mundo não acabou no bug do milênio, a internet grátis chegou pelo discador e o Napster ensinou todo mundo a baixar música.'
  WHERE ano = 2000 AND ano_fim = 2003 AND rotulo = '2000–03';
UPDATE eras SET ano_fim = 2000, rotulo = '2000' WHERE ano = 2000 AND ano_fim = 2003;
INSERT INTO eras (ano, ano_fim, rotulo, lema, texto)
SELECT v.ano, v.ano, v.rotulo, v.lema, v.texto FROM (VALUES
  (2000, '2000', 'Bug do milênio e internet grátis', 'O mundo não acabou no bug do milênio, a internet grátis chegou pelo discador e o Napster ensinou todo mundo a baixar música.'),
  (2001, '2001', 'Casa dos Artistas e Kazaa', 'A Casa dos Artistas parou o país no SBT, o Kazaa virou a loja de música de todo mundo e o ICQ fazia uh-oh o dia inteiro.'),
  (2002, '2002', 'Penta, BBB e MSN', 'O Brasil foi penta na Copa da Coreia e do Japão, estreou o primeiro Big Brother Brasil e o MSN Messenger começou a roubar o lugar do ICQ.'),
  (2003, '2003', 'Banda larga e funk na TV', 'A banda larga chegou a mais casas, o funk carioca invadiu os programas de domingo e o MP3 baixado no Kazaa ia parar no CD gravado.')
) AS v(ano, rotulo, lema, texto)
WHERE EXISTS (SELECT 1 FROM eras)
ON CONFLICT (ano) DO NOTHING;
