---
description: Make and document an architecture decision (produces an ADR).
argument-hint: <the decision/problem to resolve>
---

Resolve this architecture decision: **$ARGUMENTS**

Delegate to `architect`.

1. Frame the problem and the forces (requirements, constraints, non-functionals, time horizon).
2. Read the existing system for current architecture and prior ADRs before proposing.
3. Present 2–3 viable options with trade-offs and when each wins.
4. Recommend one, stating explicitly what is being given up. Factor in operability
   (`devops-engineer`) and security (`security-reviewer`) constraints.
5. Write a numbered ADR using `templates/ADR-template.md` and save it (suggest
   `docs/adr/NNNN-title.md` in the target repo).
6. Define the contract/interfaces the implementers need so a `*-dev` agent can build it.
