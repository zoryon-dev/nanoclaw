#!/usr/bin/env python3
"""Log ONE carousel the agent CREATED into the Notion database
"Carrosséis — Entregas".

Sibling of notion_row.py — but the opposite direction: notion_row.py archives
posts found ELSEWHERE (references/inspiration) into "Referências — Conteúdo";
this one records a carousel the agent PRODUCED (a delivery from the BrandsDecoded
Etapa 5.5 export), into a separate "creations" index. Media lives in the Drive
folder "Carrosséis — Entregas"; this DB is the browsable index + publish status.

Auth: none here. The container runs under the OneCLI gateway, which injects the
Notion OAuth bearer for api.notion.com. We send NO Authorization header.

The agent gathers the fields (from the carousel it just exported) and calls this
script; the script builds the Notion API payload deterministically and POSTs it —
so the model never hand-writes JSON.

Usage:
  notion_delivery.py \
    --carrossel "IA sem diagnóstico automatiza o erro" \
    --marca Zoryon --data 2026-06-21 --slides 9 \
    --drive "https://drive.google.com/..." \
    --status Entregue --legenda-file legenda.txt \
    [--body-file slides.txt]
Prints the created page URL on success.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile

NOTION_VERSION = "2022-06-28"
# Target database: "Carrosséis — Entregas" under "Base | Nanoclaw".
DATABASE_ID = "94603584-af9a-4f9e-b190-cc8e4bac7f4c"
API = "https://api.notion.com/v1/pages"

# Notion rich_text caps a single text run at 2000 chars; chunk past that.
TEXT_LIMIT = 2000
# Notion accepts up to 100 child blocks per page-create request.
MAX_BLOCKS = 100

STATUS = {
    "rascunho": "Rascunho", "draft": "Rascunho",
    "entregue": "Entregue", "delivered": "Entregue", "done": "Entregue",
    "publicado": "Publicado", "published": "Publicado", "live": "Publicado",
}


def _norm(table: dict[str, str], value: str | None) -> str | None:
    if not value:
        return None
    return table.get(value.strip().lower(), value.strip())


def _rt(text: str) -> list[dict]:
    """Split text into <=2000-char rich_text runs."""
    text = text or ""
    return [{"type": "text", "text": {"content": text[i:i + TEXT_LIMIT]}}
            for i in range(0, max(len(text), 1), TEXT_LIMIT)]


def _read(path: str | None) -> str:
    if not path:
        return ""
    with open(path, encoding="utf-8") as fh:
        return fh.read().strip()


def _blocks(body: str) -> list[dict]:
    """Plain text -> Notion blocks. '## ' lines become headings; blank lines
    separate paragraphs. Chunked to respect the per-request block cap."""
    blocks: list[dict] = []
    for para in body.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        if para.startswith("## "):
            blocks.append({"object": "block", "type": "heading_3",
                           "heading_3": {"rich_text": _rt(para[3:].strip())}})
        else:
            blocks.append({"object": "block", "type": "paragraph",
                           "paragraph": {"rich_text": _rt(para)}})
    return blocks[:MAX_BLOCKS]


def main() -> int:
    ap = argparse.ArgumentParser(prog="notion_delivery",
                                 description="Log a created carousel into the deliveries Notion DB.")
    ap.add_argument("--carrossel", required=True, help="Título/tema do carrossel (a headline escolhida)")
    ap.add_argument("--marca", default="Zoryon", help="Marca cliente (default: Zoryon)")
    ap.add_argument("--data", help="YYYY-MM-DD (default: deixe vazio)")
    ap.add_argument("--slides", type=int, help="Número de slides")
    ap.add_argument("--drive", help="Link da pasta no Drive (Carrosséis — Entregas)")
    ap.add_argument("--legenda", help="Legenda (inline)")
    ap.add_argument("--legenda-file", help="Legenda a partir de um arquivo")
    ap.add_argument("--status", default="Entregue", help="Rascunho | Entregue | Publicado (default: Entregue)")
    ap.add_argument("--body-file", help="Opcional: texto dos slides como corpo da página (## Slide N)")
    args = ap.parse_args()

    legenda = args.legenda or _read(args.legenda_file)
    status = _norm(STATUS, args.status) or "Entregue"

    props: dict = {
        "Carrossel": {"title": [{"text": {"content": args.carrossel[:2000]}}]},
        "Marca": {"select": {"name": args.marca.strip()}},
        "Status": {"select": {"name": status}},
    }
    if args.data:
        props["Data"] = {"date": {"start": args.data}}
    if args.slides is not None:
        props["Slides"] = {"number": args.slides}
    if args.drive:
        props["Pasta Drive"] = {"url": args.drive}
    if legenda:
        props["Legenda"] = {"rich_text": _rt(legenda)}

    payload: dict = {"parent": {"database_id": DATABASE_ID}, "properties": props}
    body = _read(args.body_file)
    if body:
        payload["children"] = _blocks(body)

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
