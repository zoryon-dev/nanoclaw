# Caio — Função Reels (skill `funcao-reels`) — Design

**Date:** 2026-06-22
**Status:** Approved (design), pending spec review
**Owner agent group:** content-machine (Caio, `ag-1776256973199-ukacj8`)

## Goal

Bring the `/root/nanoclaw/funcao-reels/` knowledge pack — a complete operating
system for producing high-retention educational Reels — into Caio **in full,
verbatim, losing nothing**, exposed as a container skill `funcao-reels`, with a
thin adapter layer that (a) wires the diagram step to a real generator (Napkin
primary, Magnific fallback), (b) adapts voice per brand (Zoryon/Faryon) from the
mounted brand-wiki, and (c) enforces an explicit deliverable contract so every
reel produces the three documented texts plus the diagram asset.

## Master constraint — fidelity

**The 16 source files are copied byte-for-byte. No summarization, no
truncation, no editing of the core.** The 70+ hook formulas, the 15 diagram
types, the second-by-second blueprint, the 4 reference research files — all
enter whole. Every integration decision (Napkin/Magnific mapping, brand voice,
output contract, Notion registration) lives in **new files layered on top**, per
the pack's own README §11 ("camada-adaptador fina por cima sem mexer no
núcleo"). If implementing any step would require changing a word inside
`modules/`, `templates/`, or `referencias/`, that is a spec violation — put the
change in the adapter instead.

## Source inventory (what "100% na íntegra" means)

All copied verbatim from `funcao-reels/` into the skill:

| Source | Lines | Destination (verbatim) |
|---|---|---|
| `00-INDICE-MESTRE.md` | 96 | `modules/00-INDICE-MESTRE.md` |
| `README.md` | 221 | `modules/README.md` |
| `01-CALIBRAGEM.md` | 60 | `modules/01-CALIBRAGEM.md` |
| `02-ROTEIRO-ENGINE.md` | 108 | `modules/02-ROTEIRO-ENGINE.md` |
| `03-BANCO-DE-HOOKS.md` | 190 | `modules/03-BANCO-DE-HOOKS.md` |
| `04-BIBLIOTECA-DIAGRAMAS.md` | 112 | `modules/04-BIBLIOTECA-DIAGRAMAS.md` |
| `05-COMPOSICAO.md` | 100 | `modules/05-COMPOSICAO.md` |
| `06-CTA-E-METRICAS.md` | 79 | `modules/06-CTA-E-METRICAS.md` |
| `07-QA-CHECKLIST.md` | 72 | `modules/07-QA-CHECKLIST.md` |
| `08-FORMATOS-SO-GRAVACAO.md` | 133 | `modules/08-FORMATOS-SO-GRAVACAO.md` |
| `templates/roteiro-reel.md` | 106 | `templates/roteiro-reel.md` |
| `templates/brief-diagrama-napkin.md` | 61 | `templates/brief-diagrama-napkin.md` |
| `referencias/analise-reels-referencia.md` | 117 | `referencias/analise-reels-referencia.md` |
| `referencias/playbook-hooks-01-gpt-deep.md` | 723 | `referencias/playbook-hooks-01-gpt-deep.md` |
| `referencias/playbook-hooks-02-estudo-instagram-2026.md` | 114 | `referencias/playbook-hooks-02-estudo-instagram-2026.md` |
| `referencias/playbook-hooks-03-compass-playbook.md` | 476 | `referencias/playbook-hooks-03-compass-playbook.md` |

Verification gate: a byte-for-byte diff (`diff -r`) between each copied file and
its source must be empty. The plan includes this check as an explicit step.

## Architecture

A **container skill** under `container/skills/funcao-reels/`, enabled for Caio by
adding `funcao-reels` to `groups/content-machine/container.json` `skills`. This
matches every other Caio subsystem (read-post, watch, magnific, r2-upload, wiki):
Caio is a single orchestrator that loads skills on demand; no new agent group.
Fidelity comes from verbatim content + a strict output contract, not from a
process boundary — a separate agent would only fragment the content context
(Notion, Drive, R2, brand-wiki) that already lives in Caio.

