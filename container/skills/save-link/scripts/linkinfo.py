#!/usr/bin/env python3
"""Classify and canonicalize a URL for the link librarian (Brown).

Deterministic, stdlib-only. Prints one JSON object:
  {
    "input": "<raw>",
    "url": "<normalized clickable url>",
    "url_key": "<canonical dedup key, lowercase>",
    "type": "github" | "youtube" | "twitter" | "generic",
    "owner_repo": "owner/repo"        # github only
    "video_id": "<id>"                # youtube only
  }

The url_key strips tracking params and fragments so that the same resource shared
two different ways dedups to one row. Usage: linkinfo.py <url>
"""
import hashlib
import json
import re
import sys
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

TRACKING_PREFIXES = ("utm_",)
TRACKING_KEYS = {
    "fbclid", "gclid", "igshid", "igsh", "si", "ref", "ref_src", "ref_url",
    "source", "spm", "mc_cid", "mc_eid", "yclid", "_hsenc", "_hsmi", "vero_id",
    "feature", "app", "ab_channel",
}


def _strip_tracking(query: str) -> str:
    pairs = [(k, v) for k, v in parse_qsl(query, keep_blank_values=False)
             if not k.lower().startswith(TRACKING_PREFIXES) and k.lower() not in TRACKING_KEYS]
    return urlencode(pairs)


def _normalize(raw: str):
    raw = raw.strip()
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", raw):
        raw = "https://" + raw
    p = urlparse(raw)
    host = (p.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    netloc = host
    if p.port:
        netloc = f"{host}:{p.port}"
    path = p.path.rstrip("/") or "/"
    query = _strip_tracking(p.query)
    norm = urlunparse((p.scheme.lower(), netloc, path, "", query, ""))
    return p, host, path, query, norm


def classify(raw: str) -> dict:
    p, host, path, query, norm = _normalize(raw)
    out = {"input": raw, "url": norm, "type": "generic"}
    qd = dict(parse_qsl(query))

    # GitHub repo (github.com/owner/repo[/...]) — exclude non-repo paths
    if host in ("github.com",):
        parts = [s for s in path.split("/") if s]
        reserved = {"features", "topics", "collections", "sponsors", "marketplace",
                    "settings", "notifications", "explore", "about", "pricing"}
        if len(parts) >= 2 and parts[0].lower() not in reserved:
            owner, repo = parts[0], parts[1]
            repo = re.sub(r"\.git$", "", repo)
            out["type"] = "github"
            out["owner_repo"] = f"{owner}/{repo}"
            out["url_key"] = f"github.com/{owner.lower()}/{repo.lower()}"
            return out

    # YouTube
    if host in ("youtube.com", "m.youtube.com", "youtube-nocookie.com"):
        vid = qd.get("v")
        if not vid:
            m = re.search(r"/(?:shorts|embed|live)/([A-Za-z0-9_-]{6,})", path)
            vid = m.group(1) if m else None
        if vid:
            out.update(type="youtube", video_id=vid,
                       url=f"https://www.youtube.com/watch?v={vid}",
                       url_key=f"youtube:{vid}")
            return out
    if host == "youtu.be":
        vid = path.strip("/").split("/")[0]
        if vid:
            out.update(type="youtube", video_id=vid,
                       url=f"https://www.youtube.com/watch?v={vid}",
                       url_key=f"youtube:{vid}")
            return out

    # X / Twitter
    if host in ("x.com", "twitter.com", "mobile.twitter.com", "nitter.net"):
        out["type"] = "twitter"
        m = re.search(r"/([^/]+)/status/(\d+)", path)
        if m:
            out["url_key"] = f"x.com/{m.group(1).lower()}/status/{m.group(2)}"
            out["url"] = f"https://x.com/{m.group(1)}/status/{m.group(2)}"
            return out

    # Generic
    key = f"{host}{path}"
    if query:
        key += f"?{query}"
    out["url_key"] = key.lower()
    return out


def main(argv):
    if len(argv) != 2:
        print(json.dumps({"error": "usage: linkinfo.py <url>"}))
        return 2
    info = classify(argv[1])
    info["id"] = "lk-" + hashlib.sha1(info["url_key"].encode("utf-8")).hexdigest()[:8]
    print(json.dumps(info, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
