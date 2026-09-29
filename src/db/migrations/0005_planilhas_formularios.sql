-- 0005_planilhas_formularios.sql
-- Fase 3: coleta de dados via planilha e formularios, com fluxo de
-- aprovacao unico para os dois (secao 5 do mapeamento).
--
-- Modelo: "formularios" guarda cada disparo de formulario (template ou
-- personalizado) para um destinatario dentro de um municipio; ao
-- responder, a resposta vira uma linha em "submissoes" — a MESMA tabela
-- que recebe as planilhas importadas. submissoes e o unico lugar onde
-- master/gestor_carteira aprovam ou rejeitam dado recem-chegado, com
-- versionamento: reenvios nunca sobrescrevem o anterior (auditoria).

CREATE TYPE tipo_submissao AS ENUM ('planilha', 'formulario');
CREATE TYPE status_submissao AS ENUM ('rascunho_pendente', 'aprovado', 'rejeitado');
CREATE TYPE status_formulario AS ENUM ('pendente', 'respondido');
CREATE TYPE modelo_formulario AS ENUM (
  'nr1_inventario_riscos', 'nine_box', 'pesquisa_clima', 'dados_institucionais', 'personalizado'
);

-- ---------------------------------------------------------------------
-- Formularios: cada linha e um disparo (template pronto ou construido do
-- zero pelo master/gestor de carteira) para UM destinatario dentro de UM
-- municipio (secao 5.2 do mapeamento).
-- ---------------------------------------------------------------------
CREATE TABLE formularios (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id     UUID NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  modelo           modelo_formulario NOT NULL DEFAULT 'personalizado',
  nome             TEXT NOT NULL,
  descricao        TEXT,
  campos           JSONB NOT NULL, -- [{chave, rotulo, tipo, obrigatorio, opcoes?}]
  destinatario_id  UUID NOT NULL REFERENCES usuarios(id),
  criado_por       UUID NOT NULL REFERENCES usuarios(id),
  status           status_formulario NOT NULL DEFAULT 'pendente',
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondido_em    TIMESTAMPTZ
);

ALTER TABLE formularios ENABLE ROW LEVEL SECURITY;
ALTER TABLE formularios FORCE ROW LEVEL SECURITY;

-- Mesmo padrao de isolamento da migration 0004: master ve tudo,
-- gestor_carteira ve os municipios da propria carteira, e qualquer outro
-- usuario autenticado (destinatario do formulario) ve o que pertence ao
-- proprio municipio de vinculo.
CREATE POLICY formularios_isolamento ON formularios
  USING (
    current_setting('app.is_master', true) = 'true'
    OR municipio_id::text = current_setting('app.current_municipio_id', true)
    OR municipio_id IN (
      SELECT id FROM municipios
       WHERE gestor_carteira_id::text = current_setting('app.current_usuario_id', true)
    )
  );

CREATE INDEX idx_formularios_municipio ON formularios(municipio_id);
CREATE INDEX idx_formularios_destinatario ON formularios(destinatario_id);

-- ---------------------------------------------------------------------
-- Submissoes: planilha importada OU resposta de formulario, sempre
-- passando por aprovacao do master/gestor de carteira antes de valer
-- como dado oficial (secao 5.1 e 5.2 do mapeamento). "dados" guarda o
-- conteudo interpretado (linhas da planilha ou respostas do formulario);
-- nunca e sobrescrito — um reenvio cria nova linha com versao+1, a
-- anterior fica retida para auditoria.
-- ---------------------------------------------------------------------
CREATE TABLE submissoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id     UUID NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  tipo             tipo_submissao NOT NULL,
  formulario_id    UUID REFERENCES formularios(id) ON DELETE SET NULL,
  origem           TEXT NOT NULL, -- nome do arquivo (planilha) ou nome do formulario (denormalizado)
  versao           SMALLINT NOT NULL DEFAULT 1,
  status           status_submissao NOT NULL DEFAULT 'rascunho_pendente',
  dados            JSONB NOT NULL,
  enviado_por      UUID NOT NULL REFERENCES usuarios(id),
  enviado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisado_por     UUID REFERENCES usuarios(id),
  revisado_em      TIMESTAMPTZ,
  motivo_rejeicao  TEXT
);

ALTER TABLE submissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissoes FORCE ROW LEVEL SECURITY;

CREATE POLICY submissoes_isolamento ON submissoes
  USING (
    current_setting('app.is_master', true) = 'true'
    OR municipio_id::text = current_setting('app.current_municipio_id', true)
    OR municipio_id IN (
      SELECT id FROM municipios
       WHERE gestor_carteira_id::text = current_setting('app.current_usuario_id', true)
    )
  );

CREATE INDEX idx_submissoes_municipio ON submissoes(municipio_id);
CREATE INDEX idx_submissoes_status ON submissoes(municipio_id, tipo, status);
