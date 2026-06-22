#!/usr/bin/env python3
"""Generate a Napkin diagram from structured concept text — Função Reels.

PRIMARY diagram generator for the funcao-reels skill (módulo 04). Takes the
"texto cru estruturado" from the brief and asks the Napkin Visual API for a
diagram, then downloads SVG/PNG to --out.

Napkin API (verified 2026-06-22): async.
  POST https://api.napkin.ai/v1/visual            → 201 {id, status:"pending"}
  GET  https://api.napkin.ai/v1/visual/{id}/status → {status, generated_files:[{url,…}], credits}
  GET  <generated_files[i].url>                    → the SVG/PNG bytes
Napkin auto-selects the visual TYPE from the structure of `content` (there is no
`visual_query` param); an optional `style_id` picks a Napkin style.

Auth: inside the container the OneCLI gateway injects the Napkin bearer for
api.napkin.ai, so we send NO Authorization header. For host testing / non-gateway
use, set env `NAPKIN_API_TOKEN` and the script will send the header itself.

If Napkin is unavailable (no token / API error / generation failed), the script
exits NON-ZERO with a clear message; the agent then falls back to Magnific, then
HTML→PNG, per ADAPTER.md. The script NEVER fabricates an output file.

Usage:
  napkin_generate.py \
    --content "<texto cru estruturado>" \
    --format png --language pt-BR --color-mode dark --transparent \
    --out diagrama.png

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
TOKEN = os.environ.get("NAPKIN_API_TOKEN")  # host/testing only; unset in-container
FALLBACK_MSG = (
    "[funcao-reels] Napkin indisponível ({why}). "
    "Use o fallback Magnific (images_generate_svg) e, se também falhar, o "
    "fallback HTML→PNG — ver ADAPTER.md."
)


def build_payload(args: argparse.Namespace) -> dict:
    """Deterministic Napkin request body. Only fields the API accepts. Defaults
    match the pack: pt-BR, dark, transparent — for the formato's black canvas."""
    payload: dict = {
        "content": args.content,
        "format": args.format,
        "language": args.language,
        "color_mode": args.color_mode,
        "transparent_background": args.transparent,
        "number_of_visuals": args.number_of_visuals,
    }
    if args.orientation:
        payload["orientation"] = args.orientation
    if args.style_id:
        payload["style_id"] = args.style_id
    return payload


def _headers(content_type: str | None = None) -> dict:
    h = {"User-Agent": "funcao-reels/1.0 (+nanoclaw)"}
    if content_type:
        h["Content-Type"] = content_type
    if TOKEN:  # host/testing path; in-container the gateway injects this
        h["Authorization"] = f"Bearer {TOKEN}"
    return h


def _req(method: str, url: str, body: bytes | None = None) -> tuple[int, bytes]:
    req = Request(url, data=body, method=method,
                  headers=_headers("application/json" if body else None))
    with urlopen(req, timeout=180) as resp:
        return resp.status, resp.read()


def _get_bytes(url: str) -> bytes:
    req = Request(url, headers=_headers())
    with urlopen(req, timeout=180) as resp:
        return resp.read()


def generate(args: argparse.Namespace) -> int:
    body = json.dumps(build_payload(args)).encode("utf-8")
    try:
        _, raw = _req("POST", f"{API_BASE}/visual", body)
        created = json.loads(raw.decode("utf-8", errors="replace"))
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

    vid = created.get("id")
    if not vid:
        print(FALLBACK_MSG.format(why="sem id na resposta de criação"), file=sys.stderr)
        return 1

    # Poll status until completed/failed.
    asset_url = None
    deadline = time.time() + 180
    while time.time() < deadline:
        try:
            _, raw = _req("GET", f"{API_BASE}/visual/{vid}/status")
            st = json.loads(raw.decode("utf-8", errors="replace"))
        except Exception as exc:  # noqa: BLE001
            print(FALLBACK_MSG.format(why=f"polling: {exc}"), file=sys.stderr)
            return 1
        status = st.get("status")
        if status == "completed":
            files = st.get("generated_files") or []
            if files:
                asset_url = files[0].get("url")
            break
        if status in {"failed", "error"}:
            print(FALLBACK_MSG.format(why="geração falhou"), file=sys.stderr)
            return 1
        time.sleep(3)

    if not asset_url:
        print(FALLBACK_MSG.format(why="sem arquivo gerado (timeout?)"), file=sys.stderr)
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
    ap.add_argument("--format", default="png", choices=["png", "svg"])
    ap.add_argument("--language", default="pt-BR")
    ap.add_argument("--color-mode", dest="color_mode", default="dark",
                    choices=["dark", "light"])
    ap.add_argument("--transparent", dest="transparent", action="store_true",
                    default=True, help="(default) fundo transparente")
    ap.add_argument("--no-transparent", dest="transparent", action="store_false",
                    help="fundo opaco")
    ap.add_argument("--number-of-visuals", dest="number_of_visuals", type=int,
                    default=1)
    ap.add_argument("--orientation", choices=["auto", "horizontal", "vertical"],
                    help="orientação (default: deixa o Napkin decidir)")
    ap.add_argument("--style-id", dest="style_id",
                    help="Napkin style_id opcional (look da série)")
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
