# Environment Variables & Credentials

## Intent

All API keys, tokens, and configuration for Jonas's NanoClaw instance.

## Required Environment Variables

```bash
# Core auth
CLAUDE_CODE_OAUTH_TOKEN=<anthropic-oauth-token>

# Identity
ASSISTANT_NAME="zory"

# Channels
TELEGRAM_BOT_TOKEN=<telegram-bot-token>

# AI/ML APIs
OPENAI_API_KEY=<openai-key>          # Used for Whisper voice transcription

# MCP Server APIs
PARALLEL_API_KEY=<parallel-ai-key>   # Parallel AI search + task
FIREFLIES_API_KEY=<fireflies-key>    # Meeting transcripts
FIRECRAWL_API_KEY=<firecrawl-key>    # Web scraping/research
MEM_API_KEY=<mem-ai-key>             # Long-term memory (Mem.ai)
TODOIST_API_TOKEN=<todoist-token>     # Task management

# Model selection
NANOCLAW_MODEL=sonnet                # Default model for interactive messages
NANOCLAW_CRON_MODEL=sonnet           # Model for scheduled tasks

# Timezone
TZ=America/Sao_Paulo                 # BRT (UTC-3)
```

## How to Apply

1. Copy the existing `.env` from the v1 tree — it contains all active credentials
2. Check v2's `.env.example` for any new required variables (e.g., `ONECLI_URL`, `NANOCLAW_ADMIN_USER_IDS`)
3. Add any v2-specific variables
4. If v2 uses OneCLI, run `/init-onecli` to migrate credentials to the vault

## Composio OAuth

Composio authentication was set up via `scripts/composio-oauth.mjs`. The OAuth tokens are stored in `data/sessions/whatsapp_main/.claude/.credentials.json`.

Connected toolkits:
- Google Drive (connected)
- Google Sheets (connected)
- Google Calendar (connected)
- Google Docs (connected)
- GitHub (connected)
- Gmail (pending)
- Meta Ads (pending)

**How to apply**: Copy the credentials file from the v1 data directory. If v2 uses a different session data path, update accordingly. The Composio MCP server at `https://connect.composio.dev/mcp` handles auth refresh automatically once initial OAuth is established.

## Credential Proxy vs OneCLI

v1 uses a custom `src/credential-proxy.ts` (HTTP proxy that injects API keys into container requests). v2 uses OneCLI gateway for the same purpose. Do NOT port the credential proxy — use OneCLI instead.
