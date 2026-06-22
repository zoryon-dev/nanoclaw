# Caio Content Manager — Subsystem G (Brand Materials Hub) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Notion `Materiais — Marca` DB + a brand-filtered hub page, give Caio a `notion_asset.py` writer to catalog reusable brand assets, and seed it with the existing Zoryon/Faryon assets (giving `arquivos-empresa/` a durable home in Drive).

**Architecture:** Notion is the navigable index; Google Drive is the canonical file home; R2 hosts only public-needed assets. The host creates the Notion DB + hub page via the claude.ai Notion MCP. Caio's gateway-only scripts (`drive_upload.py`/`r2_upload.py`/`notion_asset.py`) do all file/row writes — so the seed runs inside Caio's container, driven by one deterministic on-wake instruction, and is verified from the host afterward.

**Tech Stack:** Notion API (claude.ai Notion MCP for DDL/pages; `curl`+gateway for `notion_asset.py`), Python 3 (`container/skills/read-post/scripts/`), Google Drive native OAuth (`drive_upload.py`), Cloudflare R2 v4 (`r2_upload.py`), OneCLI gateway, `ncl` CLI.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-22-caio-content-manager-G-hub-materiais-design.md`.
- Caio agent group id: `ag-1776256973199-ukacj8` (folder `content-machine`). Caio's workspace = `/workspace/agent` = host `groups/content-machine/`.
- Notion parent page **"Base | Nanoclaw"**: `386481dd-f843-800b-a775-d273d47e9ea1`. The Notion OAuth integration only sees pages shared with it — create the DB and hub page **under this parent** so Caio's gateway access works with no per-agent grant.
- Existing DBs (do not modify): `Referências — Conteúdo` data source `386481dd-f843-8101-b564-000bfa3038d7`; `Carrosséis — Entregas` DB `94603584-af9a-4f9e-b190-cc8e4bac7f4c`. Both already carry a `Marca` select.
- **Gateway-only scripts:** `notion_asset.py`, `drive_upload.py`, `r2_upload.py` send NO `Authorization` header and depend on the OneCLI gateway — they run ONLY inside Caio's container, never from the host. Host-side Notion work uses the claude.ai Notion MCP (its own auth).
- **No manual `ntn_…` Notion token** in the vault — it collides with the OAuth injection.
- Skills are mounted RO (`container/skills` → `/app/skills`, `src/container-runner.ts:346`) — script changes are live on Caio's next spawn; no image rebuild.
- `Marca` options everywhere: `Zoryon` · `Faryon` · `Geral`.
- Install-specific (gitignored, never committed): the Notion DB/page, Drive files, R2 objects, `read-post-targets.json`, `system-prompt.md`, `CLAUDE.local.md`, `arquivos-empresa/`, any `groups/content-machine/seed-materiais/` staging. Committable: `notion_asset.py`, `read-post/SKILL.md`, this plan, the spec.
- Date stamp: `2026-06-22`.

---

### Task 1: Create the `Materiais — Marca` Notion DB

**Files:** none on disk (live Notion). Records the new data-source id into the next tasks.

**Interfaces:**
- Produces: DB `Materiais — Marca` under "Base | Nanoclaw" + its **data-source id** (used by `notion_asset.py` in Task 2 and the hub views in Task 5).

- [ ] **Step 1: Create the DB via the claude.ai Notion MCP**

Use `mcp__claude_ai_Notion__notion-create-database` with parent page id `386481dd-f843-800b-a775-d273d47e9ea1`, title `Materiais — Marca`, and these properties:
- `Material` — title
- `Marca` — select: `Zoryon` (blue), `Faryon` (orange), `Geral` (gray)
- `Tipo` — select: `Logo`, `Brand book`, `Design tokens`, `Paleta`, `Tipografia`, `Doc oficial`, `Template`, `Brand-ref`, `Outro`
- `Arquivo (Drive)` — url
- `URL pública (R2)` — url
- `Formato` — select: `SVG`, `PNG`, `PDF`, `CSS`, `MD`, `JSON`, `Outro`
- `Notas` — text (rich_text)

If `notion-create-database` cannot set all selects at creation, create with `Material`+`Marca`, then `mcp__claude_ai_Notion__notion-update-data-source` with DDL:
```
ADD COLUMN "Tipo" SELECT('Logo':blue,'Brand book':purple,'Design tokens':green,'Paleta':pink,'Tipografia':yellow,'Doc oficial':gray,'Template':brown,'Brand-ref':red,'Outro':default); ADD COLUMN "Arquivo (Drive)" URL; ADD COLUMN "URL pública (R2)" URL; ADD COLUMN "Formato" SELECT('SVG':blue,'PNG':green,'PDF':red,'CSS':purple,'MD':gray,'JSON':yellow,'Outro':default); ADD COLUMN "Notas" RICH_TEXT
```

- [ ] **Step 2: Capture the database id and data-source id**

Run `mcp__claude_ai_Notion__notion-fetch` with the new DB's id (or URL). From the response record:
- the **database id** (the `notion.so/p/<hex>` id, dash-formatted) → for `notion_asset.py`.
- the **data-source id** (`collection://<uuid>`) → for the hub views.

