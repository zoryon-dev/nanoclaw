#!/usr/bin/env python3
"""Google Calendar via the OneCLI gateway (native OAuth, no Composio).

Plain HTTPS to calendar API with NO Authorization header — the gateway injects
the token (agent needs the `google-calendar` app granted). Pure stdlib; TLS
trusts the gateway CA via SSL_CERT_FILE, HTTPS_PROXY routes through the gateway.

  calendars                                   → list the user's calendars
  list   <calId> [timeMin] [timeMax]          → events (RFC3339 times; default: now→+30d not applied, pass them)
  get    <calId> <eventId>                    → one event
  create <calId> <event-json>                 → insert an event
  freebusy <timeMin> <timeMax> <calId[,calId]>→ busy blocks

calId is usually 'primary' or an email. Times are RFC3339 (2026-06-20T09:00:00-03:00).
event-json e.g. '{"summary":"X","start":{"dateTime":"..."},"end":{"dateTime":"..."}}'
"""
from __future__ import annotations
import argparse, json, sys, urllib.error
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

BASE = "https://www.googleapis.com/calendar/v3"
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
            raise SystemExit(f"google-calendar não concedido a este agente no OneCLI (HTTP {e.code}). Peça o grant; não use Composio. {d}")
        raise SystemExit(f"Calendar API {method} falhou: HTTP {e.code} {d}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise SystemExit(f"Calendar API falhou (rede/proxy): {e}")
    return json.loads(raw) if raw.strip() else {}


def main():
    ap = argparse.ArgumentParser(prog="calendar_api")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("calendars")
    p = sub.add_parser("list"); p.add_argument("cal"); p.add_argument("timeMin", nargs="?"); p.add_argument("timeMax", nargs="?")
    p = sub.add_parser("get"); p.add_argument("cal"); p.add_argument("eventId")
    p = sub.add_parser("create"); p.add_argument("cal"); p.add_argument("event")
    p = sub.add_parser("freebusy"); p.add_argument("timeMin"); p.add_argument("timeMax"); p.add_argument("cals")
    a = ap.parse_args()

    if a.cmd == "calendars":
        out = _api("GET", f"{BASE}/users/me/calendarList")
    elif a.cmd == "list":
        q = {"singleEvents": "true", "orderBy": "startTime", "maxResults": "50"}
        if a.timeMin: q["timeMin"] = a.timeMin
        if a.timeMax: q["timeMax"] = a.timeMax
        out = _api("GET", f"{BASE}/calendars/{quote(a.cal, safe='')}/events?{urlencode(q)}")
    elif a.cmd == "get":
        out = _api("GET", f"{BASE}/calendars/{quote(a.cal, safe='')}/events/{quote(a.eventId, safe='')}")
    elif a.cmd == "create":
        out = _api("POST", f"{BASE}/calendars/{quote(a.cal, safe='')}/events", body=json.loads(a.event))
    elif a.cmd == "freebusy":
        items = [{"id": c} for c in a.cals.split(",")]
        out = _api("POST", f"{BASE}/freeBusy", body={"timeMin": a.timeMin, "timeMax": a.timeMax, "items": items})
    json.dump(out, sys.stdout, ensure_ascii=False); sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
