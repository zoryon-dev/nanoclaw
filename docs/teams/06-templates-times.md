# Tutorial 6: Templates de Times

## Templates Pré-prontos

O sistema inclui templates prontos para os cenários mais comuns. Use-os como ponto de partida e customize conforme necessário.

## Template: Suporte ao Cliente (`customer-support`)

Ideal para empresas que precisam de atendimento ao cliente organizado.

### Agentes Incluídos

| Agente | Trigger | Papel |
|--------|---------|-------|
| Atendente | `@atendente` | Primeiro contato e triagem de demandas |
| Especialista Técnico | `@tecnico` | Resolução de problemas técnicos |
| Gerente | `@gerente` | Escalações e supervisão |

### Como Usar

```bash
./scripts/create-client.sh "Minha Empresa" "-100123456" "customer-support"
```

### Documentos Sugeridos
- `faq.md` - Perguntas frequentes
- `politicas.md` - Políticas de atendimento
- `manual-tecnico.md` - Manual do produto
- `troubleshooting.md` - Soluções de problemas
- `sla.md` - Tempos de resposta
- `procedimentos-escalacao.md` - Quando e como escalar

---

## Template: Vendas (`sales`)

Para equipes comerciais que precisam qualificar leads e fechar negócios.

### Agentes Incluídos

| Agente | Trigger | Papel |
|--------|---------|-------|
| SDR | `@sdr` | Qualificação de leads e agendamento |
| Closer | `@closer` | Apresentação de propostas e fechamento |

### Como Usar

```bash
./scripts/create-client.sh "Minha Empresa" "-100123456" "sales"
```

### Documentos Sugeridos
- `perfil-cliente-ideal.md` - ICP e critérios de qualificação
- `scripts-qualificacao.md` - Perguntas BANT/SPIN
- `tabela-precos.md` - Preços e condições
- `cases-sucesso.md` - Casos de sucesso
- `objecoes.md` - Respostas a objeções

---

## Template: Produção de Conteúdo (`content`)

Para agências e equipes de marketing.

### Agentes Incluídos

| Agente | Trigger | Papel |
|--------|---------|-------|
| Redator | `@redator` | Criação de textos e copies |
| Estrategista | `@estrategista` | Planejamento e análise |

### Como Usar

```bash
./scripts/create-client.sh "Minha Agência" "-100123456" "content"
```

### Documentos Sugeridos
- `guia-estilo.md` - Guia de estilo da marca
- `tom-de-voz.md` - Tom de voz e linguagem
- `palavras-chave.md` - Keywords e SEO
- `persona.md` - Personas do público-alvo
- `calendario.md` - Calendário editorial
- `metricas.md` - KPIs e metas

---

## Template: Operações (`operations`)

Para equipes internas e operações administrativas.

### Agentes Incluídos

| Agente | Trigger | Papel |
|--------|---------|-------|
| Assistente Admin | `@admin` | Tarefas administrativas e organização |
| Analista de Dados | `@analista` | Análises e relatórios |

### Como Usar

```bash
./scripts/create-client.sh "Minha Empresa" "-100123456" "operations"
```

### Documentos Sugeridos
- `processos.md` - Processos internos
- `contatos.md` - Lista de contatos
- `fontes-dados.md` - Onde buscar dados
- `kpis.md` - Indicadores e metas

---

## Criar Template Customizado

### Via Código

```typescript
import { TEAM_TEMPLATES, TeamTemplate } from './src/teams/types';

// Definir novo template
const meuTemplate: TeamTemplate = {
  name: 'Consultoria',
  description: 'Time para empresas de consultoria',
  agents: [
    {
      name: 'Consultor',
      role: 'Análise e recomendações',
      triggerPattern: '@consultor',
      personality: 'Analítico, estratégico e didático.',
      skills: ['analise', 'recomendacoes', 'relatorios'],
      documents: ['metodologia.md', 'frameworks.md'],
      status: 'active',
    },
    {
      name: 'Pesquisador',
      role: 'Pesquisa de mercado e benchmarks',
      triggerPattern: '@pesquisador',
      personality: 'Curioso, metódico e detalhista.',
      skills: ['pesquisa', 'benchmarks', 'tendencias'],
      documents: ['fontes.md', 'metodologia-pesquisa.md'],
      status: 'active',
    },
  ],
};
```

### Via Arquivo JSON

Crie em `clients/_templates/consultoria.json`:

```json
{
  "name": "Consultoria",
  "description": "Time para empresas de consultoria",
  "agents": [
    {
      "name": "Consultor",
      "role": "Análise e recomendações",
      "triggerPattern": "@consultor",
      "personality": "Analítico, estratégico e didático.",
      "skills": ["analise", "recomendacoes"],
      "documents": ["metodologia.md"],
      "status": "active"
    }
  ]
}
```

## Combinar Templates

Você pode criar um cliente com um template e depois adicionar agentes de outro:

```bash
# Criar com template de vendas
./scripts/create-client.sh "Empresa" "-100123456" "sales"

# Adicionar agente de suporte
./scripts/create-agent.sh "empresa" "Suporte" "@suporte" \
  "Suporte técnico pós-venda" \
  "Paciente e detalhista."
```

## Próximo Passo

Vá para [Tutorial 7: Boas Práticas](07-boas-praticas.md) para dicas de otimização.
