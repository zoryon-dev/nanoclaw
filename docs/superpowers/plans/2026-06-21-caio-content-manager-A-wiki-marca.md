# Caio Content Manager — Subsystem A (Brand Wiki) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest the curated Zoryon+Faryon brand subset into Zory's wiki, mount it read-only into Caio, and give Caio his own writable wiki for self-learning.

**Architecture:** Two-wiki model. Shared brand/knowledge wiki = Zory's existing `groups/dm-with-jonas/wiki` (Zory writes, Caio reads RO at `/workspace/brand-wiki`). Caio's own wiki = `groups/content-machine/wiki` (mounts at his standard `/workspace/agent/wiki`, he writes). Brand pages are compiled by batch subagents into the Karpathy LLM-wiki structure.

**Tech Stack:** NanoClaw host (Node/pnpm), `ncl` CLI, `container_configs` table (SQLite, `data/v2.db`), `q.ts` query wrapper, Docker (Caio image `nanoclaw-agent-v2-7545d4f2:ag-1776256973199-ukacj8`), the `wiki` container skill (markdown).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-21-caio-content-manager-A-wiki-marca-design.md`.
- Caio agent group id: `ag-1776256973199-ukacj8` (folder `content-machine`).
- Zory agent group folder: `dm-with-jonas`.
- Wiki structure (Karpathy pattern): `index.md`, `log.md`, `entidades/`, `conceitos/`, `topicos/`, `comparacoes/`. Pages kebab-case `.md`, cross-linked with relative markdown links. Log entries prefixed `## [YYYY-MM-DD] <op> | <title>`.
- Ingestion scope = high-value subset only (the file list in Task 1). Exclude all binaries/HTML/CSS/SVG/PDF/DOCX/JSON/YAML and `Pesquisas-Brutas/`.
- All `groups/**` runtime files (sources, wiki pages, CLAUDE.local.md) are **install-specific (gitignored)** — never committed. Only the plan/spec docs, `.gitignore`, and the memory file are committed.
- Mount allowlist (`~/.config/nanoclaw/mount-allowlist.json`) ALREADY allows `/root/nanoclaw/groups` read-only — no allowlist change needed.
- `additional_mounts` shape: `[{ "hostPath": "<abs>", "containerPath": "<rel-or-abs>", "readonly": true }]`. Relative containerPath resolves under `/workspace` (e.g. `"brand-wiki"` → `/workspace/brand-wiki`).
- Date for log/spec stamps: `2026-06-21`.

---

### Task 1: Stage the curated brand sources + ignore the raw drop

**Files:**
- Create: `groups/dm-with-jonas/sources/marca/zoryon/*.md` (7 files, copied)
- Create: `groups/dm-with-jonas/sources/marca/faryon/*.md` (8 files, copied)
- Modify: `.gitignore` (add `arquivos-empresa/`)

**Interfaces:**
- Produces: the immutable raw sources Task 2 compiles from, at `groups/dm-with-jonas/sources/marca/{zoryon,faryon}/`.

- [ ] **Step 1: Create the source dirs and copy the Zoryon subset**

```bash
cd /root/nanoclaw
mkdir -p groups/dm-with-jonas/sources/marca/zoryon groups/dm-with-jonas/sources/marca/faryon
Z=arquivos-empresa/zoryon-brand
cp "$Z/DOCS-OFICIAIS/02-posicionamento-marca.md" \
   "$Z/DOCS-OFICIAIS/03-avatares-icps.md" \
   "$Z/DOCS-OFICIAIS/01-business-overview.md" \
   "$Z/DOCS-OFICIAIS/05-catalogo-servicos.md" \
   "$Z/DOCS-OFICIAIS/09-estrategia-conteudo.md" \
   "$Z/DOCS-OFICIAIS/00-PROJETO-BASE.md" \
   groups/dm-with-jonas/sources/marca/zoryon/
cp "$Z/BRAND/brand-voice-guide.md" groups/dm-with-jonas/sources/marca/zoryon/zoryon-brand-voice-guide.md
```

- [ ] **Step 2: Copy the Faryon subset**

