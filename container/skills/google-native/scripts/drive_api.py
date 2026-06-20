#!/usr/bin/env python3
"""Google Drive (read/search) via the OneCLI gateway (native OAuth, no Composio).

No Authorization header — gateway injects (agent needs `google-drive` granted).
For uploading carousel images see read-post/upload_drive.py; this covers
listing/searching/reading metadata.

  list   [pageSize]        → recent files (id,name,mimeType,modifiedTime)
  search <name>            → files whose name contains <name>
  get    <fileId>          → file metadata
"""
from __future__ import annotations
import argparse, json, sys, urllib.error
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

FILES = "https://www.googleapis.com/drive/v3/files"
FIELDS = "files(id,name,mimeType,modifiedTime,webViewLink),nextPageToken"
TIMEOUT = 60


def _api(url):
    try:
        with urlopen(Request(url, headers={"User-Agent": "google-native/1.0 (+nanoclaw)"}), timeout=TIMEOUT) as r:
            raw = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        d = ""
        try: d = e.read().decode("utf-8", "replace")[:600]
        except Exception: pass
        if e.code in (401, 403):
            raise SystemExit(f"google-drive não concedido a este agente no OneCLI (HTTP {e.code}). Peça o grant; não use Composio. {d}")
        raise SystemExit(f"Drive API GET falhou: HTTP {e.code} {d}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise SystemExit(f"Drive API falhou (rede/proxy): {e}")
    return json.loads(raw) if raw.strip() else {}


def main():
    ap = argparse.ArgumentParser(prog="drive_api")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list"); p.add_argument("pageSize", nargs="?", default="20")
    p = sub.add_parser("search"); p.add_argument("name")
    p = sub.add_parser("get"); p.add_argument("fileId")
    a = ap.parse_args()

    if a.cmd == "list":
        out = _api(f"{FILES}?{urlencode({'pageSize': a.pageSize, 'fields': FIELDS, 'orderBy': 'modifiedTime desc'})}")
    elif a.cmd == "search":
        esc = a.name.replace("'", "\\'")
        q = "name contains '%s' and trashed = false" % esc
        out = _api(f"{FILES}?{urlencode({'q': q, 'fields': FIELDS, 'pageSize': '20'})}")
    elif a.cmd == "get":
        out = _api(f"{FILES}/{quote(a.fileId, safe='')}?{urlencode({'fields': 'id,name,mimeType,modifiedTime,webViewLink,size,owners'})}")
    json.dump(out, sys.stdout, ensure_ascii=False); sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
