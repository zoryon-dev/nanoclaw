# PR Review — <PR title / branch>

- **Reviewer:** qa-reviewer
- **Date:** YYYY-MM-DD
- **Change scope:** <files / area>
- **Verified by running:** <commands + result, e.g. `pnpm test` ✓ 142 passed, `tsc --noEmit` ✓>

## Verdict

**APPROVE** | **REQUEST CHANGES**

> One-line summary of the verdict.

## Findings

> Lead with blockers. Each finding: `path:line` — issue — concrete fix.

### Blockers (must fix before merge)
- [ ] `path:line` — <issue> → <fix>

### Should-fix (real issues, address soon)
- [ ] `path:line` — <issue> → <fix>

### Nits (optional)
- [ ] `path:line` — <issue>

## Checklist

- [ ] **Correctness** — does what it claims; no logic/async/error-handling bugs
- [ ] **Edge cases** — null/empty, boundaries, large input, concurrency, dependency failure
- [ ] **Tests** — exist, exercise the change, cover failure modes, and pass
- [ ] **Security** — input validation, authz on every protected action, no secret exposure
- [ ] **Maintainability** — naming, complexity, duplication, dead code
- [ ] **Compatibility** — breaking API/schema changes called out and migrated
- [ ] **Docs** — README/comments updated if behavior or setup changed

## Notes / not inspected

<Anything you could not verify and why.>
