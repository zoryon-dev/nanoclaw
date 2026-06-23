#!/usr/bin/env python3
"""Schema-driven generic Notion CRUD for NanoClaw agents, via the OneCLI gateway.

Runs inside the agent container. Plain HTTPS to api.notion.com with NO
Authorization header — the OneCLI gateway injects the Notion OAuth bearer (the
agent must have the `notion` app granted and the target page shared with the
integration). Mirrors the native sheets_api.py network pattern.

All Notion shape lives in a per-agent JSON schema file (see schema.example.json):
each logical field maps to a Notion property name + type. This script is a dumb
translator; the schema is the single source of shape.

Verbs (always: --schema <path> first):
  create-row <db-key> --json '<flat>'        create a page (row)
  query      <db-key> [--filter f=v]...      list rows (flat)
  update     <db-key> --match id=<v> --json  patch a row found by logical id
  archive    <db-key> --match id=<v>         soft-delete (archived=true)
  create-db  <db-key> [--parent <page-id>]   create the database from the schema

--dry-run prints the payload that would be sent and makes no network call.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
from urllib.request import Request, urlopen

NOTION_VERSION = "2022-06-28"
API = "https://api.notion.com/v1"
TIMEOUT = 60
TEXT_LIMIT = 2000
READONLY_TYPES = {"created_time", "formula"}
TRUE_WORDS = {"sim", "true", "1", "yes", "y", "verdadeiro"}
FALSE_WORDS = {"não", "nao", "false", "0", "no", "n", "falso", ""}


def load_schema(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def chunk_rich_text(text: str) -> list[dict]:
    text = "" if text is None else str(text)
    return [{"type": "text", "text": {"content": text[i:i + TEXT_LIMIT]}}
            for i in range(0, max(len(text), 1), TEXT_LIMIT)]


def coerce_checkbox(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    s = str(value).strip().lower()
    if s in TRUE_WORDS:
        return True
    if s in FALSE_WORDS:
        return False
    raise SystemExit(f"checkbox value not understood: {value!r}")


def _prop_value(spec: dict, value, resolve) -> dict | None:
    """One logical value -> one Notion property value object (or None to omit)."""
    t = spec["type"]
    if t == "title":
        return {"title": [{"text": {"content": str(value)[:TEXT_LIMIT]}}]}
    if t == "text":
        return {"rich_text": chunk_rich_text(value)}
    if t == "number":
        return {"number": float(value)}
    if t in ("date", "datetime"):
        return {"date": {"start": str(value)}}
    if t == "select":
        return {"select": {"name": str(value)}}
    if t == "multi_select":
        items = value if isinstance(value, list) else str(value).split(",")
        names = [v.strip() for v in items if str(v).strip()]
        return {"multi_select": [{"name": n} for n in names]}
    if t == "checkbox":
        return {"checkbox": coerce_checkbox(value)}
    if t == "relation":
        page_id = resolve(str(value), spec["relation_db"])
        return {"relation": [{"id": page_id}]}
    raise SystemExit(f"unknown property type: {t}")


def build_props(db_schema: dict, flat: dict, resolve) -> dict:
    props: dict = {}
    fields = db_schema["properties"]
    for key, value in flat.items():
        if key not in fields:
            raise SystemExit(f"field {key!r} not in schema for this database")
        spec = fields[key]
        if spec["type"] in READONLY_TYPES:
            continue  # read-only — never written
        if value is None or (isinstance(value, str) and value == ""):
            continue  # omit absent values
        built = _prop_value(spec, value, resolve)
        if built is not None:
            props[spec["notion"]] = built
    return props


def _dry_resolve(name: str, relation_db_key: str) -> str:
    return f"REL:{relation_db_key}:{name}"


def cmd_create_row(schema: dict, db_key: str, flat: dict, dry_run: bool) -> int:
    db = schema["databases"][db_key]
    resolve = _dry_resolve if dry_run else _live_resolve(schema)
    payload = {
        "parent": {"database_id": db["database_id"]},
        "properties": build_props(db, flat, resolve),
    }
    if dry_run:
        json.dump(payload, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    out = _api("POST", f"{API}/pages", payload)
    print(out.get("url", "(sem url)"))
    return 0


# --- network + live resolve + remaining verbs are added in later tasks ---
def _api(method, url, body=None):  # placeholder filled in Task 3
    raise SystemExit("network layer not implemented yet")


def _live_resolve(schema):  # placeholder filled in Task 3
    raise SystemExit("live relation resolve not implemented yet")


def main() -> int:
    ap = argparse.ArgumentParser(prog="notion_db")
    ap.add_argument("--schema", required=True)
    ap.add_argument("--dry-run", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)
    cr = sub.add_parser("create-row"); cr.add_argument("db_key"); cr.add_argument("--json", required=True, dest="flat"); cr.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    schema = load_schema(args.schema)
    dry_run = getattr(args, "dry_run", False)
    if args.cmd == "create-row":
        flat = json.loads(args.flat)
        return cmd_create_row(schema, args.db_key, flat, dry_run)
    raise SystemExit(2)


if __name__ == "__main__":
    raise SystemExit(main())
