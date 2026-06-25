# 00 — Visão geral

## O que é este agent group

`team-engenharia` é um **grupo de agente NanoClaw** que transforma o seu assistente em um
**time de engenharia de software**. Em vez de um único agente generalista, você tem um
**orquestrador** (tech lead) que recebe cada pedido, decide quem deve executar e delega para
**sub-agentes especialistas**, sempre fechando com uma etapa de verificação.

Isso segue a filosofia do NanoClaw: o grupo roda isolado no próprio container, só enxerga o
que você montar, e toda customização é código/skills — não há "configuração mágica" escondida.

## Por que um time, e não um agente só

Um agente generalista tende a misturar preocupações: escreve código, "revisa" o próprio
código, e declara pronto. Um time separa responsabilidades e cria **gates de qualidade**:

- quem **decide** a arquitetura não é quem **implementa**;
- quem **implementa** não é o único que **revisa**;
- mudanças sensíveis passam por **segurança** antes de ir para produção;
- o estado dos repositórios é **auditado** periodicamente, não só quando quebra.

O resultado é mais previsível e auditável — você vê qual papel produziu o quê.

## Os 7 papéis

| Sub-agente | Em uma frase |
|---|---|
| `architect` | Decide a estrutura e escreve o ADR; não implementa. |
| `backend-dev` | Implementa server-side em TS/Node e Python, com testes. |
| `frontend-dev` | Implementa UI em React/Next/TS, acessível e testada. |
| `repo-auditor` | Audita a saúde do repositório (read-only) e prioriza. |
| `qa-reviewer` | Revisa diffs/PRs e escreve testes — é o gate de qualidade. |
| `devops-engineer` | CI/CD, Docker, deploy, observabilidade. |
| `security-reviewer` | Caça vulnerabilidades, secrets e problemas de authz. |

Detalhes em [`02-papeis-e-responsabilidades.md`](02-papeis-e-responsabilidades.md).

## O que o time domina (stack)

Prioridade definida com você: **TypeScript/Node**, **React/Next.js**, **Python**. Os defaults
de cada stack estão em [`05-stack-e-convencoes.md`](05-stack-e-convencoes.md) e em
`memory/conventions.md`. Regra de ouro: **a convenção do repositório-alvo sempre vence** os
defaults do time.

## Como você usa no dia a dia

Pelos slash commands do grupo (no canal do NanoClaw):

- `/feature <descrição>` — entrega uma feature de ponta a ponta (design → build → review → segurança).
- `/audit-repo <repo>` — auditoria completa de saúde do repositório.
- `/review-pr <PR/branch>` — revisão de PR como gate de QA + segurança.
- `/arch-decision <problema>` — decisão de arquitetura documentada (gera ADR).
- `/ship-check <branch>` — gate final de "pode ir para produção?".

Ou em linguagem natural — o orquestrador roteia para o papel certo.

## Próximos documentos

- [`01-arquitetura-do-team.md`](01-arquitetura-do-team.md) — como a orquestração funciona.
- [`03-fluxos-de-trabalho.md`](03-fluxos-de-trabalho.md) — os fluxos passo a passo.
- [`04-instalacao-no-nanoclaw.md`](04-instalacao-no-nanoclaw.md) — como plugar no seu fork.
- [`06-seguranca-e-isolamento.md`](06-seguranca-e-isolamento.md) — limites e segurança.
