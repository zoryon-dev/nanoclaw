# NanoClaw — Configuração do Servidor (Jonas)

Documentação interna com todas as configurações aplicadas nesta instalação.
Última atualização: 2026-03-18

## Infraestrutura

| Item | Valor |
|------|-------|
| **Provedor** | Digital Ocean |
| **OS** | Ubuntu (Linux 6.8.0-71-generic, x86_64) |
| **Node.js** | v20.20.1 |
| **Container Runtime** | Docker |
| **Imagem do agente** | `nanoclaw-agent:latest` |
| **Fuso horário** | `America/Sao_Paulo` (via `TZ` no `.env`) |
| **Serviço** | systemd (`nanoclaw.service`) — system-level (root) |
| **GitHub** | Fork: `zoryon-dev/nanoclaw` / Upstream: `qwibitai/nanoclaw` |
| **Git identity** | `zoryon-dev <noreply@github.com>` (local) |
| **gh CLI** | Autenticado como `zoryon-dev` (scopes: repo, admin:org, workflow) |

## Serviço systemd

**Arquivo:** `/etc/systemd/system/nanoclaw.service`

```
ExecStart=/usr/bin/node /root/nanoclaw/dist/index.js
WorkingDirectory=/root/nanoclaw
Restart=always / RestartSec=5
KillMode=process
```

**Comandos:**
```bash
systemctl status nanoclaw        # Status
systemctl restart nanoclaw       # Reiniciar
systemctl stop nanoclaw          # Parar
tail -f logs/nanoclaw.log        # Logs da aplicação
tail -f logs/nanoclaw.error.log  # Erros
```

## Variáveis de Ambiente (.env)

| Variável | Descrição |
|----------|-----------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Token OAuth do Claude (subscription Pro/Max) |
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram (`@zory_assistant_bot`, ID: 8797917233) |
| `ASSISTANT_NAME` | `"Zory"` — nome do assistente |
| `IDLE_TIMEOUT` | `60000` (60s) — tempo ocioso antes de matar o container |
| `TZ` | `America/Sao_Paulo` — fuso horário para cron e timestamps |
| `PARALLEL_API_KEY` | Parallel AI — pesquisa web e deep research |
| `FIREFLIES_API_KEY` | Fireflies — transcrição de reuniões |

**Nota sobre IDLE_TIMEOUT:** Reduzido de 30min (padrão) para 60s. O container ficava bloqueando novas mensagens. Para tarefas longas (agent teams, deep research), pode ser aumentado por grupo via `container_config`.

**Sincronização:** Sempre que alterar `.env`:
```bash
cp .env data/env/env && systemctl restart nanoclaw
```

## Git Remotes

| Remote | URL | Propósito |
|--------|-----|-----------|
| `origin` | `https://github.com/zoryon-dev/nanoclaw.git` | Fork do usuário |
| `upstream` | `https://github.com/qwibitai/nanoclaw.git` | Repo original |
| `telegram` | `https://github.com/qwibitai/nanoclaw-telegram.git` | Channel skill |
| `gmail` | `https://github.com/qwibitai/nanoclaw-gmail.git` | Channel skill |

## Canais Ativos

### Telegram

| Item | Valor |
|------|-------|
| **Bot** | `@zory_assistant_bot` (Zory Assistant) |
| **Bot ID** | 8797917233 |
| **Chat registrado** | Jonas (DM) |
| **JID** | `tg:7861696500` |
| **Trigger** | `@Zory` (não obrigatório — main chat) |
| **Pasta do grupo** | `groups/telegram_main/` |
| **Group Privacy** | Ativado (padrão) — desativar via @BotFather se usar em grupos |

### Gmail

Removido como canal standalone. Gmail agora é acessado exclusivamente via Composio (`mcp__composio__*`).

### WhatsApp

Canal principal. Autenticado via pairing code.

## Integrações MCP (ferramentas do agente)

| Integração | Pacote / Endpoint | Transporte | Status |
|---|---|---|---|
| **Parallel AI (Search)** | HTTP MCP `search-mcp.parallel.ai` | HTTP | Ativo |
| **Parallel AI (Task)** | HTTP MCP `task-mcp.parallel.ai` | HTTP | Ativo |
| **Composio** | `connect.composio.dev/mcp` | HTTP | Ativo |
| **Fireflies** | `fireflies-mcp-server` | stdio | Ativo |
| **Firecrawl** | `firecrawl-mcp` | stdio | Ativo |
| **Mem** | `mem-mcp-server` | stdio | Ativo |
| **Todoist** | `todoist-mcp-server` | stdio | Ativo |

**Google Workspace (tudo via Composio):**

Gmail, Google Calendar, Google Drive, Google Sheets, Google Docs — acessados exclusivamente via Composio (`mcp__composio__*`). MCPs standalone (`@gongrzhe/server-gmail-autoauth-mcp`, `@gongrzhe/server-calendar-autoauth-mcp`, `@piotr-agier/google-drive-mcp`) foram removidos. Autenticação OAuth gerenciada pelo Composio.

## Skills Instalados

