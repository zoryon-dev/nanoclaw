#!/usr/bin/env python3
"""Fetch GitHub repo metadata + README excerpt via the public API (no auth).

Stdlib-only. Prints one JSON object:
  {"full_name","description","stars","language","topics","homepage",
   "readme_excerpt","error"?}

Usage: gh_meta.py <owner/repo | github-url>
Unauthenticated API rate limit is 60/h — fine for personal link saving.
"""
import base64
import json
import re
import sys
import urllib.error
from urllib.request import Request, urlopen

API = "https://api.github.com"
HEADERS = {"User-Agent": "nanoclaw-brown", "Accept": "application/vnd.github+json"}
TIMEOUT = 20
README_CHARS = 1500


def _get(url: str):
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_owner_repo(arg: str) -> str:
    m = re.search(r"github\.com[/:]([^/]+)/([^/#?]+)", arg)
    if m:
        owner, repo = m.group(1), m.group(2)
    elif "/" in arg:
        owner, repo = arg.split("/", 1)
        repo = repo.split("/")[0]
    else:
        raise SystemExit("expected owner/repo or a github url")
    return f"{owner}/{re.sub(r'.git$', '', repo)}"


def main(argv):
    if len(argv) != 2:
        print(json.dumps({"error": "usage: gh_meta.py <owner/repo|url>"}))
        return 2
    try:
        full = parse_owner_repo(argv[1])
        repo = _get(f"{API}/repos/{full}")
        out = {
            "full_name": repo.get("full_name"),
            "description": repo.get("description"),
            "stars": repo.get("stargazers_count"),
            "language": repo.get("language"),
            "topics": repo.get("topics", []),
            "homepage": repo.get("homepage") or None,
        }
        try:
            readme = _get(f"{API}/repos/{full}/readme")
            content = base64.b64decode(readme.get("content", "")).decode("utf-8", "replace")
            out["readme_excerpt"] = content[:README_CHARS]
        except Exception:
            out["readme_excerpt"] = None
        print(json.dumps(out, ensure_ascii=False))
        return 0
    except urllib.error.HTTPError as exc:
        print(json.dumps({"error": f"github api {exc.code}", "full_name": argv[1]}))
        return 1
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc), "full_name": argv[1]}))
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
