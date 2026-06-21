# Lobby Personal Concierge Cluster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing `lobby` agent into a single-channel personal concierge that orchestrates three backstage specialists (a new Treino agent + reused Naia and Finance), retiring their direct DMs and adding proactive rituals.

**Architecture:** Reuse the live specialist agents (no data loss); extract Lobby's training role into a new `treino` agent; rewrite `lobby` as a concierge that delegates via agent-to-agent `send_message` and reads specialist workspaces read-only for fast lookups. Voice is already global (router); watch binaries are already baked into the image; wiki skill is already mounted — only persona + a data dir are needed.

**Tech Stack:** Node host (`ncl` CLI over Unix socket), Bun agent containers, SQLite session DBs, Docker, OneCLI gateway, Hevy MCP, `container/skills/{watch,wiki}`.

## Global Constraints

- This cluster is **personal-life only**. Do NOT mount the business context base (`/workspace/extra/context`) on the concierge.
- **Reuse, never recreate** Naia (`ag-1778017244671-myb1ap`) and Finance (`finance`) — they hold live data (nutrition tracker, finance workbook). Preserve their workspaces.
- Finance stays **whole (PF + PJ)** inside the concierge.
- Single channel only: `mg-lobby-dm` (instance `telegram-lobby`). Naia's (`mga-1778017244671-w75xde`) and Finance's (`mga-finance`) direct wirings get deleted.
- `ncl` create/update/delete are **approval-gated** — each will surface an approval to the owner; approve to proceed.
- Lobby agent group id: `lobby`. Lobby active session: `sess-1778748957751-d3fb3l`.
- Run all host commands from `/root/nanoclaw`. Use `pnpm exec ncl ...` and `pnpm exec tsx scripts/q.ts ...`.
- Commit after each task. Branch: `feat/lobby-personal-concierge`.

## Known correction to the spec

The spec said to add `ffmpeg`/`yt-dlp` packages for `/watch`. **Not needed** — they are baked into the base image (`container/Dockerfile:39` ffmpeg, `:70` yt-dlp zipapp). Any group with `"skills": "all"` can already use `/watch`. No package change, no `--rebuild` for watch.

## File / resource map

- Create: `groups/treino/CLAUDE.local.md`, `groups/treino/container.json`, `groups/treino/system-prompt.md` (+ copied training history)
- Modify: `groups/lobby/CLAUDE.local.md`, `groups/lobby/container.json`
- Create: `groups/lobby/wiki/README.md` (wiki data root)
- Create: `groups/lobby/scheduled-jobs/_override-block.md`, `groups/lobby/scheduled-jobs/bom-dia.md`, `groups/lobby/scheduled-jobs/fechamento.md`
- Modify: `scripts/lobby/cron-jobs.json`
- Modify: `groups/naia/CLAUDE.local.md` (or its `system-prompt.md`), `groups/finance/CLAUDE.local.md`
- DB (via `ncl`): `agent_groups` (+treino), `agent_destinations` (6 rows), `messaging_group_agents` (−2 rows)

---

### Task 1: Create the Treino agent and migrate training data

**Files:**
- Create: `groups/treino/CLAUDE.local.md`, `groups/treino/container.json`
- Copy: `groups/lobby/conversations/` → `groups/treino/conversations/`
- Reference: current `groups/lobby/CLAUDE.local.md` (trainer content), `groups/lobby/container.json` (hevy MCP + vendor/hevy-mcp mount)

**Interfaces:**
- Produces: new agent group id (capture from `ncl groups create` output) — later tasks call it `<TREINO_ID>`. The folder is `treino`.

- [ ] **Step 1: Create the agent group**

```bash
cd /root/nanoclaw
pnpm exec ncl groups create --name Treino --folder treino
```

Approve the request. Capture the returned `id` — referred to below as `<TREINO_ID>`.

- [ ] **Step 2: Verify the group exists**

```bash
pnpm exec tsx scripts/q.ts data/v2.db "SELECT id, folder FROM agent_groups WHERE folder='treino'"
```

Expected: one row, folder `treino`, id matching `<TREINO_ID>`.

- [ ] **Step 3: Move the training persona into Treino**

Copy the current Lobby trainer content (the aluno profile, Hevy folder/routine IDs, Mounjaro schedule, training plan) from `groups/lobby/CLAUDE.local.md` into `groups/treino/CLAUDE.local.md`, and reframe the top so it is a **backstage specialist that reports to the concierge**, not a chat partner for Jonas. Header to use:

```markdown
# Treino — especialista de treino (backstage)

Você é o especialista de treino do cluster pessoal do Jonas. Você **não fala direto com o Jonas** — você recebe pedidos do concierge **Lobby** (via mensagem `from="lobby"`) e responde a ele de forma curta e objetiva (`send_message to="lobby"`). Sem saudação, sem "em que posso ajudar": entregue o dado/treino e pare.

Domínio: Hevy, rotinas, execução de treino, progressão, restrições físicas (joelho/coluna), janela do Mounjaro.

<!-- abaixo: todo o conteúdo de treino herdado do antigo Lobby — perfil do aluno, IDs de pastas/rotinas Hevy, plano da semana, histórico -->
```

Keep every Hevy ID verbatim (they are live handles).

- [ ] **Step 4: Copy training history**

```bash
cp -r groups/lobby/conversations groups/treino/conversations 2>/dev/null || true
ls groups/treino/
```

Expected: `CLAUDE.local.md`, `conversations/` present.

- [ ] **Step 5: Write Treino's container.json (Hevy MCP + Naia read-only mount)**

Create `groups/treino/container.json` mirroring the old Lobby Hevy wiring:

```json
{
  "mcpServers": {
    "hevy": {
      "command": "node",
      "args": ["/workspace/extra/hevy-mcp/node_modules/hevy-mcp/dist/cli.mjs"],
      "env": { "HEVY_API_KEY": "2c1b8058-1b9b-42fc-84ef-3f0fb606e720" }
    }
  },
  "packages": { "apt": [], "npm": [] },
  "additionalMounts": [
    { "hostPath": "/root/nanoclaw/vendor/hevy-mcp", "containerPath": "hevy-mcp", "readonly": true }
  ],
  "skills": "all",
  "groupName": "Treino",
  "assistantName": "Treino",
  "agentGroupId": "<TREINO_ID>"
}
```

Replace `<TREINO_ID>` with the real id from Step 1.

- [ ] **Step 6: Commit**

```bash
git add groups/treino/
git commit -m "feat(concierge): create Treino specialist from Lobby training data"
```

---

### Task 2: Rewrite Lobby as the concierge persona

**Files:**
- Modify: `groups/lobby/CLAUDE.local.md` (replace trainer content with concierge role)
- Create: `groups/lobby/wiki/README.md`

**Interfaces:**
- Consumes: specialist local names from Task 3 destinations — `treino`, `naia`, `finance`.
- Produces: the concierge persona that later smoke tests exercise.

- [ ] **Step 1: Replace `groups/lobby/CLAUDE.local.md` with the concierge persona**

Full new contents:

```markdown
# Lobby — concierge da vida pessoal do Jonas

Você é o **Lobby**, a recepção única da vida pessoal do Jonas no Telegram. O Jonas fala só com você. Por trás, você coordena 3 especialistas e entrega **uma resposta sintetizada** — ele nunca vê os bastidores.

## Escopo
Vida **pessoal**: treino, nutrição, finanças (pessoal + PJ), e o dia-a-dia do Jonas. Negócio/produtividade de empresa **não é seu** — isso é da Zory. Você não tem acesso ao contexto de negócio e não deve inventá-lo.

## Especialistas (backstage)
| Domínio | Destino (`to=`) | Faz |
|---|---|---|
| Treino | `treino` | Hevy, rotinas, progressão, Mounjaro |
| Nutrição | `naia` | tracker, OCR balança, adesão, alertas de saúde |
| Finanças | `finance` | lançamentos PF+PJ, workbook, faturas |

Para **contexto/consulta rápida** (sem ação), leia os workspaces montados read-only em `/workspace/agents/treino`, `/workspace/agents/naia`, `/workspace/agents/finance` — não gaste round-trip à toa.
Para **ação** (escrever no tracker, logar treino no Hevy, registrar despesa), **delegue**: `send_message to="<destino>"` com o pedido objetivo, espere a resposta (`from="<destino>"`) e relate na sua voz.

## Roteamento
- Domínio único → delega a 1 especialista, sintetiza a resposta.
- Multi-domínio → dispara para os relevantes, junta tudo numa resposta só.
- Pessoal/geral → responde direto (usando os mounts read-only quando precisar de dado).
- Quando for demorar (ação num especialista), avise curtinho: "checando com nutrição…".

## Alertas dos especialistas
Se um especialista te manda um alerta (`from="naia"`/`"finance"`/`"treino"`), você **repassa/sintetiza** pro Jonas. Nunca encaminhe cru — fale na voz do Lobby.

## Capacidades
- **Voz**: áudios do Jonas chegam já transcritos como `[Voice: …]` — trate como texto normal.
- **Assistir vídeo**: para um link/arquivo de vídeo, use a skill `/watch` (ffmpeg/yt-dlp já no container) e responda sobre o conteúdo.
- **Wiki pessoal**: base de conhecimento em `/workspace/agent/wiki/`. Use a skill de wiki para "adiciona no wiki" e "o que eu sei sobre X". É memória pessoal de longo prazo, não conversa.

## Rituais (proativos)
Você dispara bom-dia (~7h) e fechamento (~21h) — ver `scheduled-jobs/`. Consulta os 3 especialistas e manda **uma** mensagem consolidada.
```