```
container/skills/funcao-reels/
├── SKILL.md                 ← NEW. Router: when to use, pipeline, output
│                              contract, brand adapter, diagram engine selection.
│                              Points to modules/ for every decision.
├── modules/                 ← VERBATIM core (10 files: 00–08 + README)
├── templates/               ← VERBATIM (2 files)
├── referencias/             ← VERBATIM (4 files)
├── ADAPTER.md               ← NEW. The thin layer: diagram engine (Napkin→Magnific),
│                              brand voice from wiki, deliverable contract, Notion.
└── scripts/
    └── napkin_generate.py   ← NEW. Gateway-injected Napkin call (no auth header),
                               writes svg/png to an output path. Magnific fallback
                               is an agent procedure documented in ADAPTER.md.
```

`SKILL.md` and `ADAPTER.md` reference the modules; they never duplicate or
restate module content (DRY against the verbatim core).

## Component 1 — SKILL.md (router)

Standard SKILL.md frontmatter (`name: funcao-reels`, description with trigger
phrases: "reel", "reels", "roteiro de reel", "vídeo curto educacional"). Body:

- One-paragraph statement of the pack's thesis (cite, do not restate, `modules/00`).
- The pipeline as a pointer list: each stage → which module file to open.
- **When to use / when not** (reel production vs carousel → /read-post stays separate).
- A hard pointer: "Read `modules/00-INDICE-MESTRE.md` first, then follow the
  pipeline. For diagram generation and brand voice, read `ADAPTER.md`."
- The output contract summary (full detail in ADAPTER.md).

No pack content is summarized here — SKILL.md is navigation only.

## Component 2 — ADAPTER.md (the thin layer)

Three concerns, all additive:

### 2a. Diagram engine — Napkin primary, Magnific fallback

The pack's `modules/04` and `templates/brief-diagrama-napkin.md` define the
generic Napkin recipe (`content`, `visual_query`, `style`, `language`,
`format`, `color_mode`, `transparent_background`). ADAPTER.md maps that recipe
to the real call without editing the module:

- **Primary — Napkin** via `scripts/napkin_generate.py`, which calls the Napkin
  API through the OneCLI gateway (credential injected, **no Authorization
  header in the script** — same contract as `notion_row.py` / `r2_upload.py`).
  Inputs are exactly the brief's parameters. Output: SVG (edit) + PNG (compose).
