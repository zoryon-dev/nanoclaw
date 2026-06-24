# Voya — Travel Guide Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up "Voya", a standalone personal Brazil/Nordeste travel-guide NanoClaw agent on its own dedicated Telegram bot, with web search + native memory, mirroring the proven "brown" dedicated-bot pattern.

**Architecture:** Voya is its own agent group (folder `voya`) — NOT backstage. The dedicated Telegram bot token is stored in the legacy `agent_groups.container_config` JSON column (`telegramBotToken`); the host's `registerSecondaryBots()` discovers it at startup and registers a DM-only adapter under channel_type `telegram-voya`. A `messaging_groups` row (channel_type `telegram-voya`, Jonas's constant Telegram chat-id) wired to the agent group routes Jonas's DMs to Voya. Container config (table-driven: model, skills, firecrawl MCP) drives `groups/voya/container.json` at spawn; the persona lives in `groups/voya/CLAUDE.local.md`; web search comes from the same firecrawl HTTP MCP + `research`/`tavily` skills the swarm already uses. Native Claude memory needs no setup.

**Tech Stack:** NanoClaw v2 (Node host + Bun container), SQLite central DB (`data/v2.db`) via `scripts/q.ts`, Telegram adapter, firecrawl HTTP MCP, OneCLI gateway (`research`/`tavily` skills), systemd-managed host.

## Global Constraints

- **This is provisioning + content authoring, not unit-tested code.** Each task's "test" is a verification command with expected output (verification-before-completion discipline). There is no vitest/bun:test to run.
- **Model:** `claude-opus-4-8` (mirrors the swarm; adjustable later to a cheaper tier if desired).
- **Token secrecy — HARD RULE:** the Voya Telegram bot token (`8959920932:AAG-…`, provided by Jonas in chat) goes ONLY into `data/v2.db` (`agent_groups.container_config`) and `.env` is NOT used for it. NEVER write the token into any file under `docs/`, never `git add` it, never echo it into chat. `groups/*` is gitignored (`.gitignore:15`) so `groups/voya/` files are install-local and never committed.
- **Host restart:** the host is the **system** systemd unit. Restart with `systemctl restart nanoclaw` (NOT `--user`, NOT slug-scoped). Required to register the new `telegram-voya` adapter.
- **DB access:** use `pnpm exec tsx scripts/q.ts data/v2.db "<sql>"` (handles both SELECT and mutations). Never the `sqlite3` binary.
- **Owner access:** Jonas (`telegram:8557164566`) is a **global owner** — he can access any agent group with no per-group membership. Voya needs NO `agent_group_members` rows (Brown has none).
- **Jonas's Telegram chat-id is constant across all his bots** = `8557164566` → `platform_id` `telegram:8557164566`.
- **Reference template:** the "brown" agent group (`b335198d-2904-4b41-b92a-015cdc71c956`) is the working analog. Mirror its row shapes.
- Chat updates to Jonas in pt-br; this plan/spec/code stays English.
- Commit only repo-tracked artifacts (the plan, the spec). Do NOT commit `groups/voya/` or DB.

---

### Task 1: Scaffold `groups/voya/` — persona + destination reference

**Files:**
- Create: `groups/voya/CLAUDE.local.md` (persona / system prompt — install-local, NOT committed)
- Create: `groups/voya/referencia-capacidades.md` (the source capability doc, moved into the workspace as a consultable reference)
- Source: `guia-turistico-capacidades.md` (repo root, currently untracked — moved here)

**Interfaces:**
- Produces: the persona file the agent loads, and `referencia-capacidades.md` which the persona instructs Voya to consult for destination scope.

- [ ] **Step 1: Create the folder and move the source doc into the workspace**

```bash
cd /root/nanoclaw
mkdir -p groups/voya
git mv guia-turistico-capacidades.md groups/voya/referencia-capacidades.md 2>/dev/null \
  || mv guia-turistico-capacidades.md groups/voya/referencia-capacidades.md
```

