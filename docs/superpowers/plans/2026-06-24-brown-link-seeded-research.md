# Brown — Link-Seeded Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Brown treat any incoming link as a *research seed* — resolve the link to text, research its theme, compile the findings into a wiki page, and catalog the seed link in Notion — replacing the old "archive the link as-is" capture.

**Architecture:** A new container skill `link-research` orchestrates existing pieces. A new `resolve.py` extracts *text only* (caption for carousels, transcript for reels) from Instagram/TikTok by reusing the already-mounted `read-post`/`watch` modules — no media, no Drive. The skill then defers to Brown's existing `research` skill, the `wiki` skill, and `notion_db.py`. Brown's persona switches the link mode; Consulta and the scope guardrail are unchanged.

**Tech Stack:** Python 3 (stdlib only) for scripts; container skills (Markdown SKILL.md + scripts); `gallery-dl`/`yt-dlp`/`ffmpeg` (already in the shared image); Firecrawl (MCP) + Tavily (CLI) + GitHub (`gh_search.py`) for research; Notion via `notion_db.py` (OneCLI-injected auth).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-24-brown-link-seeded-research-design.md` — every task implicitly inherits its decisions.
- **Brown agent group:** id `b335198d-2904-4b41-b92a-015cdc71c956`, folder `groups/brown`.
- **No new binaries / no image rebuild.** `gallery-dl`, `yt-dlp`, `ffmpeg` are already baked into the shared image (`container/Dockerfile`). Container skills live in `container/skills/` and are mounted read-only to `/app/skills` *in full* (`src/container-runner.ts:347`) at spawn — a new skill is live after a container **restart**, not a rebuild.
- **Python scripts: stdlib only, no `pip`/`pytest`** (not available in the container). Unit tests use stdlib `unittest`, runnable on the host with `python3`.
- **Lazy imports rule:** any import that only resolves on-container (`/app/skills/...`) MUST be inside the function that uses it, so the pure helpers stay importable for host-side unit tests.
- **Cookies are a secret:** `groups/<folder>/.watch-cookies.txt` is gitignored — never commit it.
- **Tone:** Brown's persona stays pt-br, sober, short. Reply to the owner only via the `jonas` destination.
- **Notion DB:** `Links — Biblioteca`, db key `links`, id `389481dd-f843-81b5-a077-e4a24e5fc438`. Schema file `groups/brown/migration/schema.brown.json`.

---

### Task 1: `resolve.py` — Instagram/TikTok text-only resolver

Extracts caption (carousel/photo) or transcript (reel/video) as plain text, reusing the proven `read-post`/`watch` modules but stopping at text — no media download to keep, no Drive upload. Pure helpers (`classify_type`, `parse_caption`) are unit-tested on the host; the network paths are covered by the live smoke test in Task 5.

**Files:**
- Create: `container/skills/link-research/scripts/resolve.py`
- Test: `container/skills/link-research/scripts/test_resolve.py`

**Interfaces:**
- Produces (consumed by Task 2's SKILL.md as a CLI):
  - CLI: `python3 /app/skills/link-research/scripts/resolve.py "<url>"` → prints to stdout a JSON object `{"platform": str, "type": "carousel"|"reel", "text": str, "source_url": str}`; exits non-zero with a one-line stderr message if no text could be extracted.
  - `classify_type(url: str) -> str` → `"reel"` or `"carousel"`.
  - `parse_caption(gallery_json: str) -> str` → caption text (or `""`).

- [ ] **Step 1: Write the failing test**

Create `container/skills/link-research/scripts/test_resolve.py`:

```python
import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import resolve  # noqa: E402


class TestClassifyType(unittest.TestCase):
    def test_reel_paths(self):
        for u in [
            "https://www.instagram.com/reel/Cabc123/",
            "https://instagram.com/reels/Xyz/",
            "https://www.tiktok.com/@user/video/7300000000000000000",
            "https://youtu.be/dQw4w9WgXcQ",
        ]:
            self.assertEqual(resolve.classify_type(u), "reel", u)

    def test_carousel_default(self):
        for u in [
            "https://www.instagram.com/p/Cabc123/",
            "https://www.instagram.com/username/",
        ]:
            self.assertEqual(resolve.classify_type(u), "carousel", u)


