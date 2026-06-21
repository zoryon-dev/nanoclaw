# Caio Content Manager — Subsystem D (carousel creation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate carousel creation — generate slide images with Magnific (Nano Banana Pro + GPT image) via its REST API instead of `image-gen`, brand-consistent via reference images, and fold the "LAYER VOICE" copy discipline into the methodology.

**Architecture:** A new deterministic `magnific` container skill calls `api.magnific.com/v1/ai/text-to-image/<model>` (async POST → poll → download), with the key injected by the OneCLI gateway. Etapa 3.9 of the carousel pipeline swaps `image-gen` for this skill. Lad still writes the prompts (Etapa 3.8). Copy principles fold into BLOCO 5/7 of the system-prompt.

**Tech Stack:** Python stdlib (gateway CA), `onecli` (vault), Magnific REST API, Drive (`drive_upload.py`) for the brand-ref image, `imagemagick` (in Caio's image) to compose it, `ncl`/`q.ts` for config.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-21-caio-content-manager-D-criacao-design.md`. Caio agent id `ag-1776256973199-ukacj8`; OneCLI agent uuid `54428679-a82c-4ad1-9847-8faeed30a698`; image `nanoclaw-agent-v2-7545d4f2:ag-1776256973199-ukacj8`.
- **Secrets never committed.** Magnific key → vault (DONE: secret `01ddd25e`, host `api.magnific.com`, header `x-magnific-api-key`, raw value). Caio secretMode set to `all` (DONE) → key injects. The `magnific` skill carries NO key. Plan/commits use no raw key.
- Magnific REST is **async**: `POST /v1/ai/text-to-image/<model>` → task id → poll `GET /v1/ai/text-to-image/<model>/{task-id}` until done → download the result image. Header `x-magnific-api-key` is gateway-injected (script sends none). Python `requests`/urllib must trust the gateway CA (`SSL_CERT_FILE`; set `REQUESTS_CA_BUNDLE` if using `requests`).
- Models: `nano-banana-pro` (confirmed slug; cover + brand-heavy + reference-guided) and `gpt-image-2` (typography/text/infographic — **verify exact slug** at Task 3 with a real call). POST body: `{prompt, reference_images:[{image:<URL>, text, mime_type}], aspect_ratio, resolution}`.
- Group runtime files (system-prompt.md, CLAUDE.local.md, read-post-targets.json, the brand-ref asset) are gitignored. Committable: the `magnific` skill (no key), plan/spec docs, memory.
- Permission gate is mandatory before a generation batch; usage logged to `/workspace/agent/logs/magnific/YYYY-MM.md`.

---

### Task 1: Credential (DONE) — confirm only

**Files:** none (vault).

- [ ] **Step 1: Confirm the key injects for Caio**

Run a gateway-applied container GET (no generation cost) to `https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro` as Caio (see the harness pattern used in Subsystem B).
Expected: HTTP **404 "Task not found"** (authenticated; a bare GET has no task) — NOT 401. If 401 returns, re-run `onecli agents set-secret-mode --id 54428679-a82c-4ad1-9847-8faeed30a698 --mode all`.

---

### Task 2: Zoryon brand-reference image (hosted)

**Files:**
- Create: a brand-ref PNG, uploaded to Drive (public URL)
- Modify: `groups/content-machine/read-post-targets.json` (cache the URL)

**Interfaces:**
- Produces: `magnific_brand_ref_url` (a public image URL) consumed by Task 3's skill as the `nano-banana-pro` reference.

- [ ] **Step 1: Compose a brand board PNG**

Using imagemagick (in Caio's image) compose a simple Zoryon brand reference: the logo + the 5 palette swatches (#837BF4 #FF7D3B #2BD0A8 #141420 #F2F2FA) + font names (Sora/Inter). Source assets: `arquivos-empresa/zoryon-brand/BRAND/` (logos) + `design-tokens.css` (palette). Example (run on host or in-container):
```bash
cd /tmp
convert -size 1080x1080 xc:'#141420' \
  -fill '#837BF4' -draw 'rectangle 80,700 280,900' \
  -fill '#FF7D3B' -draw 'rectangle 320,700 520,900' \
  -fill '#2BD0A8' -draw 'rectangle 560,700 760,900' \
  -fill '#F2F2FA' -draw 'rectangle 800,700 1000,900' \
  -fill '#F2F2FA' -pointsize 64 -gravity north -annotate +0+120 'ZORYON' \
  -pointsize 28 -gravity south -annotate +0+40 'Sora · Inter — paleta de marca' \
  zoryon-brand-ref.png
```
(Refine freely — the goal is an on-brand color/typography reference, 1:1.)

- [ ] **Step 2: Upload to Drive (public) + cache the URL**

Upload via the native Drive uploader (gateway), make it anyone-reader, get the direct image URL. Reuse `drive_upload.py` (or a one-off upload that returns a public `https://drive.google.com/uc?id=<id>` style direct link — reference_images need a directly fetchable image URL; if the Drive share link isn't a direct image, host it where Magnific can GET it, e.g. the OneCLI public tunnel). Then add to `read-post-targets.json`:
```json
"magnific_brand_ref_url": "<public direct image URL>"
```

- [ ] **Step 3: Verify the URL is publicly fetchable**

Run: `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "<magnific_brand_ref_url>"`
Expected: `200 image/png` (Magnific must be able to GET it). If Drive's link isn't a direct image, switch to the OneCLI tunnel host. (No commit — gitignored.)

---

### Task 3: The `magnific` skill (REST wrapper)

**Files:**
- Create: `container/skills/magnific/scripts/magnific_image.py`
- Create: `container/skills/magnific/SKILL.md`
- Modify: `container_configs.skills` for Caio (append `magnific`)

**Interfaces:**
- Produces: `magnific_image.py <model> --prompt "<en>" [--ref-url <URL>] [--aspect 1:1] [--resolution 2K] --out <file.png>` → writes the generated PNG, prints its path. Consumed by Etapa 3.9 (Task 4).

- [ ] **Step 1: Write `magnific_image.py`**

Deterministic stdlib wrapper. POST the job, poll the task until complete, download the image. NO key (gateway injects `x-magnific-api-key` for api.magnific.com). Trust the gateway CA via `SSL_CERT_FILE`. Full file:
```python
#!/usr/bin/env python3
"""Generate one image via the Magnific REST API (async). No key here — the OneCLI
gateway injects x-magnific-api-key for api.magnific.com. Trusts the gateway CA via
SSL_CERT_FILE. POST a job → poll the task → download the result PNG to --out."""
from __future__ import annotations
import argparse, json, ssl, sys, time, urllib.request, urllib.error
from urllib.request import Request, urlopen

API = "https://api.magnific.com/v1/ai/text-to-image"
CTX = ssl.create_default_context()  # SSL_CERT_FILE (gateway CA) honored by stdlib

def _req(method, url, body=None):
    headers = {"Content-Type": "application/json", "User-Agent": "magnific-skill/1.0 (+nanoclaw)"}
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urlopen(Request(url, data=data, headers=headers, method=method), timeout=120, context=CTX) as r:
            return r.getcode(), json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:500]
        if "access_restricted" in detail:
            raise SystemExit("Magnific não concedido a este agente (OneCLI). Avise o Jonas.")
        raise SystemExit(f"Magnific {method} {url.split('?')[0]} HTTP {e.code}: {detail}")
    except Exception as e:
        raise SystemExit(f"Magnific call failed: {e}")

def main() -> int:
    ap = argparse.ArgumentParser(prog="magnific_image")
    ap.add_argument("model", help="nano-banana-pro | gpt-image-2")
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--ref-url", action="append", default=[], help="reference image URL (repeatable)")
    ap.add_argument("--aspect", default="1:1")
    ap.add_argument("--resolution", default="2K")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    payload = {"prompt": a.prompt, "aspect_ratio": a.aspect, "resolution": a.resolution}
    if a.ref_url:
        payload["reference_images"] = [{"image": u, "text": "Zoryon brand reference", "mime_type": "image/png"} for u in a.ref_url]

    code, created = _req("POST", f"{API}/{a.model}", payload)
    # Response shape verified at impl: locate the task id field.
    task_id = created.get("task_id") or created.get("id") or (created.get("data") or {}).get("task_id")
    if not task_id:
        raise SystemExit(f"No task id in POST response: {json.dumps(created)[:400]}")
    print(f"[magnific] task {task_id} ({a.model}) — polling…", file=sys.stderr)

    img_url = None
    for _ in range(60):  # ~5 min max (5s interval)
        time.sleep(5)
        _, st = _req("GET", f"{API}/{a.model}/{task_id}")
        status = (st.get("status") or (st.get("data") or {}).get("status") or "").lower()
        if status in ("completed", "success", "done", "finished"):
            d = st.get("data") or st
            gens = d.get("generated") or d.get("images") or d.get("result") or []
            img_url = (gens[0] if isinstance(gens, list) and gens else None)
            if isinstance(img_url, dict):
                img_url = img_url.get("url") or img_url.get("image")
            img_url = img_url or d.get("image") or d.get("url")
            break
        if status in ("failed", "error"):
            raise SystemExit(f"Magnific task failed: {json.dumps(st)[:400]}")
    if not img_url:
        raise SystemExit("Magnific task did not complete in time / no image URL.")

    with urlopen(Request(img_url, headers={"User-Agent": "magnific-skill/1.0"}), timeout=120, context=CTX) as r, open(a.out, "wb") as f:
        f.write(r.read())
    print(a.out)  # stdout: the saved path
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Verify the response shape with ONE real generation (costs ~1 credit — Jonas-approved)**

Via a gateway-applied container run, generate a tiny test image and confirm the POST/poll/download fields match the code's `task_id`/`status`/image-url guesses. If a field name differs, fix `magnific_image.py` accordingly (this is the one place the exact REST schema is pinned down). Also confirm the `gpt-image-2` slug by hitting `…/text-to-image/gpt-image-2` (correct it if the slug differs).
```bash
python3 /app/skills/magnific/scripts/magnific_image.py nano-banana-pro \
  --prompt "abstract on-brand purple gradient background, no text" \
  --ref-url "<magnific_brand_ref_url>" --aspect 1:1 --resolution 2K --out /tmp/mtest.png && ls -la /tmp/mtest.png
```
Expected: a real PNG on disk. Adjust field names in the script if the run reveals a different schema.

- [ ] **Step 3: Write `SKILL.md`**

`container/skills/magnific/SKILL.md` (NO key) — model hierarchy + permission gate + log + brand-ref rule:
```markdown
---
name: magnific
description: Gera imagens via Magnific (REST API, key injetada pelo gateway). Use na criação de carrossel para gerar imagens de slide. Modelos: nano-banana-pro (capa, marca, reference-guided — alta fidelidade de marca) e gpt-image-2 (slides com texto/tipografia/infográfico). Async (gera por task, faz poll). NÃO é vídeo/áudio.
---

# magnific — geração de imagem (REST)

`python3 /app/skills/magnific/scripts/magnific_image.py <model> --prompt "<en>" [--ref-url <URL>] --aspect <r> --resolution 2K --out <file.png>`

- **Modelos:** `nano-banana-pro` = capa + slides brand-heavy + quando há referência de marca (passe `--ref-url` com a brand-ref de `read-post-targets.json` → `magnific_brand_ref_url`). `gpt-image-2` = slides com texto/tipografia/infográfico/diagrama.
- A key é injetada pelo gateway (host api.magnific.com) — nunca passe key.

## 🚨 Permission gate (inegociável)
ANTES de gerar, confirme com o Jonas o escopo:
> "Vou gerar [N] imagens em [modelo], [proporção]. Posso seguir?"
Só gere após "sim". Se "não" → entregue os prompts prontos pra rodar manual.

## Log de uso
Registre cada lote em `/workspace/agent/logs/magnific/AAAA-MM.md` (modelo, qtd, finalidade/peça).

## Erros
- `access_restricted`/401 → key não concedida a este agente no OneCLI; avise o Jonas.
- task não completa / falhou → relate ao Jonas; ofereça seguir sem aquela imagem ou refazer o prompt (via Lad).
```

- [ ] **Step 4: Add `magnific` to Caio's skills + commit the skill**

```bash
cd /root/nanoclaw
pnpm exec tsx scripts/q.ts data/v2.db "UPDATE container_configs SET skills=json_insert(skills,'\$[#]','magnific'), updated_at='2026-06-21T00:00:00.000Z' WHERE agent_group_id='ag-1776256973199-ukacj8'"
git add container/skills/magnific/
git commit -m "feat(skills): magnific image skill (REST nano-banana-pro/gpt-image-2, gateway key)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Expected: skills array ends with `"magnific"`; skill committed (secret-scan clean — no key).

---

### Task 4: Rewrite Etapa 3.9 (image-gen → Magnific)

**Files:**
- Modify: `groups/content-machine/system-prompt.md` (Etapa 3.9 block)

- [ ] **Step 1: Replace the `image-gen` execution with Magnific**

Use Edit. Replace the Etapa 3.9 command block (the `image-gen generate "<prompt>" --aspect <ratio> --out …` paragraph and its error handling) with:
```markdown
Com os prompts em mãos, **confirmar o gate** (BLOCO da skill `magnific`) e gerar cada imagem via Magnific. Escolha o modelo por slide:
- **Capa e slides com peso de marca / referência** → `nano-banana-pro` com `--ref-url` da brand-ref (de `read-post-targets.json` → `magnific_brand_ref_url`).
- **Slides com texto/tipografia/infográfico** → `gpt-image-2`.

```bash
python3 /app/skills/magnific/scripts/magnific_image.py <modelo> \
  --prompt "<prompt do Lad em inglês>" [--ref-url "<brand_ref_url>"] \
  --aspect <ratio> --resolution 2K --out /tmp/caio-slide-<N>.png
```

O script faz POST + poll + download e imprime o path do PNG. Erros:
- `access_restricted`/401 → avise o Jonas (key Magnific não concedida).
- task falhou/timeout → devolve o slide pro Lad ("Prompt do slide X falhou no Magnific. Refina?") OU segue sem imagem nesse slide, perguntando ao Jonas.
```
(Keep the existing "Preview opcional ao usuário" step that follows.)

- [ ] **Step 2: Verify**

Run: `grep -n "magnific_image.py\|nano-banana-pro" groups/content-machine/system-prompt.md` → present. `grep -c "image-gen generate" groups/content-machine/system-prompt.md` → `0` (the old CLI call is gone from 3.9). (No commit — gitignored.)

---

### Task 5: Fold "LAYER VOICE" copy discipline into the methodology

**Files:**
- Modify: `groups/content-machine/system-prompt.md` (BLOCO 7 "Regras de copy dos slides")

- [ ] **Step 1: Add the copy-discipline block**

Use Edit. Append to the "### Regras de copy dos slides" section (BLOCO 7):
```markdown

**LAYER VOICE — disciplina de copy (aplicar em slides e legenda):**
- **Específico > vago.** Troque o vago por concreto: número, nome, dado. "muita gente" → "2.847 pessoas"; "boa receita" → "R$47.329". **Nunca invente** — use dado real (pesquisa/brand-wiki) ou não use o número.
- **Short. Breathe. Land.** Uma ideia por frase. Quebre o ritmo. Evite frase-corrida — prefira 3 linhas curtas a 1 longa.
- **Escreva da emoção.** Abra pela tensão/sentimento (o que dói, o que surpreende), não pela mecânica do tema.
- Essas regras afinam o copy por cima do anti-AI-slop e da validação editorial — não as substituem.
```

- [ ] **Step 2: Verify**

Run: `grep -n "LAYER VOICE\|Short. Breathe. Land" groups/content-machine/system-prompt.md` → present. (No commit — gitignored.)

---

### Task 6: Restart, live test, memory

- [ ] **Step 1: Restart Caio**

`cd /root/nanoclaw && ./bin/ncl groups restart --id ag-1776256973199-ukacj8` (no rebuild — skill is mounted, prompt is reloaded next spawn).

- [ ] **Step 2: Live smoke (Caio DM)**

`cria um carrossel sobre <tema>` → through Etapa 3.8 (Lad prompts) → **Etapa 3.9 generates slide images via Magnific** (gate fires once: "N imagens em nano-banana-pro/gpt-image-2?"), cover is brand-consistent (Nano Banana Pro + brand ref), slide copy reflects LAYER VOICE (specific numbers, short lines). PDF/Drive/Notion export (Etapa 5.5) unchanged.

- [ ] **Step 3: Update the initiative memory**

Mark Subsystem D IMPLEMENTED in `project_caio_content_manager.md` (magnific skill live, Etapa 3.9 on Magnific, brand-ref hosted, LAYER VOICE folded). Next: E (agendamento).

---

## Self-Review

**Spec coverage:** Magnific REST skill (Task 3) ✓; key via gateway + grant (Task 1, done) ✓; brand via reference_images + hosted brand-ref (Task 2) ✓; Etapa 3.9 swap, Lad kept (Task 4) ✓; permission gate + usage log (Task 3 SKILL.md) ✓; LAYER VOICE fold-in (Task 5) ✓; nano-banana-pro + gpt-image-2 with slug-verify (Task 3 Step 2) ✓; verification/live smoke (Task 6) ✓; multi-format/scheduling/audit out of scope (untouched) ✓.

**Placeholder scan:** `<model>`/`<URL>`/`<tema>` are call placeholders; the one genuine unknown — the exact REST response field names + the `gpt-image-2` slug — is pinned by Task 3 Step 2 (a real call), not left vague. The `magnific_image.py` defensively probes multiple field names and Task 3 Step 2 corrects them. No raw keys.

**Type/path consistency:** skill path `/app/skills/magnific/scripts/magnific_image.py`, model slugs `nano-banana-pro`/`gpt-image-2`, brand URL key `magnific_brand_ref_url`, agent id `ag-1776256973199-ukacj8` — consistent across Tasks 2–6. The skill's printed-path stdout contract matches Etapa 3.9's `--out /tmp/caio-slide-<N>.png` usage.
