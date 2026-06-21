---
name: youtube-search
description: Pesquisa e descoberta no YouTube via Data API v3 — busca vídeos por termo (com filtros de duração, data, canal, ordenação por relevância/data/views), puxa detalhes de um vídeo (views, likes, comentários, descrição) e busca canais. Use para PESQUISA DE CONTEÚDO — temas quentes/em alta num nicho, análise de canal/concorrente, achar referências, mapear o que está performando. NÃO baixa o vídeo nem a transcrição (só metadados) — para assistir/resumir um vídeo, use /watch. Triggers — "temas quentes", "o que está bombando no YouTube sobre X", "procura no YouTube", "acha vídeo de", "analisa o canal Y", "referências de YouTube".
---

# YouTube Search — pesquisa e descoberta de conteúdo

Camada de **pesquisa** sobre o YouTube via **Data API v3**. Acha vídeos e canais e puxa
metadados (título, canal, duração, views, likes, comentários, descrição, data). É um sinal
de tendência real: o que está sendo publicado e assistido num nicho, agora.

**Limite importante:** esta skill **só lê metadados** (Data API). Ela **não baixa** o vídeo
nem extrai transcrição/frames. Para *assistir* e resumir um vídeo, encadeie com `/watch`
(ciente de que o download de YouTube costuma falhar do IP do servidor — frames de YouTube
não são garantidos; metadados+descrição daqui sempre vêm).

Credenciais são injetadas pelo **proxy OneCLI** — o helper já usa `key=onecli-managed`.
Não peça API key. Rode com `NODE_NO_WARNINGS=1` pra silenciar o aviso do undici.

## Comandos

```bash
YT=/app/skills/youtube-search/yt.mjs

# Buscar vídeos (o caso comum)
NODE_NO_WARNINGS=1 node $YT search "<termo>" [flags]

# Detalhes de um ou mais vídeos (views, likes, comentários, duração, descrição)
NODE_NO_WARNINGS=1 node $YT details <videoId>[,<id>...] [--json]

# Buscar canais
NODE_NO_WARNINGS=1 node $YT channel "<termo>" [--json]
```

### Flags do `search`
| Flag | Efeito | Default |
|---|---|---|
| `--max N` | nº de resultados (teto 25) | 8 |
| `--order relevance\|date\|viewCount\|rating` | ordenação | relevance |
| `--no-shorts` | remove vídeos ≤ 60s | off |
| `--min-min M` / `--max-min M` | filtra por duração (minutos) | — |
| `--region BR` | regionCode | BR |
| `--lang pt` | relevanceLanguage | pt |
| `--published-after ISO` | só vídeos após a data (ex: `2026-06-14T00:00:00Z`) | — |
| `--channel CHANNEL_ID` | restringe a um canal | — |
| `--json` | saída estruturada (pra processar/encadear) | off |

## Receitas de pesquisa de conteúdo

**Temas quentes (janela de 7 dias)** — o que está em alta num nicho na última semana.
Calcule a data de 7 dias atrás e ordene por views:
```bash
SINCE=$(date -u -d '7 days ago' +%Y-%m-%dT00:00:00Z)
NODE_NO_WARNINGS=1 node $YT search "<nicho/tema>" --order viewCount --published-after "$SINCE" --no-shorts --max 12 --json
```
Cruze os títulos/ângulos que mais performaram com os pilares de conteúdo da marca
(consulte `/workspace/brand-wiki/conceitos/pilares-de-conteudo-zoryon.md`) pra propor temas.

**Análise de canal/concorrente** — ache o canal, depois liste os vídeos recentes dele:
```bash
NODE_NO_WARNINGS=1 node $YT channel "<nome do canal>"            # pega o CHANNEL_ID
NODE_NO_WARNINGS=1 node $YT search "" --channel <CHANNEL_ID> --order date --max 15 --json
```

**Referência por formato** — pra "vídeo longo de verdade" use `--no-shorts` + `--min-min 5`;
pra "o mais recente" use `--order date`; pra "o mais popular" use `--order viewCount`.

## Salvar referência no Notion (SOB DEMANDA — só quando o Jonas pedir)

Pesquisa não salva nada. Mas quando o Jonas disser "salva essa referência" / "guarda esse
vídeo", registre o vídeo escolhido no database **"Referências — Conteúdo"** (o mesmo do
`/read-post`), via o writer `notion_row.py`. É só metadado — **sem mídia no Drive** (não dá
pra baixar YouTube; `--drive` é opcional, deixe de fora).

```bash
# 1) pegue os detalhes do vídeo escolhido
NODE_NO_WARNINGS=1 node /app/skills/youtube-search/yt.mjs details <videoId> --json
# 2) grave a descrição num arquivo (vira o corpo/legenda) e registre a linha:
python3 /app/skills/read-post/scripts/notion_row.py \
  --tipo video --plataforma youtube \
  --perfil "<canal>" --titulo "<título do vídeo>" \
  --data YYYY-MM-DD --link "https://youtu.be/<id>" \
  --metrica "<duração · views, ex: 9:24 · 12.5K>" \
  --tema "<tags do ângulo>" --legenda-file desc.txt
```

`--tipo video` cai como **"Vídeo"** no Notion (distinto de Reel). Só faça isso quando o Jonas
escolher um vídeo específico — nunca salve resultados de busca em lote.

## Como usar o resultado

- `--json` quando for filtrar/encadear programaticamente; sem `--json` a saída já vem legível.
- **Selecione e sintetize** (3–6 melhores) — não despeje JSON cru pro Jonas. Traga título,
  canal, duração, views, link, e uma leitura ("esse ângulo está performando porque…").
- É **pesquisa**, não publicação: ler é automático; nada aqui escreve em lugar nenhum.

## Erros comuns

- `ERRO: este agente não tem acesso à credencial do YouTube no OneCLI` → o helper imprime a
  URL de `manage`; mostre ao Jonas pra ele liberar o acesso a este agente.
- `ERRO: YouTube Data API v3 não está habilitada` → habilitar a API no projeto Google Cloud
  do OneCLI; mostre o passo ao Jonas.

## Formato de saída (chat)

Ao listar: título em destaque, link cru (sem markdown `[](...)`), bullets com `•`, no máx
1 emoji, enxuto. (Em Telegram/WhatsApp siga as regras de formatação do canal.)
