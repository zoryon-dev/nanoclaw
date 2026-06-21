# Caio Content Manager — Subsystem E (Scheduling + Publishing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Caio schedules a created carousel (editorial calendar in Notion + `schedule_task`) and, at the time, **auto-publishes it to Instagram via Composio** using R2-hosted slide URLs — with a reminder/confirm fallback.

**Architecture:** Caio (no internal agent) schedules via the `schedule_task` MCP tool. Slide PNGs are uploaded to Cloudflare R2 via the Cloudflare v4 API (gateway-injected Bearer) → public custom-domain URLs. Instagram publish via Composio (`INSTAGRAM_CREATE_CAROUSEL_CONTAINER` + `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH`). Calendar = the existing "Carrosséis — Entregas" Notion DB extended.

**Tech Stack:** Python stdlib (gateway CA), Cloudflare v4 R2 API, Composio tool router (`COMPOSIO_MULTI_EXECUTE_TOOL`), Notion (`notion_delivery.py` family), the container `schedule_task` MCP tool, `onecli`/`q.ts`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-21-caio-content-manager-E-agendamento-design.md`. Caio agent id `ag-1776256973199-ukacj8`.
- **Verified working (this session):** R2 upload `PUT https://api.cloudflare.com/client/v4/accounts/11feaa2d9e21cd5a972bccfcb8d1e3d7/r2/buckets/nanoclaw/objects/<key>` → gateway injects `Authorization: Bearer` (CF token vault secret 9d3ca3cd, host api.cloudflare.com) → public read `https://bucket-nanoclaw.zoryon.co/<key>` (200). CORS not needed (IG fetches server-side). Composio has 3 ACTIVE instagram connections (`ca_XR7qVb6pigzv`, `ca_Wwi3rTxCfz1j`, `ca_5gQmAAVzK19v`).
- Secrets never committed. CF token already in vault. Skills carry no keys. Group runtime files (system-prompt, CLAUDE.local, read-post-targets.json) gitignored.
- Reminder/confirm path must work even if IG publish fails → the system is useful regardless.
- Timezone BRT.

---

### Task 1: R2 uploader skill

**Files:**
- Create: `container/skills/r2-upload/scripts/r2_upload.py`, `container/skills/r2-upload/SKILL.md`
- Modify: Caio `container_configs.skills` (append `r2-upload`)

**Interfaces:**
- Produces: `r2_upload.py <localfile> <key>` → uploads to R2 (v4 API, gateway Bearer), prints the public URL `https://bucket-nanoclaw.zoryon.co/<key>`.

- [ ] **Step 1: Write `r2_upload.py`** (stdlib, no key — gateway injects):
```python
#!/usr/bin/env python3
"""Upload a file to Cloudflare R2 via the v4 API (gateway injects the Bearer) and
print its public URL. No key here. Trusts the gateway CA via SSL_CERT_FILE."""
import argparse, ssl, sys
from urllib.request import Request, urlopen
import urllib.error
ACCOUNT = "11feaa2d9e21cd5a972bccfcb8d1e3d7"
BUCKET = "nanoclaw"
PUBLIC = "https://bucket-nanoclaw.zoryon.co"
API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/r2/buckets/{BUCKET}/objects"
CTX = ssl.create_default_context()
def main() -> int:
    ap = argparse.ArgumentParser(prog="r2_upload")
    ap.add_argument("file"); ap.add_argument("key")
    a = ap.parse_args()
    ctype = "image/png" if a.key.lower().endswith(".png") else ("application/pdf" if a.key.lower().endswith(".pdf") else "application/octet-stream")
    with open(a.file, "rb") as f:
        body = f.read()
    req = Request(f"{API}/{a.key}", data=body, method="PUT", headers={"Content-Type": ctype, "User-Agent": "r2-upload/1.0 (+nanoclaw)"})
    try:
        with urlopen(req, timeout=120, context=CTX) as r:
            if r.getcode() not in (200, 201):
                raise SystemExit(f"R2 PUT HTTP {r.getcode()}")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"R2 PUT failed HTTP {e.code}: {e.read().decode(errors='replace')[:300]}")
    print(f"{PUBLIC}/{a.key}")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Write `SKILL.md`** documenting `r2_upload.py <file> <key>` → public URL; used to host carousel slides (for Instagram) and any image needing a public URL (e.g. the Magnific brand-ref). No key — gateway injects.

- [ ] **Step 3: Verify live** (gateway-applied container): upload a small PNG, `curl` the printed URL → 200 image/png. Then add to skills:
```bash
pnpm exec tsx scripts/q.ts data/v2.db "UPDATE container_configs SET skills=json_insert(skills,'\$[#]','r2-upload') WHERE agent_group_id='ag-1776256973199-ukacj8'"
git add container/skills/r2-upload/ && git commit -m "feat(skills): r2-upload (Cloudflare R2 v4 API, gateway Bearer, public URL)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Editorial calendar — extend the Notion DB

