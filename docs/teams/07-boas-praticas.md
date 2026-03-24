# Tutorial 7: Boas Práticas

## Organização do Telegram

### Use Supergrupos com Tópicos

Para clientes Professional e Enterprise, use tópicos no Telegram:

```
Grupo: "Empresa Alpha - Suporte"
├── Tópico: Atendimento Geral    → @atendente
├── Tópico: Suporte Técnico      → @tecnico
├── Tópico: Financeiro           → @financeiro
└── Tópico: Gerência             → @gerente (acesso restrito)
```

**Vantagens:**
- Cada assunto em seu lugar
- Clientes sabem onde pedir ajuda
- Histórico organizado
- Agentes não se confundem

### Nomenclatura de Triggers

| Padrão | Exemplo | Quando usar |
|--------|---------|-------------|
| `@funcao` | `@suporte` | Agente com papel claro |
| `@nome` | `@ana` | Agente com persona definida |
| `@acao` | `@agendar` | Agente focado em uma ação |

**Evite:** triggers muito longos, com espaços ou caracteres especiais.

## Documentos

### Princípio: Menos é Mais

- Documentos curtos e objetivos > documentos extensos
- Uma informação clara > parágrafos de contexto
- Tabelas e listas > texto corrido
- Dados concretos > descrições vagas

### Atualização Regular

```
Frequência recomendada:
- FAQ: Semanal (novas perguntas aparecem sempre)
- Preços: Quando mudar
- Políticas: Mensal ou quando atualizar
- Manual técnico: A cada release
```

### Versionamento

Inclua data de atualização nos documentos:

```markdown
# Tabela de Preços
> Última atualização: 2026-03-24

| Plano | Mensal | Anual |
|-------|--------|-------|
| Basic | R$ 99 | R$ 990 |
```

## Agentes

### Personalidades Bem Definidas

Cada agente deve ter personalidade distinta e consistente:

**Ruim:** "Seja educado e responda as perguntas."

**Bom:** "Você é objetivo e empático. Sempre valide o sentimento do cliente antes de oferecer a solução. Use linguagem informal mas profissional. Evite jargões técnicos com clientes não-técnicos."

### Escopo Claro

Defina o que cada agente **faz** e **não faz**:

```markdown
## O que faço
- Responder dúvidas sobre produtos
- Verificar status de pedidos
- Processar trocas e devoluções

## O que NÃO faço
- Negociar preços (direcione para @closer)
- Resolver bugs do sistema (direcione para @tecnico)
- Aprovar reembolsos acima de R$ 500 (direcione para @gerente)
```

### Handoff entre Agentes

Instrua os agentes a fazer passagem quando necessário:

```markdown
## Escalação
Quando o problema for técnico, diga:
"Vou te direcionar para nosso time técnico. @tecnico, pode ajudar
o [nome] com [resumo do problema]?"
```

## Segurança

### Dados Sensíveis

- **Nunca** coloque senhas, tokens ou chaves nos documentos
- Use variáveis de ambiente para credenciais
- Dados pessoais de clientes devem estar em sistemas externos, não nos docs

### Acesso por Plano

| Plano | Acesso |
|-------|--------|
| Starter | Documentos básicos, 2 agentes |
| Professional | Todos os docs, 5 agentes, tasks agendadas |
| Enterprise | Tudo + browser + mounts customizados |

## Performance

### Limite de Agentes Concurrent

```
Recomendação:
- 1-3 agentes: Funciona bem em qualquer máquina
- 4-7 agentes: Requer servidor dedicado
- 8+ agentes: Distribuir em múltiplas instâncias
```

### Timeout de Containers

Configure timeouts adequados:

```json
{
  "containerConfig": {
    "timeout": 120000   // 2 min para respostas simples
  }
}
```

- Atendimento básico: 60-120s
- Análise técnica: 180-300s
- Pesquisa web: 300-600s
- Relatórios complexos: 600-1800s

## Monitoramento

### Logs

Verifique logs regularmente:
```bash
# Logs gerais do NanoClaw
journalctl --user -u nanoclaw -f

# Logs de um cliente específico
ls clients/empresa-alpha/logs/
```

### Métricas a Acompanhar

- Tempo médio de resposta por agente
- Taxa de escalação (quanto passa para nível acima)
- Perguntas não respondidas
- Satisfação do cliente (se houver feedback)

## Checklist de Onboarding

Ao configurar um novo cliente:

- [ ] Criar grupo Telegram com tópicos
- [ ] Adicionar bot e promover a admin
- [ ] Executar `create-client.sh` com template adequado
- [ ] Adicionar documentos base (FAQ, políticas, preços)
- [ ] Configurar personalidade de cada agente
- [ ] Associar documentos aos agentes corretos
- [ ] Testar cada agente no Telegram
- [ ] Validar handoff entre agentes
- [ ] Configurar tarefas agendadas (se aplicável)
- [ ] Documentar customizações feitas
- [ ] Treinar equipe do cliente no uso dos triggers
