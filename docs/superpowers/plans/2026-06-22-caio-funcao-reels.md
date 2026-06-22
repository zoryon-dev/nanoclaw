# Caio — Função Reels Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bring the `funcao-reels/` pack into Caio in full (verbatim) as the
`funcao-reels` skill, with Napkin-primary / Magnific-fallback diagram
generation, a brand adapter (Zoryon/Faryon) sourced from the brand-wiki, and an
explicit deliverable contract (3 texts + diagram + Notion + Drive), then prove
it end-to-end on 2–3 real themes.

**Architecture:** New container skill `container/skills/funcao-reels/` with the
16 source files copied byte-for-byte under `modules/`, `templates/`,
`referencias/`, plus a `SKILL.md` router, an `ADAPTER.md` thin layer, and three
gateway-injected scripts (`napkin_generate.py`, `notion_reel.py`,
`reel_drive.py`). Enabled for Caio via `container.json`. No new agent group.

**Tech Stack:** Python 3 (gateway scripts, no auth header — curl/urllib),
OneCLI gateway (Notion OAuth, Google Drive OAuth, Napkin token), Magnific MCP
(fallback diagram), claude.ai Notion MCP (host-side DDL for the Reels DB),
`scripts/wake-with-task.ts` (in-container live smoke).

## Global Constraints

- **Fidelity:** the 16 source files are copied byte-for-byte. `diff -r` against
  source MUST be empty. No edits to `modules/`, `templates/`, `referencias/`.
  Every adaptation lives in `SKILL.md` / `ADAPTER.md` / `scripts/`.
- **Gateway scripts send NO Authorization header** (gateway injects). Each
  ships a `--dry-run` that prints the payload for host TDD.
- **Reply pt-br in chat; English in code/commits/spec/plan markdown.**
- **Never commit install-specific files:** `groups/content-machine/container.json`,
  `system-prompt.md`, `CLAUDE.local.md`, `read-post-targets.json`, per-reel output.
- **Never add a manual `ntn_` Notion token to the vault** (collides with OAuth).
- **Staged files into Caio's workspace must be `chmod 644`** (container runs as
  node uid 1000).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Scaffold skill + verbatim copy + fidelity gate

**Files:**
- Create dir tree: `container/skills/funcao-reels/{modules,templates,referencias,scripts}`
- Copy (verbatim): the 10 root/numbered `.md` → `modules/`; 2 templates → `templates/`; 4 references → `referencias/`.

- [ ] Copy all 16 files preserving names (README.md → `modules/README.md`).
- [ ] Gate: `diff -r` each copied file vs its source under `funcao-reels/`. Any non-empty diff = stop and fix.
- [ ] Commit.

### Task 2: SKILL.md router

**Files:** Create `container/skills/funcao-reels/SKILL.md`

- Frontmatter: `name: funcao-reels`, description with trigger phrases (reel, reels, roteiro de reel, vídeo curto educacional).
- Body = navigation only (no pack content restated): thesis pointer → `modules/00`; pipeline stage → module map; when-to-use vs /read-post (carousel); hard pointer to read `modules/00-INDICE-MESTRE.md` first and `ADAPTER.md` for diagram + brand + output contract.

- [ ] Write SKILL.md.
- [ ] Commit.

### Task 3: ADAPTER.md (thin layer)

**Files:** Create `container/skills/funcao-reels/ADAPTER.md`

Three sections:
1. **Diagram engine:** Napkin primary via `scripts/napkin_generate.py`; Magnific fallback via `images_generate_svg`. Include a `visual_query → Magnific SVG prompt` table for the 15 diagram types (from `modules/04`). Automatic, logged decision.
2. **Brand adapter:** read `brand-wiki/` for the tagged brand's voice/best-fit/examples before writing the roteiro; tag every deliverable with Marca.
3. **Deliverable contract:** per reel produce + save `roteiro-reel.md` (narração + legenda), `brief-diagrama.md` (texto-cru), diagram asset; then `reel_drive.py` (mirror to Drive) and `notion_reel.py` (register). Spell out the exact script invocations.

- [ ] Write ADAPTER.md.
- [ ] Commit.

