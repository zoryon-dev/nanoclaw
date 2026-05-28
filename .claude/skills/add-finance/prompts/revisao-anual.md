[CRON: finance-anual]

Job: identificar contratos ATIVOS há >12 meses e sugerir renegociação.

**Step 1 — Ler Recorrentes**
Tool: `GOOGLESHEETS_VALUES_GET`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `range`: `Recorrentes!A2:R1000`

Captura todas as linhas. Cols relevantes: A (`id`), C (`nome`), E (`valor`), L (`codigo`), M (`subcategoria`), N (`status`).

**Step 2 — Filtrar ATIVOS**
Em memória, mantém apenas linhas onde col N (`status`) == `"ATIVO"`. Ignora CORTADO, ENCERRADO, PENDENTE.

Resultado: `ativos = [{id, codigo, nome, valor, subcategoria}, ...]`.

**Step 3 — Ler Lançamentos pra descobrir idade do contrato**
Tools: `GOOGLESHEETS_VALUES_GET` em `Lançamentos-PF!A2:M10000` E `Lançamentos-PJ!A2:M10000`.

Pra cada item em `ativos`, busca a **primeira** linha de Lançamento com `recorrente_id` (col H) == `item.id`. Pega `data` (col B) dessa primeira ocorrência.

Resultado: `idade_meses = (hoje - primeira_data) / 30` (aproximação).

Se Lançamentos não tem nenhuma linha com esse `recorrente_id` (item recente ou nunca pago), usa `idade_meses = 0`.

**Step 4 — Filtrar contratos >12 meses**
Em memória, mantém apenas itens onde `idade_meses >= 12`.

Resultado: `velhos = [{codigo, nome, valor, subcategoria, idade_meses}, ...]`, ordenado por `valor` descendente.

Se `velhos.length === 0` → pula pro Step 6 com `qtd_processada=0`.

**Step 5 — Construir mensagem**

```
📞 Revisão anual (renegociação)

{N} contratos ATIVOS há mais de 12 meses, total R$ X/mês. Esses são bons candidatos pra ligar e pedir desconto / migrar pra plano novo:

**{Subcategoria 1}**
• {nome 1} ({codigo 1}) — R$ {valor}/mês — {idade} meses
• {nome 2} ({codigo 2}) — R$ {valor}/mês — {idade} meses

**{Subcategoria 2}**
• {nome 3} ({codigo 3}) — R$ {valor}/mês — {idade} meses

Sugestão prática: pega 1-2 esta semana, liga, pede desconto ou cancelamento (geralmente sai oferta). Me conta o resultado pra eu atualizar valor (ou cortar via `cortar_recorrente`).
```

Emite dentro de `<message to="jonas">…</message>`.

**Step 6 — Log**
Tool: `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`
- `spreadsheetId`: <conforme CLAUDE.md>
- `range`: `'_Log'!A:E`
- `valueInputOption`: `USER_ENTERED`
- `values`: `[[<ISO timestamp atual>, "finance-anual", "success", <velhos.length>, "total_mensal=R$<X>"]]`

**Step 7 — Output final**
- `velhos.length > 0` → já emitiu `<message>` no Step 5.
- `velhos.length === 0` → emita `<internal>silent run: nenhum contrato >12 meses</internal>`.

**Erro em qualquer Step:**
- Append linha em `_Log` com `status="error"` e `detalhes=<msg curta>` (mesmo tool do Step 6).
- Emita `<message to="jonas">⚠️ Cron finance-anual: <erro curto></message>`.
- Não tente "recuperar criativamente".
