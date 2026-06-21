# Caio Content Manager — Subsystem B (Research) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Equip Caio with a rationalized research toolkit — Firecrawl (MCP), Tavily (CLI skill), and last30days (vendored Python skill) — alongside the already-shipped youtube-search, with read-only-by-default behavior and on-demand persistence.

**Architecture:** Firecrawl is wired as an HTTP MCP server in Caio's `container_configs`. Tavily's `tvly` CLI and last30days' Python scripts are baked into the **base** container image (like `yt-dlp`/`gallery-dl`), exposed as curated container skills; their credentials are injected by the OneCLI gateway (Tavily) or already in the vault (OpenRouter). Caio's per-agent image is rebuilt from the updated base.

**Tech Stack:** NanoClaw host (Node/pnpm), `ncl` CLI, `onecli` (vault/gateway), `container_configs` (SQLite `data/v2.db`), `q.ts`, Docker, base `container/Dockerfile`, Bun/Python in-container, the `tvly` CLI, the `mvanhorn/last30days-skill` repo.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-21-caio-content-manager-B-pesquisa-design.md`.
- Caio agent group id: `ag-1776256973199-ukacj8` (folder `content-machine`); per-agent image tag `nanoclaw-agent-v2-7545d4f2:ag-1776256973199-ukacj8`; base image `nanoclaw-agent-v2-7545d4f2:latest`.
- **Secrets NEVER committed.** Firecrawl key → `container_configs.mcp_servers` (DB only). Tavily key → OneCLI vault. Plans/commits reference keys as `<FIRECRAWL_KEY>` / `<TAVILY_KEY>` — the real values were provided by the user in chat 2026-06-21; substitute at execution time, never write them into a file that gets committed. New container skills (`container/skills/tavily`, `container/skills/last30days`) must contain NO key.
- Caio's existing MCP servers JSON (preserve when merging): `{"composio":{"type":"http","url":"https://backend.composio.dev/tool_router/trs_ZYjdDf4X2Znp/mcp"}}`.
- last30days default window is **`--days=7`** (always applied). Zero-config platforms only: Reddit, Hacker News, Polymarket, GitHub. Synthesis via `OPENROUTER_API_KEY` (already in vault). Premium platforms (X/ScrapeCreators/Brave/Perplexity) OFF — and that must be visible, not silent.
- All `groups/**` runtime files and `arquivos-empresa/` are gitignored. Committable: the new container skills (no keys), `container/Dockerfile`, the plan/spec docs, memory.
- Date stamp: `2026-06-21`.

---

### Task 1: Firecrawl MCP (re-add)

**Files:**
- Modify: `container_configs.mcp_servers` for `ag-1776256973199-ukacj8` (DB `data/v2.db`)

**Interfaces:**
- Produces: `firecrawl_*` MCP tools available in Caio's session.

- [ ] **Step 1: Read current mcp_servers**

Run:
```bash
cd /root/nanoclaw
pnpm exec tsx scripts/q.ts data/v2.db "SELECT mcp_servers FROM container_configs WHERE agent_group_id='ag-1776256973199-ukacj8'"
```
Expected: `{"composio":{"type":"http","url":"https://backend.composio.dev/tool_router/trs_ZYjdDf4X2Znp/mcp"}}`. If it differs, hand-merge in Step 2 instead of overwriting.

- [ ] **Step 2: Add the Firecrawl MCP (merge with composio)**

Substitute the real key for `<FIRECRAWL_KEY>` (do NOT paste it into any committed file):
```bash
cd /root/nanoclaw
pnpm exec tsx scripts/q.ts data/v2.db "UPDATE container_configs SET mcp_servers='{\"composio\":{\"type\":\"http\",\"url\":\"https://backend.composio.dev/tool_router/trs_ZYjdDf4X2Znp/mcp\"},\"firecrawl\":{\"type\":\"http\",\"url\":\"https://mcp.firecrawl.dev/<FIRECRAWL_KEY>/v2/mcp\"}}', updated_at='2026-06-21T00:00:00.000Z' WHERE agent_group_id='ag-1776256973199-ukacj8'"
pnpm exec tsx scripts/q.ts data/v2.db "SELECT mcp_servers FROM container_configs WHERE agent_group_id='ag-1776256973199-ukacj8'"
```
Expected: the SELECT echoes both `composio` and `firecrawl` keys.

- [ ] **Step 3: Restart Caio so the next spawn materializes the MCP**

Run: `cd /root/nanoclaw && ./bin/ncl groups restart --id ag-1776256973199-ukacj8`
Expected: restart confirmation. No image change (MCP only).

- [ ] **Step 4: Verify (deferred to live smoke, Task 6)**

The MCP only surfaces inside Caio's Claude session, so a full call is verified in Task 6 (ask Caio to `firecrawl_scrape` a URL). For now confirm the config materialized: `grep -o 'firecrawl' groups/content-machine/container.json` after a spawn (or trust the DB — it materializes at spawn). No commit (DB/group files are gitignored).

---

### Task 2: Tavily — vault secret + container skill + base-image CLI install

**Files:**
- Create: `container/skills/tavily/SKILL.md`
- Modify: `container/Dockerfile` (install `tvly` CLI in the global-CLI block, ~line 112+)
- Vault: a `generic` secret (host `api.tavily.com`) via `onecli`

**Interfaces:**
- Produces: the `tvly` CLI on PATH in the base image + a `tavily` skill; Tavily auth injected by the gateway.

- [ ] **Step 1: Store the Tavily key in the OneCLI vault (gateway injection)**

Substitute the real key for `<TAVILY_KEY>`:
```bash
onecli secrets create --name TAVILY_API_KEY --type generic --value "<TAVILY_KEY>" \
  --host-pattern api.tavily.com --header-name Authorization --value-format 'Bearer {value}'
onecli secrets list | grep -i tavily
```
Expected: the secret appears with hostPattern `api.tavily.com`. (Caio is secretMode `all` per the audit, so it's auto-injected; if a 401 appears later, run `onecli agents set-secret-mode --id <caio-onecli-id> --mode all` or `set-secrets`.)

- [ ] **Step 2: Add the `tvly` CLI to the base Dockerfile**

In `container/Dockerfile`, in the global-CLI region (after the existing `RUN curl ... yt-dlp` / pnpm-global block, ~line 70–141), add a pinned install. Use a versioned ARG if the installer supports it; otherwise install latest and record the resolved version in a comment:
```dockerfile
# ---- Tavily CLI (web research; key injected by the OneCLI gateway) -----------
RUN curl -fsSL https://cli.tavily.com/install.sh | bash && \
    mv /root/.local/bin/tvly /usr/local/bin/tvly 2>/dev/null || true && \
    /usr/local/bin/tvly --version || tvly --version
```
(Adjust the `mv` to wherever the installer drops the binary — verify the install path during build; the goal is `tvly` on the global PATH for the `node`/agent user.)

- [ ] **Step 3: Write the Tavily skill**

Create `container/skills/tavily/SKILL.md` (NO key inside) wrapping the CLI for content research:
```markdown
---
name: tavily
description: Pesquisa web e research autônomo via Tavily CLI (tvly) — search (web/news, com filtros de tempo/domínio), extract (URL → markdown limpo), map/crawl (descobrir/varrer site), e research (relatório citado autônomo). Use para âncoras factuais, dados e referências num carrossel/post. A key é injetada pelo gateway OneCLI (api.tavily.com) — não passe key.
---

# Tavily — pesquisa web + research (CLI `tvly`)

Chama `api.tavily.com` — a key é injetada pelo **gateway OneCLI** (não há key no comando).
Use `--json` quando for processar/encadear.

## Comandos
\`\`\`bash
tvly search "<termo>" --topic news --time-range week --max-results 8 --json   # busca
tvly extract "<url>" --query "<foco>" --json                                  # URL → markdown
tvly map "<url-do-site>" --json                                               # descobrir URLs
tvly research "<pergunta>" --model pro -o /workspace/agent/research/<nome>.md  # relatório citado
\`\`\`

## Receitas
- **Âncora factual pra carrossel:** `tvly search "<claim>" --time-range month --json` → 3-6 fontes confiáveis.
- **Mergulho num tema:** `tvly research "<tema>" --model pro` → relatório citado (salva em research/ se útil).
- Sempre cruze com os pilares/voz em `/workspace/brand-wiki/`. É pesquisa: nada publica.

## Erro
- 401/Unauthorized → a key Tavily não está sendo injetada pra este agente (vault/secret-mode). Avise o Jonas.
```

- [ ] **Step 4: Add `tavily` to Caio's curated skills**

```bash
cd /root/nanoclaw
pnpm exec tsx scripts/q.ts data/v2.db "UPDATE container_configs SET skills=json_insert(skills,'\$[#]','tavily'), updated_at='2026-06-21T00:00:00.000Z' WHERE agent_group_id='ag-1776256973199-ukacj8'"
pnpm exec tsx scripts/q.ts data/v2.db "SELECT skills FROM container_configs WHERE agent_group_id='ag-1776256973199-ukacj8'"
```
Expected: the skills array now ends with `"tavily"`. (Image rebuild happens in Task 4; verification of `tvly` runtime + auth is in Task 4.)

- [ ] **Step 5: Commit the skill (no key) — Dockerfile commits in Task 4**

```bash
cd /root/nanoclaw
git add container/skills/tavily/SKILL.md
git commit -m "feat(skills): tavily container skill (web search/research via tvly, gateway key)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: last30days — vendor the Python skill + base-image deps

**Files:**
- Create: `container/skills/last30days/scripts/*` (vendored from `mvanhorn/last30days-skill`)
- Create: `container/skills/last30days/SKILL.md` (NanoClaw-flavored, 7-day default)
- Modify: `container/Dockerfile` (ensure Python ≥3.12 + the skill's pip deps)

**Interfaces:**
- Produces: `python3 /app/skills/last30days/scripts/last30days.py "<topic>" --days=7` runnable in-container.

- [ ] **Step 1: Vendor the upstream scripts**

Fetch the repo's `scripts/` into the skill (shallow clone, copy, drop the rest):
```bash
cd /tmp
git clone --depth 1 https://github.com/mvanhorn/last30days-skill l30d
mkdir -p /root/nanoclaw/container/skills/last30days/scripts
cp -r /tmp/l30d/skills/last30days/scripts/* /root/nanoclaw/container/skills/last30days/scripts/ 2>/dev/null \
  || cp -r /tmp/l30d/scripts/* /root/nanoclaw/container/skills/last30days/scripts/
ls /root/nanoclaw/container/skills/last30days/scripts/
```
Expected: `last30days.py` (+ helpers) present. If the repo layout differs, locate `last30days.py` with `find /tmp/l30d -name 'last30days.py'` and copy its directory. Note its Python deps from any `requirements.txt`/imports for Step 3.

- [ ] **Step 2: Write the NanoClaw SKILL.md (7-day default, zero-config scope)**

Create `container/skills/last30days/SKILL.md`:
```markdown
---
name: last30days
description: Pesquisa de tendência social multi-plataforma (Reddit, Hacker News, Polymarket, GitHub) com score por engajamento real, sintetizada num brief citado. Use para "o que está se falando / tendência social sobre X". Janela padrão 7 dias. Síntese via OpenRouter (gateway). NÃO cobre X/transcrição-YouTube nesta config (YouTube tem a skill própria).
---

# last30days — tendência social (janela 7 dias)

\`\`\`bash
mkdir -p /workspace/agent/research/last30days
python3 /app/skills/last30days/scripts/last30days.py "<tema>" --days=7 --agent \
  --emit=compact --save-dir=/workspace/agent/research/last30days
\`\`\`

- **Sempre `--days=7`** (roundup semanal). Plataformas: Reddit, HN, Polymarket, GitHub (zero-config).
- X, transcrições de YouTube, Brave/Perplexity estão **DESLIGADOS** nesta config (sem keys) — se precisar de YouTube, use a skill `youtube-search`. Diga isso ao Jonas em vez de fingir cobertura total.
- Saída crua em `research/last30days/`. Um brief que vale reusar → salve uma página na sua wiki (`/workspace/agent/wiki/topicos/tendencias-<nicho>.md`).
```

- [ ] **Step 3: Ensure Python ≥3.12 + deps in the base Dockerfile**

First check the base image's Python: `docker run --rm --entrypoint python3 nanoclaw-agent-v2-7545d4f2:latest --version`.
- If ≥3.12: only add the skill's pip deps. Add a `RUN pip3 install --no-cache-dir <deps-from-requirements>` line in `container/Dockerfile` (pin versions; read them from the vendored `requirements.txt`).
- If <3.12: add a step installing Python 3.12 (e.g. via the distro's package or deadsnakes) before the pip install, and make `python3` resolve to it for the skill. Record the exact lines added.

(Exact deps/lines are filled from the vendored repo's requirements in Step 1 — do not guess; read the file.)

- [ ] **Step 4: Add `last30days` to Caio's skills + commit skill**

```bash
cd /root/nanoclaw
pnpm exec tsx scripts/q.ts data/v2.db "UPDATE container_configs SET skills=json_insert(skills,'\$[#]','last30days'), updated_at='2026-06-21T00:00:00.000Z' WHERE agent_group_id='ag-1776256973199-ukacj8'"
git add container/skills/last30days/
git commit -m "feat(skills): vendor last30days skill (social trend research, 7d, zero-config)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Expected: skills array ends with `"last30days"`; skill committed (no keys).

---

### Task 4: Rebuild images + verify Tavily & last30days run in Caio's image

**Files:**
- Modify: `container/Dockerfile` (commit the Task 2 + Task 3 edits together)

**Interfaces:**
- Consumes: Dockerfile edits (Tasks 2–3), vault secret (Task 2), vendored scripts (Task 3).
- Produces: a rebuilt base + Caio per-agent image with `tvly` + last30days.

- [ ] **Step 1: Commit the Dockerfile changes**

```bash
cd /root/nanoclaw
git add container/Dockerfile
git commit -m "build(container): add tvly CLI + last30days python deps to base image

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: Rebuild the base image**

Run: `cd /root/nanoclaw && ./container/build.sh`
Expected: base image `nanoclaw-agent-v2-7545d4f2:latest` rebuilds clean. If a COPY of `container/skills` is cached stale, prune the builder then re-run (see CLAUDE.md "Container Build Cache").

- [ ] **Step 3: Rebuild Caio's per-agent image (FROM the new base, keeps his apt extras)**

Run: `cd /root/nanoclaw && ./bin/ncl groups restart --id ag-1776256973199-ukacj8 --rebuild`
Expected: per-agent image `…:ag-1776256973199-ukacj8` rebuilds with `python3-pil`/`imagemagick` + the new base tools.

- [ ] **Step 4: Verify both tools run inside Caio's image (gateway applied)**

Write a one-off probe `scripts/_b_probe.ts` (delete after) modeled on the earlier gateway harnesses: `applyContainerConfig({agent:'ag-1776256973199-ukacj8'})`, mount `container/skills:/app/skills:ro`, `--add-host=host.docker.internal:host-gateway`, entrypoint bash, run:
```bash
tvly --version && tvly search "AI marketing" --max-results 2 --json | head -20
python3 -c 'import sys; print(sys.version)'  # confirm ≥3.12
python3 /app/skills/last30days/scripts/last30days.py "AI agents" --days=7 --agent --emit=compact --save-dir=/tmp/l30 2>&1 | head -20; ls /tmp/l30
```
Expected: `tvly --version` prints; `tvly search` returns JSON (Tavily auth via gateway works — if 401, resolve the secret/secret-mode and re-verify); Python ≥3.12; last30days writes a brief with no premium-key fatal error. Delete the probe after.

---

### Task 5: Decision matrix + memory

**Files:**
- Modify: `groups/content-machine/CLAUDE.local.md` (add "Pesquisa — quando usar qual")
- Modify: `/root/.claude/projects/-root-nanoclaw/memory/project_caio_content_manager.md`

- [ ] **Step 1: Add the decision matrix to CLAUDE.local.md**

Insert after the "Pesquisa de conteúdo / temas quentes (YouTube)" line (use Edit):
```markdown

## Pesquisa — quando usar qual (read-only; nada publica)

- **Temas quentes / o que bomba num nicho** → `youtube-search` (vídeo) + `last30days` (social: Reddit/HN, 7 dias).
- **Âncora factual / dado / estatística pra um carrossel** → `tavily` (`tvly search`/`research`).
- **Extrair ou analisar uma página/site específico (concorrente, landing, artigo)** → **Firecrawl** (`firecrawl_scrape`/`extract`/`crawl`).
- **Tendência social com engajamento real (upvotes, discussão)** → `last30days`.
- SEMPRE cruze os achados com os pilares/voz em `/workspace/brand-wiki/` antes de propor tema.
- Persistência: referência escolhida → "Referências — Conteúdo" (Notion, sob demanda); brief que vale reusar → sua wiki (`/workspace/agent/wiki/topicos/tendencias-*`); raw do last30days → `/workspace/agent/research/`.
```

- [ ] **Step 2: Update the initiative memory**

Set Subsystem B status to IMPLEMENTED in `project_caio_content_manager.md` (Firecrawl MCP live, Tavily skill+CLI+vault, last30days vendored+running, decision matrix added). Note remaining: Subsystem C (persona).

---

### Task 6: Live end-to-end smoke

- [ ] **Step 1: Firecrawl smoke (Caio DM)**

Send Caio: `usa o firecrawl pra extrair o conteúdo de <url pública> e me resume`.
Expected: Caio calls `firecrawl_scrape`/`extract` and returns a summary (proves the MCP is live).

- [ ] **Step 2: Research-mix smoke (Caio DM)**

Send: `me dá um panorama de tendências sobre "IA para pequenos negócios" — o que está bombando essa semana`.
Expected: Caio uses an appropriate mix (`youtube-search` + `last30days`, maybe `tavily`), synthesizes against the brand pillars from `/workspace/brand-wiki/`, and offers to save a reference — without auto-saving.

- [ ] **Step 3: Mark Subsystem B done**

Confirm the smokes, then finalize the memory note. Subsystem B complete.

---

## Self-Review

**Spec coverage:**
- Firecrawl MCP (re-add, key in config) → Task 1. ✓
- Tavily CLI skill + key→vault → Task 2 (+ rebuild Task 4). ✓
- last30days vendored, 7d, zero-config + OpenRouter, premium-off-visible → Task 3 (+ rebuild/verify Task 4). ✓
- Decision matrix + persistence note → Task 5. ✓
- Image rebuild (base + per-agent) → Task 4. ✓
- Credentials never committed → Global Constraints + every key-touching step uses `<…>` placeholders. ✓
- youtube-search already shipped → referenced, not re-done. ✓
- Verification (Firecrawl scrape, tvly search, last30days run, live mix) → Tasks 4/6. ✓
- Magnific excluded → not in any task. ✓

**Placeholder scan:** `<FIRECRAWL_KEY>`/`<TAVILY_KEY>` are intentional secret placeholders (security), not gaps. Task 2 Step 2 / Task 3 Step 3 defer EXACT Dockerfile lines to "read the installer/requirements during build" — this is correct (the values are environment-determined: installer drop-path and the repo's pinned deps), and each has an explicit verification gate, not a vague "handle it". No other placeholders.

**Type/path consistency:** agent id `ag-1776256973199-ukacj8`, skill paths `/app/skills/{tavily,last30days,youtube-search}`, research dir `/workspace/agent/research/last30days`, brand wiki `/workspace/brand-wiki` — consistent across tasks. `json_insert(skills,'$[#]',…)` used identically in Tasks 2/3 to append.
