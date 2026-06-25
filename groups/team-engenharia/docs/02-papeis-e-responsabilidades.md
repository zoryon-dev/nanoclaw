# 02 — Papéis e responsabilidades

Detalhamento dos 7 sub-agentes. Cada um corresponde a um arquivo em `.claude/agents/`. A regra
geral: **papéis de decisão e auditoria não alteram código; papéis de execução alteram e testam.**

## architect — Arquiteto de software
- **Faz:** enquadra a decisão e as forças em jogo, lê o sistema existente, gera 2–3 opções com
  trade-offs, recomenda uma (dizendo o que abre mão) e escreve um ADR. Define o contrato/
  interfaces para os devs implementarem.
- **Não faz:** código de produção; aprovar o próprio design como "pronto".
- **Aciona quando:** a mudança cruza módulos/serviços, ou a estrutura certa não está clara.
- **Modelo:** opus (julgamento). Ferramentas: read-only + web + Write (para o ADR).

## backend-dev — Dev backend / full-stack
- **Faz:** implementa features server-side, APIs, lógica de negócio, acesso a dados, jobs e
  automação Python. Escreve código **e** testes, e roda até passar.
- **Stack:** TS/Node (primário), Python (secundário) — sempre respeitando a convenção do repo.
- **Aciona quando:** "construir", "corrigir", "refatorar", "adicionar endpoint", "migrar".
- **Hand-offs:** design incerto → `architect`; tocou auth/input/dado → `security-reviewer`;
  terminou → `qa-reviewer`.

## frontend-dev — Dev frontend
- **Faz:** UI em React/Next/TS — componentes, páginas, estado, formulários, data fetching.
  Cobre loading/empty/error/success e cuida de acessibilidade e performance. Escreve testes.
- **Aciona quando:** qualquer trabalho de interface/cliente.
- **Hand-offs:** precisa de API nova → `backend-dev`; decisão de IA/layout sistêmica →
  `architect`; terminou → `qa-reviewer`.

## repo-auditor — Verificador de repositório
- **Faz:** auditoria **read-only** da saúde do repo em 8 dimensões (estrutura, convenções,
  drift de docs, dependências, testes, dívida técnica, higiene de CI, superfície de segurança).
  Cada achado com evidência (path/comando). Entrega relatório priorizado.
- **Não faz:** refatorar — isso vai para os devs depois que você decide o que corrigir.
- **Aciona quando:** "auditar", "health check", "qual o estado de", onboarding em repo novo.

## qa-reviewer — QA / Code review
- **Faz:** revisa diff/PR (correção, edge cases, testes, segurança, manutenibilidade,
  compatibilidade) e classifica achados em **Blocker / Should-fix / Nit**. Também escreve/
  reforça testes. É o **gate de qualidade** — nada é "pronto" sem passar por aqui.
- **Aciona quando:** "revisar isto", "escrever testes", "está pronto pra produção?".

## devops-engineer — DevOps / CI-CD
- **Faz:** pipelines (GitHub Actions por padrão), Docker (multi-stage, non-root, pinado),
  config/secrets (12-factor + Agent Vault), deploy com rollback, e observabilidade.
- **Aciona quando:** "configurar CI", "dockerizar", "o build quebrou", "deploy", "monitorar".

## security-reviewer — Segurança (AppSec)
- **Faz:** revisa código/mudanças por vulnerabilidades (injeção, IDOR/authz quebrada, XSS,
  SSRF), audita secrets, checa dependências/supply chain e crypto. Classifica por severidade
  (**Critical/High/Medium/Low**) com remediação concreta. Advisory + read-only.
- **Aciona quando:** a mudança toca auth, input de usuário, exposição de dado, crypto, acesso
  a arquivo/rede, ou dependências.
- **Modelo:** opus (julgamento).

## Matriz de delegação (resumo)

| Pedido típico | Papel |
|---|---|
| Construir/alterar feature, bug, refactor server/data | `backend-dev` |
| Construir/alterar UI | `frontend-dev` |
| "Como devemos estruturar", trade-offs, novo serviço | `architect` |
| "Audite este repo", health check | `repo-auditor` |
| Revisar PR, escrever testes | `qa-reviewer` |
| CI/CD, Docker, deploy, monitoramento | `devops-engineer` |
| Vulnerabilidade, secrets, authz | `security-reviewer` |