```bash
cd /root/nanoclaw
F=arquivos-empresa/faryon-brand
cp "$F/00-INDICE-MASTER.md" \
   "$F/00-RESUMO-EXECUTIVO.md" \
   groups/dm-with-jonas/sources/marca/faryon/
cp "$F/08-Personas/Personas-FARYON.md" groups/dm-with-jonas/sources/marca/faryon/
cp "$F/07-Naming-e-Marca/NAMING-HANDOFF.md" groups/dm-with-jonas/sources/marca/faryon/
cp "$F/01-Documentos-Projeto/v0.7-fronteira-juridica-e-nomenclatura.md" \
   "$F/01-Documentos-Projeto/v1.0-sintese-pesquisas-mercado.md" \
   "$F/01-Documentos-Projeto/v0.9-camadas-definidas.md" \
   groups/dm-with-jonas/sources/marca/faryon/
cp "$F/BRAND/brand-voice-guide.md" groups/dm-with-jonas/sources/marca/faryon/faryon-brand-voice-guide.md
```

- [ ] **Step 3: Verify only clean markdown landed**

Run:
```bash
cd /root/nanoclaw
echo "zoryon: $(ls groups/dm-with-jonas/sources/marca/zoryon | wc -l) files"
echo "faryon: $(ls groups/dm-with-jonas/sources/marca/faryon | wc -l) files"
find groups/dm-with-jonas/sources/marca -type f ! -name '*.md' | head
```
Expected: `zoryon: 7 files`, `faryon: 8 files`, and the `find` prints nothing (no non-markdown). If any source path is missing, locate the real filename with `ls "$F/01-Documentos-Projeto/" | grep -i v1.0` and adjust the copy before continuing.

- [ ] **Step 4: Prevent the raw drop from ever being committed**

```bash
cd /root/nanoclaw
grep -qxF 'arquivos-empresa/' .gitignore || printf '\n# Raw company-docs drop (staging only — curated subset lives in groups/dm-with-jonas/sources/marca/)\narquivos-empresa/\n' >> .gitignore
git status --short | grep arquivos-empresa && echo "STILL VISIBLE — fix .gitignore" || echo "ignored OK"
```
Expected: `ignored OK`.

- [ ] **Step 5: Commit the .gitignore change**

