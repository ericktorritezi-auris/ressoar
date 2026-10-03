-- Fase 4 (BI/Dashboards/Alertas — docs/mapeamento-fase4-bi-dashboards.md,
-- mapeamento fechado em 2026-10-01).
--
-- Ate aqui, "indicadores" so guardava metadado (linha de base, meta,
-- periodicidade) — nao havia lugar para o valor realizado ao longo do
-- tempo, que e o que qualquer dashboard ou grafico do cubo de BI precisa
-- para ter dado real. Esta migration cria essa serie temporal
-- (indicador_valores) e a tabela de alertas (sino), alem de uma coluna de
-- preferencia de dashboard por usuario.

-- ---------------------------------------------------------------------
-- Serie temporal de indicadores: um valor por indicador+periodo.
-- ---------------------------------------------------------------------
CREATE TABLE indicador_valores (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id       UUID NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  indicador_id       UUID NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
  periodo_referencia TEXT NOT NULL, -- ex.: '2026-01', '2026-Q2', '2026' (conforme periodicidade do indicador)
  valor_numerico     NUMERIC NOT NULL,
  registrado_por     UUID REFERENCES usuarios(id),
  registrado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (indicador_id, periodo_referencia)
);

ALTER TABLE indicador_valores ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicador_valores FORCE ROW LEVEL SECURITY;

-- Mesmo padrao de isolamento usado em indicadores/snapshots (migration
-- 0004): master ve tudo, gestor_carteira so os municipios da propria
-- carteira, demais perfis so o proprio municipio.
CREATE POLICY indicador_valores_isolamento ON indicador_valores
  USING (
    current_setting('app.is_master', true) = 'true'
    OR municipio_id::text = current_setting('app.current_municipio_id', true)
    OR municipio_id IN (
      SELECT id FROM municipios
       WHERE gestor_carteira_id::text = current_setting('app.current_usuario_id', true)
    )
  );

CREATE INDEX idx_indicador_valores_municipio ON indicador_valores(municipio_id);
CREATE INDEX idx_indicador_valores_indicador ON indicador_valores(indicador_id, periodo_referencia);

-- ---------------------------------------------------------------------
-- Alertas (sino): gerados pelo sistema (mandato perto do fim, indicador
-- fora do padrao) ou refletidos ao vivo (formulario pendente nao gera
-- linha aqui — ver modulos/alertas/repositorio.js). chave_dedup evita
-- duplicar o mesmo alerta a cada recalculo (ex.: "mandato:180" so e
-- gerado uma vez por municipio ate o mandato mudar).
-- ---------------------------------------------------------------------
CREATE TYPE tipo_alerta AS ENUM ('mandato_fim', 'indicador_fora_padrao');
CREATE TYPE nivel_alerta AS ENUM ('info', 'atencao', 'critico');

CREATE TABLE alertas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id  UUID NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  tipo          tipo_alerta NOT NULL,
  nivel         nivel_alerta NOT NULL DEFAULT 'atencao',
  titulo        TEXT NOT NULL,
  mensagem      TEXT NOT NULL,
  chave_dedup   TEXT NOT NULL,
  gerado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  lido_em       TIMESTAMPTZ,
  UNIQUE (municipio_id, chave_dedup)
);

ALTER TABLE alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas FORCE ROW LEVEL SECURITY;

CREATE POLICY alertas_isolamento ON alertas
  USING (
    current_setting('app.is_master', true) = 'true'
    OR municipio_id::text = current_setting('app.current_municipio_id', true)
    OR municipio_id IN (
      SELECT id FROM municipios
       WHERE gestor_carteira_id::text = current_setting('app.current_usuario_id', true)
    )
  );

CREATE INDEX idx_alertas_municipio ON alertas(municipio_id);
CREATE INDEX idx_alertas_nao_lidos ON alertas(municipio_id) WHERE lido_em IS NULL;

-- ---------------------------------------------------------------------
-- Preferencia de dashboard por usuario (secao 3 do mapeamento de Fase 4):
-- quais dos 5 relatorios fixos por eixo o prefeito/secretario escolheu
-- manter visiveis. NULL = todos (padrao, antes de qualquer customizacao).
-- ---------------------------------------------------------------------
ALTER TABLE usuarios
  ADD COLUMN dashboard_eixos_ativos TEXT[];
