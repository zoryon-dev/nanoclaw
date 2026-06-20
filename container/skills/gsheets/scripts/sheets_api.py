#!/usr/bin/env python3
"""Google Sheets read/write for the finance agent, via the OneCLI gateway.

Runs inside the agent container. Makes plain HTTPS calls to sheets.googleapis.com
with NO Authorization header — the OneCLI gateway injects the Google Sheets OAuth
token (the agent must have the `google-sheets` app granted). Mirrors the proven
`read-post/upload_drive.py` Drive pattern; replaces the Composio `googlesheets`
toolkit for the finance crons so tool-slug churn can't break them.

Pure stdlib. TLS trusts the gateway CA via the container's SSL_CERT_FILE; the
HTTPS_PROXY env routes the call through the gateway.

Subcommands (spreadsheet_id is always first):
  get    <id> <range>                  → print the values JSON ({"range","values"})
  append <id> <range> <rows-json>      → append rows (USER_ENTERED), print result
  update <id> <range> <rows-json>      → overwrite a range (USER_ENTERED)
  clear  <id> <range>                  → clear a range

<rows-json> is a JSON 2-D array, e.g. '[["2026-06-20","rollover","ok",3,"done"]]'.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
from urllib.parse import quote
from urllib.request import Request, urlopen

BASE = "https://sheets.googleapis.com/v4/spreadsheets"
TIMEOUT = 60


def _api(method: str, url: str, body: dict | None = None) -> dict:
    """One gateway-proxied sheets.googleapis.com call. No auth header — the
    gateway injects the Google token. Raises SystemExit with the real error."""
    headers = {"User-Agent": "finance-sheets/1.0 (+nanoclaw)"}
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
        if exc.code in (401, 403) or "access_restricted" in detail or "PERMISSION_DENIED" in detail:
            raise SystemExit(
                "Google Sheets is not granted to this agent in OneCLI (or the sheet "
                "isn't shared with the connected account). Ask the user to grant the "
                f"google-sheets app to this agent, then retry. Detail: HTTP {exc.code} {detail}"
            )
        raise SystemExit(f"Sheets API {method} failed: HTTP {exc.code} {detail}")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise SystemExit(f"Sheets API call failed (network/proxy): {exc}")
    return json.loads(raw) if raw.strip() else {}


def _rng(spreadsheet_id: str, a1: str) -> str:
    return f"{BASE}/{quote(spreadsheet_id, safe='')}/values/{quote(a1, safe='')}"


def cmd_get(spreadsheet_id: str, a1: str) -> dict:
    return _api("GET", _rng(spreadsheet_id, a1))


def cmd_append(spreadsheet_id: str, a1: str, rows: list) -> dict:
    url = _rng(spreadsheet_id, a1) + ":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"
    return _api("POST", url, body={"values": rows})


def cmd_update(spreadsheet_id: str, a1: str, rows: list) -> dict:
    url = _rng(spreadsheet_id, a1) + "?valueInputOption=USER_ENTERED"
    return _api("PUT", url, body={"range": a1, "majorDimension": "ROWS", "values": rows})


def cmd_clear(spreadsheet_id: str, a1: str) -> dict:
    return _api("POST", _rng(spreadsheet_id, a1) + ":clear")


def main() -> int:
    ap = argparse.ArgumentParser(prog="sheets_api", description="Google Sheets via OneCLI gateway.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("get"); g.add_argument("id"); g.add_argument("range")
    a = sub.add_parser("append"); a.add_argument("id"); a.add_argument("range"); a.add_argument("rows")
    u = sub.add_parser("update"); u.add_argument("id"); u.add_argument("range"); u.add_argument("rows")
    c = sub.add_parser("clear"); c.add_argument("id"); c.add_argument("range")
    args = ap.parse_args()

    if args.cmd == "get":
        out = cmd_get(args.id, args.range)
    elif args.cmd in ("append", "update"):
        try:
            rows = json.loads(args.rows)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"rows must be a JSON 2-D array: {exc}")
        if not isinstance(rows, list) or (rows and not all(isinstance(r, list) for r in rows)):
            raise SystemExit("rows must be a JSON 2-D array, e.g. '[[\"a\",\"b\"]]'")
        out = cmd_append(args.id, args.range, rows) if args.cmd == "append" else cmd_update(args.id, args.range, rows)
    elif args.cmd == "clear":
        out = cmd_clear(args.id, args.range)
    else:  # unreachable (required=True)
        raise SystemExit(2)

    json.dump(out, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
