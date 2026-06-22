#!/usr/bin/env python3
"""Create one row in the "Materiais — Marca" Notion database.

Sibling of notion_row.py / notion_delivery.py. Catalogs a reusable BRAND ASSET
(logo, brand book, design tokens, paleta, doc oficial, template, brand-ref).
The file itself lives in Drive (and optionally R2 for a public URL); this row
is the navigable index entry.

Auth: none here — the container runs under the OneCLI gateway, which injects the
Notion OAuth bearer for api.notion.com. We send NO Authorization header.

Usage:
  notion_asset.py --material "Logo Zoryon white" --marca Zoryon --tipo Logo \
    --drive "https://drive.google.com/..." --formato svg --notas "logo principal"
  (--r2 for a public URL; --dry-run prints the payload and exits without POSTing)
Prints the created page URL on success.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile

NOTION_VERSION = "2022-06-28"
# Target database: "Materiais — Marca" under "Base | Nanoclaw".
DATABASE_ID = "d6e8e3ac-1b93-412d-90d2-6c2c101db87c"
API = "https://api.notion.com/v1/pages"

TEXT_LIMIT = 2000

MARCA = {"zoryon": "Zoryon", "faryon": "Faryon", "geral": "Geral"}
TIPO = {t.lower(): t for t in (
    "Logo", "Brand book", "Design tokens", "Paleta", "Tipografia",
    "Doc oficial", "Template", "Brand-ref", "Outro")}
FORMATO = {f.lower(): f for f in ("SVG", "PNG", "PDF", "CSS", "MD", "JSON", "Outro")}


def _norm(table: dict[str, str], value: str | None) -> str | None:
    if not value:
        return None
    return table.get(value.strip().lower(), value.strip())


def _rt(text: str) -> list[dict]:
    text = text or ""
    return [{"type": "text", "text": {"content": text[i:i + TEXT_LIMIT]}}
            for i in range(0, max(len(text), 1), TEXT_LIMIT)]


def build_payload(args) -> dict:
    props: dict = {
        "Material": {"title": [{"text": {"content": args.material[:2000]}}]},
        "Marca": {"select": {"name": _norm(MARCA, args.marca) or args.marca.strip()}},
    }
    tipo = _norm(TIPO, args.tipo)
    if tipo:
        props["Tipo"] = {"select": {"name": tipo}}
    if args.drive:
        props["Arquivo (Drive)"] = {"url": args.drive}
    if args.r2:
        props["URL pública (R2)"] = {"url": args.r2}
    formato = _norm(FORMATO, args.formato)
    if formato:
        props["Formato"] = {"select": {"name": formato}}
    if args.notas:
        props["Notas"] = {"rich_text": _rt(args.notas)}
    return {"parent": {"database_id": DATABASE_ID}, "properties": props}


def main() -> int:
    ap = argparse.ArgumentParser(prog="notion_asset",
                                 description="Catalog a brand asset in the Materiais Notion DB.")
    ap.add_argument("--material", required=True, help="asset name (row title)")
    ap.add_argument("--marca", required=True, help="Zoryon | Faryon | Geral")
    ap.add_argument("--tipo", required=True,
                    help="Logo|Brand book|Design tokens|Paleta|Tipografia|Doc oficial|Template|Brand-ref|Outro")
    ap.add_argument("--drive", help="canonical Drive link")
    ap.add_argument("--r2", help="public R2 URL (optional)")
    ap.add_argument("--formato", help="SVG|PNG|PDF|CSS|MD|JSON|Outro")
    ap.add_argument("--notas", help="what it is / when to use")
    ap.add_argument("--dry-run", action="store_true",
                    help="print payload JSON and exit (no POST)")
    args = ap.parse_args()

    payload = build_payload(args)
    if args.dry_run:
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                     encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
        payload_path = fh.name

    out = subprocess.run(
        ["curl", "-s", "-X", "POST", API,
         "-H", f"Notion-Version: {NOTION_VERSION}",
         "-H", "Content-Type: application/json",
         "--data", f"@{payload_path}"],
        capture_output=True, text=True,
    ).stdout

    try:
        d = json.loads(out)
    except json.JSONDecodeError:
        print(f"ERRO: resposta não-JSON do Notion:\n{out[:500]}", file=sys.stderr)
        return 1
    if d.get("object") == "page":
        print(d.get("url", "(sem url)"))
        return 0
    print(f"ERRO Notion: {d.get('code')} — {d.get('message', '')[:300]}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
