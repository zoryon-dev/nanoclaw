# Tutorial 5: Base de Documentos

## Conceito

A base de documentos é o conhecimento do cliente. Tudo que os agentes precisam saber fica em `clients/{slug}/docs/`.

Os agentes **só acessam** os documentos listados em sua configuração, garantindo que cada agente veja apenas o que é relevante para seu papel.

## Estrutura Recomendada

```
clients/empresa-alpha/docs/
├── README.md                    # Índice dos documentos
├── empresa/
│   ├── sobre.md                # Sobre a empresa
│   ├── valores.md              # Missão, visão, valores
│   └── organograma.md          # Estrutura organizacional
├── produtos/
│   ├── catalogo.md             # Lista de produtos/serviços
│   ├── precos.md               # Tabela de preços
│   └── comparativo.md          # Comparativo entre planos
├── atendimento/
│   ├── faq.md                  # Perguntas frequentes
│   ├── politicas.md            # Políticas (troca, devolução, etc.)
│   ├── sla.md                  # Tempos de resposta
│   └── scripts.md              # Scripts de atendimento
├── vendas/
│   ├── perfil-cliente.md       # ICP (Ideal Customer Profile)
│   ├── objecoes.md             # Respostas a objeções
│   ├── cases.md                # Casos de sucesso
│   └── processo-venda.md       # Funil e processo
└── tecnico/
    ├── manual.md               # Manual do produto/serviço
    ├── troubleshooting.md      # Solução de problemas comuns
    └── integrações.md          # APIs e integrações
```

## Como Criar Documentos Eficazes

### 1. Use Markdown Simples

```markdown
# FAQ - Perguntas Frequentes

## Entregas

### Qual o prazo de entrega?
O prazo padrão é de 3 a 7 dias úteis para capitais e 7 a 15 dias
úteis para interior. Frete expresso (1-2 dias úteis) disponível
por R$ 29,90 adicional.

### Como rastrear meu pedido?
Acesse [nosso site]/rastreio ou informe o código de rastreio
nos Correios. O código é enviado por email após o despacho.

## Trocas e Devoluções

### Posso trocar um produto?
Sim, aceitamos trocas em até 30 dias após o recebimento.
O produto deve estar na embalagem original, sem uso.
```

### 2. Seja Específico e Direto

**Ruim:**
> Nossa empresa oferece diversas opções de pagamento para melhor atender nossos clientes...

**Bom:**
> **Formas de Pagamento:**
> - PIX: 5% desconto
> - Cartão crédito: até 12x sem juros (mínimo R$ 50/parcela)
> - Boleto: 3% desconto, vence em 3 dias úteis
> - Transferência: 5% desconto

### 3. Inclua Exemplos Reais

```markdown
## Cálculo de Frete

| Região | Prazo | Preço |
|--------|-------|-------|
| SP Capital | 1-2 dias | R$ 15,00 |
| SP Interior | 3-5 dias | R$ 22,00 |
| Sudeste | 3-7 dias | R$ 28,00 |
| Sul/Nordeste | 5-10 dias | R$ 35,00 |
| Norte/CO | 7-15 dias | R$ 42,00 |

**Frete grátis** para compras acima de R$ 299.
```

### 4. Mantenha Atualizado

- Revise documentos mensalmente
- Registre a data da última atualização
- Remova informações obsoletas

## Associar Documentos a Agentes

No `config.json`, cada agente lista os documentos que pode acessar:

```json
{
  "agents": [
    {
      "name": "Atendente",
      "documents": [
        "atendimento/faq.md",
        "atendimento/politicas.md",
        "produtos/catalogo.md",
        "produtos/precos.md"
      ]
    },
    {
      "name": "Técnico",
      "documents": [
        "tecnico/manual.md",
        "tecnico/troubleshooting.md",
        "atendimento/faq.md"
      ]
    },
    {
      "name": "Closer",
      "documents": [
        "vendas/objecoes.md",
        "vendas/cases.md",
        "produtos/catalogo.md",
        "produtos/precos.md",
        "produtos/comparativo.md"
      ]
    }
  ]
}
```

## Documentos Essenciais por Tipo de Negócio

### E-commerce
- `produtos/catalogo.md` - Produtos e descrições
- `produtos/precos.md` - Preços e promoções
- `atendimento/faq.md` - Perguntas frequentes
- `atendimento/politicas.md` - Trocas, devoluções, frete
- `tecnico/troubleshooting.md` - Problemas no site/app

### SaaS
- `produtos/planos.md` - Funcionalidades por plano
- `tecnico/manual.md` - Como usar o produto
- `tecnico/api.md` - Documentação da API
- `vendas/cases.md` - Casos de sucesso
- `atendimento/sla.md` - SLA de suporte

### Serviços
- `empresa/servicos.md` - Serviços oferecidos
- `vendas/processo-venda.md` - Processo de contratação
- `atendimento/agendamento.md` - Regras de agendamento
- `empresa/equipe.md` - Time e especialidades

## Próximo Passo

Vá para [Tutorial 6: Templates de Times](06-templates-times.md) para aprender a usar templates pré-prontos.
