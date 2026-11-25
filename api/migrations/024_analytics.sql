-- 024 · Navegação do site (analytics sem dados pessoais): contadores agregados por dia, página, origem e dispositivo.
-- Não guarda IP nem cada acesso. Visitantes únicos por dia usam um HMAC (ip+navegador) que é apagado depois de 3 dias.
CREATE TABLE analytics_dia (
  dia           DATE NOT NULL,
  pagina        TEXT NOT NULL,
  origem        TEXT NOT NULL,
  dispositivo   TEXT NOT NULL CHECK (dispositivo IN ('celular', 'tablet', 'desktop')),
  visualizacoes INT  NOT NULL DEFAULT 0 CHECK (visualizacoes >= 0),
  sessoes       INT  NOT NULL DEFAULT 0 CHECK (sessoes >= 0),
  segundos      BIGINT NOT NULL DEFAULT 0 CHECK (segundos >= 0),   -- tempo com a aba visível
  PRIMARY KEY (dia, pagina, origem, dispositivo)
);
CREATE TABLE analytics_visitante_dia (
  dia       DATE NOT NULL,
  visitante TEXT NOT NULL,
  PRIMARY KEY (dia, visitante)
);
CREATE TABLE analytics_visitantes (
  dia        DATE PRIMARY KEY,
  visitantes INT NOT NULL DEFAULT 0 CHECK (visitantes >= 0)
);