### Task 4: napkin_generate.py + test (TDD)

**Files:** Create `scripts/napkin_generate.py`, `scripts/test_napkin_generate.py`

- Args mirror the brief: `--content`, `--visual-query`, `--style`, `--language` (default pt-BR), `--format` svg|png, `--color-mode` (default dark), `--transparent` flag, `--width`, `--out`, `--dry-run`.
- `--dry-run` prints the request payload JSON. Real call: gateway (no auth header). Non-2xx / missing cred → exit non-zero with message "use Magnific fallback (ADAPTER.md)". Never invents output.

- [ ] Write the failing test (`--dry-run` payload: pt-BR default, dark/transparent defaults, format passthrough).
- [ ] Run test → fails.
- [ ] Implement script.
- [ ] Run test → passes.
- [ ] Commit.

### Task 5: Reels Notion DB + notion_reel.py + test (TDD)

**Files:** Create `scripts/notion_reel.py`, `scripts/test_notion_reel.py`; host-side create "Reels — Entregas" Notion DB.

- Host-side: via claude.ai Notion MCP, create DB "Reels — Entregas" under "Base | Nanoclaw" with props: Marca (select Zoryon/Faryon), Status (Rascunho/Entregue/Publicado), Data (date), Formato (select: Napkin/R1/R2/R3), Duração (rich_text), Objetivo (select), Pasta Drive (url), Hook (rich_text), Legenda (rich_text). Capture the data-source/DB id.
- `notion_reel.py`: sibling of `notion_delivery.py`. Bake the DB id. Gateway POST, no auth header. Args: `--titulo --marca --data --formato --duracao --objetivo --drive --hook --legenda-file --body-file --dry-run`. `--marca`/`--formato` normalized.

- [ ] Create the Notion DB (host) and record its id.
- [ ] Write failing test (`--dry-run`: Marca normalized, Formato normalized, props present).
- [ ] Run → fails. Implement. Run → passes.
- [ ] Commit (code only; DB id also recorded in read-post-targets.json in Task 7, which is NOT committed).

### Task 6: reel_drive.py (Drive mirror)

**Files:** Create `scripts/reel_drive.py` (+ `--dry-run` smoke if feasible)

- Modeled on `upload_drive.py` but file-type-agnostic: ensure parent "Reels — Entregas" → "YYYY-MM" → `<slug>` folder, upload every file in a dir (diagram + .md texts), make link-readable, print folder URL. Gateway (google-drive app), no auth header.

- [ ] Write the script.
- [ ] `--dry-run` (or `--help`) sanity check on host.
- [ ] Commit.

### Task 7: Wire Caio (install-specific — NOT committed)

**Files (all gitignored):** `groups/content-machine/container.json`, `system-prompt.md`, `read-post-targets.json`

- [ ] Add `funcao-reels` to `container.json` `skills`.
- [ ] Add `reels_database_id` / `reels_database_url` / `reels_drive_parent` to `read-post-targets.json`.
- [ ] system-prompt.md: one line — when to trigger `/reel`; deliverable = diagram + 3 texts, brand-tagged.
- [ ] Respawn Caio so the new skill + config load (`ncl groups restart` or wake-with-task).

### Task 8: End-to-end live smoke (2–3 themes) — up to 5 attempts

- [ ] Pick 2–3 real concepts (≥1 Zoryon, ≥1 Faryon) grounded in the brand-wiki.
- [ ] For each, enqueue a `/reel` task into Caio via `scripts/wake-with-task.ts`; poll outbound.db for completion.
- [ ] Verify per reel: roteiro-reel.md (narração + legenda) + brief-diagrama.md (texto-cru) + diagram asset + Notion row (correct Marca) + Drive folder. Brand voice differs Zoryon vs Faryon.
- [ ] On failure, diagnose, fix, retry (max 5 attempts total). Log each attempt.

### Task 9: Document + commit + push

- [ ] Append an Execution Record to this plan (tasks, smoke results, DB/Drive ids referenced, any fallbacks taken).
- [ ] Update memory (`project_caio_content_manager.md`): Função Reels skill live.
- [ ] Verify no install-specific files staged; commit; push to origin/main.
