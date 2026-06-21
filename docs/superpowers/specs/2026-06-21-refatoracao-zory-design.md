# Zory refactor — business-pure agent + Instagram flows → Caio

**Date:** 2026-06-21
**Owner:** Jonas
**Status:** Design approved — pending spec review

## Goal

Reshape **Zory** (agent group `ag-1776222866725-qnziz1`, folder `dm-with-jonas`) from a
sprawling "everything agent" into the lean **business-pure agent** described in the `v1/`
package (`v1/zory/CLAUDE.md`, `v1/ZORY.md`): business manager + executive secretary, four
core functions only (Todoist, Gmail, Calendar, LLM Wiki) plus the MIT productivity system.

The Instagram content flows currently living on Zory **must not be deleted** — they move to
**Caio** (agent group `ag-1776256973199-ukacj8`, folder `content-machine`), the swarm's
content/carousel agent.

Execution must be **phased, isolated, and reversible per phase** (operator requirement:
"separado, sem nos perdermos, com rollback seguro").

## Hard constraints

1. **No Instagram flow is deleted.** Everything IG-related is copied/moved to Caio and
   verified working there before Zory's copy is removed.
2. **The LLM Wiki stays on Zory and is untouched.** `wiki/` and the (currently empty)
   `sources/` folder are wiki infrastructure, not IG — they remain.
3. **Rollback is filesystem + DB based, not git.** `groups/` and `data/` are gitignored
   (`.gitignore`: `groups/*`, `data/`), so the live agent state is not in version control.
   Rollback relies on per-phase tar backups + DB row dumps.

## Scope

### In scope (this round = the `v1/` first wave)
- Move IG flows from Zory → Caio.
- Slim Zory's tool stack (hybrid keep/drop, below).
- Rewrite Zory's persona from `v1/zory/CLAUDE.md` (business-pure).
- Adopt the MIT + Eat the Frog productivity system (install `produtividade-jonas` skill,
  retire the Ivy Lee ritual).
- Stand up the shared read-only base `v1/mount/` → `/mnt/context` on Zory.

### Out of scope (later waves — per `v1/README.md`)
- Pessoal and Operações agents.
- Specialist sub-agents (`social-media`, `copy`, `dados`, `proposta`).
- Deep per-client mounts (`ZoryonOS/Clientes/<x>`).
- Git sync automation.

## Decisions (locked with operator)

| Decision | Choice |
|---|---|
| Destination of IG flows | **Caio** (`content-machine`) |
| Transformation style | **Hybrid** — keep working tools, drop the rest, layer v1 persona |
| Productivity system | **Adopt MIT** (install `produtividade-jonas`, retire Ivy Lee, re-point crons) |
| Wiki | **Stays on Zory**, central, untouched |
| Execution strategy | **Phased with per-phase backup** (approach A) |

## IG migration inventory (Zory → Caio)

Narrow and clean — nothing wiki-related is touched.

| Artifact (source: `groups/dm-with-jonas/`) | Action | Destination |
|---|---|---|
| `carrosseis/` (2 archived analyses: charliehills, theromanknox) | move | `groups/content-machine/carrosseis/` |
| `read-post-targets.json` (Drive root + "Referências — Conteúdo" sheet config) | move | `groups/content-machine/read-post-targets.json` |
| `.watch-cookies.txt` (IG/TikTok cookies, 1621 B) | **copy** | `groups/content-machine/.watch-cookies.txt` |
| Composio `instagram` toolkit (16 tools) | enable on Caio | Caio container config |
| `/watch` + `/read-post` usage instructions (from Zory persona) | migrate text | Caio `system-prompt.md` |

Notes:
- `/watch`, `/read-post`, `wiki` are **global container skills** (`container/skills/`),
  already available to every agent including Caio. They are not copied — only the workspace
  artifacts, config, cookies, and the usage instructions move.
- `read-post` reads `/workspace/agent/read-post-targets.json` and
  `/workspace/agent/.watch-cookies.txt` — so both must sit at Caio's workspace root.
- `.watch-cookies.txt` is **copied, not moved**, so Zory can still run `/watch` ad hoc if
  needed. (Switch to a move if the operator wants it exclusive to Caio.)
- Caio needs Google Drive access (gateway/native) for `read-post` archiving — verify in
  Phase 1 before removing Zory's copy.

## Zory tool keep/drop (hybrid)

Current Zory MCP stack (from `groups/dm-with-jonas/container.json`): parallel-search,
parallel-task, fireflies, composio (tool router), firecrawl, mem (mem.ai), todoist, qmd.
Plus native Google helpers (gmail/calendar/docs/drive/sheets) via the `google-native` +
`gsheets` skills and the OneCLI gateway.

| Tool | Decision | Rationale |
|---|---|---|
| Todoist | **keep** | v1 core (task management) |
| Google native (Gmail/Calendar/Docs/Drive/Sheets via gateway) | **keep** | v1 core (email/calendar), already native |
| Wiki (`wiki/` + `wiki` skill + `qmd` MCP) | **keep** | Central, operator-confirmed |
| Fireflies | **keep** | Meetings → tasks is a real business flow |
| Mem.ai (`mem`) | **drop** | Redundant with the LLM Wiki; v1 unifies memory in the wiki |
| Composio `instagram` | **move → Caio** | It is IG |
| Composio `github`, `neon`, `cloudflare` | **drop** | Dev/infra = future Operações agent (out of scope) |
| Composio `metaads`, `google_analytics`, analytics skills | **drop** | v1 Zory delegates analysis; does not execute paid media |
| Composio `short_io`, `tavily` | **drop** | tavily redundant with web-research tool |
| Parallel (search/task) + Firecrawl | **keep Firecrawl only** | Zory needs web research; one tool is enough — drop Parallel |

