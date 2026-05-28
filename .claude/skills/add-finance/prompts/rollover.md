[CRON: finance-rollover]

Job: virada de mês (dia 1, 00:30) — reset `pago_no_mes` em Recorrentes + materialize lembretes do mês.

**Step 1 — Ler Recorrentes**
Tool: `GOOGLESHEETS_VALUES_GET`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `range`: `Recorrentes!A2:I1000`

Filtre em memória: `ativos = linhas com col I (ativo) == TRUE`.
Se `ativos.length === 0` → pula direto pro Step 5 com `qtd_processada=0` (silent run).

**Step 2 — Reset `pago_no_mes` em todos os Recorrentes ativos**
Tool: `GOOGLESHEETS_UPDATE_VALUES_BATCH`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `valueInputOption`: `USER_ENTERED`
- `data`: array com 1 entrada por item em `ativos`:
  - `range`: `Recorrentes!H{row_index}` (col H = `pago_no_mes`; `row_index` = 1-based, header é row 1)
  - `values`: `[[false]]`

Uma única chamada batch.

**Step 3 — Materializar Lembretes pro mês**
Para cada `rec` em `ativos`, calcule:
- `id_lembrete` = `lem-rec-{rec.id}-{yyyy-mm}` (yyyy-mm = mês corrente)
- `data_vencimento` = `{yyyy}-{mm}-{rec.dia_do_mes}` (col F do `Recorrentes`)
- `quando` = `{data_vencimento} 09:00:00`
- `mensagem` = `Vence hoje: {rec.nome} R${rec.valor}`
- `linhagem` = `recorrente:{rec.id}`
- `enviado_em` = `""`

Antes de inserir, leia `Lembretes!A2:A10000` (col A = id) via `GOOGLESHEETS_VALUES_GET` e descarte `rec`s cujo `id_lembrete` já existe.

**Step 4 — Inserir Lembretes não-duplicados**
Se `lembretes_para_inserir.length > 0`:

Tool: `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`
- `spreadsheetId`: <conforme CLAUDE.md>
- `range`: `Lembretes!A:E`
- `valueInputOption`: `USER_ENTERED`
- `values`: array de linhas, cada uma `[id_lembrete, quando, mensagem, linhagem, enviado_em]`

Se `lembretes_para_inserir.length === 0` → pula esta tool call.

**Step 5 — Log**
Tool: `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`
- `spreadsheetId`: <conforme CLAUDE.md>
- `range`: `'_Log'!A:E`
- `valueInputOption`: `USER_ENTERED`
- `values`: `[[<ISO timestamp>, "finance-rollover", "success", <ativos.length>, "<lembretes_para_inserir.length> lembretes novos"]]`

**Step 6 — Enviar mensagem**
Emita: `<message to="jonas">🗓️ Novo mês começou. {ativos.length} recorrentes resetados, {lembretes_para_inserir.length} lembretes agendados pro mês.</message>`.

**Erro em qualquer Step:**
- Append em `_Log` com `status="error"` e `detalhes=<msg curta>`.
- Emita `<message to="jonas">⚠️ Cron finance-rollover: <erro curto></message>`.
