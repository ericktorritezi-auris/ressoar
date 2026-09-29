-- 0006_mapa_municipio.sql
-- Novo UX do card de Contexto do Município (decidido em 2026-09-29, ver
-- seção 4 do mapeamento): painel de Localização com mapa estático.
--
-- Guardamos o SVG puro (texto), não um arquivo binário — evita de vez a
-- "Decisão em aberto" de armazenamento de arquivos (seção 11): o
-- contorno geográfico do IBGE cabe folgado num TEXT do Postgres (poucos
-- KB) e assim não depende de disco persistente nem de object storage
-- externo. Gerado uma única vez quando o código IBGE é informado — nunca
-- regenerado automaticamente na atualização periódica de dados públicos,
-- porque o contorno de um município praticamente não muda (só por lei
-- federal de redefinição de limites). Um botão manual cobre esse caso raro.
ALTER TABLE municipios
  ADD COLUMN mapa_svg TEXT,
  ADD COLUMN mapa_atualizado_em TIMESTAMPTZ;
