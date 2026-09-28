-- 0001_init.sql
-- Fundacao do banco: municipios, usuarios e o isolamento multi-tenant via
-- Row-Level Security (secao 7 e 8 do mapeamento). Dado clinico/prontuario
-- NUNCA entra neste banco — so numero agregado (secao 1).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Municipios
-- ---------------------------------------------------------------------
CREATE TABLE municipios (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ibge      TEXT UNIQUE,
  nome             TEXT NOT NULL,
  uf               CHAR(2) NOT NULL,
  populacao        INTEGER,
  brasao_url       TEXT,
  contrato_inicio  DATE,
  contrato_vigencia TEXT,
  gestor_carteira_id UUID, -- FK adicionada apos a tabela usuarios existir
  eh_municipio_teste BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Usuarios (todos os perfis: master, administrador de carteira,
-- prefeito/secretario, servidor, responsavel pelos dados)
-- ---------------------------------------------------------------------
CREATE TYPE perfil_usuario AS ENUM (
  'master',
  'gestor_carteira',
  'prefeito_secretario',
  'servidor',
  'responsavel_dados'
);

CREATE TABLE usuarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL para master e gestor_carteira (nao pertencem a um so municipio)
  municipio_id   UUID REFERENCES municipios(id) ON DELETE RESTRICT,
  perfil         perfil_usuario NOT NULL,
  nome           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  senha_hash     TEXT NOT NULL,
  cpf            TEXT,
  matricula      TEXT,
  cargo          TEXT,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  requer_2fa     BOOLEAN NOT NULL DEFAULT FALSE, -- true para prefeito/secretario
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT municipio_obrigatorio_exceto_master CHECK (
    (perfil IN ('master', 'gestor_carteira') AND municipio_id IS NULL)
    OR (perfil NOT IN ('master', 'gestor_carteira') AND municipio_id IS NOT NULL)
  )
);

ALTER TABLE municipios
  ADD CONSTRAINT fk_municipios_gestor_carteira
  FOREIGN KEY (gestor_carteira_id) REFERENCES usuarios(id);

-- Municipios que um gestor_carteira pode ver (N:N — um municipio tem um
-- gestor responsavel em municipios.gestor_carteira_id, mas mantemos esta
-- tabela para permitir mais de um administrador por municipio no futuro
-- sem quebrar o schema).
CREATE TABLE administradores_municipios (
  usuario_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  municipio_id  UUID NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, municipio_id)
);

-- ---------------------------------------------------------------------
-- Autenticacao: redefinicao de senha, 2FA por e-mail e dispositivo confiavel
-- ---------------------------------------------------------------------
CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expira_em   TIMESTAMPTZ NOT NULL,
  usado_em    TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE two_factor_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash TEXT NOT NULL,
  expira_em   TIMESTAMPTZ NOT NULL,
  usado_em    TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dispositivo confiavel: evita mandar codigo de 2FA a cada login (secao 13
-- do mapeamento — maior risco de estourar a cota gratuita do Resend).
CREATE TABLE trusted_devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id        UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  device_token_hash TEXT NOT NULL,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em         TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_trusted_devices_usuario ON trusted_devices(usuario_id);
CREATE INDEX idx_2fa_codes_usuario ON two_factor_codes(usuario_id);
CREATE INDEX idx_reset_tokens_usuario ON password_reset_tokens(usuario_id);

-- ---------------------------------------------------------------------
-- Row-Level Security: isolamento entre municipios
-- ---------------------------------------------------------------------
-- Padrao usado em toda tabela com dado de municipio (a partir da Fase 2):
-- a policy libera a linha se o usuario e master/gestor_carteira (variavel
-- de sessao app.is_master = true) OU se app.current_municipio_id bate com
-- a coluna municipio_id da linha. Essas variaveis sao setadas pela
-- aplicacao em toda transacao (ver src/config/db.js).

ALTER TABLE municipios ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipios FORCE ROW LEVEL SECURITY;

CREATE POLICY municipios_isolamento ON municipios
  USING (
    current_setting('app.is_master', true) = 'true'
    OR id::text = current_setting('app.current_municipio_id', true)
  );

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios FORCE ROW LEVEL SECURITY;

CREATE POLICY usuarios_isolamento ON usuarios
  USING (
    current_setting('app.is_master', true) = 'true'
    OR municipio_id IS NULL -- master/gestor_carteira sempre visivel no proprio login
    OR municipio_id::text = current_setting('app.current_municipio_id', true)
  );

-- ---------------------------------------------------------------------
-- Controle de migrations (usado por src/db/migrate.js)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  versao      TEXT PRIMARY KEY,
  aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
