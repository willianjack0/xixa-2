-- 026: "Hebe, Nair Bello e Lolita no Jô" só existe no Facebook (o link do YouTube não toca fora de lá).
-- O site passa a tocar o vídeo do Facebook (campo "fb" no data.js) dentro do player da época; aqui só sai o
-- youtube_id antigo, senão o /api/memes devolveria o link quebrado e ele teria prioridade. Não mexe se já trocaram.
UPDATE memes SET youtube_id = NULL WHERE id = 'hebe-nair-lolita-jo' AND youtube_id = 'hpe7UhFrUyM';
