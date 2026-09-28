# Ressoar

Sistema de gestão do programa **Saúde Emocional para Todos**, para uso do administrador master (Evolution Therapy) na implantação, acompanhamento e prestação de contas do programa em múltiplos municípios contratantes.

> Status: estrutura de bootstrap — repositório recém-criado, ainda sem código de funcionalidade. Este commit existe apenas para ativar a branch `main` e permitir a ligação com o Railway (GitHub + PostgreSQL).

## O que é o Ressoar

O Ressoar não é operado pela prefeitura como uma ferramenta clínica — é a plataforma pela qual o administrador master gerencia múltiplos municípios, registra ações e indicadores do programa, e entrega um painel de acompanhamento (somente leitura) para prefeitos, secretários e servidores autorizados de cada município.

O programa cobre 5 eixos: Escola Emocional, Saúde Emocional para Servidores Públicos, Atendimento Terapêutico Comunitário, Campanhas Educativas, e Riscos Psicossociais/Conformidade (NR-1 e Lei 14.831/2024).

## Stack

- **Backend**: Node.js / Express
- **Banco de dados**: PostgreSQL, multi-tenant em banco único com isolamento por município (coluna + Row-Level Security)
- **Frontend**: aplicação web mobile-first, com tema claro e escuro nativos
- **Hospedagem**: Railway
- **CI/CD**: GitHub Actions — testes de regressão/QA bloqueiam qualquer deploy com falha
- **E-mail transacional**: Resend (domínio Belle Planner)

## Estrutura de pastas

```
src/                    Backend (API, regras de negócio)
  config/                 Configuração e variáveis de ambiente
  db/
    migrations/           Migrations do PostgreSQL
    seeds/                 Seeds (incl. Município Teste)
  modules/                 Um módulo por domínio funcional
    auth/                    Autenticação, 2FA, sessões
    municipios/              Cadastro de municípios (IBGE, contrato, brasão)
    usuarios/                Cadastro de usuários/servidores e permissões
    indicadores/             Catálogo de indicadores dos 5 eixos
    formularios/             Construtor de formulários + biblioteca de modelos
    planilhas/               Importação de planilhas e fluxo de aprovação
    contexto-publico/        Integração com IBGE/SIOPS/Siconfi/CNES/DATASUS
    dashboards/              Dashboards fixos e personalização
    self-service-bi/         Cubo de dados e guardrail de cruzamento
    alertas/                 Sino de notificações
    crm-propostas/           Pipeline comercial e gerador de proposta em PDF
    nr1/                     Inventário de riscos psicossociais e planos de ação
  middlewares/             Isolamento multi-tenant, permissões, auditoria
  jobs/                    Rotinas agendadas (Central de Atualizações, backups)
  emails/
    templates/               Templates de e-mail transacional (Resend)
web/                     Frontend
  src/
    components/
      layout/               Menu lateral único, rodapé versionado, sino
      ui/                     Componentes de interface reutilizáveis
    pages/                  Telas da aplicação
    theme/                  Tokens de tema claro/escuro
  public/
    assets/
      icons/                Ícones e identidade visual (Ressoar)
docs/                    Documentação técnica do projeto
scripts/                 Scripts utilitários (deploy, geração de dados de teste)
tests/                   Testes automatizados (QA/CI)
```

## Convenções do projeto

- Nenhum ambiente de desenvolvimento local: tudo roda automaticamente a partir do push no GitHub (migrations, seeds, deploy).
- Toda entrega segue com tabela de QA e tabela de arquivos modificados.
- Versão exibida automaticamente no rodapé de todas as páginas, controlada por variável de ambiente. Primeira publicação em produção: `v1.0.0`.
- Dado clínico/prontuário nunca é armazenado — apenas números agregados.

---
© 2026 Belle Planner. Todos os direitos reservados.
