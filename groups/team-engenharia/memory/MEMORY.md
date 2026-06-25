# MEMORY — team-engenharia

Índice de memória persistente do agent group. Uma linha por memória. O orquestrador lê este
índice a cada sessão. **Não** coloque conteúdo de memória aqui — só o ponteiro.

Formato: `- [Título](arquivo.md) — gancho de uma linha`

## Convenções
- [Convenções de código e PR](conventions.md) — defaults de TS/Node, React/Next, Python e regras de review do time.

## Repositórios
<!-- Ex.: - [api-pedidos](repo-api-pedidos.md) — usa Fastify + Prisma; testes em vitest; deploy via GH Actions. -->

## Decisões de arquitetura
<!-- Ex.: - [ADR-0007 Postgres para pedidos](../docs/adr/0007-...) — escolha de banco e o trade-off aceito. -->

## Achados recorrentes de review
<!-- Ex.: - [Validação de input ausente em handlers](review-input-validation.md) — padrão a reforçar. -->

---

### Regras de memória deste grupo
- Salve: convenções confirmadas, quirks por repositório, decisões de arquitetura (linke o ADR),
  achados de review que se repetem.
- **Nunca** salve: secrets, tokens, chaves, ou detalhes efêmeros de uma única conversa.
- Antes de criar um arquivo novo, cheque se já existe um que cobre o fato — atualize em vez de duplicar.
