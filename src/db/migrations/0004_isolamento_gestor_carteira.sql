-- Bug #7 (achado na rodada de testes de 2026-09-28): as policies de RLS
-- abaixo tratavam "master" e "gestor_carteira" como a mesma coisa
-- (app.is_master = true para os dois), entao um gestor_carteira enxergava
-- TODOS os municipios do sistema, nao so os que ele administra — uma
-- falha real de isolamento multi-tenant (secao 2 do mapeamento: "cada
-- gestor de carteira ve apenas os municipios sob sua responsabilidade").
--
-- A aplicacao agora manda app.is_master = true SOMENTE para o perfil
-- master de verdade (src/middlewares/tenant.js) e passa tambem
-- app.current_usuario_id (src/config/db.js) — as policies abaixo usam
-- esse novo dado para escopar o gestor_carteira aos municipios em que ele
-- e o gestor_carteira_id, e em cascata aos usuarios/indicadores/snapshots
-- desses municipios.

DROP POLICY IF EXISTS municipios_isolamento ON municipios;
CREATE POLICY municipios_isolamento ON municipios
  USING (
    current_setting('app.is_master', true) = 'true'
    OR id::text = current_setting('app.current_municipio_id', true)
    OR gestor_carteira_id::text = current_setting('app.current_usuario_id', true)
  );

DROP POLICY IF EXISTS usuarios_isolamento ON usuarios;
CREATE POLICY usuarios_isolamento ON usuarios
  USING (
    current_setting('app.is_master', true) = 'true'
    OR municipio_id IS NULL
    OR municipio_id::text = current_setting('app.current_municipio_id', true)
    OR municipio_id IN (
      SELECT id FROM municipios
       WHERE gestor_carteira_id::text = current_setting('app.current_usuario_id', true)
    )
  );

DROP POLICY IF EXISTS indicadores_isolamento ON indicadores;
CREATE POLICY indicadores_isolamento ON indicadores
  USING (
    current_setting('app.is_master', true) = 'true'
    OR municipio_id::text = current_setting('app.current_municipio_id', true)
    OR municipio_id IN (
      SELECT id FROM municipios
       WHERE gestor_carteira_id::text = current_setting('app.current_usuario_id', true)
    )
  );

DROP POLICY IF EXISTS snapshots_isolamento ON snapshots_linha_base;
CREATE POLICY snapshots_isolamento ON snapshots_linha_base
  USING (
    current_setting('app.is_master', true) = 'true'
    OR municipio_id::text = current_setting('app.current_municipio_id', true)
    OR municipio_id IN (
      SELECT id FROM municipios
       WHERE gestor_carteira_id::text = current_setting('app.current_usuario_id', true)
    )
  );
