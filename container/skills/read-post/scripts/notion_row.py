#!/usr/bin/env python3
"""Create one row (page) in the "Referências — Conteúdo" Notion database.

This is the Step-3 writer for /read-post. It replaces the old Google-Sheets
append. The agent gathers the fields (from archive.py's report + reading
carousel cards) and calls this script; the script builds the Notion API
payload deterministically and POSTs it — so the model never hand-writes JSON.

Auth: none here. The container runs under the OneCLI gateway, which injects
the Notion OAuth bearer for api.notion.com. We send NO Authorization header.

Body: pass the post's content via --body-file (plain text). Blank lines split
paragraphs; a line beginning with "## " becomes a heading. For a reel that's
the transcript; for a carousel, write one "## Card N" heading per card.

Usage:
  notion_row.py \
    --tipo reel --plataforma instagram --perfil "@x" --data 2026-06-21 \
    --link "https://..." --drive "https://drive.google.com/..." \
    --metrica "0:42" --legenda-file cap.txt --tema "hook,storytelling" \
    --body-file transcript.txt
Prints the created page URL on success.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile

NOTION_VERSION = "2022-06-28"
# Target database: "Referências — Conteúdo" under "Base | Nanoclaw".
DATABASE_ID = "386481dd-f843-8146-b285-e3b0d818b842"
API = "https://api.notion.com/v1/pages"

# Notion rich_text caps a single text run at 2000 chars; chunk past that.
TEXT_LIMIT = 2000
# Notion accepts up to 100 child blocks per page-create request.
MAX_BLOCKS = 100

PLATAFORMA = {
    "instagram": "Instagram", "ig": "Instagram",
    "tiktok": "TikTok", "tt": "TikTok",
    "x": "X", "twitter": "X",
    "youtube": "YouTube", "yt": "YouTube",
}
TIPO = {
    "carrossel": "Carrossel", "carousel": "Carrossel",
    "foto": "Foto", "photo": "Foto", "image": "Foto",
    "reel": "Reel", "video": "Reel", "vídeo": "Reel",
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
    ap = argparse.ArgumentParser(prog="notion_row",
                                 description="Create a row in the content reference Notion DB.")
    ap.add_argument("--tipo", required=True, help="reel | carrossel | foto")
    ap.add_argument("--plataforma", required=True, help="instagram | tiktok | x | youtube")
    ap.add_argument("--perfil", required=True, help="@handle (— Nome optional)")
    ap.add_argument("--data", help="YYYY-MM-DD")
    ap.add_argument("--link", help="original post URL")
    ap.add_argument("--drive", help="Drive folder link (media)")
    ap.add_argument("--metrica", help="duração (reel) or card count (carrossel)")
    ap.add_argument("--legenda", help="caption text (inline)")
    ap.add_argument("--legenda-file", help="caption text from a file")
    ap.add_argument("--tema", help="comma-separated tags")
    ap.add_argument("--titulo", help="row title (default: composed from perfil/tipo/data)")
    ap.add_argument("--body-file", help="post content as plain text (transcript / card texts)")
    args = ap.parse_args()

    tipo = _norm(TIPO, args.tipo)
    plataforma = _norm(PLATAFORMA, args.plataforma)
    legenda = args.legenda or _read(args.legenda_file)
    titulo = args.titulo or " · ".join(
        x for x in (args.perfil, tipo, args.data) if x)

    props: dict = {
        "Referência": {"title": [{"text": {"content": titulo[:2000]}}]},
        "Perfil": {"rich_text": _rt(args.perfil)},
        "Tipo": {"select": {"name": tipo}},
        "Plataforma": {"select": {"name": plataforma}},
    }
    if args.data:
        props["Data"] = {"date": {"start": args.data}}
    if args.link:
        props["Link original"] = {"url": args.link}
    if args.drive:
        props["Midia (Drive)"] = {"url": args.drive}
    if args.metrica:
        props["Metrica"] = {"rich_text": _rt(args.metrica)}
    if legenda:
        props["Legenda"] = {"rich_text": _rt(legenda)}
    if args.tema:
        tags = [t.strip() for t in args.tema.split(",") if t.strip()]
        if tags:
            props["Tema"] = {"multi_select": [{"name": t} for t in tags]}

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
