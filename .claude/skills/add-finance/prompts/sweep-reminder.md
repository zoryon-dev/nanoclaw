[CRON: finance-sweep]

Job: enviar lembretes vencidos do Jonas.

**Step 1 — Ler Lembretes**
Tool: `GOOGLESHEETS_VALUES_GET`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `range`: `Lembretes!A2:E1000`

Se a resposta for vazia → pula direto pro Step 5 com `qtd_processada=0`.

**Step 2 — Filtrar vencidos (em memória)**
Mantenha apenas linhas onde:
- col C (`quando`) ≤ datetime atual
- col E (`enviado_em`) está vazia/nula

Resultado: array `vencidos = [{row_index, mensagem, quando}, ...]` (`row_index` é 1-based, contando o header — então a primeira linha de dados é row 2).
Se `vencidos.length === 0` → Step 5 com `qtd_processada=0`.

**Step 3 — Enviar mensagens**
Para cada item em `vencidos`, em ordem, emita exatamente:
`<message to="jonas">🔔 Lembrete: {mensagem}</message>`

**Step 4 — Marcar como enviado**
Tool: `GOOGLESHEETS_UPDATE_VALUES_BATCH`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `valueInputOption`: `USER_ENTERED`
- `data`: array com 1 entrada por item em `vencidos`:
  - `range`: `Lembretes!E{row_index}`
  - `values`: `[[<ISO timestamp atual>]]`

Uma única chamada batch com todas as células.

**Step 5 — Log**
Tool: `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`
- `spreadsheetId`: <conforme CLAUDE.md>
- `range`: `'_Log'!A:E`
- `valueInputOption`: `USER_ENTERED`
- `values`: `[[<ISO timestamp atual>, "finance-sweep", "success", <vencidos.length>, ""]]`

**Step 6 — Output final**
- `vencidos.length > 0` → já emitiu N `<message>` no Step 3. Não emita mais nada.
- `vencidos.length === 0` → emita `<internal>silent run: 0 lembretes vencidos</internal>`.

**Erro em qualquer Step:**
- Append linha em `_Log` com `status="error"` e `detalhes=<msg curta>` (mesmo tool do Step 5).
- Emita `<message to="jonas">⚠️ Cron finance-sweep: <erro curto></message>`.
- Não tente "recuperar criativamente".
