---
name: repo-audit
description: >
  Systematic repository health audit. Use when assessing the overall state of a codebase:
  structure, conventions, documentation drift, dependency risk, test coverage, technical
  debt, and CI hygiene. Produces an evidence-backed, prioritized report.
---

# Skill: Repository Audit

A repeatable method for auditing a repo and producing a prioritized health report. Pairs with
the `repo-auditor` sub-agent and `templates/repo-audit-report.md`.

## When to use

- "Audit this repo", "health check", "what's the state of X", onboarding to an unfamiliar
  codebase, or periodic hygiene reviews.

## Procedure

### 1. Map the repo
- List top-level layout; read key config (`package.json`, `tsconfig.json`, `pyproject.toml`,
  lockfiles, CI workflows, Dockerfile, README).
- Identify stack, entry points, and intended purpose.

### 2. Gather evidence per dimension
Run, don't guess. Useful commands (adapt to stack):

```bash
# Size & shape
git ls-files | wc -l
git ls-files | sed 's/.*\.//' | sort | uniq -c | sort -rn | head    # file types
find . -name '*.ts' -o -name '*.py' | xargs wc -l 2>/dev/null | sort -rn | head  # biggest files

# Debt signals
grep -rn "TODO\|FIXME\|HACK\|XXX" --include='*.ts' --include='*.py' . | wc -l

# Dependencies (Node)
npm outdated || true
npm audit --omit=dev || true

# Dependencies (Python)
pip list --outdated || true
pip-audit || true

# History / staleness
git log -1 --format='%ci' -- README.md          # last README touch
git log --since='6 months ago' --oneline | wc -l # recent activity
```

### 3. Score each dimension
For each of: structure, conventions, doc drift, dependencies, tests, tech debt, CI hygiene,
security surface → assign **Good / Needs work / At risk** with a one-line, evidence-backed
justification.

### 4. Prioritize
Build a top-N action list ranked by impact × (1/effort). Lead with the highest-leverage fixes.

### 5. Report
Fill `templates/repo-audit-report.md`. Always state what you could not inspect.

## Rules

- Every finding cites a path, line, or command output. No unsupported claims.
- Separate real risk from style preference.
- A short, acted-on list beats an exhaustive, ignored one — surface the top 5 first.
