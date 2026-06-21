# Design — Caio Content Manager, Subsystem D: Creation (carousel-focused)

**Date:** 2026-06-21
**Status:** Approved (design), pending implementation plan
**Initiative:** Evolve Caio (content-machine) into a Content Manager. Subsystem **D of six** (A–F). See memory `caio-content-manager-initiative`. Depends on A (brand wiki), B (research), C (persona/router) — all built. D **elevates carousel creation**; it does NOT build blog/reel multi-format (deferred).

## Goal

Make the carousel the agent produces measurably better on the two axes that matter: **images** and **copy**.
1. **Images** — replace the current `image-gen` CLI (OpenRouter) with **Magnific** via its REST API, using the brand-grade models the user chose (Nano Banana Pro + GPT image), brand-consistent via reference images.
2. **Copy** — fold a vetted copy-quality discipline ("LAYER VOICE") into the existing BrandsDecoded methodology.

## Decisions (locked, user 2026-06-21)

- **Magnific via REST API (NOT the OAuth MCP).** The user confirmed the REST endpoint `POST /v1/ai/text-to-image/nano-banana-pro` exists (key auth, headless-friendly). The OAuth MCP path is dropped. Key auth = `x-magnific-api-key`, injected by the OneCLI gateway (host `api.magnific.com`).
- **Models:** `nano-banana-pro` (brand fidelity / reference-guided — covers, brand-heavy slides) and `gpt-image-2` (typography / text-layout / infographic slides). The MCP catalog confirmed both are SOTA tier (`imagen-nano-banana-2` and `gpt-2`); the REST slugs are `nano-banana-pro` (confirmed) and `gpt-image-2` (same `/v1/ai/text-to-image/<slug>` pattern — verify exact slug at impl with the key).
- **Brand consistency = `reference_images[]`** (the REST API has NO `brandKitId`; that's MCP-only). Pass a hosted Zoryon brand reference image (logo + palette board) as a reference. Assets exist (`design-tokens.css` palette, logos).
- **Permission gate + usage log** carried over from the user's `magnific-auth` skill — every generation batch is scope-confirmed with Jonas; usage logged.
- **Lad stays** as the image-prompt specialist (Etapa 3.8); only the *execution* step (Etapa 3.9) swaps from `image-gen` to Magnific.
- **Copy fold-in = "LAYER VOICE" only.** From `coreyhaines31/marketingskills`: specific>vague (concrete-number swaps), short-breathe-land sentence rhythm, write-from-emotion. Plus the hook bank as deduped reference. The rest of that skill (calendar/analytics/LinkedIn-X) and the whole `deepagents/social-media` skill are **not adopted** (fluff / weaker than Caio's existing method). Methodology fold-in, NOT a container skill.
- **Multi-format (blog/reels), scheduling, audit = out of scope** (E/F + later).

## Component D1 — Magnific image generation (REST skill + Etapa 3.9)

### Credential
- Magnific API key → OneCLI vault: `onecli secrets create --name MAGNIFIC_API_KEY --type generic --value <KEY> --host-pattern api.magnific.com --header-name x-magnific-api-key --value-format '{value}'` (raw key as the header value, not `Bearer`). Gateway injects it; the script sends no key. Key never committed. (User to provide the key.)

### Skill `container/skills/magnific/`
A deterministic Python wrapper (stdlib + gateway CA, like the other skills) — NO key in the script:
- `magnific_image.py <model> --prompt "<en>" [--ref-url <URL> ...] [--aspect 1:1] [--resolution 2K] --out <file.png>`
- **Flow:** `POST https://api.magnific.com/v1/ai/text-to-image/<model>` with `{prompt, reference_images:[{image:<URL>, text, mime_type}], aspect_ratio, resolution}` → returns a task id → **poll** `GET /v1/ai/text-to-image/<model>/{task-id}` until complete → download the result image to `--out`. Set `REQUESTS_CA_BUNDLE`/`CURL_CA_BUNDLE`=`$SSL_CERT_FILE` if it uses `requests` (gateway CA), or stdlib urllib trusting `SSL_CERT_FILE`.
- **Models:** `nano-banana-pro` (default for cover + brand-heavy + reference-guided), `gpt-image-2` (text/typography/infographic slides). Document when to use which.
- **SKILL.md** carries the model hierarchy + the **permission gate** (🚨 confirm "N imagens em <modelo>, <proporção>" before generating) + the **usage log** (`/workspace/agent/logs/magnific/YYYY-MM.md`) + the brand-reference rule.
- Add `magnific` to Caio's curated skills.

### Brand reference image
Create a Zoryon brand reference board (logo + palette + a couple of on-brand sample frames) as a PNG/webp, upload it to Drive via the existing `drive_upload.py`/Drive flow, make it anyone-reader (public URL), and cache that URL in `read-post-targets.json` (e.g. `magnific_brand_ref_url`). The skill passes it as `--ref-url` for `nano-banana-pro` generations. (reference_images need a reachable URL; Drive public link is the clean reuse of existing infra.)

### Etapa 3.9 rewrite (system-prompt)
Replace the `image-gen generate … --out` block with the Magnific call:
- For each slide needing an image, pick the model (cover/brand → `nano-banana-pro` + brand ref; text-heavy/infographic → `gpt-image-2`), run `magnific_image.py … --out /tmp/caio-slide-<N>.png`.
- Keep the rest of 3.9 (preview to user, error handling: on failure, ask Lad to refine the prompt or proceed without that image).
- Etapa 3.8 (Lad prompts) unchanged. The permission gate fires once before the batch (folds into the existing "anunciar o plano" step).

## Component D2 — Copy-quality fold-in ("LAYER VOICE")

Fold into the carousel methodology (system-prompt BLOCO 7 "Regras de copy dos slides", and the headline engine BLOCO 5 for hooks):
- **Specific > vago:** trocar vago por concreto (número, nome, dado). Ex.: "muita gente" → "2.847 pessoas"; "boa receita" → "R$47.329". (Sem inventar — usar dado real ou não usar.)
- **Short. Breathe. Land.:** uma ideia por frase no slide; ritmo com quebras; evitar frase-corrida.
- **Escreva da emoção:** abrir pela tensão/sentimento, não pela mecânica.
- **Hook bank (deduped):** adicionar ao banco de referência do headline engine os padrões de hook do `marketingskills/social` que NÃO dupliquem os 56 hooks já existentes (curiosity/story/contrarian/social-proof templates). Marcar como inspiração, não regra.
- These are editing principles layered on top of the existing anti-AI-slop rules — they sharpen, they don't replace.

## Credentials / security
- Magnific key → vault only (host `api.magnific.com`, header `x-magnific-api-key`). Never in a committed file. The `magnific` skill contains no key.
- The brand reference image is a public Drive link (non-secret, a brand board) — fine to reference by URL.

## Verification
1. `magnific_image.py nano-banana-pro --prompt "<test>" --ref-url <brand> --aspect 1:1 --out /tmp/x.png` from Caio's container (gateway applied) → polls, downloads a real PNG (auth via gateway works; if 401, fix secret-mode).
2. `gpt-image-2` slug verified (or corrected) with the key.
3. A full carousel export (Etapa 3.8→3.9→5.5) uses Magnific for the slide images instead of `image-gen`, with the permission gate firing once and the usage log written.
4. Slide copy reflects LAYER VOICE (specific numbers, short lines) without breaking the anti-AI-slop / editorial validation.
5. Live smoke (Caio DM): "cria um carrossel sobre <tema>" → images come from Magnific (Nano Banana Pro cover, brand-consistent), copy is sharper.

## Out of scope (this subsystem)
- Blog / reels / other-format creation — later (the "em construção" items stay).
- Scheduling (E), audit (F).
- The OAuth MCP path and `brandKitId` (REST has no brand kit; using reference_images instead).
- Video/audio Magnific tools — images only for carousels now.
- Installing the external marketing/deepagents skills as-is (only the LAYER VOICE fold-in is adopted).