Expected: schema shows all 7 properties with the exact option sets above. Note both ids in the ledger; later tasks reference them as `<MATERIAIS_DB_ID>` and `<MATERIAIS_DS_ID>`.

- [ ] **Step 3: Verify it is visible under the right parent**

Confirm the fetch shows `<parent-page ... title="Base | Nanoclaw"/>`. If not, move it under that parent (it must share the integration's access). No commit (live Notion).

---

### Task 2: `notion_asset.py` deterministic writer

**Files:**
- Create: `container/skills/read-post/scripts/notion_asset.py`
- Test: `container/skills/read-post/scripts/test_notion_asset.py`
- Modify: `container/skills/read-post/SKILL.md` (document the asset-catalog flow)

**Interfaces:**
- Consumes: `<MATERIAIS_DB_ID>` from Task 1 (baked in, like `notion_row.py`'s DB id).
- Produces: `notion_asset.py --material … --marca … --tipo … [--drive …] [--r2 …] [--formato …] [--notas …] [--dry-run]` → prints the created page URL (or, with `--dry-run`, the payload JSON and exits 0 without POSTing). Used by the seed (Task 4) and Caio (Task 3).

- [ ] **Step 1: Write the failing payload test**

`--dry-run` lets the payload be tested on the host (no gateway). Create `container/skills/read-post/scripts/test_notion_asset.py`:
```python
import json, subprocess, sys, pathlib
SCRIPT = str(pathlib.Path(__file__).with_name("notion_asset.py"))

def _dry(*args):
    out = subprocess.run([sys.executable, SCRIPT, "--dry-run", *args],
                         capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)

def test_payload_has_required_props():
    p = _dry("--material", "Logo Zoryon white", "--marca", "zoryon",
             "--tipo", "Logo", "--drive", "https://drive.google.com/x",
             "--formato", "svg", "--notas", "logo principal")
    props = p["properties"]
    assert props["Material"]["title"][0]["text"]["content"] == "Logo Zoryon white"
    assert props["Marca"]["select"]["name"] == "Zoryon"     # normalized
    assert props["Tipo"]["select"]["name"] == "Logo"
    assert props["Formato"]["select"]["name"] == "SVG"      # normalized upper
    assert props["Arquivo (Drive)"]["url"] == "https://drive.google.com/x"
    assert props["Notas"]["rich_text"][0]["text"]["content"] == "logo principal"
    assert "URL pública (R2)" not in props                  # omitted when absent

def test_r2_included_when_given():
    p = _dry("--material", "Brand ref", "--marca", "Geral", "--tipo", "Brand-ref",
             "--r2", "https://bucket-nanoclaw.zoryon.co/x.png")
    assert p["properties"]["URL pública (R2)"]["url"] == "https://bucket-nanoclaw.zoryon.co/x.png"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 -m pytest container/skills/read-post/scripts/test_notion_asset.py -q` (or `python3 container/skills/read-post/scripts/test_notion_asset.py` if pytest absent — then add an `if __name__` runner). 
Expected: FAIL — `notion_asset.py` does not exist yet.

- [ ] **Step 3: Write `notion_asset.py`**

Mirror `notion_delivery.py` structure (no auth header; gateway injects). Create `container/skills/read-post/scripts/notion_asset.py`:
```python
#!/usr/bin/env python3
"""Create one row in the "Materiais — Marca" Notion database.

Sibling of notion_row.py / notion_delivery.py. Catalogs a reusable BRAND ASSET
(logo, brand book, design tokens, paleta, doc oficial, template, brand-ref).
The file itself lives in Drive (and optionally R2 for a public URL); this row
is the navigable index entry.

Auth: none here — the container runs under the OneCLI gateway, which injects the
Notion OAuth bearer for api.notion.com. We send NO Authorization header.

Usage:
  notion_asset.py --material "Logo Zoryon white" --marca Zoryon --tipo Logo \
    --drive "https://drive.google.com/..." --formato svg --notas "logo principal"
  (--r2 for a public URL; --dry-run prints the payload and exits without POSTing)
Prints the created page URL on success.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile

NOTION_VERSION = "2022-06-28"
# Target database: "Materiais — Marca" under "Base | Nanoclaw".
DATABASE_ID = "<MATERIAIS_DB_ID>"  # from Task 1
API = "https://api.notion.com/v1/pages"

TEXT_LIMIT = 2000

MARCA = {"zoryon": "Zoryon", "faryon": "Faryon", "geral": "Geral"}
TIPO = {t.lower(): t for t in (
    "Logo", "Brand book", "Design tokens", "Paleta", "Tipografia",
    "Doc oficial", "Template", "Brand-ref", "Outro")}
FORMATO = {f.lower(): f for f in ("SVG", "PNG", "PDF", "CSS", "MD", "JSON", "Outro")}


def _norm(table: dict[str, str], value: str | None) -> str | None:
    if not value:
        return None
    return table.get(value.strip().lower(), value.strip())


def _rt(text: str) -> list[dict]:
    text = text or ""
    return [{"type": "text", "text": {"content": text[i:i + TEXT_LIMIT]}}
            for i in range(0, max(len(text), 1), TEXT_LIMIT)]


def build_payload(args) -> dict:
    props: dict = {
        "Material": {"title": [{"text": {"content": args.material[:2000]}}]},
        "Marca": {"select": {"name": _norm(MARCA, args.marca) or args.marca.strip()}},
    }
    tipo = _norm(TIPO, args.tipo)
    if tipo:
        props["Tipo"] = {"select": {"name": tipo}}
    if args.drive:
        props["Arquivo (Drive)"] = {"url": args.drive}
    if args.r2:
        props["URL pública (R2)"] = {"url": args.r2}
    formato = _norm(FORMATO, args.formato)
    if formato:
        props["Formato"] = {"select": {"name": formato}}
    if args.notas:
        props["Notas"] = {"rich_text": _rt(args.notas)}
    return {"parent": {"database_id": DATABASE_ID}, "properties": props}


def main() -> int:
    ap = argparse.ArgumentParser(prog="notion_asset",
                                 description="Catalog a brand asset in the Materiais Notion DB.")
    ap.add_argument("--material", required=True, help="asset name (row title)")
    ap.add_argument("--marca", required=True, help="Zoryon | Faryon | Geral")
    ap.add_argument("--tipo", required=True, help="Logo|Brand book|Design tokens|Paleta|Tipografia|Doc oficial|Template|Brand-ref|Outro")
    ap.add_argument("--drive", help="canonical Drive link")
    ap.add_argument("--r2", help="public R2 URL (optional)")
    ap.add_argument("--formato", help="SVG|PNG|PDF|CSS|MD|JSON|Outro")
    ap.add_argument("--notas", help="what it is / when to use")
    ap.add_argument("--dry-run", action="store_true", help="print payload JSON and exit (no POST)")
    args = ap.parse_args()

    payload = build_payload(args)
    if args.dry_run:
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
        payload_path = fh.name

    out = subprocess.run(
        ["curl", "-s", "-X", "POST", API,
         "-H", f"Notion-Version: {NOTION_VERSION}",
         "-H", "Content-Type: application/json",
         "--data", f"@{payload_path}"],
        capture_output=True, text=True,
    ).stdout

    try:
        d = json.loads(out)
    except json.JSONDecodeError:
        print(f"ERRO: resposta não-JSON do Notion:\n{out[:500]}", file=sys.stderr)
        return 1
    if d.get("object") == "page":
        print(d.get("url", "(sem url)"))
        return 0
    print(f"ERRO Notion: {d.get('code')} — {d.get('message', '')[:300]}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
```
Replace `<MATERIAIS_DB_ID>` with the dash-formatted database id captured in Task 1.

- [ ] **Step 4: Run the test to verify it passes**

Run: `python3 -m pytest container/skills/read-post/scripts/test_notion_asset.py -q`
Expected: PASS (2 tests). Also run `python3 -m py_compile container/skills/read-post/scripts/notion_asset.py` → no output.

- [ ] **Step 5: Document the flow in SKILL.md**

Add a short section to `container/skills/read-post/SKILL.md` (after the references section) explaining the asset-catalog flow: assets go to Drive via `drive_upload.py` (+ `r2_upload.py` if a public URL is needed), then `notion_asset.py` records the row in "Materiais — Marca". One example invocation. Note it is distinct from `/read-post` (external refs) and `notion_delivery.py` (produced carousels).

- [ ] **Step 6: Commit**

```bash
git add container/skills/read-post/scripts/notion_asset.py container/skills/read-post/scripts/test_notion_asset.py container/skills/read-post/SKILL.md
git commit -m "feat(read-post): notion_asset.py — catalog brand assets in Materiais Notion DB

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Teach Caio the asset-catalog behavior

**Files:**
- Modify: `groups/content-machine/system-prompt.md` (gitignored)
- Modify: `groups/content-machine/CLAUDE.local.md` (gitignored)

**Interfaces:**
- Consumes: `notion_asset.py` (Task 2), the Drive `Materiais — Marca` layout, `r2_upload.py`.

- [ ] **Step 1: Add the cataloging instruction to system-prompt.md**

In the "Arquivamento de conteúdo (/watch + /read-post)" section of `groups/content-machine/system-prompt.md`, add a bullet:
```markdown
- **Catalogar material de marca** — quando o Jonas mandar (ou você produzir) um asset reutilizável de marca (logo, brand book, design tokens, paleta, doc oficial, template), registre no hub: suba o arquivo pro Drive em `Materiais — Marca / <Zoryon|Faryon|Geral>` (`drive_upload.py --parent-name "Materiais — Marca" --subfolder "<marca>" <arquivo>`); se precisar de URL pública (imagem pra web/IG, brand-ref do Magnific), suba também no R2 (`r2_upload.py`); então registre a linha com `notion_asset.py --material … --marca … --tipo … --drive … [--r2 …] --formato … --notas …`. Isso é distinto de `/read-post` (referências de fora) e do log de entregas (carrosséis que você produz).
```

- [ ] **Step 2: Add a one-liner to CLAUDE.local.md**

In the "Registro da criação" area of `groups/content-machine/CLAUDE.local.md`, add: a third Notion flow — **MATERIAIS** (`notion_asset.py` → "Materiais — Marca"): assets de marca reutilizáveis (logo/brand book/tokens/doc), arquivo no Drive `Materiais — Marca/<marca>` + R2 se público. Distinto de Referências (`/read-post`) e Entregas (`notion_delivery.py`). Hub navegável "Materiais & Conteúdo — por Marca" junta os três por marca.

- [ ] **Step 3: Verify**

Run: `grep -n "notion_asset\|Materiais — Marca" groups/content-machine/system-prompt.md groups/content-machine/CLAUDE.local.md`
Expected: the new lines present in both files. (No commit — gitignored.)

---

### Task 4: Stage + seed the existing brand assets (via Caio's gateway)

**Files:**
- Create (staging, gitignored): `groups/content-machine/seed-materiais/{zoryon,faryon}/…` (curated copies)
- Result: Drive folders `Materiais — Marca/{Zoryon,Faryon}`, R2 objects for public assets, rows in the `Materiais — Marca` DB.

**Interfaces:**
- Consumes: `notion_asset.py`, `drive_upload.py`, `r2_upload.py` (gateway), the curated asset subset.
- Produces: a populated hub (read back in Task 5/6).

- [ ] **Step 1: Stage the curated asset subset into Caio's workspace**

```bash
cd /root/nanoclaw
mkdir -p groups/content-machine/seed-materiais/zoryon groups/content-machine/seed-materiais/faryon
Z=arquivos-empresa/zoryon-brand; F=arquivos-empresa/faryon-brand
cp "$Z/BRAND/logo-zoryon-white.svg" "$Z/BRAND/logo-zoryon-white-v2.svg" \
   "$Z/BRAND/design-tokens.css" "$Z/BRAND/zoryon-brand-book.html" \
   "$Z/DOCS-OFICIAIS/02-posicionamento-marca.md" "$Z/DOCS-OFICIAIS/01-business-overview.md" \
   "$Z/BRAND/brand-voice-guide.md" groups/content-machine/seed-materiais/zoryon/ 2>&1
cp groups/content-machine/brand/zoryon-brand-ref.png groups/content-machine/seed-materiais/zoryon/ 2>&1
cp "$F/BRAND/logo.svg" "$F/BRAND/logo-reverso.svg" "$F/BRAND/icon.svg" \
   "$F/BRAND/design-tokens.css" "$F/BRAND/paleta.json" \
   "$F/00-RESUMO-EXECUTIVO.md" "$F/07-Naming-e-Marca/NAMING-HANDOFF.md" \
   "$F/BRAND/brand-voice-guide.md" groups/content-machine/seed-materiais/faryon/ 2>&1
echo "zoryon: $(ls groups/content-machine/seed-materiais/zoryon | wc -l) | faryon: $(ls groups/content-machine/seed-materiais/faryon | wc -l)"
```
Expected: `zoryon: 8 | faryon: 8`. If a path is missing, locate it (`ls "$Z/BRAND"`) and adjust before continuing. These are the curated assets (logos, design tokens, brand book, palette, 2–3 headline docs/voice guide per brand, + the Zoryon brand-ref board). The staging dir is gitignored.

- [ ] **Step 2: Compose the deterministic seed instruction for Caio**

Build the on-wake message. It must list, per asset, the exact three commands (Drive upload → capture link; R2 upload only for the public set = both logos + brand-ref; `notion_asset.py` with the captured links). The asset → (Tipo, Formato, public?) mapping:

| File (in `/workspace/agent/seed-materiais/<marca>/`) | Marca | Tipo | Formato | R2? |
|---|---|---|---|---|
| `logo-zoryon-white.svg`, `logo-zoryon-white-v2.svg` | Zoryon | Logo | SVG | yes |
| `design-tokens.css` | Zoryon | Design tokens | CSS | no |
| `zoryon-brand-book.html` | Zoryon | Brand book | Outro | no |
| `02-posicionamento-marca.md` | Zoryon | Doc oficial | MD | no |
| `01-business-overview.md` | Zoryon | Doc oficial | MD | no |
| `brand-voice-guide.md` | Zoryon | Doc oficial | MD | no |
| `zoryon-brand-ref.png` | Zoryon | Brand-ref | PNG | yes |
| `logo.svg`, `logo-reverso.svg`, `icon.svg` | Faryon | Logo | SVG | yes (logo.svg only) |
| `design-tokens.css` | Faryon | Design tokens | CSS | no |
| `paleta.json` | Faryon | Paleta | JSON | no |
| `00-RESUMO-EXECUTIVO.md` | Faryon | Doc oficial | MD | no |
| `NAMING-HANDOFF.md` | Faryon | Doc oficial | MD | no |
| `brand-voice-guide.md` | Faryon | Doc oficial | MD | no |

The instruction template (per asset), to be filled into the message:
```
Para cada arquivo abaixo: 1) drive_upload.py --parent-name "Materiais — Marca" --subfolder "<marca>" <arquivo>  → guarde o link impresso;
2) (só onde R2=yes) r2_upload.py <arquivo> → guarde a URL pública;
3) notion_asset.py --material "<nome>" --marca <marca> --tipo "<tipo>" --drive "<link drive>" [--r2 "<url>"] --formato <formato> --notas "<1 linha>"
Reporte os links das páginas Notion criadas.
```

- [ ] **Step 3: Run the seed through Caio (real gateway path)**

```bash
cd /root/nanoclaw
./bin/ncl groups restart --id ag-1776256973199-ukacj8 --message "<seed instruction from Step 2>"
```
This wakes Caio fresh with the seed task; he runs the gateway scripts (the only context with Drive/R2/Notion injection). Watch his outbound for the created page URLs.
Expected: Caio reports ~13 Notion page URLs + Drive links; R2 URLs for the 3 public assets.

- [ ] **Step 4: Verify the seed from the host**

Query the `Materiais — Marca` DB via `mcp__claude_ai_Notion__notion-query-data-sources` (data source `<MATERIAIS_DS_ID>`):
Expected: ~13 rows; each has `Marca`, `Tipo`, `Arquivo (Drive)` set; the 3 public assets have `URL pública (R2)`. Spot-check brand split: Zoryon ~7, Faryon ~6. Also confirm the Drive folder via `mcp__claude_ai_Google_Drive__search_files` for `Materiais — Marca`. If a row failed, re-send just that asset's 3 commands to Caio.

- [ ] **Step 5: Remove the staging dir**

```bash
cd /root/nanoclaw && rm -rf groups/content-machine/seed-materiais
```
The files now live in Drive (canonical) + Notion (index). No commit (everything here is gitignored / live).

---

### Task 5: Build the hub page (brand-filtered views)

**Files:** none on disk (live Notion).

**Interfaces:**
- Consumes: the three data sources — `Materiais` (`<MATERIAIS_DS_ID>`), `Referências` (`386481dd-f843-8101-b564-000bfa3038d7`), `Entregas` (`94603584-af9a-4f9e-b190-cc8e4bac7f4c`).
- Produces: page `Materiais & Conteúdo — por Marca` under "Base | Nanoclaw".

- [ ] **Step 1: Create the hub page**

Use `mcp__claude_ai_Notion__notion-create-pages` under parent `386481dd-f843-800b-a775-d273d47e9ea1`, title `Materiais & Conteúdo — por Marca`, with two top-level sections (`## Zoryon`, `## Faryon`), each containing linked-database views of the three DBs filtered `Marca = <section brand>`. If the MCP cannot create filtered linked views programmatically, create the page with the section headings + a short intro per section, then add the three linked views per section through the same MCP's view tools (`notion-create-view` / `notion-update-view`) targeting each data source with a `Marca` filter.

