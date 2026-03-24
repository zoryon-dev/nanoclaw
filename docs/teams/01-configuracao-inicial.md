# Tutorial 1: Configuração Inicial

## Pré-requisitos

- NanoClaw instalado e funcionando (`npm run dev`)
- Canal Telegram configurado (execute `/add-telegram` se ainda não fez)
- Bot do Telegram criado via [@BotFather](https://t.me/BotFather)

## Passo 1: Verificar a Instalação do NanoClaw

```bash
# Compilar o projeto
npm run build

# Verificar se está rodando
npm run dev
```

## Passo 2: Configurar o Bot do Telegram

### 2.1 Criar o Bot Principal (se ainda não existe)

1. Abra o Telegram e fale com [@BotFather](https://t.me/BotFather)
2. Envie `/newbot`
3. Escolha um nome (ex: "Agentes Empresa Alpha")
4. Escolha um username (ex: `empresa_alpha_bot`)
5. Copie o token gerado

### 2.2 Configurar o Bot no NanoClaw

```bash
# Adicionar o token no .env
echo "TELEGRAM_BOT_TOKEN=seu_token_aqui" >> .env
```

### 2.3 Configurar Permissões do Bot

No BotFather:
- `/mybots` → Selecione seu bot → Bot Settings
- **Group Privacy** → Turn OFF (para o bot ver todas as mensagens)
- **Allow Groups** → Turn ON

## Passo 3: Criar o Grupo Telegram do Cliente

### 3.1 Criar um Supergrupo

1. No Telegram, crie um novo grupo
2. Adicione o bot como membro
3. Promova o bot a **administrador**
4. Ative **Tópicos** (Topics) no grupo para separar agentes

### 3.2 Obter o ID do Grupo

Envie uma mensagem no grupo e verifique os logs do NanoClaw, ou use:

```bash
# O ID aparece nos logs quando o bot recebe mensagem
# Formato: -100XXXXXXXXXX (número negativo com prefixo -100)
```

### 3.3 Criar Tópicos (Opcional, Recomendado)

Para cada agente, crie um tópico no grupo:
1. Clique no nome do grupo → "Create Topic"
2. Crie tópicos como: "Atendimento", "Suporte Técnico", "Gerência"
3. Anote o ID de cada tópico (visível na URL ou logs)

## Passo 4: Estrutura Recomendada por Plano

### Plano Starter (1-2 agentes)
- 1 grupo Telegram
- Sem tópicos (agentes respondem por trigger)
- Ex: `@atendente como faço para...`

### Plano Professional (3-5 agentes)
- 1 supergrupo com tópicos
- Cada agente responde em seu tópico
- Dashboard de métricas

### Plano Enterprise (5+ agentes)
- Múltiplos grupos/canais
- Bot dedicado por cliente
- SLA monitoring
- Integrações customizadas

## Próximo Passo

Agora que o ambiente está pronto, vá para [Tutorial 2: Criar um Cliente](02-criar-cliente.md).
