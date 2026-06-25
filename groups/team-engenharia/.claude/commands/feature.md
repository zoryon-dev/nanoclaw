---
description: Implement a feature end-to-end with the engineering team (design → build → review).
argument-hint: <what to build, and in which repo if ambiguous>
---

Deliver this feature end-to-end as the engineering team: **$ARGUMENTS**

Run this workflow, delegating to sub-agents:

1. **Clarify only if blocking.** If the target repo, scope, or acceptance is genuinely
   ambiguous, ask ONE question. Otherwise state your assumptions and proceed.
2. **Design (conditional).** If the change spans modules/services or the structure is unclear,
   consult `architect` for the approach and contract. Skip for small, well-scoped changes.
3. **Implement.** Route to `backend-dev` and/or `frontend-dev` based on the surface. They read
   existing patterns first, write code + tests, and run them green.
4. **Review.** `qa-reviewer` reviews the diff and verifies tests. Address blockers before
   continuing.
5. **Security pass (conditional).** If the change touches auth, input, data, files, network,
   or dependencies, run `security-reviewer`.
6. **Summarize.** Report changed files, what was tested/verified, residual risks, and next
   steps. Do not claim "done" without a passing verification step.
