-- Card "Mandato atual" no cadastro do municipio (pedido do usuario,
-- 2026-09-28): campos manuais, preenchidos pelo master/gestor de carteira,
-- pois nao ha API publica confiavel para prefeito/partido em exercicio (o
-- TSE so reflete o resultado da ultima eleicao, nao trocas de partido no
-- meio do mandato).
--
-- O alerta pelo sino (360/180/90/60/30/15 dias antes do fim do mandato,
-- para master + gestor de carteira, parando quando o mandato for trocado)
-- fica FORA desta migration de proposito: sera construido junto da central
-- de notificacoes, ainda nao mapeada/implementada. Aqui so guardamos o
-- dado; nenhuma rotina de verificacao roda ainda.

ALTER TABLE municipios
  ADD COLUMN prefeito_nome    TEXT,
  ADD COLUMN prefeito_partido TEXT,
  ADD COLUMN mandato_inicio   DATE,
  ADD COLUMN mandato_fim      DATE;