class TestParseCaption(unittest.TestCase):
    def test_extracts_description(self):
        data = json.dumps([[3, "https://img/1.jpg", {"description": "Texto da legenda aqui"}]])
        self.assertEqual(resolve.parse_caption(data), "Texto da legenda aqui")

    def test_falls_back_to_content_then_title(self):
        self.assertEqual(
            resolve.parse_caption(json.dumps([[3, "u", {"content": "via content"}]])),
            "via content",
        )
        self.assertEqual(
            resolve.parse_caption(json.dumps([[3, "u", {"title": "via title"}]])),
            "via title",
        )

    def test_empty_on_garbage_or_no_caption(self):
        self.assertEqual(resolve.parse_caption("not json"), "")
        self.assertEqual(resolve.parse_caption("[]"), "")
        self.assertEqual(resolve.parse_caption(json.dumps([[3, "u", {}]])), "")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 container/skills/link-research/scripts/test_resolve.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'resolve'` (the script doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `container/skills/link-research/scripts/resolve.py`:

```python
#!/usr/bin/env python3
"""Resolve an Instagram/TikTok link to TEXT only.

Carousel/photo -> caption (gallery-dl metadata, no media kept).
Reel/video     -> transcript (captions if present, else Whisper via the gateway).

This is Brown's *seed* extractor: the text feeds a research pass; the post itself
is never archived (no media download to keep, no Drive upload). It reuses the
modules mounted under /app/skills (read-post/gallery.py, watch/*) but stops at
text. Heavy imports are LAZY so the pure helpers stay unit-testable off-container.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

READ_POST = Path("/app/skills/read-post/scripts")
WATCH = Path("/app/skills/watch/scripts")


def classify_type(url: str) -> str:
    """'reel' for explicit video paths, else 'carousel'. Ambiguous Instagram
    /p/ links default to carousel; resolve_carousel handles a video /p/ by
    returning whatever caption gallery-dl exposes."""
    u = url.lower()
    if "/reel/" in u or "/reels/" in u or "/tv/" in u:
        return "reel"
    if "tiktok.com" in u and "/video/" in u:
        return "reel"
    if "youtube.com" in u or "youtu.be" in u:
        return "reel"
    return "carousel"


def parse_caption(gallery_json: str) -> str:
    """Pull the caption from gallery-dl `-j` output. gallery-dl emits a list of
    [kind, url, metadata] triples; the caption sits in the metadata dict under
    'description' (Instagram), else 'content', else 'title'."""
    try:
        data = json.loads(gallery_json or "[]")
    except json.JSONDecodeError:
        return ""
    for entry in data:
        if isinstance(entry, list) and len(entry) > 2 and isinstance(entry[2], dict):
            meta = entry[2]
            cap = meta.get("description") or meta.get("content") or meta.get("title")
            if cap:
                return str(cap).strip()
    return ""


def _ca_env() -> None:
    """gallery-dl/yt-dlp use requests/certifi -> trust the gateway CA."""
    ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("NODE_EXTRA_CA_CERTS")
    if ca and Path(ca).is_file():
        os.environ.setdefault("REQUESTS_CA_BUNDLE", ca)
        os.environ.setdefault("CURL_CA_BUNDLE", ca)


def resolve_carousel(url: str) -> str:
    """Caption only — gallery-dl metadata with --no-download."""
    sys.path.insert(0, str(READ_POST))
    import gallery  # lazy; only resolves on-container
    cookies = gallery.find_cookies()
    res = subprocess.run(
        gallery._base_cmd(cookies) + ["-j", "--no-download", url],
        capture_output=True, text=True, timeout=120,
    )
    return parse_caption(res.stdout)


def resolve_reel(url: str) -> str:
    """Transcript only — reuse the watch download+transcribe pipeline, skip
    frames and Drive. Mirrors read-post/archive.py's reel transcript path."""
    sys.path.insert(0, str(WATCH))
    import download as wdl  # lazy
    import transcribe as wtr  # lazy
    import whisper as wwh  # lazy

    work = Path(tempfile.mkdtemp(prefix="brown-resolve-"))
    dl = wdl.download(url, work / "dl")
    video = dl["video_path"]
    if dl.get("subtitle_path"):
        try:
            return wtr.format_transcript(wtr.parse_vtt(dl["subtitle_path"])).strip()
        except Exception as exc:  # noqa: BLE001
            print(f"[resolve] caption parse failed: {exc}", file=sys.stderr)
    segs, _backend = wwh.transcribe_video(video, work / "audio.mp3")
    return wtr.format_transcript(segs).strip()


