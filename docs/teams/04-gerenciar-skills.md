# Tutorial 4: Gerenciar Skills

## O que são Skills?

Skills são capacidades que você adiciona aos agentes. Podem ser:
- **Skills nativos do NanoClaw** - Já disponíveis (web search, browser, etc.)
- **Skills customizados** - Criados por você para o cliente

## Skills Nativos Disponíveis

| Skill | Feature Flag | Descrição |
|-------|-------------|-----------|
| Web Search | `webSearch` | Pesquisar na internet |
| Browser | `browserAutomation` | Navegar sites, preencher formulários |
| Image Vision | `imageVision` | Analisar imagens enviadas |
| Voice Transcription | `voiceTranscription` | Transcrever áudios |
| File Sharing | `fileSharing` | Enviar/receber arquivos |
| Scheduled Tasks | `scheduledTasks` | Agendar tarefas recorrentes |

### Ativar/Desativar Features

```typescript
import { updateClientSettings } from './src/teams';

updateClientSettings('empresa-alpha', {
  features: {
    scheduledTasks: true,
    webSearch: true,
    browserAutomation: true,  // Ativar browser
    fileSharing: true,
    imageVision: true,
    voiceTranscription: true, // Ativar transcrição
  },
});
```

## Criar Skills Customizados

Skills customizados ficam em `clients/{slug}/skills/` e são instruções em Markdown que os agentes seguem.

### Exemplo: Skill de Consulta de Pedidos

Crie `clients/empresa-alpha/skills/consultar-pedido.md`:

```markdown
# Consultar Pedido

Quando o cliente perguntar sobre um pedido:

1. Peça o número do pedido ou CPF
2. Busque no sistema usando o formato: `PEDIDO-XXXXX`
3. Informe:
   - Status atual (Processando, Enviado, Entregue)
   - Previsão de entrega
   - Código de rastreio (se disponível)
4. Se o pedido estiver atrasado, ofereça opções:
   - Reenvio
   - Reembolso
   - Desconto na próxima compra

## Respostas Padrão

### Pedido em processamento
"Seu pedido {numero} está sendo preparado! Prazo estimado: {prazo}."

### Pedido enviado
"Boa notícia! Seu pedido {numero} já foi enviado. Rastreio: {codigo}."

### Pedido atrasado
"Peço desculpas pelo atraso. Vou verificar o que aconteceu e te retorno em instantes."
```

### Exemplo: Skill de Agendamento

Crie `clients/empresa-alpha/skills/agendamento.md`:

```markdown
# Agendamento de Reuniões

## Horários Disponíveis
- Segunda a Sexta: 9h às 18h
- Sábado: 9h às 12h
- Domingo: Indisponível

## Processo
1. Pergunte a data e horário desejados
2. Confirme disponibilidade
3. Peça nome completo e email
4. Confirme o agendamento com resumo

## Formato de Confirmação
"Reunião agendada!
📅 Data: {data}
🕐 Horário: {horario}
👤 Nome: {nome}
📧 Email: {email}

Você receberá um lembrete 1 hora antes."
```

### Exemplo: Skill de FAQ Dinâmico

Crie `clients/empresa-alpha/skills/faq-dinamico.md`:

```markdown
# FAQ Dinâmico

Ao responder perguntas frequentes:

1. Primeiro consulte `docs/faq.md` para respostas oficiais
2. Se a pergunta não estiver no FAQ, responda com base nos outros documentos
3. Registre perguntas não cobertas pelo FAQ no formato:
   - **Pergunta:** [pergunta do cliente]
   - **Contexto:** [categoria]
   - **Frequência:** [primeira vez / recorrente]
4. Sugira ao gerente incluir no FAQ oficial quando uma pergunta aparecer 3+ vezes
```

## Associar Skills a Agentes

### No config.json

```json
{
  "agents": [
    {
      "name": "Atendente",
      "skills": ["consultar-pedido", "agendamento", "faq-dinamico"],
      ...
    }
  ]
}
```

### Via Código

```typescript
import { updateAgent } from './src/teams';

updateAgent('empresa-alpha', 'agent-id', {
  skills: ['consultar-pedido', 'agendamento', 'faq-dinamico'],
});
```

## Skills por Tipo de Agente

### Atendimento
- `consultar-pedido` - Status de pedidos
- `faq-dinamico` - Respostas a perguntas frequentes
- `agendamento` - Marcar reuniões/atendimentos
- `triagem` - Classificar e direcionar demandas

### Vendas
- `qualificacao-lead` - Perguntas de qualificação BANT
- `proposta-comercial` - Gerar propostas
- `follow-up` - Acompanhamento pós-contato
- `objecoes` - Respostas a objeções comuns

### Técnico
- `diagnostico` - Árvore de diagnóstico de problemas
- `troubleshooting` - Guia passo-a-passo
- `escalonamento` - Quando e como escalar

### Conteúdo
- `calendario-editorial` - Planejamento de posts
- `copy-templates` - Templates de copy por plataforma
- `seo-checklist` - Checklist de otimização

## Próximo Passo

Vá para [Tutorial 5: Base de Documentos](05-documentos-base.md) para organizar o conhecimento do cliente.
