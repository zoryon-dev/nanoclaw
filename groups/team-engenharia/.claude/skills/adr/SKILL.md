---
name: adr
description: >
  Write an Architecture Decision Record (ADR). Use when making a non-trivial, hard-to-reverse
  technical decision that future maintainers will need the context and reasoning behind.
---

# Skill: Architecture Decision Records (ADR)

Capture significant technical decisions with their context and consequences. Pairs with the
`architect` sub-agent and `templates/ADR-template.md`.

## When to write an ADR

Write one when a decision is **significant and not trivially reversible**: choosing a database,
an API style, a framework, an auth model, a service boundary, a major dependency, or a data
migration strategy. Skip ADRs for routine, easily-reversed choices.

## Procedure

1. **Number it.** Find the highest existing ADR in `docs/adr/` and increment. Filename:
   `NNNN-short-title.md` (e.g. `0007-use-postgres-for-orders.md`).
2. **Status.** Start as `Proposed`; move to `Accepted` once decided. Superseded ADRs link
   forward to the one that replaces them.
3. **Context.** The forces at play: requirements, constraints, non-functionals, assumptions.
   Neutral — no decision yet.
4. **Options.** 2–3 real alternatives with trade-offs and when each wins.
5. **Decision.** What you chose and **why**, tied to the context. State what you give up.
6. **Consequences.** Positive, negative, and follow-up work the decision creates.

Use `templates/ADR-template.md` as the structure.

## Rules

- One decision per ADR. Keep it short — a page is plenty.
- ADRs are immutable once Accepted: don't rewrite history, supersede with a new ADR instead.
- The value is the *reasoning*, not the outcome. Always record what was traded away.
