#!/usr/bin/env python3
"""Upload a file to Cloudflare R2 via the v4 API and print its public URL.

No key here — the OneCLI gateway injects `Authorization: Bearer <CF token>` for
api.cloudflare.com. Trusts the gateway CA via SSL_CERT_FILE. Uses the v4 API
(simple Bearer) instead of the S3 endpoint (which needs AWS SigV4 the gateway
can't sign). Public read is served from the bucket's custom domain.
"""
from __future__ import annotations

import argparse
import ssl
import urllib.error
from urllib.request import Request, urlopen

ACCOUNT = "11feaa2d9e21cd5a972bccfcb8d1e3d7"
BUCKET = "nanoclaw"
PUBLIC = "https://bucket-nanoclaw.zoryon.co"
API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/r2/buckets/{BUCKET}/objects"
CTX = ssl.create_default_context()


def _ctype(key: str) -> str:
    k = key.lower()
    if k.endswith(".png"):
        return "image/png"
    if k.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if k.endswith(".pdf"):
        return "application/pdf"
    if k.endswith(".webp"):
        return "image/webp"
    return "application/octet-stream"


def main() -> int:
    ap = argparse.ArgumentParser(prog="r2_upload", description="Upload a file to R2, print its public URL.")
    ap.add_argument("file", help="local path")
    ap.add_argument("key", help="object key in the bucket, e.g. carrosseis/<slug>/slide-1.png")
    a = ap.parse_args()

    with open(a.file, "rb") as f:
        body = f.read()
    req = Request(
        f"{API}/{a.key}", data=body, method="PUT",
        headers={"Content-Type": _ctype(a.key), "User-Agent": "r2-upload/1.0 (+nanoclaw)"},
    )
    try:
        with urlopen(req, timeout=120, context=CTX) as r:
            if r.getcode() not in (200, 201):
                raise SystemExit(f"R2 PUT HTTP {r.getcode()}")
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode(errors="replace")[:300]
        except Exception:
            pass
        if e.code in (401, 403):
            raise SystemExit("Cloudflare/R2 não concedido a este agente no OneCLI. Avise o Jonas.")
        raise SystemExit(f"R2 PUT falhou HTTP {e.code}: {detail}")
    except Exception as e:
        raise SystemExit(f"R2 PUT falhou: {e}")

    print(f"{PUBLIC}/{a.key}")  # stdout: the public URL
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