- **Fallback — Magnific** (already in Caio's MCP). When Napkin is unavailable
  (no token / API error / beta access not granted), the agent generates the
  diagram from the **same structured `content` text** via Magnific
  `images_generate_svg`. ADAPTER.md carries a `visual_query → Magnific prompt`
  mapping table for the 15 diagram types so the fallback preserves intent.
- The decision is automatic and logged: try Napkin; on failure, state "Napkin
  indisponível, usando Magnific" and proceed. Nothing blocks.

**Risk flagged:** Napkin's public API is beta/waitlisted. If the token/gateway
route cannot be established, the skill is fully functional on Magnific alone;
the Napkin path is wired but dormant until credentialed. The plan verifies
token viability before declaring the Napkin path live.

### 2b. Brand adapter — Zoryon / Faryon

Single core engine. The calibragem (`modules/01`) gains a brand tag (Zoryon |
Faryon) recorded in the deliverable. Voice, best-fit phrasing, examples, and
accent-color choices are **pulled from the brand-wiki at runtime** — already
mounted read-only in Caio at `brand-wiki/` (`additionalMounts` in
container.json). ADAPTER.md instructs: before writing the roteiro, read the
relevant brand's wiki pages for voice/positioning; tag every deliverable with
Marca to match the existing Notion `Marca` column. No fixed presets, no
duplication of the wiki.

### 2c. Deliverable contract (closes the fidelity gap on output)

Every `/reel` run produces and saves, under a per-reel working folder, then
mirrors to Drive + Notion:

1. **`roteiro-reel.md`** filled from the verbatim template — includes the
   **narration text** (prosa dos 6 beats, `modules/02`) and the **animated
   caption script** (palavra-a-palavra, `modules/02`).
2. **`brief-diagrama.md`** filled from the verbatim brief template — includes
   the **structured concept text fed into the diagram generator** (`modules/04`
   `content`).
3. **The diagram asset** (Napkin SVG+PNG, or Magnific SVG fallback).
4. **Notion registration** in the existing deliveries flow (`notion_delivery.py`,
   `Carrosséis — Entregas` DB) with `Marca` set and a `Formato`/tipo marking it
   a Reel, plus media in Drive. If the existing DB schema cannot represent a
   Reel cleanly, the plan proposes a minimal additive field — never a rewrite.

This is the answer to "preciso tanto dos diagramas quanto dos textos pro
Napkin": all three texts (narração, legenda, texto-cru-do-diagrama) are
documented in the pack (modules 02 + 04) — the contract just makes the skill
emit them as concrete artifacts every time.

## Component 3 — `scripts/napkin_generate.py`

- Gateway-injected REST call to the Napkin API; **no auth header** (gateway
  injects). Args mirror the brief: `--content`, `--visual-query`, `--style`,
  `--language` (default `pt-BR`), `--format` (svg|png), `--color-mode`
  (default dark), `--transparent` (flag), `--width`, `--out <path>`.
- `--dry-run` prints the request payload as JSON (host-testable without the
  gateway, like the other scripts) so the plan can TDD it.
- On non-2xx / missing credential, exits non-zero with a clear message telling
  the agent to use the Magnific fallback (per ADAPTER.md). The script never
  invents output.
- Runs **only inside Caio's container** (gateway-only). Host tests use
  `--dry-run`.

## Component 4 — Caio config + prompt

- `groups/content-machine/container.json`: add `funcao-reels` to `skills`
  (install-specific file, **not committed** — edited live).
- `groups/content-machine/system-prompt.md` (gitignored): one short line —
  when to trigger `/reel`, and that the deliverable is always *diagram + the
  three texts*, brand-tagged.

## What is committed vs install-specific

- **Committed:** `container/skills/funcao-reels/` (the whole skill — verbatim
  modules + SKILL.md + ADAPTER.md + script + a test for the script), this spec,
  the plan.
- **Never committed:** `groups/content-machine/container.json`,
  `system-prompt.md`, `CLAUDE.local.md`, `read-post-targets.json`, any
  per-reel output. The original `funcao-reels/` folder at repo root is already
  gitignored material; it stays as the source-of-truth snapshot (the plan does
  not delete it).

## Testing

- `scripts/napkin_generate.py`: unit test via `--dry-run` payload (host,
  pytest/python3, sibling of `test_notion_asset.py`) — asserts param mapping,
  pt-BR default, dark/transparent defaults, format handling.
- **Verbatim verification:** `diff -r` of every copied file against its source
  must be empty (a plan step, gated).
- **Live smoke (in-container, via `scripts/wake-with-task.ts`):** run one reel
  end-to-end for a real Zoryon concept — calibragem → roteiro (3 textos) →
  diagram (Napkin or documented Magnific fallback) → Notion registration —
  and confirm all four deliverables exist. A second pass for Faryon confirms
  the brand adapter swaps voice from the wiki.

## Out of scope (YAGNI)

- No separate Reels agent group.
- No subagent/fan-out execution of pipeline stages (sequential creative flow).
- No carousel/static "sibling modules" (the references support them, but the
  pack is Reels-only and stays that way).
- No editing of the pack core for any reason.

## Open items to resolve in the plan

1. Napkin API token viability through the OneCLI gateway (host pattern +
   credential). If unavailable, Magnific carries; Napkin path stays dormant.
2. Exact Notion `Carrosséis — Entregas` schema fit for a Reel row (reuse vs one
   additive field).
