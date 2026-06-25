# Koda — Engineering Team Agent (deployment runbook)

Runbook do **Koda**, o agent group "time de engenharia de software" deste install do NanoClaw.
Instalado em 2026-06-25 a partir do pacote `team-engenharia/`.

> Os arquivos vivos do grupo ficam em `groups/team-engenharia/` (gitignored por política do repo —
> `groups/*`, e `CLAUDE.local.md` nunca é commitado). Este doc é a fonte de verdade rastreável:
> documenta o que existe e como reproduzir. **Nenhum segredo aqui** (token do bot mora só no DB).

## 1. O que é

Koda é um **time de engenharia em um único agente** (orquestrador tech-lead + 7 sub-agentes
especialistas), via o mecanismo de sub-agentes (`Task`) do Claude Agent SDK — **Modelo A**.

### Por que Modelo A (e não agentes backstage separados)
Decisão tomada pela restrição de hardware: a máquina é **2 núcleos / ~8GB RAM** com
`MAX_CONCURRENT_CONTAINERS=5`. Rodar 7-8 agentes independentes (Modelo B, via `create_agent` +
message-passing) daria pressão de RAM / OOM. No Modelo A é **1 container**: o orquestrador delega
aos sub-papéis in-process, compartilhando o mesmo repo/contexto, sem hop de mensagem. Os 7 papéis:
`architect`, `backend-dev`, `frontend-dev`, `repo-auditor`, `qa-reviewer`, `devops-engineer`,
`security-reviewer` (architect/security/auditor são read-only; os demais editam).

### Como o container carrega o time
O agente roda com cwd `/workspace/agent` e `settingSources: ['project','user','local']`, então o
SDK carrega `groups/team-engenharia/.claude/{agents,commands,skills}` como projeto, e a ferramenta
`Task` está na allowlist. A **persona do orquestrador** mora em `CLAUDE.local.md` (auto-carregada);
o composer regenera o `CLAUDE.md` a cada spawn, então a persona NÃO pode ficar no `CLAUDE.md`.

## 2. Identidade & infra

| Item | Valor |
|---|---|
| Agent group id | `0a441fca-e7d9-42e4-ad7a-75881f326c28` |
| Folder | `groups/team-engenharia` |
| Nome / assistant_name | Koda |
| Model | `claude-opus-4-8` (sub-papéis usam o `model:` do próprio frontmatter) |
| cli_scope | `group` |
| Bot Telegram | **@koda_zr_bot** (DM com o Jonas) — token só no DB |
| Canal (channel_type / instance) | `telegram-team-engenharia` |
| OneCLI agent | id `8d1c970e-817b-4a35-b485-675356b1f403`, identifier = group id, secretMode `all` |

## 3. Setup reproduzível

1. **Pasta do grupo:** copiar o pacote para `groups/team-engenharia/`; mover o `CLAUDE.md`
   orquestrador para `CLAUDE.local.md` (persona auto-carregada).
2. **Grupo + config:** `ncl groups create --name Koda --folder team-engenharia`; garantir a linha
   em `container_configs` (group-init faz no 1º spawn, ou `INSERT OR IGNORE`); setar
   `--model claude-opus-4-8 --assistant-name Koda`.
3. **Bot Telegram (secundário):** gravar o token em `agent_groups.container_config` JSON, campo
   `telegramBotToken`. O host registra o adapter `telegram-<folder>` em `registerSecondaryBots()`
   **na inicialização** → exige `systemctl restart nanoclaw`.
4. **Messaging group + wiring + destino** (ver Gotchas — o destino `jonas` é obrigatório):
   - `messaging_groups`: channel_type/instance `telegram-team-engenharia`, platform_id do Jonas.
   - `messaging_group_agents`: wiring → group, engage_mode `pattern` `.`, session_mode `agent-shared`.
   - `agent_destinations`: `local_name=jonas, target_type=channel, target_id=mg-koda-dm`.