- [ ] **Step 2: Provision the wiki data directory**

```bash
mkdir -p groups/lobby/wiki
cat > groups/lobby/wiki/README.md <<'EOF'
# Wiki pessoal do Jonas

Base de conhecimento de longo prazo do concierge Lobby. Um arquivo por nota.
Gerenciado pela skill de wiki. Não é histórico de conversa.
EOF
ls groups/lobby/wiki/
```

Expected: `README.md` present.

- [ ] **Step 3: Verify the persona no longer carries trainer data**

```bash
grep -ci "hevy\|leg press\|mounjaro" groups/lobby/CLAUDE.local.md
```

Expected: `0` (training specifics now live only in `groups/treino/`). The word "Mounjaro" may appear once as a Treino-domain reference in the table — if so, confirm it is only the routing table line, not migrated trainer data.

- [ ] **Step 4: Commit**

```bash
git add groups/lobby/CLAUDE.local.md groups/lobby/wiki/
git commit -m "feat(concierge): rewrite Lobby as personal concierge + wiki data dir"
```

---

### Task 3: Update Lobby's container.json for the concierge

**Files:**
- Modify: `groups/lobby/container.json`

**Interfaces:**
- Consumes: `<TREINO_ID>` (only for the human-readable mount comment; mounts use folder paths).
- Produces: concierge container config — read-only mounts of the three specialists, no business context, no Hevy/Fireflies MCP.

- [ ] **Step 1: Rewrite `groups/lobby/container.json`**

Full new contents:

```json
{
  "mcpServers": {},
  "packages": { "apt": [], "npm": [] },
  "additionalMounts": [
    { "hostPath": "/root/nanoclaw/groups/treino", "containerPath": "agents/treino", "readonly": true },
    { "hostPath": "/root/nanoclaw/groups/naia", "containerPath": "agents/naia", "readonly": true },
    { "hostPath": "/root/nanoclaw/groups/finance", "containerPath": "agents/finance", "readonly": true }
  ],
  "skills": "all",
  "groupName": "Lobby",
  "assistantName": "Lobby",
  "agentGroupId": "lobby"
}
```

Note: `hevy` and `fireflies` MCP servers removed (Hevy → Treino; Fireflies is business → Zory). No `/workspace/extra/context` mount. No new packages.

- [ ] **Step 2: Verify JSON is valid and excludes business context**

```bash
python3 -c "import json;c=json.load(open('groups/lobby/container.json'));print('mounts:',[m['containerPath'] for m in c['additionalMounts']]);print('mcp:',list(c['mcpServers'].keys()))"
grep -c "extra/context\|hevy\|fireflies" groups/lobby/container.json
```

Expected: mounts = `agents/treino, agents/naia, agents/finance`; mcp = `[]`; grep count `0`.

- [ ] **Step 3: Commit**

```bash
git add groups/lobby/container.json
git commit -m "feat(concierge): Lobby container — specialist mounts, drop Hevy/Fireflies, no business base"
```

---

### Task 4: Wire bidirectional agent-to-agent destinations

**Files:**
- DB only (via `ncl destinations add`)

**Interfaces:**
- Consumes: `<TREINO_ID>` from Task 1; fixed ids `lobby`, `ag-1778017244671-myb1ap` (Naia), `finance`.
- Produces: 6 destination rows. Concierge addresses `treino`/`naia`/`finance`; each specialist addresses `lobby`.

- [ ] **Step 1: Concierge → specialists (3 rows)**

```bash
cd /root/nanoclaw
pnpm exec ncl destinations add --agent-group-id lobby --local-name treino  --target-type agent --target-id <TREINO_ID>
pnpm exec ncl destinations add --agent-group-id lobby --local-name naia    --target-type agent --target-id ag-1778017244671-myb1ap
pnpm exec ncl destinations add --agent-group-id lobby --local-name finance --target-type agent --target-id finance
```

