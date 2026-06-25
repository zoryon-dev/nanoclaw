---
description: Pre-ship gate — verify a change is actually ready to merge/release.
argument-hint: <branch/PR or "current changes">
---

Run the pre-ship gate for: **$ARGUMENTS**

This is the final go/no-go. Produce a clear **SHIP** or **DO NOT SHIP** verdict with reasons.

1. **Build & tests** — `devops-engineer` (or directly): type-check, lint, build, and full test
   suite must pass. Capture the output.
2. **Review** — `qa-reviewer` confirms there are no open blockers on the change.
3. **Security** — `security-reviewer` confirms no Critical/High findings outstanding if the
   change touches sensitive surface.
4. **Ops readiness** — `devops-engineer` confirms migrations are reversible, env vars are
   documented, and a rollback path exists.
5. **Verdict** — SHIP only if all gates pass. Otherwise list exactly what blocks the release
   and who/what resolves it. Never rubber-stamp.
