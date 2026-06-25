---
description: Run a full repository health audit and produce a prioritized report.
argument-hint: <repo path/name (must be mounted), optional focus area>
---

Audit the repository: **$ARGUMENTS**

Delegate to `repo-auditor`. Produce a prioritized health report.

1. Confirm the repo is mounted/visible. If not, stop and ask the user to mount it.
2. `repo-auditor` works through all dimensions in its checklist (structure, conventions, doc
   drift, dependencies, tests, tech debt, CI hygiene, light security pass), gathering evidence.
3. Run available tooling (`npm outdated`/`npm audit`, `pip list --outdated`/`pip-audit`, lint,
   test, coverage) where the stack allows.
4. Escalate any real security finding to `security-reviewer` for severity rating.
5. Fill `templates/repo-audit-report.md`: per-dimension scores + a top-5 prioritized action
   list (impact × effort).
6. Deliver the report and offer to open issues or start on the top item.