Approve each. Replace `<TREINO_ID>`.

- [ ] **Step 2: Specialists → concierge (3 rows)**

```bash
pnpm exec ncl destinations add --agent-group-id <TREINO_ID>            --local-name lobby --target-type agent --target-id lobby
pnpm exec ncl destinations add --agent-group-id ag-1778017244671-myb1ap --local-name lobby --target-type agent --target-id lobby
pnpm exec ncl destinations add --agent-group-id finance               --local-name lobby --target-type agent --target-id lobby
```

Approve each.

- [ ] **Step 3: Verify all 6 destinations**

```bash
pnpm exec tsx scripts/q.ts data/v2.db "SELECT agent_group_id, local_name, target_type, target_id FROM agent_destinations WHERE local_name IN ('treino','naia','finance','lobby') AND target_type='agent' ORDER BY agent_group_id"
```

Expected: lobby→{treino,naia,finance} and {treino,naia,finance}→lobby (6 rows total).

- [ ] **Step 4: Commit (records the wiring in the plan log; no tracked files change)**

```bash
git commit --allow-empty -m "feat(concierge): wire lobby <-> treino/naia/finance destinations"
```

---

### Task 5: Adapt Naia and Finance to report to the concierge

**Files:**
- Modify: `groups/naia/CLAUDE.local.md`
- Modify: `groups/finance/CLAUDE.local.md`

**Interfaces:**
- Consumes: destination `lobby` from Task 4.
- Produces: specialist personas that report to `lobby` and re-point proactive alerts.

- [ ] **Step 1: Prepend a backstage block to `groups/naia/CLAUDE.local.md`**

Insert at the very top (before the existing content), keeping everything below intact:

```markdown
## Modo backstage (concierge)

Você opera **atrás do concierge Lobby**, não em DM direto com o Jonas. Pedidos chegam `from="lobby"`; responda a ele (`send_message to="lobby"`) de forma **curta e factual** — sem saudação, sem "posso ajudar", só o resultado (registro feito / dado pedido / análise).

**Alertas proativos** (hipoglicemia, janela pós-Monjaro, risco em evento) vão **para o Lobby**, não direto pro Jonas: `send_message to="lobby"` com o alerta; o Lobby sintetiza e repassa.

Todo o resto abaixo (escopo, tracker, protocolos) continua valendo.

---
```

- [ ] **Step 2: Prepend the equivalent block to `groups/finance/CLAUDE.local.md`**

```markdown
## Modo backstage (concierge)

Você (Levis) opera **atrás do concierge Lobby**. Pedidos chegam `from="lobby"`; o card de confirmação de write continua obrigatório, mas a conversa é com o Lobby (`send_message to="lobby"`), não com o Jonas direto. Respostas curtas e factuais.

**Alertas** (fatura vencendo, saldo crítico) vão **para o Lobby** (`send_message to="lobby"`), que repassa ao Jonas.

PF + PJ continuam ambos no seu escopo. Todo o resto abaixo continua valendo.

---
```

- [ ] **Step 3: Verify both blocks landed**

```bash
grep -l "Modo backstage (concierge)" groups/naia/CLAUDE.local.md groups/finance/CLAUDE.local.md
```

Expected: both file paths printed.

- [ ] **Step 4: Commit**

```bash
git add groups/naia/CLAUDE.local.md groups/finance/CLAUDE.local.md
git commit -m "feat(concierge): Naia + Finance report to concierge, alerts routed via Lobby"
```

---

### Task 6: Retire the direct DMs of Naia and Finance

**Files:**
- DB only (via `ncl wirings delete`)

**Interfaces:**
- Consumes: wiring ids `mga-1778017244671-w75xde` (Naia/telegram-naia), `mga-finance` (Finance/telegram-finance).

> Do this only AFTER Tasks 4–5 so the specialists are reachable via the concierge before their direct doors close.

- [ ] **Step 1: Delete the two direct wirings**

```bash
cd /root/nanoclaw
pnpm exec ncl wirings delete --id mga-1778017244671-w75xde
pnpm exec ncl wirings delete --id mga-finance
```

Approve each.

- [ ] **Step 2: Verify they are gone and the concierge channel remains**

```bash
pnpm exec tsx scripts/q.ts data/v2.db "SELECT id, messaging_group_id, agent_group_id FROM messaging_group_agents WHERE agent_group_id IN ('finance','ag-1778017244671-myb1ap','lobby')"
```

