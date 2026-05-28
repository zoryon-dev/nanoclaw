# 17 — Persona / Knowledge Skills + Utilities (2026-05)

Net-new, additive. No upstream conflicts. **Reapply by copying directories/files
as-is** from the main tree. These are agent behavior/knowledge content, not core code.

## Container skills — `container/skills/`

Copy each directory as-is:

| Skill | Purpose |
|-------|---------|
| `analytics-tracking-ga4` | GA4 implementation (gtag, data layer, User ID, conversion + CTA attribution) |
| `analytics-tracking-strategy` | Analytics audit & measurement planning (multi-tool, UTM, GTM, attribution); has `evals/` + `references/` |
| `calendar-defense` | Jonas calendar protection (conflict check, deep-work blocks, overload, family/meal windows); uses Composio googlecalendar |
| `drafting-emails-ptbr` | PT-BR email voice for Jonas (direct, no fluff; shows draft before send) |
| `email-triage` | Gmail inbox triage (respond / can-wait / archive / spam); uses Composio gmail |
| `naia-knowledge` | Brazilian nutrition base (food composition, menu analysis, macros, labels, High Carb plan, recipes); consulted before nutrition Q&A. Includes `apis-nutricionais.md`, `medidas-caseiras.md`, `pratos-restaurante-br.md`, `produtos-brasileiros.md`, `receitas-liti-expandidas.md`, `tabela-taco-essencial.md` |
| `naia-tracker-sheets` | Naia health-tracker sheet schema (scale entries, daily log, Monjaro doses, labs, decisions); for googlesheets writes |
| `persona-exec-assistant` | Jonas daily routine (briefing, meeting prep, weekly digest); composes with email-triage, drafting-emails-ptbr, calendar-defense |
| `personal-productivity` | Time management & focus (overwhelm, balancing responsibilities) |
| `professional-communication` | Tech communication (email structure, etiquette, agendas, tech vs non-tech audiences) |
| `written-communication` | General writing clarity (memos, strategy docs, announcements, persuasion) |

## Operational skill — `.claude/skills/find-skills/SKILL.md`

New (added, not modified). Skill-discovery guidance for "how do I do X" / "find a
skill for X" requests — `npx skills find|add|check|update`, leaderboard
verification, quality criteria. Copy as-is.

## Utility script — `scripts/composio-generate-auth-links.mjs`

Generates Composio OAuth connect URLs per agent + toolkit from an internal MATRIX
map. Copy as-is. Run:
```bash
COMPOSIO_API_KEY=... node scripts/composio-generate-auth-links.mjs
```
The MATRIX maps each agent to its toolkits, e.g. `Finance: ['googlesheets']`,
`Lili: ['todoist', 'googlecalendar']`, `Naia: ['googlesheets','googledrive','tavily']`,
plus the Creative_Lab agents (Zory/Caio/Lad/Grow). Keep this in sync with the
[[project_composio_auth]] matrix when toolkits change.

## Note on agent data (`groups/`)

Per-agent persona/data under `groups/` (Levis/Finance, Lili, Lobby, Naia, the
Creative_Lab swarm, etc.) is **user content, not code** — it is copied from the
main tree during upgrade, never migrated/merged. The skill never touches `groups/`.