def _platform(url: str) -> str:
    u = url.lower()
    if "instagram.com" in u:
        return "instagram"
    if "tiktok.com" in u:
        return "tiktok"
    if "youtube.com" in u or "youtu.be" in u:
        return "youtube"
    return "other"


def main() -> int:
    ap = argparse.ArgumentParser(description="Resolve an IG/TikTok link to text only.")
    ap.add_argument("url")
    args = ap.parse_args()

    _ca_env()
    kind = classify_type(args.url)
    text = resolve_reel(args.url) if kind == "reel" else resolve_carousel(args.url)
    if not text:
        print("[resolve] no text could be extracted (private post or expired cookies?)",
              file=sys.stderr)
        return 2
    print(json.dumps({
        "platform": _platform(args.url),
        "type": kind,
        "text": text,
        "source_url": args.url,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 container/skills/link-research/scripts/test_resolve.py`
Expected: PASS — `OK` (6 tests). The pure helpers import without touching `/app/skills`.

- [ ] **Step 5: Commit**

```bash
git add container/skills/link-research/scripts/resolve.py container/skills/link-research/scripts/test_resolve.py
git commit -m "feat(brown): resolve.py — IG/TikTok text-only link resolver (caption/transcript)"
```

---

### Task 2: `link-research` SKILL.md — orchestration procedure

The single entry point the persona points at for any incoming link. It is an instruction document (no code); it wires `resolve.py` → `research` → `wiki` → `notion_db.py`.

**Files:**
- Create: `container/skills/link-research/SKILL.md`

**Interfaces:**
- Consumes: `resolve.py` CLI (Task 1); the existing `research` skill (`/app/skills/research/SKILL.md`), `wiki` skill (`/app/skills/wiki/SKILL.md`), and `notion_db.py` (`/app/skills/notion-db/scripts/notion_db.py create-row links --json '<flat>'`).
- Produces: the documented flow Task 4's persona references by name (`link-research`).

- [ ] **Step 1: Write the SKILL.md**

Create `container/skills/link-research/SKILL.md` with exactly this content:

```markdown
---
name: link-research
description: Pesquisa a fundo a partir de um link. Quando o Jonas manda um link (Instagram/TikTok/site/YouTube), resolva o conteúdo do link em texto, use como semente pra pesquisar o tema, compile o resultado no wiki e catalogue o link-semente no Notion. NÃO arquiva o post — o link é referência, a pesquisa é o que vale.
---

# link-research — link como semente de pesquisa

O Jonas manda um link → você **pesquisa o tema por trás dele** e salva a pesquisa.
O post em si NÃO é arquivado; o link entra só como referência. Autônomo: não pergunte
antes — se ele mandar instrução junto ("vai a fundo em X disso"), ela direciona o foco.
Tom sóbrio e curto (igual ao resto do Brown). Responda sempre via `<message to="jonas">`.

## Fluxo

1. **Resolver o link → texto.**
   - **Instagram / TikTok** → `python3 /app/skills/link-research/scripts/resolve.py "<url>"`.
     Sai um JSON `{platform, type, text, source_url}`. O `text` é a legenda (carrossel) ou
     a transcrição (reel). Se o script sair com erro (post privado / cookie expirado),
     **avise em uma linha** e peça a legenda colada — não invente o conteúdo.
   - **Site / artigo / X** → `firecrawl_scrape` (MCP) na URL → markdown.
   - **YouTube** → `python3 /app/skills/save-link/scripts/yt_meta.py "<url>"` (título+descrição;
     se precisar da fala, use o resolve.py que cai no caminho de transcrição).

2. **Definir o tema.** Do texto resolvido, extraia o **tema central** (1 frase). Se o Jonas
   mandou instrução, ela manda — pesquise o que ele pediu, usando o link como referência.

3. **Pesquisar (profundidade média).** Siga a skill `research` (`/app/skills/research/SKILL.md`):
   GitHub (`gh_search.py`), Firecrawl (`firecrawl_search`), Tavily (`tvly search --json`).
   Junte/deduplique, fique com as **5–6 melhores fontes**, abra/resuma as 2–3 mais fortes.

4. **Compilar no wiki.** Siga a skill `wiki` (`/app/skills/wiki/SKILL.md`): destile a pesquisa
   numa página `wiki/topicos/<tema-em-kebab>.md` (essência + cross-refs), e registre em
   `wiki/log.md`. É isso que a Consulta vai ler depois — compile, não cole resultado cru.

5. **Catalogar no Notion** (`Links — Biblioteca`, db key `links`). Antes, dedup:
   `python3 /app/skills/save-link/scripts/linkinfo.py "<url>"` dá a `url_key`; cheque se já
   existe (`notion_db.py query links --filter url_key=<key>`).
   - **Novo** → cria a entrada:
     ```
     python3 /app/skills/notion-db/scripts/notion_db.py create-row links --json '{
       "title": "<tema>", "url": "<source_url>", "url_key": "<key>",
       "categoria": "Pesquisa",
       "resumo": "<abstract curto da pesquisa>",
       "nota": "wiki/topicos/<tema-em-kebab>.md",
       "tags": ["<tag1>", "<tag2>"]
     }'
     ```
     Tags: reuse `/workspace/agent/tags.md` (leia antes; crie tag nova só se nada serve).
   - **Já existe** → **atualize** a página do wiki e a entrada (`notion_db.py update links
     --match url_key=<key> --json '{...}'`) e avise "já tinha pesquisado isso, atualizei".

6. **Relatar.** Uma mensagem pro Jonas: o que a pesquisa achou (2–4 pontos), e onde salvou
   (página do wiki + entrada no Notion). Sem encher — entregue e pare.

## Notas

- Vários links numa mensagem → trate cada um como sua própria pesquisa+entrada, em sequência.
- Categoria `Pesquisa` é criada sozinha no Notion na primeira `create-row` (a API cria a opção
  de select ao gravar um valor novo).
- Antes do primeiro `tvly` na sessão: `export REQUESTS_CA_BUNDLE="$SSL_CERT_FILE" CURL_CA_BUNDLE="$SSL_CERT_FILE"`.
```

- [ ] **Step 2: Verify the SKILL.md is well-formed**

Run: `head -5 container/skills/link-research/SKILL.md`
Expected: shows the YAML frontmatter with `name: link-research` and a `description:` line.

- [ ] **Step 3: Commit**

```bash
git add container/skills/link-research/SKILL.md
git commit -m "feat(brown): link-research SKILL.md — resolve → research → wiki + Notion"
```

---

### Task 3: Brown infra wiring — cookies, skills list, Notion `Pesquisa` option

Give Brown the cookies its resolver needs, advertise the new skill, and document the new Notion category. No image rebuild (binaries already present; skills mounted in full).

**Files:**
- Create: `groups/brown/.watch-cookies.txt` (copy of Caio's — **not committed**, gitignored)
- Modify: `groups/brown/container.json` (add `link-research` to `skills`)
- Modify: `groups/brown/migration/schema.brown.json` (add `"Pesquisa"` to `categoria.options`)

**Interfaces:**
- Consumes: `groups/content-machine/.watch-cookies.txt` (existing source cookies).
- Produces: a Brown container that, on next spawn, has `/workspace/agent/.watch-cookies.txt` (so `gallery.find_cookies()` resolves) and advertises `link-research` in its CLAUDE.md.

- [ ] **Step 1: Copy the cookies file into Brown's group folder**

Run:
```bash
cp groups/content-machine/.watch-cookies.txt groups/brown/.watch-cookies.txt
git check-ignore groups/brown/.watch-cookies.txt
```
Expected: the `cp` succeeds; `git check-ignore` prints the path (confirming it is gitignored — it will NOT be committed).

- [ ] **Step 2: Add `link-research` to Brown's skills list**

In `groups/brown/container.json`, change the `skills` array from:
```json
  "skills": [
    "save-link",
    "research",
    "notion-db",
    "wiki",
    "tavily",
    "onecli-gateway",
    "self-customize"
  ],
```
to (insert `"link-research"` first):
```json
  "skills": [
    "link-research",
    "save-link",
    "research",
    "notion-db",
    "wiki",
    "tavily",
    "onecli-gateway",
    "self-customize"
  ],
```
(`save-link` stays — its Consulta path is still used; only the persona's *capture* wording is retired in Task 4.)

- [ ] **Step 3: Add the `Pesquisa` category to the schema file**

In `groups/brown/migration/schema.brown.json`, in `databases.links.properties.categoria.options`, append `"Pesquisa"` so the array reads:
```json
                    "options": [
                        "Repo Git",
                        "Inspiração Site",
                        "Artigo",
                        "Ferramenta",
                        "Vídeo",
                        "Doc/Referência",
                        "Outro",
                        "Pesquisa"
                    ]
```
(The live Notion DB auto-creates this select option on the first `create-row` with `categoria: "Pesquisa"`; this keeps the documented schema in sync.)

- [ ] **Step 4: Verify both JSON files are still valid**

Run:
```bash
python3 -c "import json; json.load(open('groups/brown/container.json')); json.load(open('groups/brown/migration/schema.brown.json')); print('json ok')"
```
Expected: `json ok`.

- [ ] **Step 5: Commit (config only — cookies excluded by gitignore)**

```bash
git add groups/brown/container.json groups/brown/migration/schema.brown.json
git commit -m "chore(brown): wire link-research skill + add Pesquisa Notion category"
```

---

### Task 4: Persona — switch the link mode to research

Flip `CLAUDE.local.md` so a link triggers `link-research` instead of capture. Consulta and the scope guardrail are untouched.

**Files:**
- Modify: `groups/brown/CLAUDE.local.md`

- [ ] **Step 1: Update the mode bullets in the guardrail section**

In `groups/brown/CLAUDE.local.md`, replace this bullet:
```
- Mensagem com link(s) → modo **captura** (salva).
```
with:
```
- Mensagem com link(s) → modo **pesquisa-com-semente** (resolve o link → pesquisa o tema → salva wiki + Notion). NÃO arquiva o post; o link é só referência.
```

- [ ] **Step 2: Replace the "Como trabalhar" body**

Replace the whole `## Como trabalhar` section (from its heading through the numbered list ending at the `research` item) with:

```markdown
## Como trabalhar

Para **link**, use a skill `link-research` (`/app/skills/link-research/SKILL.md`) — o passo a
passo completo está lá. Resumo: resolve o link em texto (IG/TikTok via `resolve.py`; site/X via
firecrawl; YouTube via `yt_meta.py`) → infere o tema (ou usa a instrução do Jonas) → pesquisa a
fundo (skill `research`: GitHub + Firecrawl + Tavily, 5–6 fontes) → compila no `wiki/topicos/` →
cataloga no Notion (`Links — Biblioteca`, categoria **`Pesquisa`**, `nota` aponta pra página do
wiki, dedup por `url_key`) → relata numa mensagem. Autônomo, sem perguntar antes.

Para **consulta** ("tenho algo sobre X?"): busque no Notion + leia seu `wiki/` e os
`extra/wikis/*` → responda com os 2–3 mais relevantes + link (skill `save-link` tem o detalhe da
consulta).
```

- [ ] **Step 3: Verify the edits landed and nothing else changed**

Run:
```bash
grep -n "pesquisa-com-semente\|link-research\|Pesquisa" groups/brown/CLAUDE.local.md
grep -n "Escopo travado\|consulta" groups/brown/CLAUDE.local.md
```
Expected: first grep shows the new mode bullet + the Como-trabalhar reference; second grep confirms the guardrail heading and Consulta survived.

- [ ] **Step 4: Commit**

```bash
git add groups/brown/CLAUDE.local.md
git commit -m "feat(brown): persona — link triggers research-from-seed, capture retired"
```

---

### Task 5: Deploy + live smoke test

No image rebuild. Restart Brown's container so it re-materializes `container.json`, mounts the new skill, picks up the cookies file, and reloads the persona. Then verify end-to-end with real links (owner-run on Telegram, since it touches cookies, Whisper, Notion writes, and the live agent).

**Files:** none (operational).

- [ ] **Step 1: Restart Brown's container**

Run:
```bash
./bin/ncl groups restart --id b335198d-2904-4b41-b92a-015cdc71c956
```
Expected: JSON like `{"restarted": 0|1, ...}`. (`0` just means no container was running; the next message spawns a fresh one with the new skill/persona/cookies. No `--rebuild` needed.)

- [ ] **Step 2: Smoke test — carousel (owner, on Telegram)**

Ask the owner to send Brown a real **Instagram carousel** link (no instruction). Expected agent behavior, verifiable in the logs and stores:
- Brown resolves the caption (no Drive upload, no media saved).
- Brown researches the theme and compiles `groups/brown/wiki/topicos/<tema>.md` (+ a `wiki/log.md` entry).
- A Notion row appears in `Links — Biblioteca` with `categoria=Pesquisa`, `url` = the link, `nota` = the wiki path.
- Brown replies with one message: findings + where it saved.

Verify the Notion row:
```bash
# inside any check — confirm the entry exists with the new category
./bin/ncl sessions list   # find Brown's session id if you want to inspect its outbound.db
```
And confirm the wiki page was written:
```bash
ls -t groups/brown/wiki/topicos/ | head -3
```

- [ ] **Step 3: Smoke test — reel + steering instruction**

Owner sends an **Instagram reel** link **with** an instruction (e.g. "vai a fundo no método disso"). Expected: Brown transcribes the reel (Whisper via gateway), researches the *instructed* angle, saves wiki + Notion, reports. Confirms the transcript path and instruction steering.

- [ ] **Step 4: Smoke test — dedup + guardrail**

- Owner re-sends the **same** carousel link → Brown updates the existing wiki page + Notion row and says it already had it (no duplicate row: re-check `topicos/` and Notion).
- Owner sends a **non-link** message (e.g. "qual a capital da França?") → Brown refuses in one line and restates its scope (guardrail intact).

- [ ] **Step 5: Confirm no Telegram delivery regressions**

Run:
```bash
grep -c "parse entities" logs/nanoclaw.error.log
```
Expected: no *new* parse-entity errors for Brown after the test (the merged plain-text fallback covers any that occur). If the reply arrived in Telegram, delivery is healthy.

---

## Self-Review

**Spec coverage:**
- Trigger = every link → research (decision 1): Task 4 persona + Task 2 SKILL.md. ✓
- Autonomous, instruction steers (decision 2): SKILL.md step 2 + persona "Autônomo, sem perguntar antes". ✓
- Output both, cross-linked (decision 3): SKILL.md steps 4–5 (wiki page + Notion `nota` pointer). ✓
- Own lightweight resolver, text-only (decision 4): Task 1 `resolve.py` (no Drive, caption/transcript). ✓
- Moderate depth via existing `research` (decision 5): SKILL.md step 3. ✓
- Wiki page + Notion `Pesquisa` entry, dedup: Task 2 step 1 (steps 4–5) + Task 3 step 3. ✓
- Resolution-failure → ask for pasted caption: SKILL.md step 1 + `resolve.py` exit 2. ✓
- Scope guardrail / Consulta unchanged: Task 4 keeps both. ✓
- Infra (cookies, binaries already present, skill mounted): Task 3 + Global Constraints. ✓
- Reel cost accepted: SKILL.md (Whisper path) + smoke Step 3. ✓
- Telegram delivery protected: smoke Step 5. ✓

**Placeholder scan:** No TBD/TODO; all code and SKILL.md content is literal; `<tema>`/`<url>`/`<key>` are runtime values the agent fills, documented in context. ✓

**Type consistency:** `classify_type`/`parse_caption` names match between `resolve.py` and `test_resolve.py`; `resolve.py` CLI JSON keys (`platform`/`type`/`text`/`source_url`) match the SKILL.md's step-1 description; `notion_db.py create-row links --json` matches the actual CLI (`container/skills/notion-db/scripts/notion_db.py:378`); watch APIs used (`download.download`, `transcribe.parse_vtt`/`format_transcript`, `whisper.transcribe_video`) match `container/skills/watch/scripts/*`. ✓
