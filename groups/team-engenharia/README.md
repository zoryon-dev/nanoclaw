# team-engenharia — Agent Group de Engenharia para NanoClaw

Pasta de **agent group** pronta para plugar no seu fork do NanoClaw v2. Transforma o seu
assistente (hoje focado em negócios) em um **time de engenharia de software** orquestrado:
desenvolvedores, arquiteto, verificador de repositório, QA, DevOps e segurança — todos
isolados no container do grupo e coordenados por um único orquestrador.

> Idioma: a **documentação** (`docs/`, este README) está em **PT-BR**.
> O **conteúdo operacional** (`CLAUDE.md`, sub-agentes, skills, comandos, templates) está
> em **inglês**, por compatibilidade com repositórios, prompts e o ecossistema Claude Code.

---

## O que este grupo entrega

Um grupo de agente NanoClaw cujo orquestrador sabe **delegar** para 7 sub-agentes
especialistas e seguir fluxos de trabalho de engenharia de ponta a ponta:

| Sub-agente | Papel | Domina |
|---|---|---|
| `architect` | Arquiteto de software | Design de sistemas, ADRs, trade-offs, limites de contexto |
| `backend-dev` | Dev backend | TypeScript/Node, APIs, Python, banco de dados |
| `frontend-dev` | Dev frontend | React, Next.js, TypeScript, UI/acessibilidade |
| `repo-auditor` | Verificador de repositório | Auditoria de estrutura, drift, dívida técnica, dependências |
| `qa-reviewer` | QA / Code review | Testes, revisão de PR, cobertura, edge cases |
| `devops-engineer` | DevOps / CI-CD | Docker, pipelines, deploy, observabilidade |
| `security-reviewer` | Segurança (AppSec) | Vulnerabilidades, secrets, supply chain, authz |

Stack-alvo priorizado: **TypeScript/Node**, **React/Next.js**, **Python**.

---

## Estrutura da pasta

```
team-engenharia/
├── README.md                     ← você está aqui (PT-BR)
├── CLAUDE.md                     ← contexto/sistema do orquestrador do grupo (EN)
├── .claude/
│   ├── agents/                   ← definições dos 7 sub-agentes (EN)
│   │   ├── architect.md
│   │   ├── backend-dev.md
│   │   ├── frontend-dev.md
│   │   ├── repo-auditor.md
│   │   ├── qa-reviewer.md
│   │   ├── devops-engineer.md
│   │   └── security-reviewer.md
│   ├── commands/                 ← slash commands do grupo (EN)
│   │   ├── feature.md
│   │   ├── audit-repo.md
│   │   ├── review-pr.md
│   │   ├── arch-decision.md
│   │   └── ship-check.md
│   └── skills/                   ← skills reutilizáveis (EN)
│       ├── repo-audit/SKILL.md
│       ├── code-review/SKILL.md
│       └── adr/SKILL.md
├── memory/
│   ├── MEMORY.md                 ← índice de memória persistente do grupo
│   └── conventions.md            ← convenções de código/PR aprendidas
├── templates/                    ← artefatos prontos (EN)
│   ├── ADR-template.md
│   ├── PR-review-checklist.md
│   └── repo-audit-report.md
└── docs/                         ← documentação densa (PT-BR)
    ├── 00-visao-geral.md
    ├── 01-arquitetura-do-team.md
    ├── 02-papeis-e-responsabilidades.md
    ├── 03-fluxos-de-trabalho.md
    ├── 04-instalacao-no-nanoclaw.md
    ├── 05-stack-e-convencoes.md
    └── 06-seguranca-e-isolamento.md
```

---

## Início rápido

1. Leia `docs/00-visao-geral.md` e `docs/04-instalacao-no-nanoclaw.md`.
2. Copie esta pasta para `groups/team-engenharia/` no seu fork do NanoClaw.
3. Monte (mount) no container do grupo apenas os repositórios que o time pode tocar.
4. No canal do grupo, mande: `@Andy /feature adicionar paginação no endpoint de pedidos`.

Detalhes de cada passo estão em `docs/04-instalacao-no-nanoclaw.md`.

---

## Princípios de design (alinhados ao NanoClaw)

- **Seguro por isolamento.** Tudo roda no container do grupo; o time só enxerga o que você
  montar explicitamente. Nada vaza entre grupos.
- **Customização = código/skills.** Para mudar comportamento, edite os arquivos aqui ou peça
  ao Claude Code. Cada mudança que você quer manter vira uma *skill* (sobrevive a upgrades).
- **Delegação explícita.** O orquestrador não faz tudo sozinho: ele roteia para o sub-agente
  certo, conforme `CLAUDE.md` e `docs/03-fluxos-de-trabalho.md`.
- **Viés para ação, com verificação.** O time executa, mas sempre fecha com um passo de
  verificação (testes, review, auditoria) antes de declarar pronto.