| Skill | Descrição |
|-------|-----------|
| **Telegram** | Canal principal |
| **Parallel AI** | Pesquisa web rápida + deep research |
| **Composio** | Google Workspace (Gmail, Calendar, Drive, Sheets, Docs) via OAuth |
| **Fireflies** | Buscar e resumir reuniões |
| **Firecrawl** | Scraping e crawling web |
| **Mem** | Memória de longo prazo |
| **Todoist** | Gestão de tarefas |
| **Compact** | `/compact` para limpar contexto de sessão longa |

## Skills Disponíveis (não instalados)

| Skill | Comando | Requer |
|-------|---------|--------|
| WhatsApp | `/add-whatsapp` | — |
| Agent Swarm | `/add-telegram-swarm` | Telegram (instalado) |
| Voice Transcription | `/add-voice-transcription` | WhatsApp |
| Image Vision | `/add-image-vision` | WhatsApp |
| PDF Reader | `/add-pdf-reader` | WhatsApp |
| Reactions | `/add-reactions` | WhatsApp |
| X/Twitter | `/x-integration` | — |
| Ollama | `/add-ollama-tool` | — |

## Utilitários (sempre disponíveis)

| Comando | Descrição |
|---------|-----------|
| `/update-nanoclaw` | Atualizar do upstream |
| `/update-skills` | Atualizar skills instalados |
| `/customize` | Adicionar integrações e modificar comportamento |
| `/debug` | Troubleshooting de containers |
| `/setup` | Re-executar setup |

## Memória do Agente

A memória funciona em 3 níveis:

| Nível | Arquivo | Acesso |
|-------|---------|--------|
| **Global** | `groups/global/CLAUDE.md` | Leitura por todos os grupos, escrita pelo main |
| **Grupo** | `groups/{folder}/CLAUDE.md` | Leitura/escrita pelo grupo |
| **Arquivos** | `groups/{folder}/*.md` | Notas, listas, dados criados pelo agente |

## Tarefas Agendadas (CRON)

O scheduler roda a cada 30 segundos. Todos os horários usam `America/Sao_Paulo`.

| Tipo | Formato | Exemplo |
|------|---------|---------|
| `cron` | Expressão POSIX | `0 9 * * 1` (segundas 9h) |
| `interval` | Milissegundos | `3600000` (a cada 1h) |
| `once` | Timestamp ISO (sem Z) | `2026-03-18T15:30:00` |

**Gerenciamento:** Pedir ao Zory para criar, listar, pausar ou cancelar tarefas.

## Agentes Especializados

### Via Prompt (sem configuração)
Basta pedir ao Zory no chat:
> "Monte um time com um Copywriter, um Pesquisador e um Analista de Dados para analisar nosso mercado"

Zory cria sub-agentes com papéis especializados automaticamente. Eles se coordenam internamente e enviam resultados no chat.

### Via Agent Swarm (bots individuais no Telegram)
Com `/add-telegram-swarm`, cada sub-agente aparece como um bot diferente no grupo:
1. Criar 3-5 bots pool no @BotFather
2. Rodar `/add-telegram-swarm`
3. Cada agente responde com sua identidade visual própria

### Via Grupos Dedicados (agentes permanentes)
Registrar chats separados, cada um com seu próprio CLAUDE.md e persona:
```bash
npx tsx setup/index.ts --step register \
  --jid "tg:<chat-id>" --name "Copywriter" \
  --folder "telegram_copywriter" --trigger "@Copy" \
  --channel telegram
```
Cada grupo tem memória isolada e instruções específicas em `groups/telegram_copywriter/CLAUDE.md`.

## Mount Allowlist

**Arquivo:** `/root/.config/nanoclaw/mount-allowlist.json`

Vazio — agente só acessa seu filesystem isolado no container.

## Logs

| Arquivo | Conteúdo |
|---------|----------|
| `logs/nanoclaw.log` | Log principal (stdout) |
| `logs/nanoclaw.error.log` | Erros (stderr) |
| `logs/setup.log` | Log do setup |
| `groups/{folder}/logs/container-*.log` | Logs por execução do container |

## Fixes Aplicados

| Fix | Descrição |
|-----|-----------|
| **Sessão stale** | Auto-limpa sessões inválidas (`No conversation found`) |
| **Permissões IPC** | Diretórios/arquivos IPC criados com 0o777/0o666 |
| **Timezone** | `TZ` carregado do `.env` via `readEnvFile` no boot |
| **grammy perdido** | Re-adicionado após merge do Gmail |

## Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| Bot não responde | `systemctl status nanoclaw` → `systemctl restart nanoclaw` |
| Sessão inválida (loop de erro) | Limpar sessão: `node -e "require('better-sqlite3')('store/messages.db').prepare('DELETE FROM sessions WHERE group_folder=?').run('telegram_main')"` |
| Container travado | `docker ps` → `docker stop <name>` |
| Mensagens na fila | Container anterior rodando — aguardar IDLE_TIMEOUT ou parar manualmente |
| Token Claude expirado | `claude setup-token`, atualizar `.env`, reiniciar |
| OAuth Google expirado | Re-autorizar via Composio dashboard |
| Cron no horário errado | Verificar `TZ=America/Sao_Paulo` no `.env` |
| Após alterar `.env` | `cp .env data/env/env && systemctl restart nanoclaw` |
| Após alterar agent-runner | `rm -r data/sessions/*/agent-runner-src && ./container/build.sh && systemctl restart nanoclaw` |
