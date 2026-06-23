---
name: notion-db
description: Read and write Notion databases via the OneCLI gateway using a schema-driven helper. Use whenever an agent must persist structured records (finance ledger, health tracker) to Notion instead of Google Sheets.
---

# notion-db

Generic, schema-driven Notion CRUD. Auth is automatic: the OneCLI gateway injects
the Notion bearer — **never** send an Authorization header and never ask the user
for a token. The agent must have the `notion` app granted and the target page
shared with the integration.

All database shape lives in a per-agent schema file (`schema.<agent>.json` next to
the scripts). You pass a **flat** JSON of `logical_field: value`; the helper builds
the correct Notion payload. Relations are passed by the target row's title.

## Verbs

    SCHEMA=/app/skills/notion-db/schema.finance.json   # or schema.naia.json

    # create a row
    python3 /app/skills/notion-db/scripts/notion_db.py --schema $SCHEMA \
      create-row lancamentos --json '{"descricao":"Uber","id":"lan-3c7a8e","data":"2026-05-11","tipo":"despesa","valor":80,"escopo":"PF","categoria":"Transporte"}'

    # read rows (optionally filtered)
    python3 .../notion_db.py --schema $SCHEMA query lancamentos --filter id=lan-3c7a8e

    # edit a row, found by its logical id
    python3 .../notion_db.py --schema $SCHEMA update lancamentos --match id=lan-3c7a8e --json '{"valor":90}'

    # undo = archive (soft-delete, reversible)
    python3 .../notion_db.py --schema $SCHEMA archive lancamentos --match id=lan-3c7a8e

Add `--dry-run` to any write to print the payload without sending it.

## Bootstrap (one-time, setup only)

Create the databases under the parent page (relation targets first):

    python3 .../notion_db.py --schema $SCHEMA create-db categorias
    python3 .../notion_db.py --schema $SCHEMA create-db lancamentos   # after its relation targets

`create-db` prints the new database id and writes it back into the schema file.

## If a call fails with a not-found / not-granted message

Tell the user (don't retry blindly): either the `notion` app isn't granted to this
agent in OneCLI, or the page "Base | Pessoal" isn't shared with the integration
(open the page → ••• → Connections → add the integration).

## Backfill (one-time migration from Sheets)

    python3 /app/skills/notion-db/scripts/backfill_sheets.py --schema $SCHEMA \
      --db-key lancamentos --sheet-id <SHEET_ID> --range 'Lançamentos-PF!A1:M' \
      --colmap @/app/skills/notion-db/colmap.lancamentos.json

Use `--dry-run` first to preview the records. The loader dedupes by `--id-field`
(default `id`), so re-running is safe. Note: dedup uses EXACT-STRING match on the
`--id-field`, so re-run safety depends on ids being stable and unique; verify by
running the backfill a second time and confirming it reports `created=0` (all
skipped) before trusting full idempotency.
