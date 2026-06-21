# Zory Business-Pure Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape Zory into a lean business-pure agent (per the `v1/` package) while moving every Instagram flow to Caio — phased, with a verified-before-delete migration and per-phase rollback.

**Architecture:** Each phase mutates live agent state (group workspace files + the `container_configs` DB rows + session `inbound.db` cron rows) and ends with a verification gate. Phase 0 takes a full backup; every later phase is independently reversible by restoring that backup's tar + DB rows for the affected group.

**Tech Stack:** Node host (`ncl` CLI over Unix socket), `better-sqlite3` via `scripts/q.ts`, Docker agent containers (Bun runtime), Composio tool router, OneCLI gateway, global container skills (`container/skills/`).

## Global Constraints

- **No Instagram flow is deleted.** IG artifacts are copied to Caio and verified working there BEFORE Zory's originals are removed. `.watch-cookies.txt` is copied (not moved).
- **The LLM Wiki is untouched.** `groups/dm-with-jonas/wiki/` and `groups/dm-with-jonas/sources/` stay on Zory and are never modified by this plan.
- **Rollback is filesystem + DB, not git.** `groups/` and `data/` are gitignored. Never rely on `git checkout` to restore agent state.
- **Zory agent group id:** `ag-1776222866725-qnziz1` (folder `dm-with-jonas`).
- **Caio agent group id:** `ag-1776256973199-ukacj8` (folder `content-machine`).
- **Timezone for all schedule reasoning:** BRT (America/Sao_Paulo, UTC-3).
- **ncl is run from the host** (`./bin/ncl ...` from `/root/nanoclaw`); config verbs write the DB and need a `ncl groups restart` to take effect in the container.

---

### Task 0: Full backup (Phase 0)

**Files:**
- Create: `data/backups/refator-zory-<timestamp>/` (tars + DB dumps + HEAD record)

**Interfaces:**
- Produces: a restore point every later task references for rollback.

- [ ] **Step 1: Create the backup dir with a fixed timestamp**

```bash
cd /root/nanoclaw
TS=$(date +%Y%m%d-%H%M%S); echo "$TS" > /tmp/refator_ts
BK="data/backups/refator-zory-$TS"
mkdir -p "$BK"
echo "$BK"
```

- [ ] **Step 2: Tar both affected group directories**

```bash
BK="data/backups/refator-zory-$(cat /tmp/refator_ts)"
tar czf "$BK/dm-with-jonas.tgz" -C groups dm-with-jonas
tar czf "$BK/content-machine.tgz" -C groups content-machine
ls -la "$BK"
```

- [ ] **Step 3: Dump the affected central-DB rows**

```bash
BK="data/backups/refator-zory-$(cat /tmp/refator_ts)"
for t in agent_groups container_configs messaging_group_agents agent_destinations; do
  pnpm exec tsx scripts/q.ts data/v2.db \
    "SELECT * FROM $t WHERE id IN ('ag-1776222866725-qnziz1','ag-1776256973199-ukacj8') OR agent_group_id IN ('ag-1776222866725-qnziz1','ag-1776256973199-ukacj8')" \
    > "$BK/$t.txt" 2>/dev/null || true
done
ls -la "$BK"
```

- [ ] **Step 4: Back up Zory's session inbound.db (holds cron/task rows) and record HEAD**

```bash
BK="data/backups/refator-zory-$(cat /tmp/refator_ts)"
cp -a data/v2-sessions/ag-1776222866725-qnziz1 "$BK/zory-sessions"
git rev-parse HEAD > "$BK/git-head.txt"
echo "backup complete:"; find "$BK" -maxdepth 2 -type f | sort
```

- [ ] **Step 5: Verify the backup is restorable (smoke)**

```bash
BK="data/backups/refator-zory-$(cat /tmp/refator_ts)"
tar tzf "$BK/dm-with-jonas.tgz" | head -3
tar tzf "$BK/content-machine.tgz" | head -3
test -s "$BK/container_configs.txt" && echo "DB dump OK"
```
Expected: file listings print and "DB dump OK".

