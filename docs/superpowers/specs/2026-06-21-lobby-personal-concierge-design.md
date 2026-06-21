# Lobby Personal Concierge Cluster — Design

**Date:** 2026-06-21
**Status:** Approved (design phase)
**Scope:** Refactor Jonas's personal-life agents into a single-channel concierge cluster.

## Problem

Jonas's personal life is spread across separate agents, each on its own Telegram
DM: training (Lobby), nutrition (Naia), personal+business finance (Finance/Levis),
plus a productivity agent (Lili) that overlaps with the business assistant (Zory).
This means juggling multiple bots and no unified view of "how is my week going."

The naive fix — one mega-agent with every skill and data source mounted together —
collapses unrelated contexts (nutrition + money + training in one prompt) and is hard
to evolve per domain. The naive multi-agent fix — a group chat with all agents — is
noisy and confusing.

## Goal

One channel, one voice. A **concierge** agent fronts a single Telegram DM and
orchestrates a small set of backstage specialists. Jonas talks only to the concierge;
the multi-agent coordination happens off-channel. The concierge synthesizes specialist
output into a single reply and runs proactive personal rituals.

**This cluster is personal-life only.** Business productivity stays with Zory. The
concierge is isolated from the business context base (`/workspace/extra/context`),
mirroring Zory's business-pure posture.

## Decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Topology: concierge + backstage specialists | Single voice, no noisy group chat; specialist chatter stays off-channel |
| 2 | Reuse existing specialist agents, adapt persona | Naia/Finance/Lobby are live data systems (trackers, Hevy, workbook) — recreating loses data |
| 3 | Lobby becomes the concierge; its training role is extracted into a new **Treino** agent | "Lobby" (front desk) name fits the concierge; training is a clean separate domain |
| 4 | Cluster scope = personal only: Treino, Nutrição, Finanças. Productivity/Lili dropped (stays in Zory) | Productivity is business; Jonas wants this cluster purely personal |
| 5 | Finance kept whole (PF **and** PJ) inside the concierge | Jonas is solo — personal/business finance is one continuous picture for him |
| 6 | Concierge owns proactive personal rituals (morning + evening); specialist critical alerts route through the concierge | One synthesized message, never three bots speaking |
| 7 | Direct DMs of Naia/Finance/Treino are retired — single channel only | Coherent with single-voice decision; fewer bots to manage |
| 8 | Concierge does **not** mount the business context base (`/workspace/extra/context`) | Keeps the personal/business boundary clean; symmetric with business-pure Zory |

## Architecture

```
   [Jonas] ─── @lobby_bot (Telegram, single channel) ──> ┌──────────┐
                                                         │  LOBBY   │  concierge / single voice
                                                         └────┬─────┘
          read-only mounts (context)  ◄───────────────────   │  send_message (delegate actions)
                    ┌──────────────────┬────────────────────┼────────────────────┐
                🏋️ TREINO          🥗 NUTRIÇÃO           💰 FINANÇAS         (backstage, no own DM)
                (new, ex-Lobby)    (Naia, reused)        (Finance/Levis, reused)
                Hevy, routines     tracker 7 tabs        workbook PF+PJ
                    └──────────────── report back ──> Lobby synthesizes
```

### Agents after refactor

| Agent | Group id | Folder | Role | Channel |
|-------|----------|--------|------|---------|
| **Lobby** (concierge) | `lobby` (reused) | `groups/lobby` | Classify intent, delegate, synthesize, run rituals | `mg-lobby-dm` (kept) |
| **Treino** | NEW (`ncl groups create`) | `groups/treino` | Training/Hevy specialist | none (backstage) |
| **Naia** (Nutrição) | `ag-1778017244671-myb1ap` (reused) | `groups/naia` | Nutrition specialist | `mg-1778017244671-8gvbcl` (telegram-naia) → **unwired** |
| **Finance** (Levis) | `finance` (reused) | `groups/finance` | Personal+business finance specialist | `mg-finance-dm` (telegram-finance) → **unwired** |

### Destinations (agent-type, bidirectional)

Same pattern the creative swarm already uses (`zory ↔ caio`):

- `lobby ↔ treino`
- `lobby ↔ naia`
- `lobby ↔ finance`

The concierge addresses a specialist via `send_message({ to: "<name>", ... })`; the
specialist's reply arrives as an inbound message `from="<name>"`.

## Data flow

1. **Inbound from Jonas** → Lobby classifies the message:
   - **Single domain** → delegate to that specialist, await the reply, relay it in the
     concierge voice.
   - **Multi-domain** → fan out to the relevant specialists, collect, synthesize one reply.
   - **Personal/general** (chit-chat, planning, "how's my week") → answer directly,
     pulling context from the read-only mounts.
2. **Read-only context mounts:** Lobby mounts each specialist workspace read-only at
   `/workspace/agents/treino`, `/workspace/agents/naia`, `/workspace/agents/finance`.
   For simple *lookups* the concierge reads context directly (no round-trip). It only
   **delegates** when an *action* is required: write to the nutrition tracker, log a
   workout in Hevy, register an expense in the workbook.
