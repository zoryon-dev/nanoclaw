---
name: gsheets
description: Google Sheets read/write helper for ANY agent, via the OneCLI gateway with NATIVE Google OAuth — never Composio. Use whenever you need to read or write a Google Sheet (any spreadsheet the agent's `google-sheets` app grant can reach). Shared by finance/Levis, Naia, and any swarm agent. The Composio `googlesheets` toolkit is deprecated for Sheets — its slugs change and break callers; this helper hits the stable Google REST API directly.
---

# gsheets — native Google Sheets helper (shared)

Read/write Google Sheets by calling `sheets.googleapis.com` directly through the
OneCLI gateway, which injects the Google OAuth token. **No Composio, no API key in
the container** — the agent just runs the helper and must have the `google-sheets`
app granted in OneCLI. Mirrors the proven `read-post/upload_drive.py` Drive pattern.

## Usage (via Bash)

```bash
PY=/app/skills/gsheets/scripts/sheets_api.py
SHEET=<spreadsheet_id>   # the sheet for YOUR agent (see your agent's own skill/CLAUDE.md)

# READ a range → prints {"range","values":[[...]]}
python3 $PY get    "$SHEET" "Aba!A2:E1000"

# APPEND rows (insert at end) — rows is a JSON 2-D array
python3 $PY append "$SHEET" "Aba!A:E" '[["2026-06-20","x","y"]]'

# UPDATE (overwrite an exact range) — rows is a JSON 2-D array
python3 $PY update "$SHEET" "Aba!A42:M42" '[["..."]]'

# CLEAR a range
python3 $PY clear  "$SHEET" "Aba!A42:M42"
```

`append`/`update` use `valueInputOption=USER_ENTERED` (formulas and dates parse as
in the UI). Lookup/filter is done in memory after a `get` (the data is JSON).

## Composio → helper map (for migrating existing prompts)

| Old (Composio) | Now (helper) |
|---|---|
| `GOOGLESHEETS_VALUES_GET` / `GOOGLESHEETS_BATCH_GET` | `python3 $PY get $SHEET "R"` |
| `GOOGLESHEETS_*_VALUES_APPEND` | `python3 $PY append $SHEET "R" '<json>'` |
| `GOOGLESHEETS_*_UPDATE*` | `python3 $PY update $SHEET "R" '<json>'` |
| `GOOGLESHEETS_CLEAR_VALUES` | `python3 $PY clear $SHEET "R"` |
| `GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW` | `get` the id column, find `row_index` in memory (1-based; header = row 1) |

## Errors
- HTTP 403 / `access_restricted` → the `google-sheets` app isn't granted to this
  agent in OneCLI. Ask the user to grant it; do NOT fall back to Composio.
- HTTP 4xx with detail → bad range or JSON 2-D payload; fix and retry.
- Network/proxy failure → transient; retry, then report if it persists.
