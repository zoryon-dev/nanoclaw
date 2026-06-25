---
name: code-review
description: >
  Rigorous code review of a diff, PR, or branch. Use to evaluate correctness, edge cases,
  tests, security, and maintainability, and to deliver a clear approve/request-changes verdict
  with classified, evidence-backed findings.
---

# Skill: Code Review

A repeatable review method. Pairs with the `qa-reviewer` sub-agent and
`templates/PR-review-checklist.md`.

## When to use

- Reviewing a PR/diff/branch before merge, or sanity-checking a change you just wrote.

## Procedure

### 1. Get the change
```bash
gh pr diff <number>            # GitHub PR
git diff main...HEAD           # branch vs base
git diff --staged             # staged changes
```
Read the diff AND enough surrounding code to understand intent.

### 2. Review in priority order
1. **Correctness** — does it do what it claims? Logic, async/await, error handling, races.
2. **Edge cases** — null/empty, boundaries, large input, concurrency, dependency failure,
   timezone/locale/encoding.
3. **Tests** — present? exercise the change? cover failure modes? Run them:
   ```bash
   npm test || pnpm test || pytest
   npm run typecheck || tsc --noEmit
   npm run lint || ruff check .
   ```
4. **Security** — input validation, authorization on every protected action, secret exposure,
   injection. Escalate non-trivial findings to `security-reviewer`.
5. **Maintainability** — naming, complexity, duplication, dead code.
6. **Compatibility** — breaking API/schema changes called out and migrated.

### 3. Classify findings
- **Blocker** — must fix before merge (bug, security, data loss, broken contract).
- **Should-fix** — real issue, fix soon.
- **Nit** — style/preference, optional.

### 4. Verdict
**Approve** only with zero blockers and green tests. Otherwise **Request changes**, leading
with blockers. Each finding: `file:line` + why + concrete fix.

## Rules

- Cite the line and propose the fix — never just "this is wrong".
- Don't block on nits. Don't approve on vibes — show what you ran.