- [ ] **Step 2: Verify**

`mcp__claude_ai_Notion__notion-fetch` the page. Expected: two brand sections, each surfacing Materiais + Referências + Entregas filtered to that brand (Zoryon section shows only Zoryon rows, etc.). No commit (live Notion).

---

### Task 6: Wire config, update memory, hand off live smoke

**Files:**
- Modify: `groups/content-machine/read-post-targets.json` (gitignored)
- Modify: `/root/.claude/projects/-root-nanoclaw/memory/project_caio_content_manager.md`

**Interfaces:**
- Consumes: ids/links from Tasks 1, 4, 5.

- [ ] **Step 1: Cache the hub ids in read-post-targets.json**

Add keys: `materiais_database_id` (`<MATERIAIS_DB_ID>`), `materiais_drive_root` (the Drive `Materiais — Marca` folder id from Task 4), `hub_page_url` (Task 5). Edit the JSON in place; keep existing keys.
Run: `python3 -c "import json;json.load(open('groups/content-machine/read-post-targets.json'))"` → no error (valid JSON).

- [ ] **Step 2: Update the initiative memory**

Append a `Subsystem G (materials hub)` block to `project_caio_content_manager.md`: DB `Materiais — Marca` (id), hub page, `notion_asset.py` (committed), seeded N assets across Zoryon/Faryon, Drive `Materiais — Marca` canonical home, R2 for public assets, `read-post-targets.json` keys. Note the three Notion flows (Referências/Entregas/Materiais) + the hub that unifies them by brand. Link `[[project-watch-skill]]`.