3. **Latency:** multi-domain requests incur agent round-trips. Mitigations: read-only
   mounts for lookups, and the concierge sets expectations ("checando com nutrição…")
   when it must delegate a slow action.

## Proactivity

- **Morning ritual (~07:00 BRT)** and **evening close (~21:00 BRT)** — cron jobs on the
  Lobby session (same mechanism Lili used: `scheduled-jobs/` + host-sweep, prompt
  prefixed by an override block for non-interactive start). The concierge queries the
  three specialists and sends **one** synthesized message (today's workout + nutrition
  target/adherence + financial alert).
- **Critical alerts** (Naia: hypoglycemia / post-Mounjaro; Finance: bill due) — the
  specialist calls `send_message` to the concierge, which relays/synthesizes to Jonas.
  Jonas never receives three loose bots.
- **Migration caution:** Naia's existing proactive safety logic must be re-pointed from
  "message Jonas directly" to "message the concierge" without losing any alert.

## Added capabilities (lightweight — infra already present)

| Capability | Status | Work required |
|------------|--------|---------------|
| **Voice input** (Jonas sends audio) | Already global | None. Transcription runs host-side in the router (`src/router.ts:462`, `transcribeVoiceAttachments`), folding `[Voice: <transcript>]` into the message before it reaches any container. Applies to the Lobby channel automatically. |
| **Watch / video** (concierge watches a video) | Skill already mounted (`container/skills/watch`, group has `"skills": "all"`) | Add `ffmpeg` + `yt-dlp` to the concierge container packages; add persona instructions for when/how to use `/watch`. |
| **Wiki** (personal knowledge base) | Skill already mounted (`container/skills/wiki`, `.claude/skills/karpathy-llm-wiki`) | Provision a wiki data directory in the concierge workspace (`groups/lobby/wiki/`); add persona instructions for "add to wiki" / "what do I know about". |

## Concierge container config changes (`groups/lobby/container.json`)

- **Remove** `hevy` MCP server → moves to Treino.
- **Remove** `fireflies` MCP server → business meeting notes belong to Zory, not the
  personal concierge.
- **Remove** the `groups/naia` read-only mount (replaced by the three specialist mounts).
- **Add** read-only mounts: `groups/treino`, `groups/naia`, `groups/finance` →
  `/workspace/agents/{treino,naia,finance}`.
- **Add** packages: `ffmpeg` (apt), `yt-dlp` (apt or npm per existing watch convention
  used by Caio/content-machine) — for `/watch`.
- **Keep** `"skills": "all"`.
- **Do not** mount `/workspace/extra/context` (business base).

## Migration plan (no data loss)

1. **Create Treino agent** (`ncl groups create`, folder `treino`). Copy the training
   files from `groups/lobby/` (Hevy IDs, aluno profile, Mounjaro schedule, routines,
   training history) into `groups/treino/`. Write the Treino persona/system prompt.
   Move the `hevy` MCP server and Hevy-related mounts to Treino's container config.
2. **Rewrite Lobby as concierge:** new `groups/lobby/CLAUDE.local.md` +
   `system-prompt.md` (classify/delegate/synthesize, rituals, personal-only scope).
   Strip the training content (now in Treino).
3. **Wire destinations:** bidirectional `agent` destinations `lobby ↔ {treino, naia,
   finance}`.
4. **Unwire direct DMs:** delete the `messaging_group_agents` rows for `telegram-naia`
   (`mg-1778017244671-8gvbcl`) and `telegram-finance` (`mg-finance-dm`). Bot tokens can
   stay dormant in the vault; we only stop routing.
5. **Adapt specialist personas** (Naia, Finance): change tone from "direct conversation
   with Jonas" to "short report to the concierge"; re-point proactive alerts to the
   concierge.
6. **Register concierge crons** (morning ritual, evening close) on the Lobby session.
7. **Add concierge capabilities:** ffmpeg+yt-dlp packages, `groups/lobby/wiki/` dir,
   persona instructions for watch + wiki.
8. **Rebuild + restart** the affected groups (`ncl groups restart --rebuild` where
   packages changed).

### History handling

The Treino agent starts from migrated **files** (not raw chat history). Lobby's old
training conversation log remains archived in its existing session DB; the concierge
persona takes over going forward. If training continuity matters on day one, the
operator can seed Treino's first message with a short summary.

## Trade-offs accepted

- **Latency** on multi-domain requests (round-trips) — mitigated by read-only mounts +
  expectation-setting.
- **Single point of failure:** if the concierge container is down, the personal channel
  goes quiet (same risk as any single agent).
- **Specialist proactivity rewrite** must be done carefully so no safety alert is lost.
- **Bot sprawl reduced** but the retired bots' tokens remain in the vault (dormant).

## Out of scope

- Productivity/Lili (stays with Zory).
- The business context base mount.
- Changes to the creative swarm (Zory/Caio/Lad/Grow).
- Deleting the retired Telegram bots from the vault (left dormant).

## Open questions

None blocking. The concierge keeps the name "Lobby" (confirmed). A short summary seed
for Treino's first session is optional and operator-driven.
