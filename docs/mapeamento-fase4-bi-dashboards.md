# Mapeamento — Fase 4 (Indicadores, Dashboards, Self-Service BI, Alertas)

> **Status: mapeamento fechado em 2026-10-01.** Revisado contra todo o
> histórico disponível da conversa e contra o estado atual do código antes
> de iniciar qualquer implementação, conforme o processo-padrão do projeto
> ("nenhuma fase nova começa sem antes revisar o mapeamento completo").

## 1. Escopo da fase

Módulos afetados: `indicadores` (evolução do que já existe), `dashboards`,
`self-service-bi`, `alertas` (todos ainda placeholder).

## 2. Série temporal de indicadores (base técnica)

Hoje `indicadores` guarda só metadado (eixo, nome, linha de base, meta,
unidade, periodicidade, fonte, ativo). Não existe lugar para o valor
realizado ao longo do tempo.

**Decisão:** criar uma tabela de **valores de indicador por
município + indicador + período** (série temporal). É a base técnica que
alimenta dashboards fixos e o cubo de self-service BI — sem ela, nenhum
gráfico tem dado real para mostrar.

## 3. Dashboards

- Dashboards fixos: **um relatório por eixo** nesta primeira versão —
  Escola Emocional, Saúde Emocional para Servidores Públicos, Atendimento
  Terapêutico Comunitário, Campanhas Educativas, Riscos
  Psicossociais/Conformidade (NR-1) — cada um lendo a série temporal de
  indicadores daquele eixo.
- Customização: prefeito/secretário podem adicionar/remover relatórios a
  partir dessa lista sugerida (não é um construtor livre).
- Painel é somente leitura para esses perfis (servidor municipal: só
  acompanhamento/BI, nunca insere dado).
- Requisitos de UI que já valem pra todo o sistema também valem aqui:
  mobile-first sem scroll horizontal, tema claro/escuro completo desde o
  início.

## 4. Self-service BI (cubo de dados)

- Cobertura nesta primeira versão: **indicadores + dados públicos
  (IBGE/Siconfi/InfoDengue/IDHM) + formulários/planilhas** — as três
  fontes já existentes no sistema entram no mesmo cubo.
- **Guardrail obrigatório, não opcional:** antes de renderizar qualquer
  gráfico, o backend precisa validar se a dimensão e a métrica escolhidas
  pelo usuário realmente se cruzam (mesma granularidade/fonte/junção
  válida). Se não se cruzarem, a resposta é um aviso claro de que aquele
  cruzamento não gera dado correto — nunca um gráfico vazio, zerado ou
  enganoso. Essa validação é a peça mais crítica da fase e deve ser escrita
  e testada antes de qualquer tela de cubo.
- Como as três fontes têm granularidades diferentes (indicador = por
  eixo/período; dados públicos = por município/ano; formulário/planilha =
  por pergunta/período de coleta), o guardrail precisa de uma tabela de
  compatibilidade explícita dimensão×métrica×fonte, não uma heurística
  solta.

## 5. Alertas / sino de notificações

- Sino presente no mobile e na web, cobrindo:
  - **Pendências** (ex.: formulário não respondido).
  - **Números fora do padrão** — ver regra abaixo.
- **Regra de "fora do padrão" (decisão fechada):** comparação com o
  **histórico do próprio município** — desvio em relação à média/tendência
  anterior daquele indicador naquele município. Não depende de meta/limite
  cadastrado nem de comparação entre municípios.
- **Card "Mandato atual"** (já mapeado antes, entra nesta fase por
  depender do módulo de alertas): campos prefeito/partido/início-fim de
  mandato no cadastro do município; alerta disparado **só pelo sino**
  (nunca e-mail, pra preservar a cota compartilhada do Resend) aos
  **360 / 180 / 90 / 60 / 30 / 15 dias** antes do fim do mandato, para
  **master + gestor de carteira responsável**; para de disparar quando o
  mandato é atualizado no cadastro.

## 6. O que fica para depois (fora desta fase)

- Diferenciação fina de alertas por perfil (escopo exato de quem vê o quê
  além de "master + gestor responsável" no caso do mandato) — resolver
  caso surja necessidade real durante os testes em staging.
- Conteúdo de dashboard/BI para a linha de Consultoria Tributária — essa
  linha segue pausada (ver `docs/mapeamento-consultoria-tributaria.md`).
- Povoamento do "Município Teste" com cenários de dashboard/alerta para
  demonstração comercial — fica para a etapa final do projeto, antes de
  produção, como já definido anteriormente.

## 7. Observação de processo

Parte do histórico de planejamento original (Fase 1–3) não estava mais
disponível no transcript desta sessão (só a memória persistente guardava
os requisitos citados acima). Caso o Erick tenha anotações adicionais de
Fase 4 em outro lugar que não tenham sido capturadas aqui, é importante
trazer antes de fechar a implementação de cada parte.
