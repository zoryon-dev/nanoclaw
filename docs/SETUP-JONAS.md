# NanoClaw — Configuração do Servidor (Jonas)

Documentação interna com todas as configurações aplicadas nesta instalação.

## Infraestrutura

| Item | Valor |
|------|-------|
| **Provedor** | Digital Ocean |
| **OS** | Ubuntu (Linux 6.8.0-71-generic, x86_64) |
| **Node.js** | v20.20.1 |
| **Container Runtime** | Docker |
| **Imagem do agente** | `nanoclaw-agent:latest` (694MB) |
| **Fuso horário** | `America/Sao_Paulo` (via `TZ` no `.env`) |
| **Serviço** | systemd (`nanoclaw.service`) — system-level (root) |

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
journalctl -u nanoclaw -f        # Logs do systemd
tail -f logs/nanoclaw.log        # Logs da aplicação
tail -f logs/nanoclaw.error.log  # Erros
```

## Git Remotes

| Remote | URL | Propósito |
|--------|-----|-----------|
| `origin` | `https://github.com/zoryon-dev/nanoclaw.git` | Fork do usuário |
| `upstream` | `https://github.com/qwibitai/nanoclaw.git` | Repo original |
| `telegram` | `https://github.com/qwibitai/nanoclaw-telegram.git` | Channel skill |

**Git identity:** `zoryon-dev <noreply@github.com>` (configurado local no repo)

## Variáveis de Ambiente (.env)

| Variável | Descrição |
|----------|-----------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Token OAuth do Claude (subscription Pro/Max) |
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram (`@zory_assistant_bot`, ID: 8797917233) |
| `ASSISTANT_NAME` | `"Zory"` — nome do assistente |
| `IDLE_TIMEOUT` | `60000` (60s) — tempo que o container fica vivo após última resposta |
| `TZ` | `America/Sao_Paulo` — fuso horário para cron e timestamps |

**Nota:** O `IDLE_TIMEOUT` padrão é 30 minutos (1800000ms). Foi reduzido para 60 segundos porque o container ficava bloqueando novas mensagens enquanto esperava. Para tarefas longas (pesquisa, times de agentes), pode ser necessário aumentar via `container_config` por grupo.

**Sincronização:** Sempre que alterar `.env`, executar:
```bash
cp .env data/env/env && systemctl restart nanoclaw
```

## Canais Configurados

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

### WhatsApp

Não configurado. Executar `/add-whatsapp` quando necessário.

## Mount Allowlist

**Arquivo:** `/root/.config/nanoclaw/mount-allowlist.json`

Configurado como vazio — o agente só tem acesso ao seu próprio filesystem isolado dentro do container.

## Memória do Agente

A memória funciona em 3 níveis:

| Nível | Arquivo | Acesso |
|-------|---------|--------|
| **Global** | `groups/global/CLAUDE.md` | Leitura por todos os grupos, escrita pelo main |
| **Grupo** | `groups/telegram_main/CLAUDE.md` | Leitura/escrita pelo grupo |
| **Arquivos** | `groups/telegram_main/*.md` | Criados pelo agente conforme necessidade |

## Tarefas Agendadas (CRON)

O scheduler roda a cada 30 segundos e verifica tarefas no SQLite. Todos os horários usam o fuso `America/Sao_Paulo`.

**Tipos de agendamento:**

| Tipo | Formato | Exemplo |
|------|---------|---------|
| `cron` | Expressão POSIX | `0 9 * * 1` (segundas 9h) |
| `interval` | Milissegundos | `3600000` (a cada 1h) |
| `once` | Timestamp ISO (sem Z) | `2026-03-18T15:30:00` |

**Gerenciamento via chat:** Pedir ao Zory para criar, listar, pausar, retomar ou cancelar tarefas.

## Logs

| Arquivo | Conteúdo |
|---------|----------|
| `logs/nanoclaw.log` | Log principal (stdout) |
| `logs/nanoclaw.error.log` | Erros (stderr) |
| `logs/setup.log` | Log do setup |
| `groups/telegram_main/logs/container-*.log` | Logs por execução do container |

## Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| Bot não responde | `systemctl status nanoclaw` → `systemctl restart nanoclaw` |
| Container travado | Verificar `IDLE_TIMEOUT`, checar `docker ps` |
| Mensagens na fila | Container anterior ainda rodando — aguardar ou `docker stop` manual |
| Token expirado | Renovar via `claude setup-token`, atualizar `.env`, reiniciar |
| Cron no horário errado | Verificar `TZ=America/Sao_Paulo` no `.env` |
| Após alterar `.env` | `cp .env data/env/env && systemctl restart nanoclaw` |

## Skills Disponíveis (não instalados)

| Skill | Comando | Descrição |
|-------|---------|-----------|
| WhatsApp | `/add-whatsapp` | Canal WhatsApp |
| Agent Swarm | `/add-telegram-swarm` | Times de agentes no Telegram |
| Gmail | `/add-gmail` | Integração com email |
| Voice | `/add-voice-transcription` | Transcrição de áudios |
| Image Vision | `/add-image-vision` | Análise de imagens |
| PDF Reader | `/add-pdf-reader` | Leitura de PDFs |
| Parallel AI | `/add-parallel` | Pesquisa web e Deep Research |
| X/Twitter | `/x-integration` | Integração com X |
