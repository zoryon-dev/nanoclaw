# 01 — Arquitetura do team

## Onde isto roda

No NanoClaw v2, cada **agent group** roda em um container isolado, com seu próprio
`CLAUDE.md`, memória, skills e mounts. O fluxo de mensagens do NanoClaw é:

```
app de mensagem → host (router) → inbound.db → container (Claude Agent SDK) → outbound.db → host (delivery) → app de mensagem
```

Este pacote é o conteúdo da pasta do grupo (`groups/team-engenharia/`). Tudo o que descrevemos
aqui acontece **dentro do container do grupo** — o orquestrador e os sub-agentes não saem dele
e só veem os repositórios que você montar.

## Orquestrador + sub-agentes

O `CLAUDE.md` na raiz é o **orquestrador** (tech lead). Ele não tenta fazer tudo sozinho: lê o
pedido, classifica a intenção e delega para o sub-agente certo definido em `.claude/agents/`.

```
                         ┌─────────────────────────┐
   pedido do usuário ──▶ │  Orquestrador (CLAUDE.md)│
                         │  triagem + delegação     │
                         └────────────┬─────────────┘
              ┌───────────────┬───────┼────────┬───────────────┬──────────────┐
              ▼               ▼       ▼        ▼               ▼              ▼
        architect      backend-dev frontend  repo-auditor  qa-reviewer  devops / security
        (decide)       (implementa) (UI)     (audita)      (gate QA)    (infra / AppSec)
```

Cada sub-agente é um arquivo Markdown com *frontmatter* (`name`, `description`, `tools`,
`model`) e um corpo que define seu papel, procedimento e limites. O orquestrador invoca o
sub-agente pelo `name`; a `description` é o que o orquestrador usa para decidir quando chamá-lo.

## Modelo por papel

Os papéis de **julgamento** (`architect`, `security-reviewer`) usam um modelo mais forte
(`opus`). Os papéis de **execução** (`backend-dev`, `frontend-dev`, `qa-reviewer`,
`devops-engineer`, `repo-auditor`) usam `sonnet`. Ajuste no frontmatter de cada agente se sua
conta/fork preferir outra distribuição — provider e modelo são configuráveis por grupo no
NanoClaw.

## Ferramentas por papel (princípio do menor privilégio)

Cada agente recebe só as ferramentas de que precisa:

- `architect`, `repo-auditor`, `security-reviewer` → **read-only** sobre código
  (`Read/Grep/Glob/Bash` para inspeção + web), **sem** `Edit`. Eles avaliam e propõem; não alteram.
- `backend-dev`, `frontend-dev`, `qa-reviewer`, `devops-engineer` → têm `Edit/Write/Bash` para
  implementar e rodar testes.

Isso reflete o desenho do time: separar quem decide/audita de quem altera.

## Skills e commands

- `.claude/skills/` — métodos reutilizáveis (`repo-audit`, `code-review`, `adr`) que qualquer
  papel pode aplicar.
- `.claude/commands/` — atalhos (`/feature`, `/audit-repo`, …) que disparam um fluxo inteiro.
- `templates/` — artefatos prontos (ADR, checklist de PR, relatório de auditoria).

## Memória

`memory/` guarda o conhecimento durável do time (convenções, quirks por repo, ADRs, achados
recorrentes). O índice é `memory/MEMORY.md`. Veja
[`06-seguranca-e-isolamento.md`](06-seguranca-e-isolamento.md) para o que **nunca** vai pra memória.

## Por que esta divisão importa

Mantém o orquestrador enxuto e o comportamento previsível: o `CLAUDE.md` decide *para quem*
mandar, e cada agente carrega seu próprio contexto profundo só quando acionado. Isso evita um
prompt-monstro único e deixa cada papel afinável de forma independente.
