# CI/CD Customizations

## Intent

Custom GitHub Actions workflow for token count badge updates.

## Workflows

### update-tokens.yml

**Purpose**: Automatically updates a token count badge in README after pushes to main.
**Trigger**: Push to main or manual dispatch
**Scope**: Counts tokens in `src/**/*.ts`, `container/**/*.ts`, `container/Dockerfile`, `launchd/com.nanoclaw.plist`, `CLAUDE.md`
**Dependencies**: GitHub App secrets (`APP_ID`, `APP_PRIVATE_KEY`)

**How to apply**: This workflow is specific to the fork's README badge. If desired:
1. Copy `.github/workflows/update-tokens.yml` from v1
2. Update the repo name check (currently checks for `qwibitai/nanoclaw` — change to fork's repo name)
3. Ensure GitHub App secrets are configured in the fork's repo settings

**Priority**: Low — this is cosmetic and can be added later.

## Standard Workflows (from upstream)

These come from upstream and should already be in v2:
- `ci.yml` — format check, type check, tests
- `bump-version.yml` — version bumping
- `label-pr.yml` — PR labeling
