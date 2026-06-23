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

_SCHEMA_PATH = None


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


def _db_prop_def(spec: dict, resolve_db_id) -> dict:
    t = spec["type"]
    if t == "title":
        return {"title": {}}
    if t == "text":
        return {"rich_text": {}}
    if t == "number":
        return {"number": {"format": "number"}}
    if t in ("date", "datetime"):
        return {"date": {}}
    if t == "select":
        opts = [{"name": o} for o in spec.get("options", [])]
        return {"select": {"options": opts}}
    if t == "multi_select":
        opts = [{"name": o} for o in spec.get("options", [])]
        return {"multi_select": {"options": opts}}
    if t == "checkbox":
        return {"checkbox": {}}
    if t == "created_time":
        return {"created_time": {}}
    if t == "formula":
        return {"formula": {"expression": spec["expression"]}}
    if t == "relation":
        return {"relation": {"database_id": resolve_db_id(spec["relation_db"]),
                             "single_property": {}}}
    raise SystemExit(f"unknown property type: {t}")


def build_db_properties(db_schema: dict, resolve_db_id) -> dict:
    fields = db_schema["properties"]
    titles = [k for k, s in fields.items() if s["type"] == "title"]
    if len(titles) != 1:
        raise SystemExit(f"database must have exactly one title property, found {titles}")
    return {s["notion"]: _db_prop_def(s, resolve_db_id) for s in fields.values()}


def _dry_resolve_db_id(db_key: str) -> str:
    return f"DBID:{db_key}"


def cmd_create_db(schema: dict, db_key: str, parent: str | None, dry_run: bool) -> int:
    db = schema["databases"][db_key]
    parent_page = parent or schema["parent_page"]
    resolve_db_id = _dry_resolve_db_id if dry_run else (lambda k: schema["databases"][k]["database_id"])
    payload = {
        "parent": {"type": "page_id", "page_id": parent_page},
        "title": [{"text": {"content": db["title"]}}],
        "icon": {"type": "emoji", "emoji": db["icon"]},
        "properties": build_db_properties(db, resolve_db_id),
    }
    if dry_run:
        json.dump(payload, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    out = _api("POST", f"{API}/databases", payload)
    new_id = out["id"]
    db["database_id"] = new_id
    _save_schema(_SCHEMA_PATH, schema)
    print(new_id)
    return 0


def auth_hint(code: int, detail: str) -> str | None:
    d = (detail or "").lower()
    if code in (401, 403) or "restricted" in d or "unauthorized" in d:
        return ("Notion is not granted to this agent in OneCLI. Ask the user to grant "
                "the `notion` app to this agent, then retry.")
    if code == 404 or "object_not_found" in d:
        return ("Notion returned not-found. The target page/database is likely not shared "
                "with the integration — open 'Base | Pessoal' in Notion, click the ••• menu, "
                "Connections → add the integration, then retry.")
    return None


def _api(method, url, body=None):
    headers = {"User-Agent": "notion-db/1.0 (+nanoclaw)", "Notion-Version": NOTION_VERSION}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=TIMEOUT) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:600]
        except Exception:
            pass
        hint = auth_hint(exc.code, detail)
        if hint:
            raise SystemExit(f"{hint} Detail: HTTP {exc.code} {detail}")
        raise SystemExit(f"Notion API {method} failed: HTTP {exc.code} {detail}")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise SystemExit(f"Notion API call failed (network/proxy): {exc}")
    return json.loads(raw) if raw.strip() else {}


def parse_match(s: str) -> tuple[str, str]:
    if "=" not in s:
        raise SystemExit("--match must be field=value")
    field, value = s.split("=", 1)
    return field.strip(), value.strip()


def _title_field(db_schema: dict) -> str:
    for key, spec in db_schema["properties"].items():
        if spec["type"] == "title":
            return key
    raise SystemExit("database has no title property")


def _match_filter(spec: dict, value: str) -> dict:
    """Build a Notion query filter dict for a given property spec + string value."""
    t = spec["type"]
    prop = spec["notion"]
    if t == "title":
        return {"property": prop, "title": {"equals": value}}
    if t == "text":
        return {"property": prop, "rich_text": {"equals": value}}
    if t == "number":
        return {"property": prop, "number": {"equals": float(value)}}
    if t == "select":
        return {"property": prop, "select": {"equals": value}}
    raise SystemExit(
        f"--match/--filter not supported for property type {t!r} "
        f"(supported: title, text, number, select)"
    )


def _find_page(schema: dict, db_key: str, field: str, value: str) -> dict | None:
    db = schema["databases"][db_key]
    spec = db["properties"][field]
    flt = _match_filter(spec, value)
    out = _api("POST", f"{API}/databases/{db['database_id']}/query",
               {"filter": flt, "page_size": 1})
    results = out.get("results", [])
    return results[0] if results else None


