#!/usr/bin/env python3
"""Search GitHub repositories via the public API (no auth).

Stdlib-only. Prints a JSON array of up to N repos:
  [{"full_name","url","description","stars","language","topics"}, ...]

Usage: gh_search.py "<query>" [limit]
Unauthenticated search rate limit is ~10/min — fine for interactive research.
"""
import json
import sys
import urllib.error
import urllib.parse
from urllib.request import Request, urlopen

API = "https://api.github.com/search/repositories"
HEADERS = {"User-Agent": "nanoclaw-brown", "Accept": "application/vnd.github+json"}
TIMEOUT = 20


def main(argv):
    if len(argv) < 2:
        print(json.dumps({"error": "usage: gh_search.py <query> [limit]"}))
        return 2
    query = argv[1]
    limit = int(argv[2]) if len(argv) > 2 and argv[2].isdigit() else 6
    # Default to GitHub's best-match relevance (no sort param). Pass "stars" as a
    # 3rd arg to force star-ranking when the caller wants the most popular.
    params = {"q": query, "per_page": limit}
    if len(argv) > 3 and argv[3] == "stars":
        params.update({"sort": "stars", "order": "desc"})
    qs = urllib.parse.urlencode(params)
    try:
        req = Request(f"{API}?{qs}", headers=HEADERS)
        with urlopen(req, timeout=TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        print(json.dumps({"error": f"github api {exc.code}"}))
        return 1
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        return 1
    out = [
        {
            "full_name": r.get("full_name"),
            "url": r.get("html_url"),
            "description": (r.get("description") or "")[:300] or None,
            "stars": r.get("stargazers_count"),
            "language": r.get("language"),
            "topics": (r.get("topics") or [])[:6],
        }
        for r in data.get("items", [])[:limit]
    ]
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