**Files:** Notion DB "Carrosséis — Entregas" (`94603584-...`, data source `4fac81ae-...`).

- [ ] **Step 1: Add `Data de publicação` (date) + `Agendado` status option**

Via the Notion MCP (`notion-update-data-source`) or the web UI: add a `Data de publicação` date property; add `Agendado` to the `Status` select (so: Rascunho → Entregue → Agendado → Publicado). Add a **calendar view** keyed on `Data de publicação`.

- [ ] **Step 2: Verify** the data source schema shows `Data de publicação` + `Status` has `Agendado`.

---

### Task 3: Notion scheduling-update helper

**Files:**
- Create: `container/skills/read-post/scripts/notion_update.py`

**Interfaces:**
- Produces: `notion_update.py --page <id> [--data-publicacao YYYY-MM-DD] [--status Agendado|Publicado] [--link-post <url>]` → PATCHes the page (gateway-injected Notion bearer, like `notion_row.py`).

- [ ] **Step 1: Write `notion_update.py`** — curl PATCH `https://api.notion.com/v1/pages/<id>` with the property updates (no auth header; gateway injects). Set `Data de publicação` (date), `Status` (select), and optionally a `Link do post` (url — add this property to the DB in Task 2 if wanted). Prints OK or `ERRO…`.

- [ ] **Step 2: Verify** live: create a throwaway page via `notion_delivery.py`, then `notion_update.py --page <id> --status Agendado --data-publicacao 2026-06-25` → fetch the page → confirms, then archive it.

---

### Task 4: Instagram publish — pick the connection + document the flow

**Files:** none (Composio via the existing `composio` tool router) + a doc note.

- [ ] **Step 1: Identify the right IG connection (@zoryon.dev)**

For each ACTIVE connection (`ca_XR7qVb6pigzv`, `ca_Wwi3rTxCfz1j`, `ca_5gQmAAVzK19v`), call a read-only IG action (e.g. `INSTAGRAM_GET_USER_INFO` / get-me) via the Composio API (gateway-injected) to read the username; keep the one that is **@zoryon.dev** with the **content-publish** permission. Record its `connected_account_id`. (Optionally archive the EXPIRED connections.)

- [ ] **Step 2: Confirm the publish actions + carousel flow**

Confirm the action slugs via the Composio tool router: `INSTAGRAM_CREATE_CAROUSEL_CONTAINER` (children = the R2 image URLs, 2–10; + caption) → `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH` (the returned container id). Note the exact arg names (do one DRY/read where possible; a real publish is the Task 7 smoke, gated on Jonas).

- [ ] **Step 3: Record** the connection id + action arg shapes in `read-post-targets.json` (`ig_connected_account_id`, etc.) for the prompt to reference.

---

### Task 5: Scheduling + publish flow in the system-prompt

**Files:** Modify `groups/content-machine/system-prompt.md` (new "Etapa 6.5 — Agendar & Publicar" after the export/legenda).

