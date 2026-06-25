---
description: Review a PR / diff / branch as the QA + security gate.
argument-hint: <PR number, branch name, or "the staged diff">
---

Review this change: **$ARGUMENTS**

1. Obtain the diff (`git diff`, `gh pr diff`, or the staged changes). If you can't access it,
   ask the user for the branch/PR or to stage the change.
2. `qa-reviewer` runs the full review using `templates/PR-review-checklist.md`: correctness,
   edge cases, tests (run them), maintainability, backward compatibility. Findings classified
   **Blocker / Should-fix / Nit**.
3. If the change touches auth, input, data, crypto, files, network, or dependencies,
   `security-reviewer` does a security pass with severity ratings.
4. Deliver a single verdict — **Approve** or **Request changes** — leading with blockers/
   criticals, each with a file:line reference and a concrete fix. Show what was run to verify.
