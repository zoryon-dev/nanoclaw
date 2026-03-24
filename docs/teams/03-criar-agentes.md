# Tutorial 3: Criar Agentes

## Conceito

Cada agente é um assistente IA especializado com:
- **Nome** - Identificação no time
- **Papel** - O que ele faz
- **Trigger** - Como ativá-lo (ex: `@atendente`)
- **Personalidade** - Tom de voz e comportamento
- **Skills** - Capacidades específicas
- **Documentos** - Base de conhecimento que ele acessa
- **Tópico Telegram** (opcional) - Canal exclusivo no grupo

## Criar Agente via Script

```bash
./scripts/create-agent.sh "empresa-alpha" "Financeiro" "@financeiro" \
  "Suporte financeiro e cobrança" \
  "Preciso, confiável e empático. Explica questões financeiras com clareza."
```

## Criar Agente via Código

```typescript
import { addAgent } from './src/teams';

const agent = addAgent('empresa-alpha', {
  name: 'Financeiro',
  role: 'Suporte financeiro e cobrança',
  triggerPattern: '@financeiro',
  personality: 'Preciso, confiável e empático. Explica questões financeiras com clareza.',
  skills: ['cobranca', 'notas-fiscais', 'parcelamento'],
  documents: ['tabela-precos.md', 'politica-cobranca.md', 'formas-pagamento.md'],
  telegramTopicId: 12345,  // Opcional: ID do tópico no Telegram
  status: 'active',
});
```

## Anatomia do Agente

### Arquivo CLAUDE.md (Memória)

Cada agente tem seu `CLAUDE.md` em `clients/{slug}/agents/{nome}/CLAUDE.md`:

```markdown
# Financeiro

## Papel
Suporte financeiro e cobrança

## Personalidade
Preciso, confiável e empático. Explica questões financeiras com clareza.

## Trigger
Responda quando mencionado com: `@financeiro`

## Skills
- cobranca
- notas-fiscais
- parcelamento

## Documentos de Referência
- `docs/tabela-precos.md`
- `docs/politica-cobranca.md`
- `docs/formas-pagamento.md`

## Memória do Agente
_Anotações e aprendizados específicos deste agente:_
```

### Personalidades Eficazes

| Tipo | Exemplo |
|------|---------|
| Atendimento | "Cordial, objetivo e empático. Resolve rapidamente sem enrolação." |
| Técnico | "Detalhista e paciente. Explica passo a passo, usa linguagem simples." |
| Vendas | "Consultivo e persuasivo. Foca em entender a dor antes de oferecer solução." |
| Gerência | "Profissional e resolutivo. Assume responsabilidade e dá retorno rápido." |
| Conteúdo | "Criativo e antenado. Adapta o tom de voz conforme a plataforma." |

## Configurar Tópicos no Telegram

### Por que usar Tópicos?

- Cada agente responde em seu próprio canal
- Clientes sabem onde ir para cada tipo de ajuda
- Histórico organizado por tema
- Evita confusão entre agentes

### Como Configurar

1. **No Telegram**: Grupo → Settings → Topics → Enable
2. **Criar tópicos**: Para cada agente (Atendimento, Suporte, Financeiro, etc.)
3. **Anotar IDs**: O ID do tópico aparece na URL ou nos logs
4. **Configurar no agente**: Adicione `telegramTopicId` na configuração

```json
{
  "name": "Financeiro",
  "telegramTopicId": 12345,
  "triggerPattern": "@financeiro"
}
```

## Gerenciar Agentes

### Atualizar um Agente

```typescript
import { updateAgent } from './src/teams';

updateAgent('empresa-alpha', 'agent-id-here', {
  personality: 'Nova personalidade mais amigável...',
  skills: ['cobranca', 'notas-fiscais', 'parcelamento', 'reembolso'],
});
```

### Pausar/Reativar

```typescript
updateAgent('empresa-alpha', 'agent-id', { status: 'paused' });
updateAgent('empresa-alpha', 'agent-id', { status: 'active' });
```

### Remover

```typescript
import { removeAgent } from './src/teams';
removeAgent('empresa-alpha', 'agent-id');
```

## Exemplos de Times Completos

### Time de E-commerce

| Agente | Trigger | Papel |
|--------|---------|-------|
| Atendente | @atendente | Dúvidas gerais, status de pedido |
| Trocas | @trocas | Trocas e devoluções |
| Rastreio | @rastreio | Rastreamento de entregas |
| Financeiro | @financeiro | Pagamentos e notas fiscais |

### Time de SaaS

| Agente | Trigger | Papel |
|--------|---------|-------|
| Onboarding | @onboarding | Setup inicial do cliente |
| Suporte | @suporte | Bugs e problemas técnicos |
| CSM | @csm | Customer Success, health check |
| Billing | @billing | Assinaturas e pagamentos |

### Time de Agência

| Agente | Trigger | Papel |
|--------|---------|-------|
| Redator | @redator | Criação de textos e copies |
| Designer | @designer | Briefing e revisão de artes |
| Mídia | @midia | Gestão de campanhas |
| Atendimento | @atendimento | Interface com o cliente |

## Próximo Passo

Agora que seus agentes estão criados, vá para [Tutorial 4: Gerenciar Skills](04-gerenciar-skills.md).