Expected: no rows for `finance` or `ag-1778017244671-myb1ap`; the `lobby`↔`mg-lobby-dm` wiring still present.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "feat(concierge): retire Naia/Finance direct DMs (single channel)"
```

---

### Task 7: Register the concierge rituals (bom-dia + fechamento)

**Files:**
- Modify: `scripts/lobby/cron-jobs.json`
- Create: `groups/lobby/scheduled-jobs/_override-block.md`, `groups/lobby/scheduled-jobs/bom-dia.md`, `groups/lobby/scheduled-jobs/fechamento.md`

**Interfaces:**
- Consumes: `scripts/lobby/register-cron-jobs.ts` (existing; promptsDir = `groups/lobby/scheduled-jobs`), Lobby session `sess-1778748957751-d3fb3l`.

- [ ] **Step 1: Rewrite `scripts/lobby/cron-jobs.json` for 7h/21h**

```json
{
  "jobs": [
    { "id": "task-lobby-bom-dia",    "kind": "task", "recurrence": "0 7 * * *",  "promptFile": "bom-dia.md" },
    { "id": "task-lobby-fechamento", "kind": "task", "recurrence": "0 21 * * *", "promptFile": "fechamento.md" }
  ]
}
```

- [ ] **Step 2: Create the override block** (`groups/lobby/scheduled-jobs/_override-block.md`)

```markdown
[TAREFA DE SISTEMA — GATILHO DE CRON]

Isto é um disparo automático de cron, não uma mensagem do Jonas. Regras:

1. NÃO cumprimente como se ele tivesse acabado de falar. NÃO peça confirmação. Você INICIA.
2. Puxe os dados ANTES de escrever: consulte os especialistas (treino/naia/finance) ou leia os mounts read-only. Nunca invente número, treino, refeição ou valor.
3. Você tem um único destino (o Jonas, no Telegram). Escreva a mensagem final na voz do Lobby — sem wrapping, vai direto pra ele.
4. **Default = ENVIAR.** Não silencie por achar redundante ou por ele estar ativo. `<internal>silent run: {motivo}</internal>` só é permitido se (a) o arquivo do job tem regra explícita de não-enviar e ela bateu, (b) os especialistas necessários estão todos fora do ar, ou (c) você já disparou ESTE mesmo ritual nas últimas 4h.
5. Falha graciosa: se um especialista não responder, use o que tem dos outros e diga o que faltou — não silencie por isso.

Execute as instruções abaixo.

---
```

- [ ] **Step 3: Create `groups/lobby/scheduled-jobs/bom-dia.md`**

```markdown
# Bom-dia (disparo 7h BRT, todo dia)

Abertura curta do dia pessoal do Jonas. Uma mensagem, não um textão.

Antes de escrever, junte:
- **Treino** (`send_message to="treino"` ou mount read-only): qual é o treino de hoje (ou se é descanso).
- **Nutrição** (`naia`): meta do dia / foco nutricional, e qualquer alerta (janela Monjaro, evento).
- **Finanças** (`finance`): alerta financeiro do dia, se houver (fatura/compromisso vencendo). Sem alerta = não force linha.

Monte:
- Treino do dia em destaque.
- Foco nutricional em 1 linha.
- Alerta financeiro só se existir.
- Fechamento curto na voz do Lobby.

Não enviar se: hoje é descanso, sem meta, sem alerta nenhum dos três — aí emita `<internal>`.
```

- [ ] **Step 4: Create `groups/lobby/scheduled-jobs/fechamento.md`**

```markdown
# Fechamento (disparo 21h BRT, todo dia)

Fechamento curto do dia. Consolida adesão, não cobra.

Antes de escrever, junte:
- **Treino** (`treino`): o treino de hoje foi feito? (se descanso, pula.)
- **Nutrição** (`naia`): adesão do dia / se já registrou o diário; se faltou registro, ofereça registrar agora.
- **Finanças** (`finance`): gasto do dia dentro da meta? alerta pra amanhã?

Monte uma síntese de 3-4 linhas, tom leve, sem julgamento. Termine oferecendo fechar o que ficou pendente (ex: registrar o diário da Naia).

