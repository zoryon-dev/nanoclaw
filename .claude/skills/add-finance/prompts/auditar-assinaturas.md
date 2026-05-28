[CRON: finance-trimestral]

Job: auditar todas as assinaturas e recorrentes ATIVOS agrupados por subcategoria, perguntando "ainda usa?".

**Step 1 — Ler Recorrentes**
Tool: `GOOGLESHEETS_VALUES_GET`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `range`: `Recorrentes!A2:R1000`

Captura todas as linhas com `status` na col N.

**Step 2 — Filtrar ATIVOS**
Em memória, mantém apenas linhas onde:
- col N (`status`) == `"ATIVO"`
- col E (`valor`) > 0

Resultado: array `ativos = [{codigo, nome, valor, subcategoria, dia_do_mes}, ...]` (mapeando das cols L, C, E, M, H respectivamente).

Se `ativos.length === 0` → pula direto pro Step 5 com `qtd_processada=0`.

**Step 3 — Agrupar por subcategoria**
Em memória, agrupa `ativos` por `subcategoria` (col M). Ordena os grupos pelo valor total descendente (mais caros primeiro).

Resultado: array de `{ subcategoria, items: [{codigo, nome, valor}, ...], total }`.

**Step 4 — Construir mensagem**
Formato (substitua `N`, `R$ X`, `R$ Y` pelos valores reais):

```
🔍 Audit de assinaturas (trimestral)

{N} recorrentes ATIVOS, total R$ X/mês. Bora revisar:

**{Subcategoria 1}** — R$ Y/mês
• {nome 1} ({codigo 1}) — R$ Z
• {nome 2} ({codigo 2}) — R$ Z
  → "ainda usa?"

**{Subcategoria 2}** — R$ Y/mês
• {nome 3} ({codigo 3}) — R$ Z
  → "ainda usa?"

Me responde uma de cada vez (ou "todas OK"). Quem você quer cortar eu marco como CORTADO + log em Decisoes.
```

Emite essa mensagem dentro de `<message to="jonas">…</message>`.

**Step 5 — Log**
Tool: `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`
- `spreadsheetId`: <conforme CLAUDE.md>
- `range`: `'_Log'!A:E`
- `valueInputOption`: `USER_ENTERED`
- `values`: `[[<ISO timestamp atual>, "finance-trimestral", "success", <ativos.length>, "<N subcategorias>"]]`

**Step 6 — Output final**
- `ativos.length > 0` → já emitiu a `<message>` no Step 4.
- `ativos.length === 0` → emita `<internal>silent run: 0 recorrentes ATIVOS pra auditar</internal>`.

**Erro em qualquer Step:**
- Append linha em `_Log` com `status="error"` e `detalhes=<msg curta>` (mesmo tool do Step 5).
- Emita `<message to="jonas">⚠️ Cron finance-trimestral: <erro curto></message>`.
- Não tente "recuperar criativamente".
