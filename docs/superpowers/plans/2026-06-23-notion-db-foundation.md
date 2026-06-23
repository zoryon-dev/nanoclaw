# notion-db Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable `notion-db` container skill — a schema-driven generic Notion CRUD helper plus a one-time Sheets→Notion backfill loader — that the Finance and Naia agents will use to read/write Notion databases under "Base | Pessoal".

**Architecture:** A single Python CLI (`notion_db.py`, stdlib only) makes gateway-proxied HTTPS calls to `api.notion.com` with **no Authorization header** (the OneCLI gateway injects the Notion OAuth bearer), mirroring the existing native `sheets_api.py`. All Notion-specific shape lives in a per-agent JSON **schema file** that maps logical field → Notion property name + type; the script is a dumb translator driven by that schema. A `--dry-run` flag prints the payload it *would* send, which is the unit under test (matching the existing `read-post` skill test convention). A separate `backfill_sheets.py` reads a sheet via `sheets_api.py` and replays rows through `notion_db.py create-row`.

**Tech Stack:** Python 3 standard library only (`urllib`, `json`, `argparse`). No third-party deps. Tests are pytest-style functions invoking the script as a subprocess with `--dry-run`. Notion API version `2022-06-28`.

## Global Constraints

- **No `Authorization` header anywhere.** The OneCLI gateway injects the Notion bearer; sending an auth header is forbidden. (Same rule as `sheets_api.py` and `notion_row.py`.)
- **Notion API version header on every call:** `Notion-Version: 2022-06-28`.
- **Stdlib only** in container skill scripts — no pip installs. Mirror `container/skills/gsheets/scripts/sheets_api.py` for the network layer (`urllib.request`, honors the container's `HTTPS_PROXY` + `SSL_CERT_FILE` automatically via the default opener/SSL context).
- **Network calls are never unit-tested.** The deterministic payload-building logic is tested via `--dry-run`; live API behavior is covered by documented manual smoke commands only (consistent with existing skills, which do not mock the gateway).
- **No secrets in the schema files.** Database IDs are not secrets; they are committed to the repo and filled at bootstrap.
- Skill path: `container/skills/notion-db/`. Both target agents already mount all skills (`"skills": "all"` in their `container.json`), so no per-group wiring is needed. Inside the container the skill is at `/app/skills/notion-db/`.

---

## File Structure

- `container/skills/notion-db/scripts/notion_db.py` — the generic CRUD + create-db CLI (one responsibility: translate flat input ⇄ Notion API given a schema).
- `container/skills/notion-db/scripts/test_notion_db.py` — pytest dry-run tests for payload building.
- `container/skills/notion-db/scripts/backfill_sheets.py` — one-time Sheets→Notion loader (one responsibility: map sheet rows → create-row calls, throttled, deduped).
- `container/skills/notion-db/scripts/test_backfill_sheets.py` — pytest dry-run tests for row→field mapping.
- `container/skills/notion-db/schema.example.json` — a documented example schema file (the real `schema.finance.json` / `schema.naia.json` are produced by the Finance/Naia plans).
- `container/skills/notion-db/SKILL.md` — usage doc for the agent.

### Schema file contract (used by every task)

```json
{
  "parent_page": "388481dd-f843-80a1-b09d-ce0d9e67cc3e",
  "databases": {
    "<db-key>": {
      "database_id": "",
      "title": "Lançamentos",
      "icon": "💸",
      "properties": {
        "<logical_field>": {
          "notion": "<Notion property name>",
          "type": "title|text|number|date|datetime|select|multi_select|checkbox|relation|created_time|formula",
          "options": ["..."],          // select / multi_select only (optional)
          "relation_db": "<db-key>",    // relation only — key of the target database in this same file
          "expression": "..."           // formula only — Notion formula expression
        }
      }
    }
  }
}
```

Rules the code enforces:
- Exactly one property per database has `type: "title"`.
- `created_time` and `formula` are **read-only**: silently ignored on `create-row`/`update` (a value passed for them is dropped, not written).
- `relation` values are passed by the human-readable title of the target row; the code resolves the title → Notion page id by querying the target database.

---

## Task 1: Payload-building core + `create-row --dry-run`

**Files:**
- Create: `container/skills/notion-db/scripts/notion_db.py`
- Create: `container/skills/notion-db/scripts/test_notion_db.py`
- Create: `container/skills/notion-db/schema.example.json`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `load_schema(path: str) -> dict` — parse the schema JSON.
  - `chunk_rich_text(text: str) -> list[dict]` — split into ≤2000-char runs.
  - `coerce_checkbox(value) -> bool` — accepts `True/False`, `"sim"/"não"`, `"true"/"false"`, `1/0`, `"1"/"0"`.
  - `build_props(db_schema: dict, flat: dict, resolve) -> dict` — flat logical dict → Notion `properties` object. `resolve(name, relation_db_key) -> str` returns a page id (in dry-run a stub `f"REL:{relation_db_key}:{name}"`).
  - CLI: `notion_db.py --schema <path> create-row <db-key> --json '<flat-json>' [--dry-run]`. With `--dry-run`, prints the full create-page payload JSON to stdout and exits 0 without any network call.

- [ ] **Step 1: Write the example schema fixture**

Create `container/skills/notion-db/schema.example.json`:

```json
{
  "parent_page": "00000000-0000-0000-0000-000000000000",
  "databases": {
    "lancamentos": {
      "database_id": "",
      "title": "Lançamentos",
      "icon": "💸",
      "properties": {
        "descricao": {"notion": "Descrição", "type": "title"},
        "id": {"notion": "id", "type": "text"},
        "data": {"notion": "Data", "type": "date"},
        "criado_em": {"notion": "Criado em", "type": "created_time"},
        "tipo": {"notion": "Tipo", "type": "select", "options": ["despesa", "receita"]},
        "valor": {"notion": "Valor", "type": "number"},
        "pago": {"notion": "Pago", "type": "checkbox"},
        "categoria": {"notion": "Categoria", "type": "relation", "relation_db": "categorias"}
      }
    },
    "categorias": {
      "database_id": "",
      "title": "Categorias",
      "icon": "🏷️",
      "properties": {
        "nome": {"notion": "Nome", "type": "title"},
        "codigo_prefixo": {"notion": "Código prefixo", "type": "text"}
      }
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `container/skills/notion-db/scripts/test_notion_db.py`:

```python
import json
import pathlib
import subprocess
import sys

SCRIPT = str(pathlib.Path(__file__).with_name("notion_db.py"))
SCHEMA = str(pathlib.Path(__file__).parents[1] / "schema.example.json")


def _dry_create(db_key, flat):
    out = subprocess.run(
        [sys.executable, SCRIPT, "--schema", SCHEMA, "create-row", db_key,
         "--json", json.dumps(flat), "--dry-run"],
        capture_output=True, text=True,
    )
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_create_row_builds_each_property_type():
    p = _dry_create("lancamentos", {
        "descricao": "Uber", "id": "lan-3c7a8e", "data": "2026-05-11",
        "tipo": "despesa", "valor": 80, "pago": "sim", "categoria": "Transporte",
    })
    props = p["properties"]
    assert p["parent"]["database_id"] == ""  # not yet bootstrapped in the fixture
    assert props["Descrição"]["title"][0]["text"]["content"] == "Uber"
    assert props["id"]["rich_text"][0]["text"]["content"] == "lan-3c7a8e"
    assert props["Data"]["date"]["start"] == "2026-05-11"
    assert props["Tipo"]["select"]["name"] == "despesa"
    assert props["Valor"]["number"] == 80
    assert props["Pago"]["checkbox"] is True
    assert props["Categoria"]["relation"] == [{"id": "REL:categorias:Transporte"}]


def test_create_row_drops_readonly_and_absent():
    p = _dry_create("lancamentos", {
        "descricao": "Salário", "criado_em": "2026-05-11 10:00", "valor": None,
    })
    props = p["properties"]
    assert "Criado em" not in props      # created_time is read-only -> dropped
    assert "Valor" not in props          # None -> omitted
    assert "Tipo" not in props           # absent -> omitted


def test_checkbox_accepts_nao_as_false():
    p = _dry_create("lancamentos", {"descricao": "x", "pago": "não"})
    assert p["properties"]["Pago"]["checkbox"] is False
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd container/skills/notion-db/scripts && python3 -m pytest test_notion_db.py -v`
Expected: FAIL — `notion_db.py` does not exist / no `create-row`.

- [ ] **Step 4: Write the minimal implementation**

Create `container/skills/notion-db/scripts/notion_db.py`:

```python
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
    cr = sub.add_parser("create-row"); cr.add_argument("db_key"); cr.add_argument("--json", required=True, dest="flat")
    args = ap.parse_args()

    schema = load_schema(args.schema)
    if args.cmd == "create-row":
        flat = json.loads(args.flat)
        return cmd_create_row(schema, args.db_key, flat, args.dry_run)
    raise SystemExit(2)


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd container/skills/notion-db/scripts && python3 -m pytest test_notion_db.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add container/skills/notion-db/scripts/notion_db.py \
        container/skills/notion-db/scripts/test_notion_db.py \
        container/skills/notion-db/schema.example.json
git commit -m "feat(notion-db): schema-driven create-row payload builder + dry-run tests"
```

---

## Task 2: `create-db --dry-run` (database bootstrap schema translation)

**Files:**
- Modify: `container/skills/notion-db/scripts/notion_db.py`
- Modify: `container/skills/notion-db/scripts/test_notion_db.py`

**Interfaces:**
- Consumes: `load_schema`, the `schema["databases"]` shape from Task 1.
- Produces:
  - `build_db_properties(db_schema: dict, resolve_db_id) -> dict` — schema property map → Notion *database* property-definitions object. `resolve_db_id(db_key) -> str` returns the related database's id (dry-run stub `f"DBID:{db_key}"`).
  - CLI: `notion_db.py --schema <path> create-db <db-key> [--parent <page-id>] [--dry-run]`. Dry-run prints the `databases.create` payload.

- [ ] **Step 1: Write the failing tests**

Append to `test_notion_db.py`:

```python
def _dry_create_db(db_key):
    out = subprocess.run(
        [sys.executable, SCRIPT, "--schema", SCHEMA, "create-db", db_key, "--dry-run"],
        capture_output=True, text=True,
    )
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_create_db_translates_property_types():
    p = _dry_create_db("lancamentos")
    assert p["parent"] == {"type": "page_id", "page_id": "00000000-0000-0000-0000-000000000000"}
    assert p["title"][0]["text"]["content"] == "Lançamentos"
    assert p["icon"] == {"type": "emoji", "emoji": "💸"}
    props = p["properties"]
    assert props["Descrição"] == {"title": {}}
    assert props["id"] == {"rich_text": {}}
    assert props["Data"] == {"date": {}}
    assert props["Criado em"] == {"created_time": {}}
    assert props["Valor"] == {"number": {"format": "number"}}
    assert props["Pago"] == {"checkbox": {}}
    assert props["Tipo"]["select"]["options"] == [{"name": "despesa"}, {"name": "receita"}]
    assert props["Categoria"]["relation"]["database_id"] == "DBID:categorias"


def test_create_db_requires_exactly_one_title():
    # categorias has exactly one title -> fine
    p = _dry_create_db("categorias")
    titles = [k for k, v in p["properties"].items() if v == {"title": {}}]
    assert titles == ["Nome"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd container/skills/notion-db/scripts && python3 -m pytest test_notion_db.py -k create_db -v`
Expected: FAIL — no `create-db` subcommand.

- [ ] **Step 3: Add the implementation**

In `notion_db.py`, add the builder and a formula case, above `main`:

```python
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
    db["database_id"] = new_id  # write-back happens in Task 3 via _save_schema
    print(new_id)
    return 0
```

Wire it into `main` — add after the `create-row` parser:

```python
    cd = sub.add_parser("create-db"); cd.add_argument("db_key"); cd.add_argument("--parent", default=None)
```

and in the dispatch block, before the final `raise SystemExit(2)`:

```python
    if args.cmd == "create-db":
        return cmd_create_db(schema, args.db_key, args.parent, args.dry_run)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd container/skills/notion-db/scripts && python3 -m pytest test_notion_db.py -v`
Expected: PASS (all tests, incl. create-db).

- [ ] **Step 5: Commit**

```bash
git add container/skills/notion-db/scripts/notion_db.py container/skills/notion-db/scripts/test_notion_db.py
git commit -m "feat(notion-db): create-db schema translation + dry-run tests"
```

---

## Task 3: Network layer + live verbs (create-row POST, query, update, archive, create-db write-back)

**Files:**
- Modify: `container/skills/notion-db/scripts/notion_db.py`
- Modify: `container/skills/notion-db/scripts/test_notion_db.py`

**Interfaces:**
- Consumes: `build_props`, `cmd_create_row`/`cmd_create_db` from Tasks 1–2.
- Produces:
  - `_api(method, url, body=None) -> dict` — gateway-proxied call, no auth header, Notion-Version set, friendly 401/403 message.
  - `auth_hint(code: int, detail: str) -> str | None` — pure function returning the friendly grant/share message for 401/403/restricted, else None. (Unit-tested.)
  - `parse_match(s: str) -> tuple[str, str]` — `"id=lan-3c"` → `("id", "lan-3c")`. (Unit-tested.)
  - `_find_page_id(schema, db_key, field, value) -> str | None` — query by a logical field equality, return the page id.
  - `_live_resolve(schema)` / `_save_schema(path, schema)` — relation resolution by title; write database_id back after create-db.
  - CLI: `query <db-key> [--filter f=v]... [--limit N]`, `update <db-key> --match f=v --json '<flat>'`, `archive <db-key> --match f=v`.

- [ ] **Step 1: Write the failing unit tests for the pure helpers**

Append to `test_notion_db.py`:

```python
import importlib.util

_spec = importlib.util.spec_from_file_location("notion_db", SCRIPT)
notion_db = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(notion_db)


def test_parse_match_splits_on_first_equals():
    assert notion_db.parse_match("id=lan-3c7a8e") == ("id", "lan-3c7a8e")
    assert notion_db.parse_match("nome=A=B") == ("nome", "A=B")


def test_auth_hint_fires_on_401_403_and_restricted():
    assert notion_db.auth_hint(401, "") is not None
    assert notion_db.auth_hint(403, "") is not None
    assert notion_db.auth_hint(404, "object_not_found") is not None  # page not shared
    assert notion_db.auth_hint(400, "validation_error") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd container/skills/notion-db/scripts && python3 -m pytest test_notion_db.py -k "parse_match or auth_hint" -v`
Expected: FAIL — `parse_match` / `auth_hint` not defined.

- [ ] **Step 3: Implement the network layer and helpers**

In `notion_db.py`, replace the two placeholder functions (`_api`, `_live_resolve`) and add the helpers:

```python
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
    return field.strip(), value


def _title_field(db_schema: dict) -> str:
    for key, spec in db_schema["properties"].items():
        if spec["type"] == "title":
            return key
    raise SystemExit("database has no title property")


def _find_page(schema: dict, db_key: str, field: str, value: str) -> dict | None:
    db = schema["databases"][db_key]
    spec = db["properties"][field]
    prop = spec["notion"]
    if spec["type"] == "title":
        flt = {"property": prop, "title": {"equals": value}}
    elif spec["type"] in ("text",):
        flt = {"property": prop, "rich_text": {"equals": value}}
    else:
        flt = {"property": prop, "rich_text": {"equals": value}}
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
    return out


def cmd_query(schema: dict, db_key: str, filters: list[str], limit: int) -> int:
    db = schema["databases"][db_key]
    notion_filter = None
    if filters:
        conds = []
        for f in filters:
            field, value = parse_match(f)
            spec = db["properties"][field]
            kind = "title" if spec["type"] == "title" else "rich_text"
            conds.append({"property": spec["notion"], kind: {"equals": value}})
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
```

Update `cmd_create_db` to persist the new id (replace its post-create lines):

```python
    out = _api("POST", f"{API}/databases", payload)
    new_id = out["id"]
    db["database_id"] = new_id
    _save_schema(_SCHEMA_PATH, schema)
    print(new_id)
    return 0
```

Record the schema path globally in `main` so `_save_schema` can write it back. Replace the schema-load line in `main` with:

```python
    global _SCHEMA_PATH
    _SCHEMA_PATH = args.schema
    schema = load_schema(args.schema)
```

and add `_SCHEMA_PATH = None` as a module-level global near the top constants.

Wire the new verbs into `main` (add parsers after `create-db`):

```python
    q = sub.add_parser("query"); q.add_argument("db_key"); q.add_argument("--filter", action="append", default=[], dest="filters"); q.add_argument("--limit", type=int, default=100)
    up = sub.add_parser("update"); up.add_argument("db_key"); up.add_argument("--match", required=True); up.add_argument("--json", required=True, dest="flat")
    ar = sub.add_parser("archive"); ar.add_argument("db_key"); ar.add_argument("--match", required=True)
```

and dispatch (before the final `raise SystemExit(2)`):

```python
    if args.cmd == "query":
        return cmd_query(schema, args.db_key, args.filters, args.limit)
    if args.cmd == "update":
        return cmd_update(schema, args.db_key, args.match, json.loads(args.flat), args.dry_run)
    if args.cmd == "archive":
        return cmd_archive(schema, args.db_key, args.match)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd container/skills/notion-db/scripts && python3 -m pytest test_notion_db.py -v`
Expected: PASS (all dry-run + unit tests). The network paths are not exercised by tests.

- [ ] **Step 5: Verify `update --dry-run` works end to end**

Run:
```bash
cd container/skills/notion-db/scripts
python3 notion_db.py --schema ../schema.example.json update lancamentos \
  --match id=lan-3c7a8e --json '{"valor": 90}' --dry-run
```
Expected: prints `{"_match": {"id": "lan-3c7a8e"}, "properties": {"Valor": {"number": 90.0}}}`.

- [ ] **Step 6: Commit**

```bash
git add container/skills/notion-db/scripts/notion_db.py container/skills/notion-db/scripts/test_notion_db.py
git commit -m "feat(notion-db): network layer + query/update/archive verbs + create-db id write-back"
```

---

## Task 4: `backfill_sheets.py` — one-time Sheets→Notion loader

**Files:**
- Create: `container/skills/notion-db/scripts/backfill_sheets.py`
- Create: `container/skills/notion-db/scripts/test_backfill_sheets.py`

**Interfaces:**
- Consumes: `sheets_api.py get` output shape (`{"range","values"}` — `values` is a 2-D array, row 0 is headers) and `notion_db.py create-row`.
- Produces:
  - `rows_to_records(values: list[list], colmap: dict) -> list[dict]` — header row + data rows + a `{sheet_header: logical_field}` map → list of flat field dicts (skips empty rows, drops unmapped columns). (Unit-tested.)
  - CLI: `backfill_sheets.py --schema <path> --db-key <k> --sheet-id <id> --range <A1> --colmap <json|@file> [--id-field id] [--sleep 0.4] [--dry-run]`. For each record: dedupe by `--id-field` against Notion (skip if a row with that id already exists), else call `notion_db.py create-row`. `--dry-run` prints the records it would create (newline-delimited JSON) and makes no calls.

- [ ] **Step 1: Write the failing test**

Create `container/skills/notion-db/scripts/test_backfill_sheets.py`:

```python
import importlib.util
import pathlib

SCRIPT = str(pathlib.Path(__file__).with_name("backfill_sheets.py"))
_spec = importlib.util.spec_from_file_location("backfill_sheets", SCRIPT)
backfill = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(backfill)


def test_rows_to_records_maps_headers_and_skips_empty():
    values = [
        ["id", "data", "valor", "ignored_col"],
        ["lan-1", "2026-05-01", "80", "x"],
        [],                       # blank row -> skipped
        ["lan-2", "2026-05-02", "12.5", "y"],
    ]
    colmap = {"id": "id", "data": "data", "valor": "valor"}
    recs = backfill.rows_to_records(values, colmap)
    assert recs == [
        {"id": "lan-1", "data": "2026-05-01", "valor": "80"},
        {"id": "lan-2", "data": "2026-05-02", "valor": "12.5"},
    ]


def test_rows_to_records_handles_short_rows():
    values = [["id", "data", "valor"], ["lan-3", "2026-05-03"]]  # missing valor cell
    recs = backfill.rows_to_records(values, {"id": "id", "data": "data", "valor": "valor"})
    assert recs == [{"id": "lan-3", "data": "2026-05-03"}]  # absent cell omitted
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd container/skills/notion-db/scripts && python3 -m pytest test_backfill_sheets.py -v`
Expected: FAIL — `backfill_sheets.py` does not exist.

- [ ] **Step 3: Implement**

Create `container/skills/notion-db/scripts/backfill_sheets.py`:

```python
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

    raw = args.colmap
    if raw.startswith("@"):
        raw = pathlib.Path(raw[1:]).read_text(encoding="utf-8")
    colmap = json.loads(raw)

    values = _sheets_get(args.sheet_id, args.a1)
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd container/skills/notion-db/scripts && python3 -m pytest test_backfill_sheets.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add container/skills/notion-db/scripts/backfill_sheets.py container/skills/notion-db/scripts/test_backfill_sheets.py
git commit -m "feat(notion-db): one-time Sheets->Notion backfill loader + mapping tests"
```

---

## Task 5: `SKILL.md` — agent-facing documentation

**Files:**
- Create: `container/skills/notion-db/SKILL.md`

**Interfaces:**
- Consumes: the finished CLIs from Tasks 1–4.
- Produces: the skill manifest the container loads.

- [ ] **Step 1: Write the SKILL.md**

Create `container/skills/notion-db/SKILL.md`:

```markdown
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
(default `id`), so re-running is safe.
```

- [ ] **Step 2: Verify the skill files are coherent**

Run:
```bash
cd container/skills/notion-db/scripts
python3 -m pytest -v
python3 notion_db.py --schema ../schema.example.json create-db categorias --dry-run
```
Expected: all tests pass; the create-db dry-run prints a valid Notion database payload.

- [ ] **Step 3: Commit**

```bash
git add container/skills/notion-db/SKILL.md
git commit -m "docs(notion-db): SKILL.md usage for the schema-driven Notion helper"
```

---

## Self-Review notes

- **Spec coverage:** This plan covers the spec's §4.2 foundation (notion_db.py CRUD,
  schema-file contract, backfill_sheets.py, bootstrap via create-db, SKILL.md, access-check
  message). The spec's §4.3 schemas, §5 cutover, and §6–7 risks/rollback are
  intentionally **out of scope** here — they belong to the Finance and Naia plans, which
  depend on this foundation and on resolving the three open items (§8). The per-agent
  `schema.finance.json` / `schema.naia.json` and `colmap.*.json` files are produced there.
- **Placeholder scan:** The two `_api`/`_live_resolve` stubs in Task 1 are explicit,
  intentional placeholders **replaced with real code in Task 3** — they exist so Task 1 is
  independently testable (dry-run never calls them). No `TODO`/`TBD` remain.
- **Type consistency:** `resolve(name, relation_db_key)` signature is identical in
  `build_props` (Task 1) and `_live_resolve` (Task 3). `resolve_db_id(db_key)` matches
  between `build_db_properties` (Task 2) and `cmd_create_db` (Tasks 2→3). `parse_match`
  returns `(field, value)` used uniformly by query/update/archive.
```
