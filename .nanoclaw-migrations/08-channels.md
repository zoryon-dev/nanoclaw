# Channel-Specific Notes

## Gmail Channel

### Intent

Gmail is used as both an input channel (emails trigger the agent) and an output channel (agent sends reports, detailed weekly updates). Weekly Monday reports (Anthropic Updates, NanoClaw Updates, Top 3 AI Market) are delivered via email.

### v1 Implementation

`src/channels/gmail.ts` (~364 lines) — full Gmail channel using Google API with OAuth2. Credentials stored in `~/.gmail-mcp/`.

### v2 Status

v2 has `add-resend-v2` skill for email via Resend (transactional email service), but no native Gmail adapter. However, Jonas already has Gmail access via Composio MCP (Google Workspace integration).

### How to Apply in v2

**Option A (Recommended)**: Use Composio MCP for Gmail. The agent already has Google Workspace access via Composio. For receiving emails, configure Composio Gmail toolkit (currently "pending" status — needs OAuth connection). This avoids a separate Gmail channel implementation.

**Option B**: If full Gmail channel is needed (polling inbox for triggers), check if `upstream/skill/gmail` is v2-compatible and merge. If not, port `src/channels/gmail.ts` to v2's channel adapter interface.

**Option C**: Use `add-resend-v2` for outbound email only. Simpler but requires a Resend API key and doesn't support inbox polling.

## Emacs Channel

### Intent

Emacs integration via local HTTP bridge. Allows chatting with NanoClaw from within Emacs (Doom, Spacemacs, or vanilla). Includes org-mode integration.

### v1 Implementation

`src/channels/emacs.ts` (~249 lines) — HTTP server on localhost:8888 with JSON protocol. Plus `emacs/nanoclaw.el` Elisp package.

### v2 Status

No v2 Emacs adapter. v2 has a webhook server (`src/webhook-server.ts`) that could serve as a bridge.

### How to Apply in v2

1. Check if `upstream/skill/emacs` branch is compatible with v2
2. If not, the Emacs channel could be reimplemented as a v2 channel adapter using the webhook server pattern
3. The `emacs/nanoclaw.el` Elisp file is client-side and can be copied as-is
4. **Priority**: Low — Emacs channel is supplementary; WhatsApp and Telegram are primary

## docs/SETUP-JONAS.md

Personal setup documentation (8.8 KB). Copy to v2 as reference. Update any paths or procedures that changed in v2.
