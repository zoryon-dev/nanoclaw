---
name: finance-sheets
description: Leitura e escrita no Google Sheets do finance (Levis) via OAuth NATIVO do Google (OneCLI gateway) — NÃO via Composio. Use SEMPRE que o agente finance/Levis precisar ler ou escrever qualquer aba do workbook (Lançamentos, Recorrentes, Lembretes, Recebiveis, Categorias, _Log, Dashboard, etc.), incluindo em todos os crons (finance-sweep, finance-daily, finance-rollover, weekly/monthly closing). Substitui o toolkit Composio `googlesheets` — os slugs da Composio mudam e quebram os crons determinísticos.
---

# Finance Sheets — acesso nativo ao Google Sheets

O agente finance lê/escreve o workbook do Levis chamando a **API do Google Sheets diretamente**, através do gateway do OneCLI, que injeta o token OAuth do Google. **Sem Composio, sem chave no container** — o agente só roda o helper e o gateway cuida da auth (o agente precisa ter o app `google-sheets` concedido no OneCLI).

**Spreadsheet ID:** `1xlivzP9po42s2SoIqr45uRFuphHgGdHdpf7X1JRtThg`

## Por que helper (e não Composio)
Os slugs da Composio (`GOOGLESHEETS_VALUES_GET`, `GOOGLESHEETS_UPDATE_VALUES_BATCH`) foram **renomeados pela Composio** e quebraram todos os crons. O helper chama a API REST oficial do Google (estável) via gateway. Determinístico, fora do contexto do turno.

## Como usar (via Bash)

Helper: `/app/skills/finance-sheets/scripts/sheets_api.py`

```bash
SHEET=1xlivzP9po42s2SoIqr45uRFuphHgGdHdpf7X1JRtThg
PY=/app/skills/finance-sheets/scripts/sheets_api.py

# LER um range → imprime {"range","values":[[...]]}
python3 $PY get  "$SHEET" "Lembretes!A2:E1000"

# APPEND linhas (insere no fim) — rows é JSON 2-D
python3 $PY append "$SHEET" "_Log!A:E" '[["2026-06-20T12:00:00Z","finance-daily","success",3,"ok"]]'

# UPDATE (sobrescreve um range exato) — rows é JSON 2-D
python3 $PY update "$SHEET" "Lançamentos-PF!A42:M42" '[["id123","2026-06-20","despesa","..."]]'

# CLEAR um range (ex.: desfazer uma linha)
python3 $PY clear "$SHEET" "Lançamentos-PF!A42:M42"
```

`get` imprime JSON (`values` é array de linhas; range vazio → sem `values`). `append`/`update` usam `valueInputOption=USER_ENTERED` (fórmulas e datas são interpretadas como na UI).

## Mapa Composio → helper (pros crons existentes)

| Antigo (Composio) | Agora (helper) |
|---|---|
| `GOOGLESHEETS_VALUES_GET` range R | `python3 $PY get $SHEET "R"` |
| `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND` em R | `python3 $PY append $SHEET "R" '<json>'` |
| `GOOGLESHEETS_UPDATE_VALUES_BATCH` / update | `python3 $PY update $SHEET "R" '<json>'` |
| `GOOGLESHEETS_CLEAR_VALUES` em R | `python3 $PY clear $SHEET "R"` |
| `GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW` por id | `get` a coluna do id, ache o `row_index` em memória (1-based, header = row 1) |

## Erros
- `access_restricted` / HTTP 403 → o app `google-sheets` não está concedido a este agente no OneCLI. Avise o Jonas pra conceder; não tente Composio como fallback.
- HTTP 4xx com detalhe → erro de range/payload; corrija o range ou o JSON 2-D.
- Falha de rede/proxy → transitório, tente de novo; se persistir, reporta no `_Log` + avisa o Jonas (1 frase).
