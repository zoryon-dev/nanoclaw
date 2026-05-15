[CRON: finance-semestral]

Job: revisão estrutural da taxonomia (Subcategorias). Identifica subcats subutilizadas e lançamentos com subcategoria vazia.

**Step 1 — Ler Subcategorias**
Tool: `GOOGLESHEETS_VALUES_GET`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `range`: `Subcategorias!A2:F100`

Captura `subcats = [{nome, categoria_pai, escopo}, ...]` (cols A, B, C).

**Step 2 — Ler Recorrentes ATIVOS**
Tool: `GOOGLESHEETS_VALUES_GET`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `range`: `Recorrentes!A2:R1000`

Filtra em memória onde col N (`status`) == `"ATIVO"`. Conta items por `subcategoria` (col M).

Resultado: `contagem_por_subcat = {subcategoria: N_items, ...}`.

**Step 3 — Identificar subcats com ≤1 item ativo**
Pra cada subcat em `subcats`:
- Se `contagem_por_subcat[subcat.nome]` é `undefined` ou `0` → marca como **sem uso**.
- Se == `1` → marca como **subutilizada** (candidata a merge com a sibling mais próxima do mesmo `categoria_pai`).
- Se ≥ 2 → ignorado nesse passo.

Resultado: `subutilizadas = [{nome, categoria_pai, item_count, status: "sem_uso" | "subutilizada"}, ...]`.

**Step 4 — Ler Lançamentos sem subcategoria**
Tools: `GOOGLESHEETS_VALUES_GET` em `Lançamentos-PF!A2:M10000` e `Lançamentos-PJ!A2:M10000` (duas chamadas).

Em memória, filtra linhas onde col M (`subcategoria`) está vazia/nula. Conta por categoria pai (col E).

Resultado: `lancamentos_sem_subcat = {categoria_pai: count, ...}`.

Se total de lançamentos sem subcategoria == 0 E `subutilizadas.length === 0` → pula pro Step 6 com `qtd_processada=0` (nada a reportar).

**Step 5 — Construir mensagem**

Se `subutilizadas.length > 0` OU `lancamentos_sem_subcat` não vazio:

```
🏛️ Revisão estrutural (semestral)

{Se subutilizadas.length > 0:}

**Subcategorias subutilizadas** ({N}):
• {nome 1} ({categoria_pai 1}) — {item_count} items ATIVOS{; sugere merge com X se aplicável}
• {nome 2} ({categoria_pai 2}) — {item_count} items ATIVOS

Quer mantê-las, mergear ou cortar? Posso atualizar Subcategorias se você decidir.

{Se lancamentos_sem_subcat não vazio:}

**Lançamentos sem subcategoria** ({total}):
• {categoria_pai 1}: {count} linhas
• {categoria_pai 2}: {count} linhas

Eu posso preencher na próxima vez que você tocar nessas linhas (`editar_lancamento`), ou faço um batch — você prefere?
```

Emite dentro de `<message to="jonas">…</message>`.

**Step 6 — Log**
Tool: `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`
- `spreadsheetId`: <conforme CLAUDE.md>
- `range`: `'_Log'!A:E`
- `valueInputOption`: `USER_ENTERED`
- `values`: `[[<ISO timestamp atual>, "finance-semestral", "success", <subutilizadas.length + total_lancamentos_sem_subcat>, "subutilizadas=<N>; lancamentos_sem_subcat=<total>"]]`

**Step 7 — Output final**
- Reportou algo no Step 5 → já emitiu a `<message>`.
- Nada a reportar → emita `<internal>silent run: taxonomia saudável, todos os lançamentos categorizados</internal>`.

**Erro em qualquer Step:**
- Append linha em `_Log` com `status="error"` e `detalhes=<msg curta>` (mesmo tool do Step 6).
- Emita `<message to="jonas">⚠️ Cron finance-semestral: <erro curto></message>`.
- Não tente "recuperar criativamente".