def _live_resolve(schema: dict):
    cache: dict[tuple[str, str], str] = {}

    def resolve(name: str, relation_db_key: str) -> str:
        key = (relation_db_key, name)
        if key in cache:
            return cache[key]
        target = schema["databases"][relation_db_key]
        title_field = _title_field(target)
        page = _find_page(schema, relation_db_key, title_field, name)
        if not page:
            raise SystemExit(f"relation target not found in {relation_db_key!r}: {name!r}")
        cache[key] = page["id"]
        return page["id"]

    return resolve


def _save_schema(path: str, schema: dict) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(schema, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def _flatten_page(db_schema: dict, page: dict) -> dict:
    """Notion page -> flat logical dict (best-effort, for query output)."""
    out = {"_page_id": page["id"]}
    props = page.get("properties", {})
    for key, spec in db_schema["properties"].items():
        v = props.get(spec["notion"])
        if not v:
            continue
        t = spec["type"]
        if t == "title":
            out[key] = "".join(r["plain_text"] for r in v.get("title", []))
        elif t == "text":
            out[key] = "".join(r["plain_text"] for r in v.get("rich_text", []))
        elif t == "number":
            out[key] = v.get("number")
        elif t in ("date", "datetime"):
            out[key] = (v.get("date") or {}).get("start")
        elif t == "select":
            out[key] = (v.get("select") or {}).get("name")
        elif t == "checkbox":
            out[key] = v.get("checkbox")
        elif t == "formula":
            f = v.get("formula", {})
            out[key] = f.get("string") or f.get("number") or f.get("boolean")
        elif t == "multi_select":
            out[key] = [o["name"] for o in v.get("multi_select", [])]
        elif t == "relation":
            out[key] = [r["id"] for r in v.get("relation", [])]
    return out


def cmd_query(schema: dict, db_key: str, filters: list[str], limit: int) -> int:
    db = schema["databases"][db_key]
    notion_filter = None
    if filters:
        conds = []
        for f in filters:
            field, value = parse_match(f)
            spec = db["properties"][field]
            conds.append(_match_filter(spec, value))
        notion_filter = conds[0] if len(conds) == 1 else {"and": conds}
    body = {"page_size": min(limit, 100)}
    if notion_filter:
        body["filter"] = notion_filter
    out = _api("POST", f"{API}/databases/{db['database_id']}/query", body)
    rows = [_flatten_page(db, p) for p in out.get("results", [])]
    json.dump(rows, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_update(schema: dict, db_key: str, match: str, flat: dict, dry_run: bool) -> int:
    db = schema["databases"][db_key]
    field, value = parse_match(match)
    resolve = _dry_resolve if dry_run else _live_resolve(schema)
    props = build_props(db, flat, resolve)
    if dry_run:
        json.dump({"_match": {field: value}, "properties": props}, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    page = _find_page(schema, db_key, field, value)
    if not page:
        raise SystemExit(f"no row in {db_key!r} where {field}={value!r}")
    out = _api("PATCH", f"{API}/pages/{page['id']}", {"properties": props})
    print(out.get("url", "(sem url)"))
    return 0


def cmd_archive(schema: dict, db_key: str, match: str) -> int:
    field, value = parse_match(match)
    page = _find_page(schema, db_key, field, value)
    if not page:
        raise SystemExit(f"no row in {db_key!r} where {field}={value!r}")
    _api("PATCH", f"{API}/pages/{page['id']}", {"archived": True})
    print(f"archived {field}={value}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(prog="notion_db")
    ap.add_argument("--schema", required=True)
    sub = ap.add_subparsers(dest="cmd", required=True)
    cr = sub.add_parser("create-row"); cr.add_argument("db_key"); cr.add_argument("--json", required=True, dest="flat"); cr.add_argument("--dry-run", action="store_true")
    cd = sub.add_parser("create-db"); cd.add_argument("db_key"); cd.add_argument("--parent", default=None); cd.add_argument("--dry-run", action="store_true")
    q = sub.add_parser("query"); q.add_argument("db_key"); q.add_argument("--filter", action="append", default=[], dest="filters"); q.add_argument("--limit", type=int, default=100)
    up = sub.add_parser("update"); up.add_argument("db_key"); up.add_argument("--match", required=True); up.add_argument("--json", required=True, dest="flat"); up.add_argument("--dry-run", action="store_true")
    ar = sub.add_parser("archive"); ar.add_argument("db_key"); ar.add_argument("--match", required=True)
    args = ap.parse_args()

    global _SCHEMA_PATH
    _SCHEMA_PATH = args.schema
    schema = load_schema(args.schema)
    dry_run = getattr(args, "dry_run", False)
    if args.cmd == "create-row":
        flat = json.loads(args.flat)
        return cmd_create_row(schema, args.db_key, flat, dry_run)
    if args.cmd == "create-db":
        return cmd_create_db(schema, args.db_key, args.parent, dry_run)
    if args.cmd == "query":
        return cmd_query(schema, args.db_key, args.filters, args.limit)
    if args.cmd == "update":
        return cmd_update(schema, args.db_key, args.match, json.loads(args.flat), dry_run)
    if args.cmd == "archive":
        return cmd_archive(schema, args.db_key, args.match)
    raise SystemExit(2)


if __name__ == "__main__":
    raise SystemExit(main())
