#!/usr/bin/env python3
"""Gmail via the OneCLI gateway (native OAuth, no Composio).

No Authorization header — gateway injects (agent needs `gmail` granted).

  labels                       → list labels
  search <query> [max]         → message ids+snippets (Gmail query syntax)
  read   <messageId>           → headers (From/To/Subject/Date) + plain body
  send   <to> <subject> <body> → send a plain-text email (write — confirm first)
  draft  <to> <subject> <body> → create a draft (no send)

`send`/`draft` build an RFC-2822 message and base64url it into {"raw": ...}.
"""
from __future__ import annotations
import argparse, base64, json, sys, urllib.error
from email.message import EmailMessage
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
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
            raise SystemExit(f"gmail não concedido a este agente no OneCLI (HTTP {e.code}). Peça o grant; não use Composio. {d}")
        raise SystemExit(f"Gmail API {method} falhou: HTTP {e.code} {d}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise SystemExit(f"Gmail API falhou (rede/proxy): {e}")
    return json.loads(raw) if raw.strip() else {}


def _raw(to, subject, body):
    m = EmailMessage(); m["To"] = to; m["Subject"] = subject; m.set_content(body)
    return base64.urlsafe_b64encode(m.as_bytes()).decode()


def _decode_body(payload):
    """Best-effort plain-text from a Gmail message payload."""
    def walk(p):
        if p.get("mimeType") == "text/plain" and p.get("body", {}).get("data"):
            return base64.urlsafe_b64decode(p["body"]["data"]).decode("utf-8", "replace")
        for part in p.get("parts", []) or []:
            t = walk(part)
            if t:
                return t
        return ""
    return walk(payload)


def main():
    ap = argparse.ArgumentParser(prog="gmail_api")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("labels")
    p = sub.add_parser("search"); p.add_argument("query"); p.add_argument("max", nargs="?", default="10")
    p = sub.add_parser("read"); p.add_argument("messageId")
    for c in ("send", "draft"):
        p = sub.add_parser(c); p.add_argument("to"); p.add_argument("subject"); p.add_argument("body")
    a = ap.parse_args()

    if a.cmd == "labels":
        out = _api("GET", f"{BASE}/labels")
    elif a.cmd == "search":
        out = _api("GET", f"{BASE}/messages?{urlencode({'q': a.query, 'maxResults': a.max})}")
    elif a.cmd == "read":
        msg = _api("GET", f"{BASE}/messages/{quote(a.messageId, safe='')}?format=full")
        hdrs = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])
                if h["name"] in ("From", "To", "Subject", "Date")}
        out = {"id": msg.get("id"), "snippet": msg.get("snippet"), "headers": hdrs,
               "body": _decode_body(msg.get("payload", {}))}
    elif a.cmd == "send":
        out = _api("POST", f"{BASE}/messages/send", body={"raw": _raw(a.to, a.subject, a.body)})
    elif a.cmd == "draft":
        out = _api("POST", f"{BASE}/drafts", body={"message": {"raw": _raw(a.to, a.subject, a.body)}})
    json.dump(out, sys.stdout, ensure_ascii=False); sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
