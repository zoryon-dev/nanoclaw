---
name: mem
description: Memoria persistente de longo prazo via Mem.ai. Criar, buscar e listar notas. Use para salvar insights, decisoes, padroes e aprendizados que devem persistir alem das sessoes.
---

# Mem — Memoria de Longo Prazo

Ferramenta `mem-cli` para salvar e buscar memorias persistentes no Mem.ai.

## Comandos

```bash
mem-cli create "conteudo"                # Nota com titulo auto
mem-cli create "titulo" "conteudo"       # Nota com titulo explicito
mem-cli search "query"                   # Buscar notas
mem-cli list [limite]                    # Listar recentes (padrao 10)
mem-cli get <note-id>                    # Ler nota especifica
```

## Quando Usar

SALVAR no Mem:
- Decisoes estrategicas de Jonas (ex: "Decidiu focar em educacional antes de SaaS")
- Padroes de comportamento observados (ex: "Jonas tende a adiar lancamentos")
- Resultados de projetos (ex: "Lancamento X fez R$Y em Z dias")
- Insights de reunioes importantes
- Metas de medio/longo prazo
- Info que sera util daqui a semanas ou meses

BUSCAR no Mem:
- Quando Jonas perguntar sobre algo que aconteceu ha tempo
- Quando precisar de contexto historico para uma decisao
- Quando quiser entender padroes passados

## Formato para Criar

Sempre incluir data e contexto suficiente para ser util no futuro:

```bash
mem-cli create "Decisao: [topico]" "[Data] Jonas decidiu [o que] porque [motivo]. Contexto: [detalhe relevante]."
```

```bash
mem-cli create "Insight: [topico]" "[Data] Observacao: [o que]. Impacto: [por que importa]."
```

```bash
mem-cli create "Resultado: [projeto]" "[Data] [Metricas]. [O que funcionou]. [O que nao funcionou]."
```

## NAO Usar Para

- Tarefas (usar Todoist)
- Dados que mudam frequentemente (usar arquivos .md locais)
- Info que ja esta nos arquivos de referencia (clientes.md, produtos.md, etc.)