(`git mv` removes it from the untracked root; if git refuses because it's untracked, the `mv` fallback runs. Either way it lands in the gitignored `groups/voya/`.)

- [ ] **Step 2: Author the persona** — write `groups/voya/CLAUDE.local.md` with exactly this content:

```markdown
# Voya — Guia de Turismo Pessoal

Você é a **Voya**, guia de turismo pessoal do Jonas, especialista em viagens pelo
Brasil com foco no **Nordeste**. Você conversa com o Jonas pelo Telegram para
planejar as viagens **dele** — recomenda destinos, compara opções, monta roteiros
dia-a-dia, sugere onde comer e ficar, e responde dúvidas de viagem.

## Tom e jeito

Você é **o amigo que conhece todo mundo no destino**: acolhedor, direto, opinativo.
Dá o pulo do gato, avisa das ciladas de turista, não enrola. Fala como guia local de
confiança — sem corporativês, sem encher linguiça. Responde em **português**.

## Como você trabalha

1. Antes de recomendar, entenda o essencial: perfil da viagem (sozinho, casal,
   família, amigos), ritmo (intenso x relaxado), orçamento, época, e o que o Jonas
   curte. Use a memória — se já sabe das preferências dele, não pergunte de novo.
2. Proponha, compare, e entregue no formato certo (veja "Formatos").
3. Para destinos, seu conhecimento próprio já cobre muito do Nordeste. Para qualquer
   coisa que precise estar **atual ou verificada** (preço, horário, evento, avaliação
   recente, condição do momento), **busque na web**.
4. Consulte `referencia-capacidades.md` na sua pasta como mapa do escopo de destinos e
   capacidades quando precisar de um checklist do que cobrir.

## Ferramentas

- **Busca web** (research / tavily / firecrawl) — sua principal ferramenta. Use para
  avaliações (lê TripAdvisor/Google na fonte), eventos e datas de festas, preços
  aproximados, dicas práticas, condições atuais.
- **Memória** — guarde o perfil de viajante do Jonas entre conversas: gostos,
  restrições alimentares/acessibilidade, destinos já feitos, preferências de
  hospedagem e ritmo. Lembre disso nas próximas conversas.

## Regras de honestidade (importante)

- **Avise quando um dado pode estar desatualizado** (preço, horário) e sugira
  confirmar na fonte.
- **Nunca invente** avaliação, preço ou disponibilidade. Se não tem a ferramenta pra
  saber, diga que não tem.
- **Voos, hotéis e marés**: você **orienta e manda o link** (Google Flights, Booking/
  Airbnb, tábua de marés da Marinha) — não tem integração de reserva. A confirmação
  final (pagar, submeter dados) é sempre do Jonas.
- Segurança sem alarmismo e sem reforçar estigma de bairro ou cidade.
- Respeite regras ambientais de destinos sensíveis (Fernando de Noronha, Lençóis
  Maranhenses, parques nacionais).

## Formatos de entrega (escolha conforme a pergunta)

- Resposta de conversa rápida e direta.
- Roteiro dia-a-dia (manhã/tarde/noite, com deslocamentos e folgas realistas).
- Tabela comparativa (ex.: pousadas lado a lado).
- Checklist de mala/documentos por tipo de viagem.
- Orçamento estimado detalhado.
- Cartão-resumo: "tudo sobre [destino] em uma tela".

## Limite de escopo

Você é uma guia de turismo. Mantenha o foco em viagem; se o Jonas puxar outro
assunto, responda com bom senso mas traga de volta pro que você faz bem.
```

- [ ] **Step 3: Verify both files exist and the root doc is gone**

```bash
cd /root/nanoclaw
ls -la groups/voya/CLAUDE.local.md groups/voya/referencia-capacidades.md
test ! -f guia-turistico-capacidades.md && echo "OK: root doc moved" || echo "FAIL: root doc still present"
```

Expected: both files listed; "OK: root doc moved".

- [ ] **Step 4: Confirm git will not track Voya's files (token safety)**

```bash
cd /root/nanoclaw
git check-ignore groups/voya/CLAUDE.local.md groups/voya/referencia-capacidades.md
```

Expected: both paths echoed back (meaning they are ignored). If nothing prints, STOP — do not proceed; the token would be at risk.

---

### Task 2: Create the agent group + container config rows

**Files:**
- Modify (DB): `data/v2.db` — `agent_groups` + `container_configs` tables

**Interfaces:**
- Consumes: nothing.
- Produces: `agent_groups.id` for Voya (a generated UUID, call it `$AGID`), reused by Tasks 3. The legacy `container_config` JSON carrying `telegramBotToken` (consumed by the host adapter loader at restart). Container config: model `claude-opus-4-8`, assistant_name `Voya`, skills `["research","tavily","onecli-gateway","self-customize"]`, firecrawl HTTP MCP, `cli_scope='group'`.

- [ ] **Step 1: Generate a stable UUID for the agent group and store it in a file** (so later steps/sessions reuse the same id)

```bash
cd /root/nanoclaw
node -e "console.log(require('crypto').randomUUID())" > /tmp/voya_agid.txt
AGID=$(cat /tmp/voya_agid.txt); echo "Voya agent_group id = $AGID"
```

- [ ] **Step 2: Insert the `agent_groups` row** — the legacy `container_config` JSON holds the bot token. Replace `__TOKEN__` with the real Voya token from chat (`8959920932:AAG-…`). Do NOT paste the token into any committed file.

```bash
cd /root/nanoclaw
AGID=$(cat /tmp/voya_agid.txt)
TOKEN='__TOKEN__'   # ← paste the real Voya bot token here, in-shell only
pnpm exec tsx scripts/q.ts data/v2.db "INSERT INTO agent_groups (id, name, folder, agent_provider, container_config, created_at) VALUES ('$AGID', 'Voya', 'voya', NULL, json_object('telegramBotToken','$TOKEN','groupName','Voya','assistantName','Voya','agentGroupId','$AGID'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
```

- [ ] **Step 3: Insert the `container_configs` row** (table-driven config → materialized to `groups/voya/container.json` at spawn). Reuses the swarm's firecrawl HTTP MCP URL.

```bash
cd /root/nanoclaw
AGID=$(cat /tmp/voya_agid.txt)
pnpm exec tsx scripts/q.ts data/v2.db "INSERT INTO container_configs (agent_group_id, provider, model, effort, image_tag, assistant_name, max_messages_per_prompt, skills, mcp_servers, packages_apt, packages_npm, additional_mounts, updated_at, cli_scope) VALUES ('$AGID', NULL, 'claude-opus-4-8', NULL, NULL, 'Voya', NULL, json('[\"research\",\"tavily\",\"onecli-gateway\",\"self-customize\"]'), json('{\"firecrawl\":{\"type\":\"http\",\"url\":\"https://mcp.firecrawl.dev/fc-d8064d211d824a8e8a7b40773a6832ea/v2/mcp\"}}'), '[]', '[]', '[]', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'group')"
```

- [ ] **Step 4: Verify both rows, and that the token is present but never printed in full**

```bash
cd /root/nanoclaw
AGID=$(cat /tmp/voya_agid.txt)
pnpm exec tsx scripts/q.ts data/v2.db "SELECT id, name, folder, CASE WHEN container_config LIKE '%telegramBotToken%' THEN 'token-present' ELSE 'NO TOKEN' END FROM agent_groups WHERE id='$AGID'"
pnpm exec tsx scripts/q.ts data/v2.db "SELECT agent_group_id, model, assistant_name, cli_scope, skills, substr(mcp_servers,1,60) FROM container_configs WHERE agent_group_id='$AGID'"
```

Expected: agent_groups row shows `Voya|voya|token-present`; container_configs row shows model `claude-opus-4-8`, assistant `Voya`, cli_scope `group`, the 4-skill list, and the firecrawl MCP prefix.

---

### Task 3: Create the messaging group + wiring (route Jonas's DMs to Voya)

**Files:**
- Modify (DB): `data/v2.db` — `messaging_groups` + `messaging_group_agents` tables

**Interfaces:**
- Consumes: `$AGID` from Task 2.
- Produces: a `messaging_groups` row (`telegram-voya` / `telegram:8557164566` / instance `telegram-voya`) and a wiring (`agent-shared`, `pattern`, `.`, `all`, `drop`) — mirrors Brown's wiring exactly.

- [ ] **Step 1: Insert the messaging group** (channel_type and instance both `telegram-voya`, matching how `registerSecondaryBots` names the adapter)

```bash
cd /root/nanoclaw
pnpm exec tsx scripts/q.ts data/v2.db "INSERT INTO messaging_groups (id, channel_type, platform_id, instance, name, is_group, unknown_sender_policy, created_at) VALUES ('mg-voya-dm', 'telegram-voya', 'telegram:8557164566', 'telegram-voya', 'Voya DM', 0, 'strict', strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
```

- [ ] **Step 2: Insert the wiring** (mirror Brown: agent-shared session, always-on pattern)

```bash
cd /root/nanoclaw
AGID=$(cat /tmp/voya_agid.txt)
pnpm exec tsx scripts/q.ts data/v2.db "INSERT INTO messaging_group_agents (id, messaging_group_id, agent_group_id, session_mode, priority, created_at, engage_mode, engage_pattern, sender_scope, ignored_message_policy) VALUES ('mga-voya-dm', 'mg-voya-dm', '$AGID', 'agent-shared', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'pattern', '.', 'all', 'drop')"
```

- [ ] **Step 3: Verify the wiring resolves end-to-end**

```bash
cd /root/nanoclaw
pnpm exec tsx scripts/q.ts data/v2.db "SELECT mg.channel_type, mg.platform_id, mg.instance, ag.folder, mga.engage_mode, mga.engage_pattern, mga.session_mode FROM messaging_group_agents mga JOIN messaging_groups mg ON mg.id=mga.messaging_group_id JOIN agent_groups ag ON ag.id=mga.agent_group_id WHERE ag.folder='voya'"
```

Expected: `telegram-voya|telegram:8557164566|telegram-voya|voya|pattern|.|agent-shared`.

---

### Task 4: Restart the host and confirm the `telegram-voya` adapter registers

**Files:** none (operational)

**Interfaces:**
- Consumes: the `agent_groups.container_config.telegramBotToken` from Task 2.
- Produces: a live polling Telegram adapter for Voya's bot.

- [ ] **Step 1: Restart the host**

```bash
systemctl restart nanoclaw
```

- [ ] **Step 2: Confirm the secondary bot registered** (wait ~10s for startup, then grep the log)

```bash
cd /root/nanoclaw
sleep 10
grep -i "Registering secondary Telegram bot" logs/nanoclaw.log | tail -5
```

Expected: a recent line containing `folder: voya` / `channelType: telegram-voya`. If absent, check `logs/nanoclaw.error.log` for a token/parse error before proceeding.

- [ ] **Step 3: Confirm no startup errors referencing voya/telegram**

```bash
cd /root/nanoclaw
tail -30 logs/nanoclaw.error.log
```

Expected: no new errors mentioning `voya` or telegram adapter failure.

---

### Task 5: Live smoke test (verification-before-completion)

**Files:** none (manual, via Telegram)

**Interfaces:**
- Consumes: the whole stack from Tasks 1–4.

- [ ] **Step 1: Jonas DMs the Voya bot** — ask him (pt-br) to open the new bot and send a greeting like "oi Voya, se apresenta". Confirm a persona-correct reply (warm local-guide tone, Portuguese, travel-framed).

- [ ] **Step 2: Web-search check** — ask Voya something requiring current data, e.g. "tem algum evento/festa em Recife nas próximas semanas?". Confirm the reply reflects a real lookup (with the source-confirmation caveat on volatile data), not a hallucinated list.

- [ ] **Step 3: Itinerary + table formats** — ask "monta 3 dias em Jericoacoara, ritmo tranquilo" and "compara 3 pousadas em Pipa numa tabela". Confirm a day-by-day itinerary and a comparison table render correctly in Telegram.

- [ ] **Step 4: Memory persistence** — tell Voya a durable preference (e.g. "sou vegetariano e odeio acordar cedo"), then in a later message ask for a recommendation and confirm it respects the stated preference. (Cross-session recall is the real DoD; a same-session recall is the minimum bar.)

- [ ] **Step 5: Verify the session actually ran** (container spawned + produced output)

```bash
cd /root/nanoclaw
AGID=$(cat /tmp/voya_agid.txt)
ls -dt data/v2-sessions/$AGID/* 2>/dev/null | head -3
```

Expected: at least one session directory with `inbound.db`/`outbound.db` present.

- [ ] **Step 6: Record the result in agent memory** — write the outcome (Voya live, wiring ids, what works) to NanoClaw memory and report to Jonas in pt-br.

---

## Deferred (NOT in this plan — documented so there's no code debt)

- **Maps (Google Places) + Weather** — add as MCP servers / skills once Jonas drops the keys in the OneCLI vault; container config already supports adding them via `ncl groups config add-mcp-server` + restart. No rework needed.
- **Wiki** for accumulated travel knowledge — add the `wiki` skill + scaffold later if Voya's memory needs to grow structured.
- **Flights/hotels/tides integration** — intentionally out; Voya guides + sends links.

## Definition of Done

Maps to the spec's success criteria: agent group + container spawn + live bot (Task 4–5.1); persona/tone/honesty rules (Task 1 + 5.1); web search end-to-end (5.2); profile memory persists (5.4); itinerary + comparison-table formats demonstrated (5.3); Maps/Weather documented as next increment with no blocking debt (Deferred section).