- [ ] **Step 3: Hand off the live smoke (user-side)**

Tell Jonas to test in the Caio DM: (a) "cataloga esse asset da Faryon: <link/arquivo>" → Caio uploads + creates a Materiais row; (b) "me mostra os materiais da Zoryon" → Caio points to the hub / lists Materiais filtered by brand. This exercises `notion_asset.py` + the cataloging instruction end-to-end on the live channel.

---

## Self-Review

**Spec coverage:**
- DB `Materiais — Marca` (schema) → Task 1. ✓
- `notion_asset.py` deterministic writer → Task 2. ✓
- Hub page, 3 DBs, brand-filtered → Task 5. ✓
- Caio cataloging instruction (living registry) → Task 3. ✓
- Seed via Caio's gateway, curated subset, arquivos-empresa durable home → Task 4. ✓
- Drive canonical + R2 public + Notion index → Tasks 2/4 (mapping table). ✓
- Config cache + memory + live smoke → Task 6. ✓
- Commit/install-specific handling → Global Constraints + per-task commit notes. ✓
- Out-of-scope (no Status/Versão, existing DBs untouched, no A–F change) → respected (only references DB was touched earlier, separately). ✓

**Placeholder scan:** `<MATERIAIS_DB_ID>` / `<MATERIAIS_DS_ID>` are deliberate carries from Task 1 (the DB does not exist until then), substituted in Tasks 2/4/5/6 — not open TODOs. The seed instruction text (Task 4 Step 2) is templated with an explicit per-asset mapping table — no vague content. All commands concrete.

