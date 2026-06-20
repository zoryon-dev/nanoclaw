[SYSTEM TASK — NON-INTERACTIVE]

Este é um cron job automatizado, não uma mensagem do Jonas. Regras de execução:

1. NÃO cumprimente. NÃO peça confirmação. NÃO pergunte esclarecimento.
2. NÃO mostre cards de confirmação. NÃO use os templates "📝 Confirma?".
3. Os princípios "Confirme antes de escrever" e "Pergunte se ambíguo" NÃO se aplicam — siga os Steps literalmente.
4. Output deve ser exatamente UM destes formatos:
   - `<message to="jonas">{conteúdo entregue ao usuário}</message>` — quando o cron produz info útil
   - `<internal>silent run: {motivo curto}</internal>` — quando não há nada pra entregar
5. SEMPRE registre 1 linha em `_Log!A:E` ao final com `append` (ver regra 8): `[ISO timestamp, job_name, status, qtd_processada, detalhes]`.
6. Se algum Step falhar: log error em `_Log` + emita `<message to="jonas">⚠️ Cron {nome}: {erro curto}</message>` (1 frase).
7. Não tente "recuperar criativamente" — falha → log + reporta + para.
8. 🔴 **GOOGLE SHEETS — USE O HELPER NATIVO, NÃO A COMPOSIO.** Os Steps abaixo citam tools `GOOGLESHEETS_*` (legado Composio) — elas foram **DESCONTINUADAS** pro finance (a Composio renomeou os slugs e quebrou todos os crons). Para TODA leitura/escrita de Sheets, **carregue a skill `finance-sheets` e use o helper via Bash**. Defina `SHEET=1xlivzP9po42s2SoIqr45uRFuphHgGdHdpf7X1JRtThg` e `PY=/app/skills/finance-sheets/scripts/sheets_api.py`. Tradução obrigatória dos Steps:
   - `GOOGLESHEETS_VALUES_GET` / `GOOGLESHEETS_BATCH_GET` (range `R`) → `python3 $PY get "$SHEET" "R"` (imprime `{"values":[[...]]}`)
   - `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND` (range `R`) → `python3 $PY append "$SHEET" "R" '<json 2-D>'`
   - `GOOGLESHEETS_UPDATE_VALUES_BATCH` / update (range `R`) → `python3 $PY update "$SHEET" "R" '<json 2-D>'`
   - `GOOGLESHEETS_CLEAR_VALUES` (range `R`) → `python3 $PY clear "$SHEET" "R"`
   - `GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW` por `id` → `get` a coluna do id e ache o `row_index` em memória (1-based; header = row 1).
   Filtragem/lookup é feita em memória após o `get`. NUNCA chame Composio pra Sheets.

Execute os Steps abaixo na ordem. Cada Step é uma tool-call explícita ou ação determinística (traduzindo os `GOOGLESHEETS_*` conforme a regra 8).

---
