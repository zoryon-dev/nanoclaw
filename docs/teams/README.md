# Gestão de Times de Agentes - NanoClaw

Sistema completo para criar e gerenciar times de agentes IA para seus clientes empresariais, utilizando Telegram como canal principal.

## Visão Geral

Cada cliente recebe:
- **Base central de documentos** - Conhecimento da empresa (FAQs, políticas, manuais)
- **Múltiplos agentes especializados** - Cada um com papel, personalidade e skills próprios
- **Isolamento completo** - Dados de um cliente nunca se misturam com outro
- **Canal Telegram dedicado** - Grupo ou supergrupo com tópicos por agente

## Estrutura

```
clients/
├── _template/                    # Template para novos clientes
├── empresa-alpha/                # Cliente: Empresa Alpha
│   ├── config.json              # Configuração central
│   ├── CLAUDE.md                # Memória do cliente
│   ├── agents/                  # Agentes do cliente
│   │   ├── atendente/CLAUDE.md  # Memória do agente
│   │   └── tecnico/CLAUDE.md
│   ├── docs/                    # Base de conhecimento
│   │   ├── faq.md
│   │   ├── produtos.md
│   │   └── politicas.md
│   ├── skills/                  # Skills customizados
│   └── logs/                    # Logs de execução
└── empresa-beta/
    └── ...
```

## Tutoriais

| # | Tutorial | Descrição |
|---|----------|-----------|
| 1 | [Configuração Inicial](01-configuracao-inicial.md) | Preparar o ambiente e Telegram |
| 2 | [Criar um Cliente](02-criar-cliente.md) | Cadastrar novo cliente e configurar |
| 3 | [Criar Agentes](03-criar-agentes.md) | Definir agentes com papéis e personalidades |
| 4 | [Gerenciar Skills](04-gerenciar-skills.md) | Adicionar capacidades aos agentes |
| 5 | [Base de Documentos](05-documentos-base.md) | Organizar conhecimento do cliente |
| 6 | [Templates de Times](06-templates-times.md) | Usar templates pré-prontos |
| 7 | [Boas Práticas](07-boas-praticas.md) | Dicas e padrões recomendados |

## Início Rápido

```bash
# 1. Criar um cliente com template de suporte
./scripts/create-client.sh "Empresa Alpha" "-1001234567890" "customer-support" "professional"

# 2. Adicionar documentos
cp ~/docs/faq.md clients/empresa-alpha/docs/

# 3. Adicionar agente extra
./scripts/create-agent.sh "empresa-alpha" "Financeiro" "@financeiro" "Suporte financeiro" "Preciso e confiável"

# 4. Listar clientes
./scripts/list-clients.sh

# 5. Reiniciar NanoClaw
npm run dev
```

## Templates Disponíveis

| Template | Agentes | Ideal para |
|----------|---------|------------|
| `customer-support` | Atendente, Técnico, Gerente | Atendimento ao cliente |
| `sales` | SDR, Closer | Processo comercial |
| `content` | Redator, Estrategista | Marketing de conteúdo |
| `operations` | Admin, Analista | Operações internas |
