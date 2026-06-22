#!/usr/bin/env python3
"""Generate a Napkin diagram from structured concept text — Função Reels.

PRIMARY diagram generator for the funcao-reels skill (módulo 04). Takes the
"texto cru estruturado" from the brief and asks the Napkin API for a visual,
saving SVG/PNG to --out.

Auth: NONE here. The container runs under the OneCLI gateway, which injects the
Napkin token for api.napkin.ai. We send NO Authorization header. TLS trusts the
gateway CA via SSL_CERT_FILE (set in the container env).

If the Napkin path is unavailable (no token / beta access not granted / API
error), this script exits NON-ZERO with a clear message; the agent then falls
back to Magnific `images_generate_svg` per ADAPTER.md. The script NEVER invents
or fabricates an output file.

Usage:
  napkin_generate.py \
    --content "<texto cru estruturado>" \
    --visual-query comparison \
    --style "Monochrome Pro" \
    --language pt-BR --format png --color-mode dark --transparent \
    --width 1400 --out diagrama.png

  napkin_generate.py --dry-run ...   # prints the request payload JSON, no call
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
from urllib.request import Request, urlopen

API_BASE = os.environ.get("NAPKIN_API_BASE", "https://api.napkin.ai/v1").rstrip("/")
FALLBACK_MSG = (
    "[funcao-reels] Napkin indisponível ({why}). "
    "Use o fallback Magnific (images_generate_svg) — ver ADAPTER.md."
)


def build_payload(args: argparse.Namespace) -> dict:
    """Deterministic Napkin request body. Defaults match the pack: pt-BR,
    dark, transparent — for the formato's black canvas."""
    payload: dict = {
        "content": args.content,
        "visual_query": args.visual_query,
        "language": args.language,
        "format": args.format,
        "color_mode": args.color_mode,
        "transparent_background": args.transparent,
    }
    if args.style:
        payload["style"] = args.style
    if args.width:
        payload["width"] = args.width
    if args.number_of_visuals:
        payload["number_of_visuals"] = args.number_of_visuals
    return payload


def _post(url: str, body: bytes) -> dict:
    req = Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "funcao-reels/1.0 (+nanoclaw)",
        },
        method="POST",
    )
    with urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _get_bytes(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "funcao-reels/1.0 (+nanoclaw)"})
    with urlopen(req, timeout=180) as resp:
        return resp.read()


def generate(args: argparse.Namespace) -> int:
    payload = build_payload(args)
    body = json.dumps(payload).encode("utf-8")
    try:
        created = _post(f"{API_BASE}/visual", body)
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        print(FALLBACK_MSG.format(why=f"HTTP {exc.code} {detail}"), file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(FALLBACK_MSG.format(why=f"rede: {exc}"), file=sys.stderr)
        return 1

    # The API may return the asset URL directly or a job to poll.
    status_url = created.get("status_url") or created.get("self")
    asset_url = created.get("url") or created.get("file_url")
    deadline = time.time() + 180
    while not asset_url and status_url and time.time() < deadline:
        time.sleep(3)
        try:
            st = json.loads(_get_bytes(status_url).decode("utf-8", errors="replace"))
        except Exception as exc:  # noqa: BLE001
            print(FALLBACK_MSG.format(why=f"polling: {exc}"), file=sys.stderr)
            return 1
        if st.get("status") in {"failed", "error"}:
            print(FALLBACK_MSG.format(why="geração falhou"), file=sys.stderr)
            return 1
        asset_url = st.get("url") or st.get("file_url")

    if not asset_url:
        print(FALLBACK_MSG.format(why="sem URL de asset na resposta"), file=sys.stderr)
        return 1

    try:
        data = _get_bytes(asset_url)
    except Exception as exc:  # noqa: BLE001
        print(FALLBACK_MSG.format(why=f"download: {exc}"), file=sys.stderr)
        return 1

    with open(args.out, "wb") as fh:
        fh.write(data)
    print(args.out)  # stdout: the saved path
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        prog="napkin_generate",
        description="Generate a Napkin diagram from structured concept text.",
    )
    ap.add_argument("--content", required=True, help="Texto cru estruturado (curto)")
    ap.add_argument("--visual-query", dest="visual_query", required=True,
                    help="flowchart|comparison|cycle|pyramid|timeline|chart|mindmap")
    ap.add_argument("--style", help='ex: "Monochrome Pro" / "Elegant Outline"')
    ap.add_argument("--language", default="pt-BR")
    ap.add_argument("--format", default="png", choices=["png", "svg"])
    ap.add_argument("--color-mode", dest="color_mode", default="dark",
                    choices=["dark", "light"])
    ap.add_argument("--transparent", dest="transparent", action="store_true",
                    default=True, help="(default) fundo transparente")
    ap.add_argument("--no-transparent", dest="transparent", action="store_false",
                    help="fundo opaco")
    ap.add_argument("--width", type=int, help="largura em px (se png)")
    ap.add_argument("--number-of-visuals", dest="number_of_visuals", type=int)
    ap.add_argument("--out", required=True, help="caminho de saída (svg/png)")
    ap.add_argument("--dry-run", action="store_true",
                    help="imprime o payload JSON e sai (sem chamar a API)")
    args = ap.parse_args()

    if args.dry_run:
        print(json.dumps(build_payload(args), ensure_ascii=False))
        return 0
    return generate(args)


if __name__ == "__main__":
    raise SystemExit(main())
