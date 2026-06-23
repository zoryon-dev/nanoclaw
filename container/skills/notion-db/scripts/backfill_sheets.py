#!/usr/bin/env python3
"""One-time Google Sheets -> Notion backfill. Reads a sheet tab via sheets_api.py
and replays each row through notion_db.py create-row. Throttled (Notion ~3 req/s)
and deduped by a logical id field so re-runs are safe.

Usage:
  backfill_sheets.py --schema <schema.json> --db-key lancamentos \
    --sheet-id <id> --range 'Lançamentos-PF!A1:M' \
    --colmap '{"id":"id","data":"data","valor":"valor", ...}' \
    [--id-field id] [--sleep 0.4] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
SHEETS = str(HERE.parents[1] / "gsheets" / "scripts" / "sheets_api.py")
NOTION = str(HERE / "notion_db.py")


def rows_to_records(values: list[list], colmap: dict) -> list[dict]:
    if not values:
        return []
    headers = values[0]
    records = []
    for row in values[1:]:
        if not any(str(c).strip() for c in row):
            continue
        rec = {}
        for idx, header in enumerate(headers):
            field = colmap.get(header)
            if field is None or idx >= len(row):
                continue
            cell = row[idx]
            if cell is None or str(cell) == "":
                continue
            rec[field] = cell
        if rec:
            records.append(rec)
    return records


def build_colmap(raw: str, values: list[list]) -> dict:
    """Resolve the --colmap argument into a {sheet_header: logical_field} map.

    "identity" builds the map from the sheet's own header row (each header maps
    to a logical field of the same name — schema property keys must match the
    sheet headers verbatim). "@path" reads JSON from a file. Otherwise raw is
    parsed as an inline JSON object.
    """
    if raw == "identity":
        headers = values[0] if values else []
        return {h: h for h in headers if str(h).strip()}
    if raw.startswith("@"):
        raw = pathlib.Path(raw[1:]).read_text(encoding="utf-8")
    return json.loads(raw)


def _sheets_get(sheet_id: str, a1: str) -> list[list]:
    out = subprocess.run([sys.executable, SHEETS, "get", sheet_id, a1],
                         capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(f"sheets_api get failed: {out.stderr}")
    return json.loads(out.stdout).get("values", [])


def _exists(schema_path: str, db_key: str, id_field: str, id_value: str) -> bool:
    out = subprocess.run(
        [sys.executable, NOTION, "--schema", schema_path, "query", db_key,
         "--filter", f"{id_field}={id_value}", "--limit", "1"],
        capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(f"notion_db query failed: {out.stderr}")
    return bool(json.loads(out.stdout))


def _create(schema_path: str, db_key: str, rec: dict) -> None:
    out = subprocess.run(
        [sys.executable, NOTION, "--schema", schema_path, "create-row", db_key,
         "--json", json.dumps(rec, ensure_ascii=False)],
        capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(f"notion_db create-row failed for {rec!r}: {out.stderr}")


def main() -> int:
    ap = argparse.ArgumentParser(prog="backfill_sheets")
    ap.add_argument("--schema", required=True)
    ap.add_argument("--db-key", required=True)
    ap.add_argument("--sheet-id", required=True)
    ap.add_argument("--range", required=True, dest="a1")
    ap.add_argument("--colmap", required=True, help="JSON object or @file")
    ap.add_argument("--id-field", default="id")
    ap.add_argument("--sleep", type=float, default=0.4)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    values = _sheets_get(args.sheet_id, args.a1)
    colmap = build_colmap(args.colmap, values)
    records = rows_to_records(values, colmap)

    if args.dry_run:
        for rec in records:
            sys.stdout.write(json.dumps(rec, ensure_ascii=False) + "\n")
        sys.stderr.write(f"[dry-run] {len(records)} record(s) from {args.a1}\n")
        return 0

    created = skipped = 0
    for rec in records:
        idv = rec.get(args.id_field)
        if idv and _exists(args.schema, args.db_key, args.id_field, str(idv)):
            skipped += 1
            continue
        _create(args.schema, args.db_key, rec)
        created += 1
        time.sleep(args.sleep)
    sys.stderr.write(f"backfill {args.db_key}: created={created} skipped={skipped} total={len(records)}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
