---
name: tavily
description: Pesquisa web e research autônomo via Tavily CLI (`tvly`) — search (web/news, com filtros de tempo/domínio), extract (URL → markdown limpo), map/crawl (descobrir/varrer um site) e research (relatório citado autônomo). Use para âncoras factuais, dados, estatísticas e referências num carrossel/post. A key é injetada pelo gateway OneCLI (api.tavily.com) — NÃO passe key.
---

# Tavily — pesquisa web + research (CLI `tvly`)

Chama `api.tavily.com` — a key é injetada pelo **gateway OneCLI** (não há key no comando).
Use `--json` quando for processar/encadear. Saída de research pode ir pra `/workspace/agent/research/`.

## Comandos

```bash
tvly search "<termo>" --topic news --time-range week --max-results 8 --json   # busca web/notícia
tvly extract "<url>" --query "<foco>" --json                                  # URL → markdown limpo
tvly map "<url-do-site>" --json                                               # descobrir URLs de um site
tvly crawl "<url>" --instructions "<o que procurar>" --json                   # varrer site
tvly research "<pergunta>" --model pro -o /workspace/agent/research/<nome>.md  # relatório citado autônomo
```

### Flags úteis do `search`
- `--topic news|general`, `--time-range day|week|month`, `--max-results N`
- `--include-domains a.com,b.com` / `--exclude-domains x.com`
- `--depth advanced` (busca mais profunda)

## Receitas (pesquisa de conteúdo)

- **Âncora factual pra carrossel:** `tvly search "<claim/dado>" --time-range month --json` → 3-6 fontes confiáveis; cite a fonte no conteúdo.
- **Mergulho num tema:** `tvly research "<tema>" --model pro -o /workspace/agent/research/<tema>.md` → relatório citado; resuma o essencial, não cole o relatório todo.
- **Extrair um artigo/landing de concorrente:** `tvly extract "<url>" --query "<o que importa>"`.
- SEMPRE cruze os achados com os pilares/voz em `/workspace/brand-wiki/`. É **pesquisa** — nada publica; salvar referência é sob demanda (ver read-post `notion_row.py`).

## Erros

- **401 / Unauthorized** → a key Tavily não está sendo injetada pra este agente (vault/secret-mode no OneCLI). Avise o Jonas; não tente passar key manual.
- **command not found: tvly** → o CLI não está na imagem deste agente (precisa de rebuild). Avise o Jonas.