**Rollback:** N/A (this task only creates backups).

---

### Task 1: Move IG flows to Caio (Phase 1)

**Files:**
- Create: `groups/content-machine/carrosseis/` (copied), `groups/content-machine/read-post-targets.json`, `groups/content-machine/.watch-cookies.txt`
- Modify: `groups/content-machine/system-prompt.md` (append `/watch` + `/read-post` usage), Caio's `container_configs` row (enable `composio` MCP for the `instagram` toolkit)
- Remove (only after verify): `groups/dm-with-jonas/carrosseis/`, `groups/dm-with-jonas/read-post-targets.json`

**Interfaces:**
- Consumes: backup from Task 0.
- Produces: a Caio that can run `/read-post` and `/watch`; a Zory with no IG archiving artifacts.

- [ ] **Step 1: Copy IG artifacts into Caio's workspace**

```bash
cd /root/nanoclaw
cp -a groups/dm-with-jonas/carrosseis groups/content-machine/carrosseis
cp -a groups/dm-with-jonas/read-post-targets.json groups/content-machine/read-post-targets.json
cp -a groups/dm-with-jonas/.watch-cookies.txt groups/content-machine/.watch-cookies.txt
ls -la groups/content-machine/carrosseis groups/content-machine/read-post-targets.json groups/content-machine/.watch-cookies.txt
```
Expected: all three exist under `content-machine/`.

- [ ] **Step 2: Inspect Caio's current MCP config (decide how to wire `composio`/instagram)**

```bash
./bin/ncl groups config get --id ag-1776256973199-ukacj8
```
Read the output. If a `composio` (http tool router) server is already present, no MCP change is needed — instagram is a toolkit inside the router. If it is absent, add it by writing the `container_configs.mcp_servers` JSON directly (http servers cannot be added via `ncl add-mcp-server`, which only writes stdio servers):

```bash
# ONLY if composio is missing from Caio — copy Zory's tool-router URL:
pnpm exec tsx scripts/q.ts data/v2.db \
  "SELECT json_extract(mcp_servers,'$.composio') FROM container_configs WHERE id='ag-1776256973199-ukacj8'"
```

- [ ] **Step 3: If needed, add the `composio` http server to Caio's config**

Only run if Step 2 showed `composio` absent. Replace `<ROUTER_URL>` with Zory's tool-router URL (`https://backend.composio.dev/tool_router/trs_UB_TakAL9_aJ/mcp`) — or a Caio-specific router if Jonas prefers a separate session:

```bash
pnpm exec tsx scripts/q.ts data/v2.db \
  "UPDATE container_configs SET mcp_servers = json_set(mcp_servers,'$.composio', json('{\"type\":\"http\",\"url\":\"https://backend.composio.dev/tool_router/trs_UB_TakAL9_aJ/mcp\"}')) WHERE id='ag-1776256973199-ukacj8'"
./bin/ncl groups config get --id ag-1776256973199-ukacj8
```
Expected: `composio` now present in Caio's config. (Note for Jonas: the Composio account must have the `instagram` toolkit connected; if not, he authorizes it via `COMPOSIO_MANAGE_CONNECTIONS`.)

- [ ] **Step 4: Append `/watch` + `/read-post` usage to Caio's system prompt**

