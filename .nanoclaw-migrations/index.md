# NanoClaw Migration Guide: v1 -> v2

Generated: 2026-04-15
Base (merge-base): 934f063aff5c30e7b49ce58b53b41901d3472a3e
HEAD at generation: 595f8ea
Upstream target: upstream/v2 (db3aa0b)

## Overview

This fork belongs to Jonas (Zoryon founder, Brazil). The assistant is named **Zory** — an executive secretary persona in Portuguese. The fork has 16 upstream skills applied and significant custom integrations (Composio, Parallel AI, Fireflies, Mem, Firecrawl, Todoist, QMD).

Migration target is `upstream/v2`, which is an architectural rewrite. Most v1 skills are replaced by v2 native channel adapters and built-in MCP tools. The migration focuses on reapplying persona, MCP configurations, and custom container skills onto the v2 base.

## Migration Plan

### Order of Operations

1. **Checkout clean v2** in worktree
2. **Copy persona files** (groups/) — user content, architecture-independent
3. **Apply v2 channel skills** — WhatsApp (`add-whatsapp-v2`), Telegram (`add-telegram-v2`) if available as v2 skills
4. **Configure MCP servers** — via `NANOCLAW_MCP_SERVERS` env var (v2 pattern)
5. **Port container skills** — copy custom skills (meta-ads-analyst, ivy-lee-todoist, mem)
6. **Apply remaining v2 skills** — image-vision, voice-transcription, pdf-reader if v2 branches exist
7. **Configure environment** — env vars, model selection
8. **Validate** — build + test
9. **Re-register scheduled tasks** — via agent after first boot (v2 uses `schedule_task` MCP tool)

### Risk Areas

- **Model selection**: v2 has no native per-task model selection (Sonnet vs Haiku). May need custom code in agent-runner provider.
- **Status tracker**: v2 has no emoji reaction status tracking. If desired, needs reimplementation against v2's delivery system.
- **MCP server config**: v2 uses `NANOCLAW_MCP_SERVERS` JSON env var instead of hardcoded configs in agent-runner. All MCP configs move to host-side env.
- **Credential proxy**: v2 uses OneCLI gateway instead of the custom credential-proxy.ts. OneCLI must be configured.

### What v2 Already Handles (no migration needed)

- WhatsApp channel (native Baileys v6 adapter)
- Telegram channel (Chat SDK bridge + pairing)
- Channel formatting (built-in per-channel markdown conversion)
- Session commands (/compact via Claude Agent SDK)
- Scheduled tasks (via `schedule_task` MCP tool)
- Credential management (OneCLI gateway)
- Approval system (OneCLI + admin cards)

## Section Files

- [01-persona.md](01-persona.md) — Zory persona, group configs, daily routines
- [02-mcp-integrations.md](02-mcp-integrations.md) — MCP server configurations
- [03-container-skills.md](03-container-skills.md) — Custom container skills to port
- [04-custom-features.md](04-custom-features.md) — Status tracker, image support, model selection
- [05-environment.md](05-environment.md) — Environment variables and credentials
- [06-scheduled-tasks.md](06-scheduled-tasks.md) — Scheduled task configurations
- [07-ci-workflows.md](07-ci-workflows.md) — CI/CD customizations
- [08-channels.md](08-channels.md) — Gmail and Emacs channel notes

## Applied Skills (v1)

These were applied as branch merges in v1. In v2, most are replaced by native adapters or v2-specific skills:

| v1 Skill | v2 Equivalent | Action |
|----------|--------------|--------|
| `skill/whatsapp` | Native WhatsApp adapter + `add-whatsapp-v2` skill | Use v2 native |
| `skill/gmail` | Not in v2 natively; v2 has `add-resend-v2` for email | Check for v2 Gmail skill; may need Composio Gmail instead |
| `skill/voice-transcription` | Check `upstream/skill/voice-transcription` | Re-merge if compatible |
| `skill/image-vision` | Check `upstream/skill/image-vision` | Re-merge if compatible |
| `skill/pdf-reader` | Check `upstream/skill/pdf-reader` | Re-merge if compatible |
| `skill/reactions` | v2 WhatsApp has native reactions | Use v2 native |
| `skill/telegram` | Native Telegram adapter + `add-telegram-v2` skill | Use v2 native |
| `skill/compact` | Native Claude Agent SDK `/compact` | Use v2 native |
| `skill/native-credential-proxy` | OneCLI gateway | Use v2 native (OneCLI) |
| `skill/channel-formatting` | v2 has built-in formatting | Use v2 native |
| `skill/emacs` | No v2 equivalent yet | Re-merge if compatible; or use v2 webhook server as bridge |
| `skill/apple-container` | Check for v2 equivalent | Re-merge if compatible |
| `skill/ollama-tool` | Check for v2 equivalent | Re-merge if compatible |
| `skill/qmd` | Check for v2 equivalent | Re-merge if compatible |

## Skill Interactions

No inter-skill conflicts were identified. All skills were used as-is from upstream without modifications.

## Modifications to Applied Skills

None. User confirmed all skills were used without post-application changes.
