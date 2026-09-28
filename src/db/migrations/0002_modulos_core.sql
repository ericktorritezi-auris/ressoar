-- 0002_modulos_core.sql
-- Fase 2: eixos, catalogo de indicadores, fontes de dados publicos e o
-- cache de dados publicos por codigo IBGE (secoes 3 e 4 do mapeamento).
-- municipios e usuarios ja existem desde a 0001_init.sql.

-- ---------------------------------------------------------------------
-- Eixos do programa (fixos: A a E — secao 3.3 do mapeamento)
-- ---------------------------------------------------------------------
CREATE TABLE eixos (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo CHAR(1) NOT NULL UNIQUE CHECK (codigo IN ('A', 'B', 'C', 'D', 'E')),
  nome   TEXT NOT NULL,
  ordem  SMALLINT NOT NULL
);

INSERT INTO eixos (codigo, nome, ordem) VALUES
  ('A', 'Escola Emocional', 1),
  ('B', 'Saúde do Servidor', 2),
  ('C', 'Atendimento Comunitário', 3),
  ('D', 'Campanhas Educativas', 4),
  ('E', 'NR-1 / Riscos Psicossociais', 5);

-- ---------------------------------------------------------------------
-- Catalogo de indicadores por municipio/eixo
-- ---------------------------------------------------------------------
CREATE TYPE periodicidade_indicador AS ENUM (
  'mensal', 'bimestral', 'trimestral', 'semestral', 'anual'
);

CREATE TYPE fonte_indicador AS ENUM ('planilha', 'formulario', 'dado_publico');

CREATE TABLE indicadores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id   UUID NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  eixo_id        UUID NOT NULL REFERENCES eixos(id),
  nome           TEXT NOT NULL,
  linha_base     NUMERIC,
  meta           NUMERIC,
  unidade        TEXT,
  periodicidade  periodicidade_indicador NOT NULL DEFAULT 'mensal',
  fonte_dado     fonte_indicador NOT NULL DEFAULT 'planilha',
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE indicadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicadores FORCE ROW LEVEL SECURITY;

CREATE POLICY indicadores_isolamento ON indicadores
  USING (
    current_setting('app.is_master', true) = 'true'
    OR municipio_id::text = current_setting('app.current_municipio_id', true)
  );

CREATE INDEX idx_indicadores_municipio ON indicadores(municipio_id);
CREATE INDEX idx_indicadores_eixo ON indicadores(eixo_id);

-- ---------------------------------------------------------------------
-- Fontes de dados publicos (secao 4): cada uma sabe se e integracao "api"
-- (buscada ao vivo pelo sistema) ou "arquivo" (baixado a mao pelo master e
-- importado na Central de Atualizacoes).
-- ---------------------------------------------------------------------
CREATE TYPE tipo_integracao_fonte AS ENUM ('api', 'arquivo');

CREATE TABLE fontes_dados_publicos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       TEXT NOT NULL UNIQUE,
  nome         TEXT NOT NULL,
  dado_trazido TEXT NOT NULL,
  integracao   tipo_integracao_fonte NOT NULL,
  ordem        SMALLINT NOT NULL
);

INSERT INTO fontes_dados_publicos (codigo, nome, dado_trazido, integracao, ordem) VALUES
  ('ibge_sidra', 'IBGE SIDRA/Agregados', 'População, território, densidade', 'api', 1),
  ('siops', 'SIOPS', 'Percentual investido em saúde', 'arquivo', 2),
  ('siconfi', 'Siconfi/Finbra (Tesouro Nacional)', 'Finanças municipais', 'arquivo', 3),
  ('cnes', 'CNES', 'Estabelecimentos de saúde', 'arquivo', 4),
  ('datasus', 'DATASUS (SIH/SIM/SINASC/SINAN)', 'Internações, mortalidade, nascimentos', 'arquivo', 5);

-- ---------------------------------------------------------------------
-- Dados publicos: compartilhados por codigo IBGE, armazenados uma unica
-- vez (NUNCA duplicados por municipio-cliente que compartilhe o mesmo
-- codigo — secao 4 do mapeamento). Por isso a chave e codigo_ibge, nao
-- municipio_id; o acesso de cada tenant e sempre mediado pelo JOIN com
-- municipios (que tem RLS). Nao e dado sensivel: e numero agregado
-- publico em nivel municipal, nunca individual/clinico.
-- ---------------------------------------------------------------------
CREATE TABLE dados_publicos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ibge        TEXT NOT NULL,
  fonte_id           UUID NOT NULL REFERENCES fontes_dados_publicos(id),
  chave              TEXT NOT NULL, -- ex.: 'populacao', 'area_km2', 'densidade'
  valor_numerico     NUMERIC,
  valor_texto        TEXT,
  periodo_referencia TEXT,          -- ex.: '2026', '2026-Q2'
  coletado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_ibge, fonte_id, chave, periodo_referencia)
);

CREATE INDEX idx_dados_publicos_codigo_ibge ON dados_publicos(codigo_ibge);

-- ---------------------------------------------------------------------
-- Snapshot de linha de base: congelado na assinatura do contrato (nesta
-- fase, disparado manualmente pelo master no cadastro do municipio), para
-- medir evolucao ao longo do programa sem que a linha de base "ande"
-- quando o dado publico e atualizado depois (secao 4 do mapeamento).
-- ---------------------------------------------------------------------
CREATE TABLE snapshots_linha_base (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id   UUID NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  codigo_ibge    TEXT,
  chave          TEXT NOT NULL,
  valor_numerico NUMERIC,
  valor_texto    TEXT,
  congelado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE snapshots_linha_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots_linha_base FORCE ROW LEVEL SECURITY;

CREATE POLICY snapshots_isolamento ON snapshots_linha_base
  USING (
    current_setting('app.is_master', true) = 'true'
    OR municipio_id::text = current_setting('app.current_municipio_id', true)
  );

CREATE INDEX idx_snapshots_municipio ON snapshots_linha_base(municipio_id);