Everything dropped becomes "out of my lane → route, don't execute" in the persona
(personal → Pessoal agent; dev/infra → Operações agent; paid media/analytics → specialist),
exactly as `v1/zory/CLAUDE.md` §Escopo describes. Until those agents exist, Zory says it's
out of lane and offers to handle as a one-off exception.

## Persona / productivity changes

- Rewrite `groups/dm-with-jonas/CLAUDE.local.md` from `v1/zory/CLAUDE.md`: business-pure
  identity, "atrito útil" (disagree until useful), autonomy = act internally / confirm
  anything external or irreversible, proactivity only at routines + urgent, briefing as a
  short scannable card.
- Productivity: install `produtividade-jonas` skill (ships in `v1/skills/produtividade-jonas/`).
  System = 1 MIT/day + up to 7 TASKS_DIA + NICE_TO_HAVE unlimited + inbox zeroed nightly,
  Todoist as the single source. **Retire** the Ivy Lee ritual (6-task system) and its
  embedded instructions.
- **Crons:** re-point the existing scheduled triggers (18h Organizze reminder, weekly
  review, and the v1 08h/17h routines) to the MIT ritual content. Audit live scheduled
  tasks first; rewrite the ritual body, keep the schedule slots.
- Remove the Mem.ai (`mem-cli`) memory instructions from the persona (tool dropped).
- Keep the swarm handoff block (delegation to Caio/Lad) — but Zory now delegates **all**
  Instagram/content to Caio (it no longer holds any IG archiving itself).

## Shared mount `/mnt/context`

- Copy `v1/mount/` to a host path (e.g. `/srv/nanoclaw-context/context/`).
- Wire it read-only into Zory at `/mnt/context` via `/manage-mounts`.
- Contents: `about-me.md`, `voice.md`, `rules.md`, `projetos/` (INDICE + 6 profiles).
- This is a **new** shared base — no `/mnt/context` exists today on any group.
- Zory's persona references it at session start ("read `/mnt/context` first; act from it,
  don't repeat it").

## Phased execution plan

Each phase is independently testable and reversible. Each ends with a commit (for any
version-controlled change) + a note appended to this spec's changelog.

### Phase 0 — Backup
- Create `data/backups/refator-zory-<timestamp>/`.
- `tar` of `groups/dm-with-jonas/` and `groups/content-machine/`.
- DB row dump (CSV/SQL) of the affected rows in `agent_groups`, `container_configs`,
  `messaging_group_agents` for both groups.
- Record the current `git rev-parse HEAD`.

### Phase 1 — IG → Caio
- Copy `carrosseis/`, `read-post-targets.json`, `.watch-cookies.txt` into Caio's workspace.
- Enable Composio `instagram` on Caio's container config; verify Drive access for read-post.
- Add `/watch` + `/read-post` usage instructions to Caio's `system-prompt.md`.
- **Verify on Caio** (run a `/read-post` dry check against the configured sheet/Drive)
  before removing anything from Zory.
- Then remove the moved artifacts from Zory (cookies are copied, not removed).

### Phase 2 — Slim Zory's tools
- Edit Zory's container config: drop `mem`, `parallel-search`, `parallel-task`; remove the
  dropped Composio toolkits from persona usage; keep todoist, fireflies, firecrawl, qmd,
  composio (instagram removed), native Google.
- Restart Zory's container, confirm the kept tools still resolve.

### Phase 3 — Persona + productivity
- Rewrite `CLAUDE.local.md` from `v1/zory/CLAUDE.md`.
- Install `produtividade-jonas` skill.
- Retire Ivy Lee instructions; re-point crons to MIT ritual.
- Restart, smoke-test (capture a task, run the nightly ritual in proposal mode).

### Phase 4 — Mount `/mnt/context`
- Place `v1/mount/` on host; wire `/mnt/context` read-only via `/manage-mounts`.
- Restart Zory; confirm it reads `about-me.md` / `projetos/` at session start.

### Phase 5 — Validate & close
- End-to-end: ask Zory a project question (pulls from `/mnt/context`), capture a task, run
  the MIT nightly ritual, trigger a Caio handoff; confirm Caio runs `/read-post`.
- Final commit + changelog note. Backups retained until operator signs off.

## Rollback procedure

Per phase: restore the Phase 0 tar for the affected group directory, restore the dumped DB
rows for that group, restart the container. Because phases are isolated, a single phase can
be reverted without unwinding the others. Full revert = restore both tars + all dumped rows
+ `git checkout` the recorded HEAD for version-controlled files.

## Validation checklist

- [ ] Caio runs `/read-post` against the "Referências — Conteúdo" sheet + Drive root.
- [ ] Caio runs `/watch` with the migrated cookies.
- [ ] `carrosseis/` archive present and readable on Caio.
- [ ] Zory's kept tools (Todoist, Google native, Fireflies, Firecrawl, wiki/qmd) all resolve.
- [ ] Zory's dropped tools no longer referenced in persona.
- [ ] `produtividade-jonas` installed; MIT ritual runs in proposal mode; Ivy Lee gone.
- [ ] Crons fire on the MIT ritual content at the expected BRT times.
- [ ] Zory reads `/mnt/context` at session start.
- [ ] LLM Wiki (`wiki/`) intact and unchanged throughout.

## Changelog
- 2026-06-21: design approved; spec written.
- 2026-06-21: Phase 1 done — IG flows live on Caio (native OAuth verified 200 Sheets+Drive), removed from Zory; cookies+wiki intact.
- 2026-06-21: Phase 2 done — dropped mem/parallel-search/parallel-task from Zory DB config; kept fireflies/composio/firecrawl/todoist/qmd. container.json overwrites from DB at next spawn (verified container-config.ts:51,86).
