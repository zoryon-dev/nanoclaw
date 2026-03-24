# Tutorial 2: Criar um Cliente

## Visão Geral

Cada cliente é uma pasta dentro de `clients/` com configuração, agentes, documentos e skills isolados.

## Método 1: Via Script (Recomendado)

### Criar cliente com template

```bash
# Sintaxe: ./scripts/create-client.sh "Nome" "telegram_id" [template] [plano]
./scripts/create-client.sh "Empresa Alpha" "-1001234567890" "customer-support" "professional"
```

**Templates disponíveis:**
- `customer-support` - Atendente + Técnico + Gerente
- `sales` - SDR + Closer
- `content` - Redator + Estrategista
- `operations` - Admin + Analista

### Criar cliente vazio

```bash
./scripts/create-client.sh "Empresa Beta" "-1009876543210"
```

## Método 2: Via Código

```typescript
import { createClient } from './src/teams';

const client = createClient({
  name: 'Empresa Alpha',
  telegramGroupId: '-1001234567890',
  plan: 'professional',
  templateName: 'customer-support',
  timezone: 'America/Sao_Paulo',
  language: 'pt-BR',
});
```

## Método 3: Manual

1. Copie o template:
```bash
cp -r clients/_template clients/empresa-alpha
```

2. Edite `clients/empresa-alpha/config.json`:
```json
{
  "id": "unique-id-here",
  "name": "Empresa Alpha",
  "slug": "empresa-alpha",
  "telegramGroupId": "-1001234567890",
  "status": "active",
  "plan": "professional",
  "agents": [],
  "settings": {
    "timezone": "America/Sao_Paulo",
    "language": "pt-BR",
    "maxConcurrentAgents": 3,
    "allowedModels": ["claude-sonnet-4-6"],
    "features": {
      "scheduledTasks": true,
      "webSearch": true,
      "browserAutomation": false,
      "fileSharing": true,
      "imageVision": true,
      "voiceTranscription": false
    }
  },
  "createdAt": "2026-03-24T00:00:00.000Z"
}
```

3. Edite `clients/empresa-alpha/CLAUDE.md` com informações do cliente.

## Estrutura Criada

Após criar um cliente, a seguinte estrutura é gerada:

```
clients/empresa-alpha/
├── config.json              # Configuração central
├── CLAUDE.md                # Memória do cliente
├── agents/                  # Agentes (criados com template ou manualmente)
│   ├── atendente/
│   │   └── CLAUDE.md       # Memória e personalidade
│   ├── especialista-tecnico/
│   │   └── CLAUDE.md
│   └── gerente/
│       └── CLAUDE.md
├── docs/                    # Base de conhecimento
│   └── README.md
├── skills/                  # Skills customizados
└── logs/                    # Logs de execução
```

## Verificar o Cliente

```bash
# Listar todos os clientes
./scripts/list-clients.sh

# Resultado esperado:
# 🟢 Empresa Alpha (empresa-alpha)
#    Plano: professional | Agentes: 3 | Telegram: -1001234567890
#    ✅ Atendente (@atendente) - Primeiro contato e triagem
#    ✅ Especialista Técnico (@tecnico) - Suporte técnico avançado
#    ✅ Gerente (@gerente) - Supervisão e escalações
```

## Configurações do Cliente

### Planos

| Plano | Agentes Max | Features |
|-------|-------------|----------|
| `starter` | 2 | Básico |
| `professional` | 5 | + Tasks + Browser |
| `enterprise` | Ilimitado | Tudo + Bot dedicado |

### Features

| Feature | Descrição |
|---------|-----------|
| `scheduledTasks` | Tarefas agendadas (cron/interval) |
| `webSearch` | Pesquisa na web |
| `browserAutomation` | Automação de navegador |
| `fileSharing` | Envio/recebimento de arquivos |
| `imageVision` | Análise de imagens |
| `voiceTranscription` | Transcrição de áudio |

## Próximo Passo

Com o cliente criado, vá para [Tutorial 3: Criar Agentes](03-criar-agentes.md).
