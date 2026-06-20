#!/usr/bin/env python3
"""Google Docs via the OneCLI gateway (native OAuth, no Composio).

No Authorization header — gateway injects (agent needs `google-docs` granted).

  get    <docId>           → full document JSON (title + body structural elements)
  text   <docId>           → just the plain text of the doc (flattened)
  create <title>           → new doc, prints its documentId
  append <docId> <text>    → insert text at end of the document
"""
from __future__ import annotations
import argparse, json, sys, urllib.error
from urllib.parse import quote
from urllib.request import Request, urlopen

BASE = "https://docs.googleapis.com/v1/documents"
TIMEOUT = 60


def _api(method, url, body=None):
    headers = {"User-Agent": "google-native/1.0 (+nanoclaw)"}
    data = None
    if body is not None:
        data = json.dumps(body).encode(); headers["Content-Type"] = "application/json"
    try:
        with urlopen(Request(url, data=data, headers=headers, method=method), timeout=TIMEOUT) as r:
            raw = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        d = ""
        try: d = e.read().decode("utf-8", "replace")[:600]
        except Exception: pass
        if e.code in (401, 403):
            raise SystemExit(f"google-docs não concedido a este agente no OneCLI (HTTP {e.code}). Peça o grant; não use Composio. {d}")
        raise SystemExit(f"Docs API {method} falhou: HTTP {e.code} {d}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise SystemExit(f"Docs API falhou (rede/proxy): {e}")
    return json.loads(raw) if raw.strip() else {}


def _flatten_text(doc):
    out = []
    for el in (doc.get("body", {}).get("content") or []):
        para = el.get("paragraph")
        if not para:
            continue
        for pe in para.get("elements", []):
            tr = pe.get("textRun")
            if tr and tr.get("content"):
                out.append(tr["content"])
    return "".join(out)


def _end_index(doc):
    content = doc.get("body", {}).get("content") or []
    return max((el.get("endIndex", 1) for el in content), default=1)


def main():
    ap = argparse.ArgumentParser(prog="docs_api")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for c in ("get", "text"):
        p = sub.add_parser(c); p.add_argument("docId")
    p = sub.add_parser("create"); p.add_argument("title")
    p = sub.add_parser("append"); p.add_argument("docId"); p.add_argument("text")
    a = ap.parse_args()

    if a.cmd == "get":
        out = _api("GET", f"{BASE}/{quote(a.docId, safe='')}")
    elif a.cmd == "text":
        out = {"documentId": a.docId, "text": _flatten_text(_api("GET", f"{BASE}/{quote(a.docId, safe='')}"))}
    elif a.cmd == "create":
        out = _api("POST", BASE, body={"title": a.title})
    elif a.cmd == "append":
        doc = _api("GET", f"{BASE}/{quote(a.docId, safe='')}")
        idx = max(_end_index(doc) - 1, 1)
        out = _api("POST", f"{BASE}/{quote(a.docId, safe='')}:batchUpdate",
                   body={"requests": [{"insertText": {"location": {"index": idx}, "text": a.text}}]})
    json.dump(out, sys.stdout, ensure_ascii=False); sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
