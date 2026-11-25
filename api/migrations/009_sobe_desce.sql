-- 009 · Sobe.Desce de verdade: visitas (abriu o meme) e cliques (deu play) por dia.
-- Um contador por meme, tipo e dia (não guarda cada acesso). O anti-spam fica em eventos_meme_ip.

CREATE TABLE eventos_meme_dia (
  meme_id  TEXT NOT NULL REFERENCES memes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  tipo     TEXT NOT NULL CHECK (tipo IN ('visita', 'clique')),
  dia      DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  total    INT  NOT NULL DEFAULT 0 CHECK (total >= 0),
  PRIMARY KEY (meme_id, tipo, dia)
);
CREATE INDEX eventos_meme_dia_rank_idx ON eventos_meme_dia (tipo, dia, total DESC);

-- quem já contou hoje (HMAC do IP, nunca o IP puro): 1 visita e 1 clique por meme, IP e dia
CREATE TABLE eventos_meme_ip (
  meme_id  TEXT NOT NULL,
  tipo     TEXT NOT NULL,
  dia      DATE NOT NULL,
  ip_hash  TEXT NOT NULL,
  PRIMARY KEY (meme_id, tipo, dia, ip_hash)
);
