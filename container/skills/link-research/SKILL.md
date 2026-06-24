---
name: link-research
description: Pesquisa a fundo a partir de um link. Quando o Jonas manda um link (Instagram/TikTok/site/YouTube), resolva o conteúdo do link em texto, use como semente pra pesquisar o tema, compile o resultado no wiki e catalogue o link-semente no Notion. NÃO arquiva o post — o link é referência, a pesquisa é o que vale.
---

# link-research — link como semente de pesquisa

O Jonas manda um link → você **pesquisa o tema por trás dele** e salva a pesquisa.
O post em si NÃO é arquivado; o link entra só como referência. Autônomo: não pergunte
antes — se ele mandar instrução junto ("vai a fundo em X disso"), ela direciona o foco.
Tom sóbrio e curto (igual ao resto do Brown). Responda sempre via `<message to="jonas">`.

## Fluxo

1. **Resolver o link → texto.**
   - **Instagram / TikTok** → `python3 /app/skills/link-research/scripts/resolve.py "<url>"`.
     Sai um JSON `{platform, type, text, source_url}`. O `text` é a legenda (carrossel) ou
     a transcrição (reel). Se o script sair com erro (post privado / cookie expirado),
     **avise em uma linha** e peça a legenda colada — não invente o conteúdo.
   - **Site / artigo / X** → `firecrawl_scrape` (MCP) na URL → markdown.
   - **YouTube** → `python3 /app/skills/save-link/scripts/yt_meta.py "<url>"` (título+descrição;
     se precisar da fala, use o resolve.py que cai no caminho de transcrição).

2. **Definir o tema.** Do texto resolvido, extraia o **tema central** (1 frase). Se o Jonas
   mandou instrução, ela manda — pesquise o que ele pediu, usando o link como referência.

3. **Pesquisar (profundidade média).** Siga a skill `research` (`/app/skills/research/SKILL.md`):
   GitHub (`gh_search.py`), Firecrawl (`firecrawl_search`), Tavily (`tvly search --json`).
   Junte/deduplique, fique com as **5–6 melhores fontes**, abra/resuma as 2–3 mais fortes.

4. **Compilar no wiki.** Siga a skill `wiki` (`/app/skills/wiki/SKILL.md`): destile a pesquisa
   numa página `wiki/topicos/<tema-em-kebab>.md` (essência + cross-refs), e registre em
   `wiki/log.md`. É isso que a Consulta vai ler depois — compile, não cole resultado cru.

5. **Catalogar no Notion** (`Links — Biblioteca`, db key `links`). Schema (passe em toda
   chamada do notion_db.py): `SCHEMA=/workspace/agent/migration/schema.brown.json`. Antes, dedup:
   `python3 /app/skills/save-link/scripts/linkinfo.py "<url>"` dá a `url_key`; cheque se já
   existe (`python3 /app/skills/notion-db/scripts/notion_db.py --schema $SCHEMA query links --filter url_key=<key>`).
   - **Novo** → cria a entrada:
     ```
     python3 /app/skills/notion-db/scripts/notion_db.py --schema $SCHEMA create-row links --json '{
       "title": "<tema>", "url": "<source_url>", "url_key": "<key>",
       "categoria": "Pesquisa",
       "resumo": "<abstract curto da pesquisa>",
       "nota": "wiki/topicos/<tema-em-kebab>.md",
       "tags": ["<tag1>", "<tag2>"]
     }'
     ```
     Tags: reuse `/workspace/agent/tags.md` (leia antes; crie tag nova só se nada serve).
   - **Já existe** → **atualize** a página do wiki e a entrada (`python3 /app/skills/notion-db/scripts/notion_db.py --schema $SCHEMA update links
     --match url_key=<key> --json '{...}'`) e avise "já tinha pesquisado isso, atualizei".

6. **Relatar.** Uma mensagem pro Jonas: o que a pesquisa achou (2–4 pontos), e onde salvou
   (página do wiki + entrada no Notion). Sem encher — entregue e pare.

## Notas

- Vários links numa mensagem → trate cada um como sua própria pesquisa+entrada, em sequência.
- Categoria `Pesquisa` é criada sozinha no Notion na primeira `create-row` (a API cria a opção
  de select ao gravar um valor novo).
- Antes do primeiro `tvly` na sessão: `export REQUESTS_CA_BUNDLE="$SSL_CERT_FILE" CURL_CA_BUNDLE="$SSL_CERT_FILE"`.
