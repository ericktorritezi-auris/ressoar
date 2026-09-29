-- Busca única de dados municipais (2026-09-29, mapeamento validado com o
-- usuário): Siconfi passa de "arquivo" (upload manual) para "api" (busca
-- ao vivo, igual IBGE); entram duas fontes novas — InfoDengue (api) e
-- IDHM/Atlas Brasil (arquivo_auto: baixado e importado automaticamente
-- de um endereço estável, sem upload manual). SNIS, DEMAS, CAGED/RAIS,
-- INEP/IDEB e SSP/SINESP ficaram de fora do recorte por não terem uma
-- API viva nem um arquivo com endereço estável confirmado.

ALTER TABLE fontes_dados_publicos ADD COLUMN arquivo_url TEXT;

UPDATE fontes_dados_publicos
   SET integracao = 'api',
       dado_trazido = 'Receita corrente líquida, despesa total, % investido em saúde/educação, dívida'
 WHERE codigo = 'siconfi';

INSERT INTO fontes_dados_publicos (codigo, nome, dado_trazido, integracao, ordem, arquivo_url) VALUES
  ('infodengue', 'InfoDengue', 'Casos de dengue/chikungunya/zika, incidência por 100 mil hab., nível de alerta', 'api', 6, NULL),
  ('idhm_atlas', 'IDHM (Atlas Brasil/PNUD)', 'IDHM geral, educação, longevidade e renda; escolarização 6-14 anos', 'arquivo_auto', 7,
   'https://www.atlasbrasil.org.br/cockpit/storage/uploads/dados/censo_total_1991_2010.xlsx');
