# 03 — Fluxos de trabalho

Os fluxos que o time executa. Cada um tem um slash command correspondente em `.claude/commands/`.

## 1. Nova feature — `/feature`

```
/feature adicionar paginação no endpoint de pedidos
```

1. **Triagem.** O orquestrador só pergunta se o repo/escopo for ambíguo; senão assume e segue.
2. **Design (condicional).** Se cruza módulos ou a estrutura é incerta → `architect` define a
   abordagem e o contrato. Mudança pequena pula esta etapa.
3. **Implementação.** `backend-dev` e/ou `frontend-dev` leem os padrões existentes, escrevem
   código + testes e rodam até verde.
4. **Review.** `qa-reviewer` revisa o diff e roda os testes. Blockers são resolvidos.
5. **Segurança (condicional).** Tocou auth/input/dado/rede/deps → `security-reviewer`.
6. **Resumo.** Arquivos alterados, o que foi verificado, riscos residuais, próximos passos.

## 2. Auditoria de repositório — `/audit-repo`

```
/audit-repo api-pedidos
```

1. Confirma que o repo está montado (senão, pede para montar).
2. `repo-auditor` percorre as 8 dimensões, coletando evidência e rodando tooling
   (`npm outdated`/`audit`, `pip-audit`, lint, testes, coverage).
3. Achados de segurança reais sobem para `security-reviewer` classificar severidade.
4. Preenche `templates/repo-audit-report.md`: scores + top-5 priorizado.
5. Entrega o relatório e oferece abrir issues ou já atacar o item nº 1.

## 3. Revisão de PR — `/review-pr`

```
/review-pr 142
```

1. Obtém o diff (`gh pr diff`, `git diff`, ou staged).
2. `qa-reviewer` aplica o checklist (`templates/PR-review-checklist.md`), roda os testes e
   classifica achados em Blocker/Should-fix/Nit.
3. Tocou superfície sensível → `security-reviewer` faz a passada de segurança.
4. Veredito único: **Approve** ou **Request changes**, liderando por blockers/críticos, cada um
   com `arquivo:linha` e correção concreta.

## 4. Decisão de arquitetura — `/arch-decision`

```
/arch-decision escolher entre fila SQS e tabela de outbox para eventos de pedido
```

1. `architect` enquadra problema e forças, lê o sistema e ADRs anteriores.
2. Apresenta 2–3 opções com trade-offs.
3. Recomenda uma, dizendo o que abre mão; considera ops e segurança.
4. Escreve ADR numerado (`templates/ADR-template.md`) e o contrato para implementação.

## 5. Gate de produção — `/ship-check`

```
/ship-check release/1.4.0
```

1. **Build & testes** — type-check, lint, build, suíte completa devem passar.
2. **Review** — `qa-reviewer` confirma zero blockers abertos.
3. **Segurança** — `security-reviewer` confirma nenhum Critical/High pendente (se sensível).
4. **Prontidão de ops** — migrações reversíveis, env vars documentadas, rollback existe.
5. **Veredito** — **SHIP** só se todos os gates passam; senão, lista exatamente o que bloqueia.

## Composição livre

Você não precisa usar só os commands. Em linguagem natural, o orquestrador compõe os papéis —
ex.: "investigue por que o build do `web` está lento e proponha uma correção" pode acionar
`repo-auditor` (diagnóstico) → `devops-engineer` (otimização) → `qa-reviewer` (validação).