5. **Contexto de negócio (mounts RO)** — em `container_configs.additional_mounts`:
   - `groups/_context` → `/workspace/extra/context` (about-me, rules, voice, projetos/{zoryon,…}).
   - `groups/dm-with-jonas/wiki` → `/workspace/extra/wiki` (wiki business da Zory).
   - A persona aponta esses paths (seção "Who you work for & business context").
6. **Conhecimento próprio:** Koda escreve na própria `memory/` (RW em `/workspace/agent`) — NÃO há
   wiki separada (decisão do dono). Wiki da Zory é só leitura.

## 4. GitHub (via OneCLI gateway) — verificado 2026-06-25

Conexões OAuth ficam em `onecli apps` (não em `secrets list`). **GitHub** e **GitHub App**
`connected`. Agente do Koda em modo `all` → injeção automática. Teste real: `api.github.com/user`
→ 200 (`zoryon-dev`); `git clone` de repo privado → OK. Acessa repos públicos e privados.

**Gotcha — 2 conexões github** → o gateway retorna `409 multiple_providers` até escolher via header
`x-onecli-connection-id`:

| Uso | Connection id |
|---|---|
| API read / user / repos / **clone/fetch** (OAuth) | `9e56562c-a9cb-42fd-8fb5-4a5a9336e9a8` |
| Writes app-scoped (commit statuses, etc.) (GitHub App) | `036848e4-ef76-4251-9a68-36977e1d2997` |

Para `git`: `git -c http.extraHeader='x-onecli-connection-id: <id>' clone <url>`. Para curl/API:
`-H 'x-onecli-connection-id: <id>'`. Se o 409 listar ids diferentes, usar os de lá. Documentado na
persona do Koda.

## 5. Comandos no Telegram

O NanoClaw **não** registra comandos no Telegram por padrão. Registrados via `setMyCommands` no bot
Koda (Telegram não aceita hífen → arquivos `.claude/commands/` renomeados para underscore, batendo
com o nome do menu):

`/feature`, `/audit_repo`, `/review_pr`, `/arch_decision`, `/ship_check`.

Linguagem natural também funciona — o orquestrador roteia ("audita o repo X" = `/audit_repo X`).

## 6. Disciplina de recursos

Máquina pequena, compartilhada. A persona instrui: clone **shallow** (`--depth 1`), **limpar**
clones após auditar, preferir a API do GitHub para inspecionar poucos arquivos, e **avisar antes**
de build/teste pesado. Containers não têm cap de RAM/CPU — um build descontrolado pode OOM o host;
opção futura: cap de memória no container do Koda.

## 7. Gotchas (aprendidos no deploy)

- **Destino `jonas` obrigatório.** Sem a linha em `agent_destinations`, o agente responde para
  `unknown:...` e a mensagem é **descartada** (`agent output had no <message to>`). O
  `ncl wiring create` normal cria isso junto; INSERT manual de wiring **não** — criar à mão.
- **Sessão poluída.** Consertar config com a conversa viva faz o Claude *resumir* contexto
  bagunçado (fica só se re-apresentando). Fix: `DELETE FROM session_state WHERE key LIKE
  'continuation%'` na `outbound.db` + matar o container → próximo DM = sessão nova.
- **Prompt "se apresente"** faz o orquestrador liderar com a apresentação e não executar a tarefa.
  Usar prompt de tarefa pura.
- **Bot secundário** só registra após `systemctl restart nanoclaw` (registro na inicialização).

## 8. Operação

- **Falar com o Koda:** DM no @koda_zr_bot. Comandos `/...` ou linguagem natural.
- **Restart do grupo:** `ncl groups restart --id 0a441fca-e7d9-42e4-ad7a-75881f326c28`.
- **Logs:** `logs/nanoclaw.log` (roteamento/spawn/Progress de sub-agente/delivery);
  sessão em `data/v2-sessions/0a441fca-.../<session>/` (`inbound.db` / `outbound.db`).
- **Status:** ✅ operacional — delegação via `Task`, entrega no Telegram, contexto de negócio,
  memória própria, menu Telegram e GitHub (clone público+privado) todos verificados.
