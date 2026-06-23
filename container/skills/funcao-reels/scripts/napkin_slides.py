#!/usr/bin/env python3
"""Generate a CONGRUENT SET of Napkin diagram slides for one reel — Função Reels.

A reel's diagram often evolves across the beats (setup → highlight → resolution)
— the pack's Napkin workflow is literally "select the block → generate the visual
for that block" (referencias/analise-reels-referencia.md). This helper turns N
content blocks (one per reel stage) into N visually-CONGRUENT slides:

  1. Generate slide 1 → capture the Napkin `style_id` it returns.
  2. Generate slides 2..N pinning that same `style_id` → identical visual style.
  3. Save them as <out-dir>/<prefix>-1[-label].<ext> … and print every path.

Still ONE concept per reel (the pack's rule) — this just lets the single concept
be shown as a coherent storyboard mapped to the beats, instead of one static image.

Builds on napkin_generate.py (same dir): same async Napkin API, same gateway-only
auth (no Authorization header in-container; set env NAPKIN_API_TOKEN for host
testing). If any slide fails, the script reports which and exits non-zero — the
agent then falls back per ADAPTER.md (Magnific → HTML→PNG). Never fabricates files.

Usage:
  napkin_slides.py --blocks slides.json --out-dir reels/<...>/ --prefix diagrama --format png
  napkin_slides.py --blocks slides.json --dry-run    # prints the planned per-slide payloads

slides.json: [{"content": "<texto cru do bloco>", "label": "beat3-setup"}, ...]
(label optional; used only to name the file.)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
from pathlib import Path

import napkin_generate as ng

PLACEHOLDER_STYLE = "<style_id-do-slide-1>"


def _slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").strip().lower()).strip("-")
    return s[:40]


def _slide_payload(block: dict, base: dict, style_id: str | None) -> dict:
    p = dict(base)
    p["content"] = block["content"]
    if style_id:
        p["style_id"] = style_id
    return p


def plan(blocks: list[dict], base: dict, fixed_style_id: str | None) -> list[dict]:
    """The per-slide payloads, for --dry-run. Slide 1 establishes the style
    (no style_id, unless one was pinned via --style-id); slides 2+ reuse it."""
    payloads = []
    for i, block in enumerate(blocks):
        if i == 0:
            sid = fixed_style_id            # slide 1: only if explicitly pinned
        else:
            sid = fixed_style_id or PLACEHOLDER_STYLE  # reuse pinned or slide-1's
        payloads.append(_slide_payload(block, base, sid))
    return payloads


def _out_path(out_dir: Path, prefix: str, i: int, label: str | None, ext: str) -> Path:
    name = f"{prefix}-{i}" + (f"-{_slug(label)}" if label else "") + f".{ext}"
    return out_dir / name


def run(args: argparse.Namespace, blocks: list[dict], base: dict) -> int:
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    style_id = args.style_id  # may be None; slide 1 establishes it if so
    saved: list[str] = []
    for i, block in enumerate(blocks, 1):
        payload = _slide_payload(block, base, style_id)
        try:
            result = ng.fetch_visual(payload)
            data = ng.download(result["files"][0]["url"])
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8", "replace")[:200]
            except Exception:
                pass
            print(f"[funcao-reels] slide {i} falhou (HTTP {exc.code} {detail}). "
                  f"Fallback Magnific→HTML→PNG — ver ADAPTER.md.", file=sys.stderr)
            return 1
        except (urllib.error.URLError, RuntimeError, ValueError) as exc:
            print(f"[funcao-reels] slide {i} falhou ({exc}). "
                  f"Fallback Magnific→HTML→PNG — ver ADAPTER.md.", file=sys.stderr)
            return 1
        if style_id is None:  # slide 1 establishes the congruent style
            style_id = result["style_id"]
        path = _out_path(out_dir, args.prefix, i, block.get("label"), args.format)
        path.write_bytes(data)
        saved.append(str(path))
        print(str(path))  # stdout: one slide path per line, in order
    print(f"[funcao-reels] {len(saved)} slides congruentes · style_id={style_id}",
          file=sys.stderr)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        prog="napkin_slides",
        description="Generate a congruent set of Napkin slides for one reel.",
    )
    ap.add_argument("--blocks", required=True,
                    help="JSON file: [{content, label?}, ...] — um bloco por etapa")
    ap.add_argument("--out-dir", dest="out_dir", default=".",
                    help="pasta de saída (default: atual)")
    ap.add_argument("--prefix", default="diagrama", help="prefixo dos arquivos")
    ap.add_argument("--format", default="png", choices=["png", "svg"])
    ap.add_argument("--language", default="pt-BR")
    ap.add_argument("--color-mode", dest="color_mode", default="dark",
                    choices=["dark", "light"])
    ap.add_argument("--transparent", dest="transparent", action="store_true",
                    default=True)
    ap.add_argument("--no-transparent", dest="transparent", action="store_false")
    ap.add_argument("--orientation", choices=["auto", "horizontal", "vertical"])
    ap.add_argument("--style-id", dest="style_id",
                    help="pin um style_id em TODOS os slides (default: slide 1 define)")
    ap.add_argument("--dry-run", action="store_true",
                    help="imprime os payloads planejados por slide e sai")
    args = ap.parse_args()

    with open(args.blocks, encoding="utf-8") as fh:
        blocks = json.load(fh)
    if not isinstance(blocks, list) or not blocks:
        print("ERRO: --blocks deve ser um JSON com uma lista não-vazia de blocos.",
              file=sys.stderr)
        return 2
    for b in blocks:
        if not isinstance(b, dict) or not b.get("content"):
            print("ERRO: cada bloco precisa de 'content'.", file=sys.stderr)
            return 2

    base = {
        "format": args.format,
        "language": args.language,
        "color_mode": args.color_mode,
        "transparent_background": args.transparent,
        "number_of_visuals": 1,
    }
    if args.orientation:
        base["orientation"] = args.orientation

    if args.dry_run:
        for i, p in enumerate(plan(blocks, base, args.style_id), 1):
            print(f"slide {i}: {json.dumps(p, ensure_ascii=False)}")
        return 0
    return run(args, blocks, base)


if __name__ == "__main__":
    raise SystemExit(main())
