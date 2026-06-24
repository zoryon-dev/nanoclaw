# Brown — Implementation Plan

Companion to `2026-06-24-brown-link-librarian-design.md`. Execution order, commit per
task, push per cycle. Autonomy: iterate to done or 3 error attempts per blocker.

## Verified infra facts (from research)

- **Secondary Telegram bot:** token lives in `agent_groups.container_config` JSON
  (`telegramBotToken`), read by `registerSecondaryBots()` at host startup → **host
  restart required** to register. channel_type/instance = `telegram-brown`, dmOnly.
- **Jonas's chat id = `8557164566`** for every DM bot → no pairing; pre-fill
  `platform_id = telegram:8557164566`.
- **Authorization:** replicate Caio's footprint — owner role on base `telegram:8557164566`
  canonicalizes across instances; only a `users` row `telegram-brown:8557164566` is added.
  No member/role/user_dms rows (Caio has none and works).
- **Runtime config** = `container_configs` table (materialized → `groups/brown/container.json`
  at spawn). `ncl groups config update` only sets scalars (model, cli-scope, …). Firecrawl
  (HTTP MCP), `skills` list, and `additional_mounts` must be written directly via `q.ts`.
- **Firecrawl** = HTTP MCP, account-embedded URL (reuse Zory's), no secret.
- **Notion** = `container/skills/notion-db` (`notion_db.py` + `schema.brown.json`), `create-db`
  under parent `388481dd-f843-80a1-b09d-ce0d9e67cc3e` ("Base | Pessoal"); auth via OneCLI
  `all` mode (gateway-injected). DB creation runs inside Brown's container.
- **Scope guardrail** enforced two ways: minimal `skills` list (no content tools) + strong
  CLAUDE.local.md persona.

## Tasks

### Cycle 1 — Backend artifacts (git-tracked, no host change yet)
- **T1** ✅ Design spec — committed.
- **T2** `save-link` skill in `container/skills/save-link/` — SKILL.md + deterministic
  helpers (`url_canon.py`, `classify.py`, `gh_meta.py`, `yt_meta.py`). Verify `notion_db.py`
  supports `multi_select`; extend if missing. → commit
- **T3** Create agent group (`ncl groups create`), then configure `container_configs`:
  model `claude-opus-4-8`, cli_scope `group`, minimal `skills`, firecrawl MCP, wiki RO
  mounts; set `agent_groups.container_config.telegramBotToken`. Force-add curated files. → commit
- **T4** `groups/brown/migration/schema.brown.json` — `Links — Biblioteca` schema. → commit
- **T5** `groups/brown/CLAUDE.local.md` — persona + hard scope guardrails. → commit
- **T6** Wiki scaffold `groups/brown/wiki/` (karpathy structure). → commit + **push**

### Cycle 2 — Wiring + Notion DB
- **T7** `messaging_groups` (telegram-brown) + wiring (clone Caio shape) + `users`
  row `telegram-brown:8557164566`. → commit
- **T8** Restart host (`systemctl restart nanoclaw`); verify `telegram-brown` adapter
  registered in logs. → (state, no commit) 
- **T9** Create the Notion DB: `ncl groups restart --id <brown> --message "<bootstrap>"`
  so Brown runs `notion_db.py create-db`; verify DB id written back to schema. → commit
  schema with id + **push**

### Cycle 3 — Verify
- **T10** Backend end-to-end smoke via on-wake task: save a sample link of each type
  (github + generic), confirm Notion rows, dedup, and a query answer. Capture evidence.
- **T11** Update memory with outcome; final commit + **push**. If live Telegram leg can't
  be self-tested (can't impersonate Jonas), document that the only remaining step is Jonas
  sending the first message, and confirm backend is fully functional.

## Self-review (fresh-eyes pass)

- **Placeholders:** none — all ids/paths concrete (`8557164566`, parent page id, firecrawl URL).
- **Risk 1 — owner canonicalization:** assumption that `telegram-brown:<id>` resolves to the
  base owner. Mitigation: exact Caio clone (living proof). If smoke shows Jonas dropped,
  add scoped owner/member role for `telegram-brown:8557164566` (1 row) — bounded fix.
- **Risk 2 — base image deps:** github=curl, youtube=yt-dlp may be absent. curl/python3 are
  needed for the critical path (github+generic+notion); yt-dlp is best-effort (YouTube
  degrades to metadata). Verify in T2/T10; if curl missing use python urllib (no apt rebuild).
- **Risk 3 — notion_db.py multi_select:** if unsupported, Tags can't be multi-select.
  Checked/extended in T2 before relying on it.
- **Risk 4 — can't self-test Telegram leg:** acceptable per owner's fallback clause; backend
  is fully verifiable via on-wake tasks. Document clearly.
- **Scope check:** single agent, single purpose — fits one plan. No decomposition needed.
- **Ambiguity:** "robusto" bounded to the MVP extras (dedup/multi-link/nota) + 3-layer
  knowledge; further extras explicitly deferred in the spec.