**Type/consistency:** `Marca` options `Zoryon|Faryon|Geral` consistent across Tasks 1/2/3/4; property names (`Arquivo (Drive)`, `URL pública (R2)`, `Formato`, `Notas`) identical in Task 1 schema, Task 2 `build_payload`, and the Task 2 test; gateway-only rule (no host runs of `notion_asset.py`/`drive_upload.py`/`r2_upload.py`) consistent with the seed running inside Caio (Task 4).

---

## Execution Record (2026-06-22) — COMPLETE, live-verified

All 6 tasks executed inline + smoke-tested live through Caio's real gateway.

- **Task 1 ✅** DB `Materiais — Marca` created (id `d6e8e3ac-1b93-412d-90d2-6c2c101db87c`, data source `30e911f6-020d-4daa-8fa9-01e8b17b9027`) under "Base | Nanoclaw" via the claude.ai Notion MCP.
- **Task 2 ✅** `notion_asset.py` + `test_notion_asset.py` (2 tests pass via `--dry-run`) + SKILL.md. Commits `4975637`, `99056f7` (r2_upload path/key fix).
- **Task 3 ✅** Cataloging instruction in `system-prompt.md` + `CLAUDE.local.md` (gitignored).
- **Task 4 ✅** Seed of 16 Zoryon+Faryon assets → Drive `Materiais — Marca/<marca>` + 4 R2 public + 16 Notion rows. Ran inside Caio's container via the real gateway, no FAIL; row props verified via MCP fetch.
- **Task 5 ✅** Hub page "Materiais & Conteúdo — por Marca" (`387481ddf84381c8a6cee37284df7061`) — 3 DBs with per-brand filter guidance.
- **Task 6 ✅** `read-post-targets.json` (materiais_* keys + `hub_page_url`; bonus: `magnific_brand_ref_url` set from the R2-hosted brand-ref, unblocking Subsystem D) + memory updated.
- **Smoke ✅** Both items passed via `scripts/wake-with-task.ts`: (1) Caio listed the 8 Zoryon materials from the DB; (2) Caio catalogued a new Faryon doc via the prompt-driven flow (`drive_upload`→`notion_asset`), row verified (Marca=Faryon, Tipo=Doc oficial, Formato=MD).

**Seed-trigger tooling discovered/built:** `scripts/wake-with-task.ts` (commits `0c22e34`, `2adef33`) — `ncl restart --message` is a no-op for an idle single-DM `--rm` agent (0 running containers); this helper writes a `trigger=1` task message to the active session and the live host-sweep wakes the container. Uses `trigger`-only (NOT `onWake=1`, which an already-running container skips).

**Operational note:** when staging files into Caio's workspace as root, `chmod 644` them — the container runs as `node` (uid 1000) and can't read root/600 files (caught in smoke; not a flow defect).

**Related (same session, separate commit):** `Marca` (Zoryon/Faryon) select added to the Referências DB + `notion_row.py --marca` — commit `39a3dc2`.

Install-specific artifacts (Notion DB/page, Drive files, R2 objects, `read-post-targets.json`, prompt files) are live data / gitignored — not committed, per the Global Constraints.