Não enviar se: já disparou o fechamento nas últimas 4h.
```

- [ ] **Step 5: Confirm the Lobby session inbound DB exists**

```bash
ls data/v2-sessions/lobby/sess-1778748957751-d3fb3l/inbound.db
```

Expected: path prints (no error). If missing, list sessions: `pnpm exec tsx scripts/q.ts data/v2.db "SELECT id FROM sessions WHERE agent_group_id='lobby'"` and use the current one.

- [ ] **Step 6: Register the crons**

```bash
cd /root/nanoclaw
npx tsx scripts/lobby/register-cron-jobs.ts --session sess-1778748957751-d3fb3l
```

Expected: `✅ 2 cron jobs registered ...`.

- [ ] **Step 7: Verify the recurring rows**

```bash
pnpm exec tsx scripts/q.ts data/v2-sessions/lobby/sess-1778748957751-d3fb3l/inbound.db "SELECT id, kind, recurrence, datetime(process_after) FROM messages_in WHERE recurrence IS NOT NULL"
```

Expected: `task-lobby-bom-dia` (`0 7 * * *`) and `task-lobby-fechamento` (`0 21 * * *`), each with a future `process_after`.

- [ ] **Step 8: Commit**

```bash
git add scripts/lobby/cron-jobs.json groups/lobby/scheduled-jobs/
git commit -m "feat(concierge): bom-dia 7h + fechamento 21h rituals"
```

---

### Task 8: Restart, spawn, and smoke-test the cluster

**Files:**
- None (runtime)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Restart the four groups so they pick up new personas/config**

```bash
cd /root/nanoclaw
pnpm exec ncl groups restart --id lobby
pnpm exec ncl groups restart --id <TREINO_ID>
pnpm exec ncl groups restart --id ag-1778017244671-myb1ap
pnpm exec ncl groups restart --id finance
```

(Treino's image builds on first spawn automatically; no `--rebuild` needed since no new packages.)

- [ ] **Step 2: Verify the concierge container can spawn**

Send a plain message in the Telegram concierge DM (`@telegram-lobby` bot): `oi`. Then check it landed and produced a reply:

```bash
pnpm exec tsx scripts/q.ts data/v2-sessions/lobby/sess-1778748957751-d3fb3l/outbound.db "SELECT seq, substr(content,1,80) FROM messages_out ORDER BY seq DESC LIMIT 3"
```

Expected: a concierge reply in Lobby's voice (no trainer persona).

- [ ] **Step 3: Smoke-test delegation (single domain)**

In the concierge DM, ask a nutrition question that requires Naia, e.g. `posso comer tapioca com ovo agora?`. Watch the host log for the agent-to-agent hop:

```bash
tail -n 40 logs/nanoclaw.log | grep -iE "lobby|naia|destination|send_message"
```

Expected: Lobby delegates to `naia`, Naia replies, Lobby relays one synthesized answer. Confirm Jonas sees a single message, not two bots.

- [ ] **Step 4: Smoke-test a training delegation**

In the concierge DM: `qual meu treino de hoje?`. Expected: Lobby consults `treino`, returns today's workout (Hevy data intact).

- [ ] **Step 5: Confirm voice + watch are live (optional manual)**

Send a short voice note → expect it handled as `[Voice: …]`. Send a video link with "assiste isso" → expect `/watch` to run and the concierge to describe the content.

- [ ] **Step 6: Final commit**

```bash
git commit --allow-empty -m "test(concierge): cluster spawns, delegates, and synthesizes (smoke verified)"
```

---

## Self-Review

**Spec coverage:**
- Topology concierge + backstage → Tasks 2,3,4,8 ✓
- Reuse specialists, extract Treino → Tasks 1,5 ✓
- Personal-only, no business base → Task 3 (verified grep) ✓
- Finance whole PF+PJ → Task 5 block keeps scope ✓
- Single channel, retire direct DMs → Task 6 ✓
- Proactive rituals + alerts via concierge → Tasks 5,7 ✓
- Voice (already global) → Task 8 Step 5, no work ✓
- Watch (binaries baked) → spec correction noted; Task 2 persona + Task 8 ✓
- Wiki (skill mounted) → Task 2 data dir + persona ✓
- Read-only context mounts → Task 3 ✓
- Migration without data loss → Task 1 (verbatim Hevy IDs, copied history) ✓

**Placeholder scan:** Only intentional variable is `<TREINO_ID>` (generated at Task 1 Step 1, used downstream) — documented, not a gap. No "TBD/handle edge cases" left.

**Type/name consistency:** Destination local names `treino`/`naia`/`finance`/`lobby` are used identically in Tasks 4, 5, 7 personas and Task 8 smoke tests. Wiring ids and agent group ids match the verified DB values.