Add this block to the end of `groups/content-machine/system-prompt.md` (adapt wording to Caio's voice — he is the carousel machine, this is his new archiving capability):

```markdown
## Arquivamento de conteúdo (/watch + /read-post)

Você agora é o dono dos fluxos de captura de conteúdo do Instagram/TikTok (antes na Zory).

- **`/read-post <url>`** — arquiva carrosséis e reels: baixa a mídia, salva nas pastas do Drive por mês e registra na planilha "Referências — Conteúdo". A config (Drive root + planilha) está em `read-post-targets.json` no seu workspace; os cookies de sessão em `.watch-cookies.txt`. Reuse a config, não recrie.
- **`/watch <url|arquivo>`** — analisa um vídeo (baixa, extrai frames, transcreve) e responde sobre o conteúdo.
- Análises arquivadas anteriores ficam em `carrosseis/`.

Quando a Zory te delegar um link de conteúdo (`<message to="caio">`), use esses fluxos.
```

- [ ] **Step 5: Restart Caio and VERIFY `/read-post` works there (the gate)**

```bash
./bin/ncl groups restart --id ag-1776256973199-ukacj8 --message "Teste de migração: rode /read-post em modo verificação contra a planilha 'Referências — Conteúdo' configurada em read-post-targets.json e confirme acesso ao Drive root. Só confirme leitura, não arquive nada novo."
```
Watch the swarm chat / Caio's outbound for confirmation that it reached the sheet + Drive. **Do not proceed until Caio confirms.** If it fails (403/access), Jonas grants Drive/sheet access via OneCLI before continuing — Zory's originals stay put meanwhile.

- [ ] **Step 6: Only after the gate passes — remove the originals from Zory**

```bash
cd /root/nanoclaw
rm -rf groups/dm-with-jonas/carrosseis
rm -f groups/dm-with-jonas/read-post-targets.json
# .watch-cookies.txt stays on Zory (copied, not moved)
ls groups/dm-with-jonas/ | grep -E "carrosseis|read-post-targets" && echo "STILL PRESENT — STOP" || echo "removed from Zory OK"
```
Expected: "removed from Zory OK".

- [ ] **Step 7: Commit the version-controlled change (Caio's system-prompt is gitignored; record progress in the spec changelog)**

```bash
# group files are gitignored; append a changelog line to the spec and commit that
printf -- '- %s: Phase 1 done — IG flows live on Caio, removed from Zory.\n' "$(date +%Y-%m-%d)" \
  >> docs/superpowers/specs/2026-06-21-refatoracao-zory-design.md
git add docs/superpowers/specs/2026-06-21-refatoracao-zory-design.md
git commit -m "chore(refactor): phase 1 — IG flows migrated to Caio"
```

**Rollback:** `tar xzf data/backups/refator-zory-<ts>/dm-with-jonas.tgz -C groups` and `content-machine.tgz` likewise; restore Caio's `container_configs` row from the dump; `ncl groups restart` both groups.

---

### Task 2: Slim Zory's tool stack (Phase 2)

**Files:**
- Modify: Zory's `container_configs.mcp_servers` (drop `mem`, `parallel-search`, `parallel-task`)

**Interfaces:**
- Consumes: backup from Task 0.
- Produces: a Zory whose MCP stack = todoist, fireflies, firecrawl, qmd, composio (non-IG toolkits), native Google. (instagram toolkit usage now belongs to Caio; the shared `composio` router stays for github/neon/etc. only until the Operações agent exists — but per the spec those are dropped from the persona in Task 3, not the router itself.)

- [ ] **Step 1: Snapshot Zory's current MCP server names**

```bash
pnpm exec tsx scripts/q.ts data/v2.db \
  "SELECT json_group_array(key) FROM container_configs, json_each(container_configs.mcp_servers) WHERE id='ag-1776222866725-qnziz1'"
```
Expected: a JSON array including `mem`, `parallel-search`, `parallel-task`, `firecrawl`, `fireflies`, `todoist`, `qmd`, `composio`.

- [ ] **Step 2: Remove the dropped servers**

```bash
for s in mem parallel-search parallel-task; do
  ./bin/ncl groups config remove-mcp-server --id ag-1776222866725-qnziz1 --name "$s"
done
```
Expected: each prints `{ removed: "<s>" }`.

- [ ] **Step 3: Verify the kept set**

```bash
pnpm exec tsx scripts/q.ts data/v2.db \
  "SELECT json_group_array(key) FROM container_configs, json_each(container_configs.mcp_servers) WHERE id='ag-1776222866725-qnziz1'"
```
Expected: `mem`, `parallel-search`, `parallel-task` are gone; `todoist`, `fireflies`, `firecrawl`, `qmd`, `composio` remain.

- [ ] **Step 4: Restart Zory and confirm kept tools resolve**

```bash
./bin/ncl groups restart --id ag-1776222866725-qnziz1 --message "Verificação pós-enxugamento: confirme que Todoist, Firecrawl, Fireflies, Google nativo e a wiki (qmd) respondem. Liste qualquer tool que falhe."
```
Watch Zory's reply. **Gate:** kept tools must resolve before Task 3.

- [ ] **Step 5: Commit changelog**

```bash
printf -- '- %s: Phase 2 done — dropped mem/parallel from Zory; kept tools verified.\n' "$(date +%Y-%m-%d)" \
  >> docs/superpowers/specs/2026-06-21-refatoracao-zory-design.md
git add docs/superpowers/specs/2026-06-21-refatoracao-zory-design.md
git commit -m "chore(refactor): phase 2 — slim Zory tool stack"
```

**Rollback:** restore Zory's `container_configs` row from the Task 0 dump (it holds the full `mcp_servers` JSON), `ncl groups restart`.

---

### Task 3: Business-pure persona + MIT productivity (Phase 3)

**Files:**
- Create: `container/skills/produtividade-jonas/SKILL.md` (from `v1/skills/produtividade-jonas/SKILL.md`)
- Rewrite: `groups/dm-with-jonas/CLAUDE.local.md` (from `v1/zory/CLAUDE.md`)
- Modify: Zory's recurring `messages_in` task rows (re-point Ivy Lee crons → MIT ritual)

**Interfaces:**
- Consumes: backups; the slimmed Zory from Task 2.
- Produces: a Zory speaking the v1 business-pure persona, running MIT, Ivy Lee retired.

- [ ] **Step 1: Install the productivity skill globally (Zory has `skills:"all"`, so it auto-loads)**

```bash
cd /root/nanoclaw
mkdir -p container/skills/produtividade-jonas
cp v1/skills/produtividade-jonas/SKILL.md container/skills/produtividade-jonas/SKILL.md
ls container/skills/produtividade-jonas/
```
Expected: `SKILL.md` present.

- [ ] **Step 2: Rewrite Zory's persona from v1**

Replace the body of `groups/dm-with-jonas/CLAUDE.local.md` (keep the leading `@./.claude-global.md` import line) with the content of `v1/zory/CLAUDE.md`, adapting two things:
1. Keep the **swarm handoff block** (delegate to Caio/Lad) — and make it explicit that ALL Instagram/content goes to Caio now (Zory holds no IG archiving).
2. Reference the kept tools only (Todoist, Gmail/Calendar/Drive/Docs/Sheets native, Fireflies, Firecrawl, LLM Wiki via `wiki/` + `qmd`). Remove all Mem.ai (`mem-cli`) instructions and the dropped Composio toolkits (github/neon/cloudflare/metaads/GA4/short_io/tavily). Out-of-lane → route per v1 §Escopo.

- [ ] **Step 3: Identify Zory's live recurring task rows (the crons)**

```bash
SESS=$(ls data/v2-sessions/ag-1776222866725-qnziz1 | grep -v sessions | head -20)
for s in $SESS; do
  db="data/v2-sessions/ag-1776222866725-qnziz1/$s/inbound.db"
  test -f "$db" && echo "== $s ==" && \
    pnpm exec tsx scripts/q.ts "$db" \
      "SELECT id, process_after, recurrence, substr(content,1,80) FROM messages_in WHERE kind='task'" 2>/dev/null
done
```
Expected: the 18h Organizze reminder, weekly review, and any 08h/17h routine rows, with their `content`.

- [ ] **Step 4: Re-point each routine's `content` to the MIT ritual**

For each planning routine row found, rewrite `content` so the prompt invokes the MIT system instead of Ivy Lee. Use the exact db path + `<SESSION>`/`<ROW_ID>` discovered in Step 3. Concrete prompts to use:

Nightly ritual row:
```bash
pnpm exec tsx scripts/q.ts "data/v2-sessions/ag-1776222866725-qnziz1/<SESSION>/inbound.db" \
  "UPDATE messages_in SET content='Ritual noturno (skill produtividade-jonas, modo automático/proposta): 1) processe a Caixa de Entrada do Todoist até zerar; 2) trate as atrasadas (reagendar/concluir/remover); 3) prepare uma PROPOSTA do dia seguinte — 1 MIT candidata + até 7 TASKS_DIA — e apresente pro Jonas aprovar. Não decida a MIT sozinha.' WHERE id='<ROW_ID>'"
```

Morning routine row (if an 08h row exists):
```bash
pnpm exec tsx scripts/q.ts "data/v2-sessions/ag-1776222866725-qnziz1/<SESSION>/inbound.db" \
  "UPDATE messages_in SET content='Rotina 8h (BRT): 1) e-mails que pedem ação, com drafts prontos; 2) classifique (fatura/cobrança/acordo/importante); 3) compromissos do dia (Calendar); 4) relatório de tarefas — MIT do dia + TASKS_DIA (skill produtividade-jonas).' WHERE id='<ROW_ID>'"
```

The **18h Organizze reminder keeps its original `content`** (it is not an Ivy Lee artifact — leave it as-is). Keep every row's `process_after`/`recurrence` (the schedule slots) unchanged — only the planning rows' `content` changes.

- [ ] **Step 5: Restart Zory and smoke-test the new persona + MIT**

```bash
./bin/ncl groups restart --id ag-1776222866725-qnziz1 --message "Verificação: 1) você está em modo negócio-puro (sem IG, sem dev/mídia — roteia o que for fora da alçada). 2) Rode o ritual MIT em modo proposta: puxe candidatas e proponha 1 MIT + TASKS_DIA, sem decidir sozinha. 3) Confirme que a skill produtividade-jonas carregou e que Ivy Lee foi aposentado."
```
**Gate:** Zory must run MIT (not Ivy Lee) and behave business-pure.

- [ ] **Step 6: Commit**

```bash
cp v1/skills/produtividade-jonas/SKILL.md container/skills/produtividade-jonas/SKILL.md
git add container/skills/produtividade-jonas/SKILL.md
printf -- '- %s: Phase 3 done — v1 persona + MIT installed, Ivy Lee retired, crons re-pointed.\n' "$(date +%Y-%m-%d)" \
  >> docs/superpowers/specs/2026-06-21-refatoracao-zory-design.md
git add docs/superpowers/specs/2026-06-21-refatoracao-zory-design.md
git commit -m "feat(refactor): phase 3 — Zory business-pure persona + MIT productivity"
```

**Rollback:** restore `dm-with-jonas.tgz` (brings back old `CLAUDE.local.md`) and `zory-sessions/` (brings back old cron rows); `rm -rf container/skills/produtividade-jonas`; `ncl groups restart`.

---

### Task 4: Shared mount `/mnt/context` (Phase 4)

**Files:**
- Create: host dir `/srv/nanoclaw-context/context/` (from `v1/mount/`)
- Modify: mount allowlist (per `.claude/skills/manage-mounts/SKILL.md`), Zory's `container_configs` `additional_mounts`

**Interfaces:**
- Consumes: backups; the v1-persona Zory from Task 3 (which references `/mnt/context`).
- Produces: Zory reading the shared read-only base at session start.

- [ ] **Step 1: Place the shared base on the host**

```bash
sudo mkdir -p /srv/nanoclaw-context/context
sudo cp -a /root/nanoclaw/v1/mount/. /srv/nanoclaw-context/context/
ls -R /srv/nanoclaw-context/context | head -20
```
Expected: `about-me.md`, `voice.md`, `rules.md`, `projetos/` present.

- [ ] **Step 2: Read the manage-mounts skill and add the allowlist entry**

```bash
cat .claude/skills/manage-mounts/SKILL.md
```
Follow it to allowlist `/srv/nanoclaw-context/context` (the allowlist lives outside the project root per `src/modules/mount-security/index.ts`). Then wire Zory's mount — `additional_mounts` entry mapping host `/srv/nanoclaw-context/context` → container `/mnt/context`, read-only:

```bash
./bin/ncl groups config get --id ag-1776222866725-qnziz1   # confirm current additional_mounts
# add the mount (via manage-mounts skill workflow or by editing container_configs.additional_mounts JSON):
# [{"source":"/srv/nanoclaw-context/context","target":"/mnt/context","readonly":true}]
```

- [ ] **Step 3: Restart Zory and verify it can read the mount**

```bash
./bin/ncl groups restart --id ag-1776222866725-qnziz1 --message "Verificação de mount: leia /mnt/context/about-me.md e /mnt/context/projetos/INDICE.md e me diga o nome de um cliente listado. Se não conseguir ler, diga o erro."
```
**Gate:** Zory must read `/mnt/context`. If blocked, the allowlist entry is wrong — fix before committing.

- [ ] **Step 4: Commit changelog**

```bash
printf -- '- %s: Phase 4 done — /mnt/context shared base mounted on Zory (read-only).\n' "$(date +%Y-%m-%d)" \
  >> docs/superpowers/specs/2026-06-21-refatoracao-zory-design.md
git add docs/superpowers/specs/2026-06-21-refatoracao-zory-design.md
git commit -m "chore(refactor): phase 4 — mount /mnt/context on Zory"
```

**Rollback:** restore Zory's `container_configs` row (removes the mount); optionally `sudo rm -rf /srv/nanoclaw-context`; `ncl groups restart`.

---

### Task 5: End-to-end validation & close (Phase 5)

**Files:** none (validation only); final changelog commit.

**Interfaces:**
- Consumes: all prior phases.
- Produces: a signed-off refactor.

- [ ] **Step 1: Run the full validation checklist (from the spec)**

```bash
echo "Manual gates — confirm each via the live agents:"
cat docs/superpowers/specs/2026-06-21-refatoracao-zory-design.md | sed -n '/## Validation checklist/,/## Changelog/p'
```
Walk each box: Caio `/read-post` + `/watch` + `carrosseis/` readable; Zory kept tools resolve; dropped tools absent from persona; `produtividade-jonas` runs MIT; Ivy Lee gone; crons fire MIT content; Zory reads `/mnt/context`; wiki intact.

- [ ] **Step 2: Confirm the LLM Wiki is byte-identical to pre-refactor**

```bash
BK="data/backups/refator-zory-$(cat /tmp/refator_ts)"
mkdir -p /tmp/wiki-check && tar xzf "$BK/dm-with-jonas.tgz" -C /tmp/wiki-check dm-with-jonas/wiki
diff -r /tmp/wiki-check/dm-with-jonas/wiki groups/dm-with-jonas/wiki && echo "WIKI INTACT" || echo "WIKI CHANGED — INVESTIGATE"
```
Expected: "WIKI INTACT".

- [ ] **Step 3: Trigger a Caio handoff end-to-end**

Send Zory (via the normal DM channel) a content request ("transforma esse link em carrossel: <url>") and confirm she delegates to Caio with `<message to="caio">` and Caio picks up the IG flow. **Gate.**

- [ ] **Step 4: Final commit + retain backups**

```bash
printf -- '- %s: Phase 5 done — full validation passed; refactor complete. Backups retained pending sign-off.\n' "$(date +%Y-%m-%d)" \
  >> docs/superpowers/specs/2026-06-21-refatoracao-zory-design.md
git add docs/superpowers/specs/2026-06-21-refatoracao-zory-design.md
git commit -m "chore(refactor): phase 5 — Zory business-pure refactor validated & complete"
```

- [ ] **Step 5: Offer branch integration**

Per `superpowers:finishing-a-development-branch`, ask Jonas whether to merge `refactor/zory-business-pure` to `main`, open a PR, or keep the branch. Backups in `data/backups/` are deleted only after he signs off.

**Rollback:** full revert = restore both group tars + all dumped DB rows + `zory-sessions/`; `git checkout $(cat <BK>/git-head.txt)` for tracked files; `ncl groups restart` both groups.
