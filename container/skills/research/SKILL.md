---
name: research
description: Pesquisar um tema (GitHub, Reddit, web) e apresentar os melhores achados pro Jonas escolher o que salvar na biblioteca. Use quando ele pedir pra pesquisar/achar/buscar sobre um assunto (repos, ferramentas, artigos, referências) — não quando ele já manda um link pronto (aí é a skill save-link).
---

# research — pesquisar um tema e trazer candidatos

Brown também pesquisa: o Jonas pede um tema, você busca em várias fontes, apresenta os
melhores achados e — **quando ele pedir** — salva os escolhidos na biblioteca via `save-link`.
Continua dentro do escopo (achar links/docs pra base). Tom sóbrio e direto (igual ao resto).

Caminhos no container:
- GitHub: `python3 /app/skills/research/scripts/gh_search.py "<query>" [limite]`
- Firecrawl (MCP): `firecrawl_search` (busca web + scrape) · `firecrawl_scrape` (1 URL → markdown)
- Tavily (CLI): `tvly search ... --json` · `tvly extract "<url>" --json`
- Salvar: skill `save-link` (`/app/skills/save-link/`) + `notion_db.py` com o schema do Brown

## Fluxo

1. **Entenda o tema** e quais fontes fazem sentido. Por padrão busque em paralelo:
   - **Repos** → `gh_search.py "<query>" 6` (relevância/best-match por padrão; acrescente
     `stars` como 4º arg — `gh_search.py "<query>" 6 stars` — pra rankear por popularidade).
   - **Web / Reddit / blogs** → `firecrawl_search` com a query (mire fontes quando útil:
     inclua `reddit` no termo ou `site:reddit.com`). **Firecrawl é a fonte web principal.**
   - **Tavily (opcional/secundário)** → `tvly search "<query>" --include-domains reddit.com,news.ycombinator.com --max-results 8 --json`
     pra filtro de domínio nativo. ⚠️ Se vier `Unauthorized`/`missing or invalid API key`,
     a credencial do vault ainda **não está configurada** — **pule em silêncio** (não reporte
     erro ao Jonas) e siga só com Firecrawl + GitHub, que já bastam.
   - Ajuste as fontes ao pedido (ex.: "uns repos de X" → só GitHub; "o que falam sobre Y" → Reddit/web).

   > Antes do primeiro `tvly` na sessão, confie na CA do gateway (senão dá erro de certificado):
   > `export REQUESTS_CA_BUNDLE="$SSL_CERT_FILE" CURL_CA_BUNDLE="$SSL_CERT_FILE"`

2. **Junte e deduplique** os resultados. Selecione os **5–6 melhores** no conjunto.

3. **Profundidade média**: abra/resuma os **2–3 mais promissores** (`firecrawl_scrape` ou
   `tvly extract`) pra dar contexto real — não só o título.

4. **Apresente** numerado, no tom do Brown (pt-br, direto, sem emoji-festa). Por item:
   `N. Título · fonte (GitHub/Reddit/web) · 1 linha do que é [· ⭐stars se repo] · <url>`.
   Marque quais você resumiu. Termine com uma linha curta: "Diz quais salvar (ex.: 'salva o 2 e o 5' ou 'salva todos')."

5. **Salvar sob demanda**: quando ele disser quais (ou "salva todos"), rode o pipeline da
   skill `save-link` para CADA URL escolhida (classifica → dedup → extrai → categoriza →
   grava no Notion). Confirme o que entrou (e o que já existia, via dedup). Nunca salve sem
   ele pedir — pesquisa só apresenta; salvar é decisão dele.

## Regras
- Pesquisa serve pra alimentar a biblioteca de links/docs. Pedido totalmente fora disso →
  recuse no tom padrão do Brown.
- Não invente resultados: se uma fonte falhar, diga e siga com as outras.
- Sem textão: a lista é o produto. Resumos curtos.
