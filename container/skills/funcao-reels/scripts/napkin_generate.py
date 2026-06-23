#!/usr/bin/env python3
"""Generate a Napkin diagram from structured concept text — Função Reels.

PRIMARY diagram generator for the funcao-reels skill (módulo 04), and the base
the multi-slide helper (napkin_slides.py) builds on. Takes the "texto cru
estruturado" from the brief and asks the Napkin Visual API for a diagram, then
downloads SVG/PNG to --out.

Napkin API (verified 2026-06-22): async.
  POST https://api.napkin.ai/v1/visual            → 201 {id, status:"pending"}
  GET  https://api.napkin.ai/v1/visual/{id}/status → {status, generated_files:[{url,style_id,…}], credits}
  GET  <generated_files[i].url>                    → the SVG/PNG bytes
Napkin auto-selects the visual TYPE from the structure of `content` (there is no
`visual_query` param); an optional `style_id` picks/pins a Napkin style — pass
the style_id returned by a prior call to keep a set of slides visually congruent.

With `--number-of-visuals N` the API returns N renderings; this script saves ALL
of them (`<out-stem>-1.<ext>` … `-N.<ext>`) and prints each path. It also prints
the chosen `style_id` to stderr so a caller can pin it on the next call.

Auth: inside the container the OneCLI gateway injects the Napkin bearer for
api.napkin.ai, so we send NO Authorization header. For host testing / non-gateway
use, set env `NAPKIN_API_TOKEN` and the script sends the header itself.

If Napkin is unavailable (no token / API error / generation failed), the script
exits NON-ZERO with a clear message; the agent then falls back to Magnific, then
HTML→PNG, per ADAPTER.md. The script NEVER fabricates an output file.

Usage:
  napkin_generate.py --content "<texto cru>" --format png --out diagrama.png
  napkin_generate.py --content "<...>" --style-id <id> --out diagrama-2.png  # congruent
  napkin_generate.py --dry-run ...   # prints the request payload JSON, no call
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
from pathlib import Path
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


def out_paths(out: str, n: int) -> list[str]:
    """One file → [out]. N files → out-1.ext … out-N.ext (stem-numbered)."""
    if n <= 1:
        return [out]
    p = Path(out)
    stem, suffix = p.stem, p.suffix
    return [str(p.with_name(f"{stem}-{i}{suffix}")) for i in range(1, n + 1)]


def _headers(content_type: str | None = None) -> dict:
    h = {"User-Agent": "funcao-reels/1.0 (+nanoclaw)"}
    if content_type:
        h["Content-Type"] = content_type
    if TOKEN:  # host/testing path; in-container the gateway injects this
        h["Authorization"] = f"Bearer {TOKEN}"
    return h


def _req(method: str, url: str, body: bytes | None = None) -> bytes:
    req = Request(url, data=body, method=method,
                  headers=_headers("application/json" if body else None))
    with urlopen(req, timeout=180) as resp:
        return resp.read()


def fetch_visual(payload: dict) -> dict:
    """POST + poll. Returns {"files":[{"url","style_id",...}], "style_id", "credits"}.
    Raises RuntimeError on failure (caller maps to the fallback message)."""
    raw = _req("POST", f"{API_BASE}/visual", json.dumps(payload).encode("utf-8"))
    created = json.loads(raw.decode("utf-8", errors="replace"))
    vid = created.get("id")
    if not vid:
        raise RuntimeError("sem id na resposta de criação")
    deadline = time.time() + 180
    while time.time() < deadline:
        st = json.loads(_req("GET", f"{API_BASE}/visual/{vid}/status").decode("utf-8", "replace"))
        status = st.get("status")
        if status == "completed":
            files = st.get("generated_files") or []
            if not files:
                raise RuntimeError("completed sem generated_files")
            return {
                "files": files,
                "style_id": files[0].get("style_id"),
                "credits": (st.get("credits") or {}).get("consumed"),
            }
        if status in {"failed", "error"}:
            raise RuntimeError("geração falhou")
        time.sleep(3)
    raise RuntimeError("timeout aguardando a geração")


def download(url: str) -> bytes:
    return _req("GET", url)


def generate(args: argparse.Namespace) -> int:
    try:
        result = fetch_visual(build_payload(args))
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        print(FALLBACK_MSG.format(why=f"HTTP {exc.code} {detail}"), file=sys.stderr)
        return 1
    except (urllib.error.URLError, RuntimeError, ValueError) as exc:
        print(FALLBACK_MSG.format(why=str(exc)), file=sys.stderr)
        return 1

    files = result["files"]
    paths = out_paths(args.out, len(files))
    for path, f in zip(paths, files):
        try:
            data = download(f["url"])
        except Exception as exc:  # noqa: BLE001
            print(FALLBACK_MSG.format(why=f"download: {exc}"), file=sys.stderr)
            return 1
        with open(path, "wb") as fh:
            fh.write(data)
        print(path)  # stdout: one saved path per line
    # Surface the style_id so a caller can pin it for congruent follow-up slides.
    print(f"[funcao-reels] style_id={result['style_id']} "
          f"credits={result['credits']} files={len(files)}", file=sys.stderr)
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
                    default=1, help="N renderings (salva todos: out-1…out-N)")
    ap.add_argument("--orientation", choices=["auto", "horizontal", "vertical"],
                    help="orientação (default: deixa o Napkin decidir)")
    ap.add_argument("--style-id", dest="style_id",
                    help="Napkin style_id opcional — pin pra slides congruentes")
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
