#!/usr/bin/env python3
"""Update properties on an existing Notion page (PATCH). Used to schedule/publish
a carousel row in "Carrosséis — Entregas": set Data de publicação, Status, and the
published post link.

Auth: none here — the OneCLI gateway injects the Notion OAuth bearer for
api.notion.com (same as notion_row.py / notion_delivery.py). We send NO
Authorization header.

Usage:
  notion_update.py --page <page-id> [--data-publicacao YYYY-MM-DD]
                   [--status Rascunho|Entregue|Agendado|Publicado] [--link-post <url>]
Prints OK + the page url on success, or ERRO… on failure.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile

NOTION_VERSION = "2022-06-28"


def main() -> int:
    ap = argparse.ArgumentParser(prog="notion_update", description="PATCH a Notion page's scheduling/status props.")
    ap.add_argument("--page", required=True, help="Notion page id")
    ap.add_argument("--data-publicacao", help="YYYY-MM-DD")
    ap.add_argument("--status", help="Rascunho | Entregue | Agendado | Publicado")
    ap.add_argument("--link-post", help="published post URL")
    a = ap.parse_args()

    props: dict = {}
    if a.data_publicacao:
        props["Data de publicação"] = {"date": {"start": a.data_publicacao}}
    if a.status:
        props["Status"] = {"select": {"name": a.status.strip()}}
    if a.link_post:
        props["Link do post"] = {"url": a.link_post}
    if not props:
        raise SystemExit("Nada pra atualizar (passe --data-publicacao / --status / --link-post).")

    payload = {"properties": props}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
        path = fh.name

    out = subprocess.run(
        ["curl", "-s", "-X", "PATCH", f"https://api.notion.com/v1/pages/{a.page}",
         "-H", f"Notion-Version: {NOTION_VERSION}", "-H", "Content-Type: application/json",
         "--data", f"@{path}"],
        capture_output=True, text=True,
    ).stdout

    try:
        d = json.loads(out)
    except json.JSONDecodeError:
        print(f"ERRO: resposta não-JSON do Notion:\n{out[:400]}", file=sys.stderr)
        return 1
    if d.get("object") == "page":
        print(f"OK {d.get('url', '(sem url)')}")
        return 0
    print(f"ERRO Notion: {d.get('code')} — {d.get('message', '')[:300]}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
