#!/usr/bin/env python3
"""Generate one image via the Magnific REST API (async). No key here — the OneCLI
gateway injects x-magnific-api-key for api.magnific.com. Trusts the gateway CA via
SSL_CERT_FILE. POST a job -> poll the task -> download the result PNG to --out.

The exact response field names are normalized defensively (Magnific's schema is
pinned by a live call during skill bring-up; this handles the common shapes)."""
from __future__ import annotations

import argparse
import json
import ssl
import sys
import time
import urllib.error
from urllib.request import Request, urlopen

API = "https://api.magnific.com/v1/ai/text-to-image"
CTX = ssl.create_default_context()  # honors SSL_CERT_FILE (gateway CA)


def _req(method: str, url: str, body: dict | None = None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json", "User-Agent": "magnific-skill/1.0 (+nanoclaw)"}
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urlopen(Request(url, data=data, headers=headers, method=method), timeout=120, context=CTX) as r:
            raw = r.read().decode() or "{}"
            return r.getcode(), json.loads(raw)
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode(errors="replace")[:500]
        except Exception:
            pass
        if "access_restricted" in detail or e.code == 401:
            raise SystemExit("Magnific não concedido a este agente no OneCLI. Avise o Jonas pra liberar.")
        raise SystemExit(f"Magnific {method} {url.split('?')[0]} HTTP {e.code}: {detail}")
    except Exception as e:
        raise SystemExit(f"Magnific call falhou: {e}")


def _dig(d: dict, *keys):
    """First non-empty value among top-level or nested-under-'data' keys."""
    src = [d, d.get("data") or {}]
    for s in src:
        for k in keys:
            if isinstance(s, dict) and s.get(k):
                return s[k]
    return None


def main() -> int:
    ap = argparse.ArgumentParser(prog="magnific_image", description="Generate one image via Magnific REST.")
    ap.add_argument("model", help="nano-banana-pro | gpt-image-2")
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--ref-url", action="append", default=[], help="reference image URL (repeatable)")
    ap.add_argument("--aspect", default="1:1")
    ap.add_argument("--resolution", default="2K")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    payload: dict = {"prompt": a.prompt, "aspect_ratio": a.aspect, "resolution": a.resolution}
    if a.ref_url:
        payload["reference_images"] = [
            {"image": u, "text": "Zoryon brand reference", "mime_type": "image/png"} for u in a.ref_url
        ]

    _, created = _req("POST", f"{API}/{a.model}", payload)
    task_id = _dig(created, "task_id", "id", "taskId")
    if not task_id:
        raise SystemExit(f"Sem task id na resposta do POST: {json.dumps(created)[:400]}")
    print(f"[magnific] task {task_id} ({a.model}) — polling…", file=sys.stderr)

    img_url = None
    for _ in range(72):  # ~6 min max @ 5s
        time.sleep(5)
        _, st = _req("GET", f"{API}/{a.model}/{task_id}")
        status = str(_dig(st, "status") or "").lower()
        if status in ("completed", "success", "succeeded", "done", "finished", "ok"):
            gens = _dig(st, "generated", "images", "result", "outputs") or []
            cand = gens[0] if isinstance(gens, list) and gens else gens
            if isinstance(cand, dict):
                cand = cand.get("url") or cand.get("image") or cand.get("src")
            img_url = cand or _dig(st, "image", "url", "image_url")
            break
        if status in ("failed", "error", "canceled", "cancelled"):
            raise SystemExit(f"Magnific task falhou: {json.dumps(st)[:400]}")
    if not img_url:
        raise SystemExit("Magnific não completou a tempo / sem URL de imagem.")

    with urlopen(Request(img_url, headers={"User-Agent": "magnific-skill/1.0"}), timeout=120, context=CTX) as r, open(a.out, "wb") as f:
        f.write(r.read())
    print(a.out)  # stdout: the saved path
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