```bash
cd /root/nanoclaw
git add .gitignore
git commit -m "chore: gitignore arquivos-empresa raw drop (curated subset staged into wiki sources)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Compile the brand wiki pages (batch via subagents)

**Files:**
- Create: `groups/dm-with-jonas/wiki/entidades/{zoryon,faryon}.md`
- Create: `groups/dm-with-jonas/wiki/conceitos/{pilares-de-conteudo-zoryon,personas-zoryon,personas-faryon}.md`
- Create: `groups/dm-with-jonas/wiki/topicos/{voz-e-tom-zoryon,voz-e-tom-faryon,posicionamento-zoryon,posicionamento-faryon,catalogo-servicos-zoryon,naming-e-mercado-faryon}.md`
- Modify: `groups/dm-with-jonas/wiki/index.md`, `groups/dm-with-jonas/wiki/log.md`

**Interfaces:**
- Consumes: `groups/dm-with-jonas/sources/marca/{zoryon,faryon}/*.md` (Task 1).
- Produces: brand wiki pages Caio will read at `/workspace/brand-wiki/**` (Task 4).

- [ ] **Step 1: Confirm the existing wiki structure before writing into it**

Run:
```bash
cd /root/nanoclaw
ls groups/dm-with-jonas/wiki/
head -5 groups/dm-with-jonas/wiki/index.md
```
Expected: an existing `index.md`, `log.md`, and category dirs. If a category dir (`entidades/`, `conceitos/`, `topicos/`) is missing, create it with `mkdir -p`. Do NOT overwrite existing pages — only add the new brand pages and append to `index.md`/`log.md`.

- [ ] **Step 2: Dispatch the Zoryon compiler subagent**

Dispatch one subagent (general-purpose) with this exact task:

> Compile Zoryon brand wiki pages from the sources in `/root/nanoclaw/groups/dm-with-jonas/sources/marca/zoryon/` into `/root/nanoclaw/groups/dm-with-jonas/wiki/`, following the Karpathy LLM-wiki convention (read `container/skills/wiki/SKILL.md` first). Read ALL source files in full. Create these pages (kebab-case, PT-br, cross-linked with relative markdown links, frontmatter `tipo`/`fontes`/`atualizado: 2026-06-21`):
> - `entidades/zoryon.md` — what Zoryon is: business overview, model, the 5 sectors/service catalog, mission.
> - `conceitos/pilares-de-conteudo-zoryon.md` — the 4 content pillars (Diagnóstico, Setorização/Solução, Educação, Bastidores) + the blog-driven distribution engine (1 blog → carrossel/reel/YT/WhatsApp) + cadence.
> - `conceitos/personas-zoryon.md` — the 2 ICPs (Operador Travado, Construtor Solo) with revenue, pains, channels, budget.
> - `topicos/voz-e-tom-zoryon.md` — voice/tone (direto 80%, acessível, firme, humano, técnico 30%; "IA é meio não fim").
> - `topicos/posicionamento-zoryon.md` — positioning + enemy beliefs + vocabulary territory.
> - `topicos/catalogo-servicos-zoryon.md` — diagnóstico→implementação→operação flow + tiers.
> Do NOT touch `index.md`/`log.md` (the main session updates those). Synthesize — extract the essence, don't copy-paste whole docs. Report the list of files you created.

- [ ] **Step 3: Dispatch the Faryon compiler subagent (parallel with Step 2)**

Dispatch a second subagent (general-purpose) with this exact task:

> Compile Faryon brand wiki pages from the sources in `/root/nanoclaw/groups/dm-with-jonas/sources/marca/faryon/` into `/root/nanoclaw/groups/dm-with-jonas/wiki/`, following the Karpathy LLM-wiki convention (read `container/skills/wiki/SKILL.md` first). Read ALL source files in full (note `Personas-FARYON.md` is ~51KB). Create these pages (kebab-case, PT-br, cross-linked, frontmatter `tipo`/`fontes`/`atualizado: 2026-06-21`):
> - `entidades/faryon.md` — what Faryon is: concept, product layers (from v0.9), executive summary of decisions.
> - `conceitos/personas-faryon.md` — the 4 Faryon personas + the primary-persona decision.
> - `topicos/voz-e-tom-faryon.md` — voice/tone + archetype + the 5-question test framework from the brand-voice-guide.
> - `topicos/posicionamento-faryon.md` — positioning + the legal-boundary/nomenclature constraints (from v0.7).
> - `topicos/naming-e-mercado-faryon.md` — naming logic/concept (NAMING-HANDOFF) + market synthesis (v1.0).
> Do NOT touch `index.md`/`log.md`. Synthesize, don't copy-paste. Report the list of files you created.

- [ ] **Step 3 caveat (if executing inline rather than via the agentic harness):** run the two compilations sequentially as plain Read+Write work in this session instead of dispatching subagents. Same output pages.

- [ ] **Step 4: Update index.md and append the ingest log entry**

After both subagents report done, add the new pages to `groups/dm-with-jonas/wiki/index.md` under a "Marca" section (grouped: Zoryon, Faryon), each as `- [title](path) — one-line summary`, and append to `groups/dm-with-jonas/wiki/log.md`:

```markdown
## [2026-06-21] ingest | marca Zoryon + Faryon (subset alto valor)
Ingeridas as docs curadas de Zoryon (posicionamento, ICPs, pilares de conteúdo, voz, catálogo de serviços) e Faryon (personas, voz/arquétipo, posicionamento/fronteira jurídica, naming + síntese de mercado). Fontes em `sources/marca/{zoryon,faryon}/`. Páginas em `entidades/`, `conceitos/`, `topicos/`.
```

- [ ] **Step 5: Verify the pages exist and are linked**

Run:
```bash
cd /root/nanoclaw
find groups/dm-with-jonas/wiki/{entidades,conceitos,topicos} -name '*.md' -newermt '2026-06-21' | sort
grep -c 'marca\|zoryon\|faryon' groups/dm-with-jonas/wiki/index.md
tail -4 groups/dm-with-jonas/wiki/log.md
```
Expected: the 11 new pages listed; index.md grep count > 0; the log entry present. (No commit — `groups/**` is gitignored.)

---

### Task 3: Scaffold Caio's own (writable) wiki

**Files:**
- Create: `groups/content-machine/wiki/index.md`, `groups/content-machine/wiki/log.md`
- Create: `groups/content-machine/sources/.gitkeep` (and `wiki/{entidades,conceitos,topicos}/.gitkeep`)

**Interfaces:**
- Produces: Caio's writable wiki at his standard `/workspace/agent/wiki` (no mount needed — `groups/content-machine` is already his `/workspace/agent`).

- [ ] **Step 1: Create the dirs and seed files**

```bash
cd /root/nanoclaw
mkdir -p groups/content-machine/wiki/{entidades,conceitos,topicos,comparacoes} groups/content-machine/sources
cat > groups/content-machine/wiki/index.md <<'EOF'
# Wiki do Caio — índice

Minha base de conhecimento própria (auto-aprendizado): decisões de conteúdo, fluxos que funcionaram, aprendizados, briefs recorrentes. Para conhecimento de MARCA (Zoryon/Faryon), consulto `/workspace/brand-wiki/` (read-only).

## Categorias
_(vazio — preencho conforme aprendo)_
EOF
cat > groups/content-machine/wiki/log.md <<'EOF'
# Log da wiki do Caio
## [2026-06-21] init | wiki própria criada
Wiki own/RW criada. Marca vem da brand-wiki compartilhada (RO).
EOF
touch groups/content-machine/sources/.gitkeep groups/content-machine/wiki/{entidades,conceitos,topicos}/.gitkeep
```

- [ ] **Step 2: Verify**

Run: `ls -R groups/content-machine/wiki groups/content-machine/sources`
Expected: `index.md`, `log.md`, the four category dirs, and `sources/`. (No commit — gitignored.)

---

### Task 4: Mount the brand wiki read-only into Caio + restart

**Files:**
- Modify: `container_configs.additional_mounts` for `ag-1776256973199-ukacj8` (DB `data/v2.db`)
- Result (materialized at spawn): `groups/content-machine/container.json` `mounts` array

**Interfaces:**
- Consumes: the brand wiki dir `groups/dm-with-jonas/wiki` (Task 2).
- Produces: `/workspace/brand-wiki` (RO) inside Caio's container.

- [ ] **Step 1: Read the current additional_mounts**

Run:
```bash
cd /root/nanoclaw
pnpm exec tsx scripts/q.ts data/v2.db "SELECT additional_mounts FROM container_configs WHERE agent_group_id='ag-1776256973199-ukacj8'"
```
Expected: `[]` (Caio has no extra mounts today). If it is non-empty, merge rather than overwrite in Step 2.

- [ ] **Step 2: Add the brand-wiki RO mount**

Run (assumes current value is `[]`; if not, hand-merge the JSON array):
```bash
cd /root/nanoclaw
pnpm exec tsx scripts/q.ts data/v2.db "UPDATE container_configs SET additional_mounts='[{\"hostPath\":\"/root/nanoclaw/groups/dm-with-jonas/wiki\",\"containerPath\":\"brand-wiki\",\"readonly\":true}]', updated_at='2026-06-21T00:00:00.000Z' WHERE agent_group_id='ag-1776256973199-ukacj8'"
pnpm exec tsx scripts/q.ts data/v2.db "SELECT additional_mounts FROM container_configs WHERE agent_group_id='ag-1776256973199-ukacj8'"
```
Expected: the SELECT echoes the one-element array with `hostPath`, `containerPath:"brand-wiki"`, `readonly:true`.

- [ ] **Step 3: Restart Caio so the next spawn materializes + mounts it**

Run:
```bash
cd /root/nanoclaw
./bin/ncl groups restart --id ag-1776256973199-ukacj8
```
Expected: a restart confirmation. (No `--message` → Caio respawns on the next user message; the mount is in effect from that spawn.)

- [ ] **Step 4: Verify the mount resolves inside Caio's image**

Run (mirrors how the host mounts it; RO bind of the brand wiki):
```bash
cd /root/nanoclaw
docker run --rm -v /root/nanoclaw/groups/dm-with-jonas/wiki:/workspace/brand-wiki:ro \
  --entrypoint sh nanoclaw-agent-v2-7545d4f2:ag-1776256973199-ukacj8 \
  -c 'ls /workspace/brand-wiki && echo --- && head -3 /workspace/brand-wiki/index.md && (touch /workspace/brand-wiki/_x 2>&1 || echo "RO confirmed")'
```
Expected: lists the wiki (incl. the new `entidades/`/`conceitos/`/`topicos/` pages), prints the index head, and prints `RO confirmed` (write blocked).

---

### Task 5: Teach Caio the two-wiki convention

**Files:**
- Modify: `groups/content-machine/CLAUDE.local.md` (add a "Wikis" section)

**Interfaces:**
- Consumes: `/workspace/brand-wiki` (Task 4), `/workspace/agent/wiki` (Task 3).

- [ ] **Step 1: Add the Wikis section**

Insert this block into `groups/content-machine/CLAUDE.local.md` immediately after the `## Escopo de atuação` section (use the Edit tool, anchoring on the line that starts `- **Entrega final:**` or the end of that list):

```markdown

## Wikis (duas, papéis distintos)

- **`/workspace/brand-wiki/` — MARCA (read-only, mantida pela Zory).** Consulte ANTES de criar conteúdo: voz, personas/ICPs, posicionamento, pilares, catálogo de serviços (Zoryon e Faryon). Leia `index.md` primeiro, depois a página relevante (`entidades/`, `conceitos/`, `topicos/`). NUNCA escreva aqui.
- **`/workspace/agent/wiki/` — SUA (read-write, você é dono).** Sua base de auto-aprendizado: decisões de conteúdo, fluxos que funcionaram, briefs recorrentes, aprendizados. Use a skill `wiki` para manter (ela opera neste path). Registre aqui o que vale lembrar entre sessões e que não é marca.
- Não confunda: marca = leio da brand-wiki; minha operação/aprendizado = escrevo na minha. `CLAUDE.local.md` continua sendo memória de comportamento; Mem é ferramenta da Zory.
```

- [ ] **Step 2: Verify**

Run: `grep -n "brand-wiki" groups/content-machine/CLAUDE.local.md`
Expected: the new lines present. (No commit — gitignored.)

---

### Task 6: Live end-to-end smoke test

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Trigger Caio with a brand-knowledge question**

In the Caio DM (Telegram), send: `qual a voz da Zoryon e quais os 4 pilares de conteúdo?`
Expected: Caio answers from `/workspace/brand-wiki/` (voice attributes + the 4 pillars) without asking for the info or re-deriving. Confirm in `data/v2-sessions/ag-1776256973199-ukacj8/.../outbound.db` (`messages_out`) or directly in the chat.

- [ ] **Step 2: Confirm his own wiki is writable**

In the Caio DM, send: `salva na tua wiki: aprendizado X (teste)` — then verify a page/edit appears under `groups/content-machine/wiki/`.
Expected: a new/updated markdown file in Caio's own wiki (proves RW), while `/workspace/brand-wiki` stays untouched.

- [ ] **Step 3: Update the initiative memory + mark Subsystem A done**

Update `/root/.claude/projects/-root-nanoclaw/memory/project_caio_content_manager.md` Status: Subsystem A IMPLEMENTED (brand wiki ingested, Caio RO mount live, own wiki scaffolded, smoke-verified). Next: Subsystem B (research tools).

---

## Self-Review

**Spec coverage:**
- Source staging (subset, brand-namespaced, binaries excluded) → Task 1. ✓
- Batch ingestion via subagents into Karpathy structure + index/log → Task 2. ✓
- Caio's own RW wiki scaffold → Task 3. ✓
- Brand wiki RO mount + restart → Task 4. ✓
- CLAUDE.local.md two-wiki conventions → Task 5. ✓
- Verification (sources, pages, mount RO/RW, smoke Q&A) → Tasks 1/2/4/6. ✓
- Commit/install-specific handling (.gitignore for raw drop; groups/** gitignored) → Task 1 + Global Constraints. ✓
- Out-of-scope (B–F) untouched. ✓

**Placeholder scan:** Task 2 page content is produced by subagents (not hand-codeable verbatim) but each page has an exact path + explicit content brief — no "TBD". All commands are concrete. The inline-execution caveat (Task 2 Step 3) covers the non-agentic path.

**Type/path consistency:** mount uses `containerPath:"brand-wiki"` → `/workspace/brand-wiki` consistently across Tasks 4/5/6; Caio's own wiki `/workspace/agent/wiki` ↔ `groups/content-machine/wiki` consistent across Tasks 3/5/6; agent id `ag-1776256973199-ukacj8` consistent throughout.
