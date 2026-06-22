#!/usr/bin/env python3
"""Log ONE reel the agent produced into the Notion database "Reels — Entregas".

Sibling of read-post/notion_delivery.py (carousels) — same gateway contract,
different DB. Records a reel produced via the funcao-reels skill: the browsable
index + publish status. Media (diagrama + roteiro-reel.md + brief-diagrama.md)
lives in the Drive folder "Reels — Entregas"; this DB points to it.

Auth: none here. The container runs under the OneCLI gateway, which injects the
Notion OAuth bearer for api.notion.com. We send NO Authorization header. Never
write the Notion token by hand.

The agent gathers the fields and calls this script; the script builds the Notion
API payload deterministically and POSTs it — so the model never hand-writes JSON.

Usage:
  notion_reel.py \
    --titulo "Os 2 caminhos que funcionam (e o meio é cilada)" \
    --marca Zoryon --data 2026-06-22 \
    --formato Napkin --duracao "15–30s" --objetivo salvar \
    --drive "https://drive.google.com/..." \
    --hook "Existem só 2 caminhos que funcionam — e o meio é cilada." \
    --legenda-file roteiro-reel.md \
    [--body-file roteiro-reel.md]
  notion_reel.py --dry-run ...   # prints the payload JSON, no POST
Prints the created page URL on success.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile

NOTION_VERSION = "2022-06-28"
# Target database: "Reels — Entregas" under "Base | Nanoclaw".
DATABASE_ID = "5a920ab3-b2d6-4552-8ae5-3ff9c6582f27"
API = "https://api.notion.com/v1/pages"

TEXT_LIMIT = 2000
MAX_BLOCKS = 100

MARCA = {"zoryon": "Zoryon", "faryon": "Faryon"}
STATUS = {
    "rascunho": "Rascunho", "draft": "Rascunho",
    "entregue": "Entregue", "delivered": "Entregue", "done": "Entregue",
    "publicado": "Publicado", "published": "Publicado", "live": "Publicado",
}
FORMATO = {"napkin": "Napkin", "r1": "R1", "r2": "R2", "r3": "R3"}
OBJETIVO = {
    "salvar": "Salvar", "save": "Salvar",
    "enviar": "Enviar", "send": "Enviar", "dm": "Enviar",
    "comentar": "Comentar", "comment": "Comentar",
    "seguir": "Seguir", "follow": "Seguir",
    "clicar": "Clicar", "click": "Clicar", "link": "Clicar",
}


def _norm(table: dict[str, str], value: str | None) -> str | None:
    if not value:
        return None
    return table.get(value.strip().lower(), value.strip())


def _rt(text: str) -> list[dict]:
    text = text or ""
    return [{"type": "text", "text": {"content": text[i:i + TEXT_LIMIT]}}
            for i in range(0, max(len(text), 1), TEXT_LIMIT)]


def _read(path: str | None) -> str:
    if not path:
        return ""
    with open(path, encoding="utf-8") as fh:
        return fh.read().strip()


def _blocks(body: str) -> list[dict]:
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


def build_payload(args: argparse.Namespace) -> dict:
    legenda = args.legenda or _read(args.legenda_file)
    props: dict = {
        "Reel": {"title": [{"text": {"content": args.titulo[:2000]}}]},
        "Marca": {"select": {"name": _norm(MARCA, args.marca) or "Zoryon"}},
        "Status": {"select": {"name": _norm(STATUS, args.status) or "Entregue"}},
    }
    if args.data:
        props["Data"] = {"date": {"start": args.data}}
    fmt = _norm(FORMATO, args.formato)
    if fmt:
        props["Formato"] = {"select": {"name": fmt}}
    if args.duracao:
        props["Duração"] = {"rich_text": _rt(args.duracao)}
    obj = _norm(OBJETIVO, args.objetivo)
    if obj:
        props["Objetivo"] = {"select": {"name": obj}}
    if args.drive:
        props["Pasta Drive"] = {"url": args.drive}
    if args.hook:
        props["Hook"] = {"rich_text": _rt(args.hook)}
    if legenda:
        props["Legenda"] = {"rich_text": _rt(legenda)}

    payload: dict = {"parent": {"database_id": DATABASE_ID}, "properties": props}
    body = _read(args.body_file)
    if body:
        payload["children"] = _blocks(body)
    return payload


def main() -> int:
    ap = argparse.ArgumentParser(prog="notion_reel",
                                 description="Log a produced reel into the Reels deliveries Notion DB.")
    ap.add_argument("--titulo", required=True, help="Headline/conceito do reel")
    ap.add_argument("--marca", default="Zoryon", help="Zoryon | Faryon (default: Zoryon)")
    ap.add_argument("--data", help="YYYY-MM-DD")
    ap.add_argument("--formato", help="Napkin | R1 | R2 | R3")
    ap.add_argument("--duracao", help="ex: 15–30s")
    ap.add_argument("--objetivo", help="salvar | enviar | comentar | seguir | clicar")
    ap.add_argument("--drive", help="Link da pasta no Drive (Reels — Entregas)")
    ap.add_argument("--hook", help="O hook escolhido")
    ap.add_argument("--legenda", help="Legenda (inline)")
    ap.add_argument("--legenda-file", dest="legenda_file", help="Legenda a partir de um arquivo")
    ap.add_argument("--status", default="Entregue", help="Rascunho | Entregue | Publicado")
    ap.add_argument("--body-file", dest="body_file", help="Opcional: corpo da página (## headings)")
    ap.add_argument("--dry-run", action="store_true", help="imprime o payload JSON e sai")
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