- [ ] **Step 1: Add the flow:**
```markdown
### Etapa 6.5 — Agendar & Publicar (Instagram)

Quando o Jonas pedir pra **agendar** um carrossel pronto (ex.: "agenda pra quinta 9h"):
1. Atualize o Notion ("Carrosséis — Entregas"): `notion_update.py --page <id> --status Agendado --data-publicacao <YYYY-MM-DD>`.
2. Crie um `schedule_task` com `process_after` = o horário (BRT) e conteúdo = o job de publicação: o page id, a pasta/PNGs dos slides, e a legenda.

**No horário (a tarefa te acorda):**
1. Suba cada PNG de slide no R2: `python3 /app/skills/r2-upload/scripts/r2_upload.py /tmp/caio-slide-<N>.png carrosseis/<slug>/slide-<N>.png` → coleta as URLs públicas.
2. Publique via Composio (conta `ig_connected_account_id` de `read-post-targets.json`): `INSTAGRAM_CREATE_CAROUSEL_CONTAINER` (as URLs em ordem + a legenda) → `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH` (o container id).
3. **Sucesso:** `notion_update.py --page <id> --status Publicado --link-post <url>` e avise o Jonas: "Publicado: `<link>`".
4. **Falha** (ou IG não disponível): NÃO finja. Caia pro **lembrete** — mande no Caio DM o PDF + link da pasta Drive + legenda e diga "publica manual e me confirma que eu marco como Publicado".
```

- [ ] **Step 2: Verify** the section present; `schedule_task`/`r2_upload`/`INSTAGRAM_CREATE_CAROUSEL_CONTAINER` referenced.

---

### Task 6: Persona/router update (agendar = ativo)

**Files:** Modify `groups/content-machine/system-prompt.md` (BLOCO 2 router + capabilities map) + `CLAUDE.local.md`.

- [ ] **Step 1:** In BLOCO 2, move "agendar" from the "em construção" row to an active route → Etapa 6.5; in the capabilities map set **Agendamento = ativo (calendário Notion + auto-publish IG via Composio, fallback lembrete)**. Mirror one line in CLAUDE.local.md. Restart Caio.

- [ ] **Step 2: Verify** no "agendar … em construção" remains; router points agendar → Etapa 6.5.

---

### Task 7: Live smoke + memory

- [ ] **Step 1 (Caio DM):** with a carousel already exported, `agenda esse carrossel pra <amanhã, horário próximo>` → Notion row = Agendado + date; a `schedule_task` is listed. At the time, the task fires → slides upload to R2 → **Jonas-gated publish** ("vou publicar N imagens no @zoryon.dev, ok?") → on yes, publishes via Composio; Status→Publicado + post link. (Test the reminder fallback by temporarily expecting a failure if needed.)
- [ ] **Step 2:** Update the initiative memory — Subsystem E IMPLEMENTED. Next: F (auditoria).

---

## Self-Review

**Spec coverage:** R2 hosting (Task 1, verified) ✓; editorial calendar Notion (Task 2) ✓; schedule_task scheduling (Task 5) ✓; auto-publish via Composio carousel actions (Tasks 4/5) ✓; reminder/confirm fallback (Task 5 step 4) ✓; persona "agendar"=ativo (Task 6) ✓; prereqs all verified done (CF token, R2 public domain, Composio IG connections) ✓; verification/live smoke (Task 7) ✓; F out of scope ✓.

**Placeholder scan:** the IG action arg shapes + which `ca_` connection are pinned by Task 4 (live reads), not left vague. R2 path/account/domain are concrete (verified). No raw keys.

**Type/path consistency:** R2 URL `https://bucket-nanoclaw.zoryon.co/<key>`, account `11feaa2d9e21cd5a972bccfcb8d1e3d7`, skill paths `/app/skills/{r2-upload,read-post}/scripts/…`, Notion DB `Carrosséis — Entregas`, agent id `ag-1776256973199-ukacj8` — consistent across tasks.
