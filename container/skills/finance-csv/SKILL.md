---
name: finance-csv
description: Parse, reconcile, and classify bank statement files from BTG PF (XLS), BTG PJ (CSV), Inter PF (CSV), and Hotmart (CSV). Use when the user uploads or references a bank statement file in the finance agent (Levis). Auto-detects source, runs deterministic matching against existing Lançamentos/Recorrentes/Recebíveis, and consults the classification cache.
allowed-tools: Bash(finance-csv:*)
---

# finance-csv

CLI for reconciling bank statement files against Levis's Google Sheets workbook.

Supports 4 sources:
- **BTG PF** — `.xls` (OLE2 binary, individual account export)
- **BTG PJ** — `.csv` (`,` quoted fields: `"Data","Descricao","Valor","Saldo"`)
- **Inter PF** — `.csv` (`;` with preamble rows before the real header)
- **Hotmart** — `.csv` (`;` UTF-8 BOM, PT-BR headers, includes a `Categoria` column used as a classification hint)

## Quick start

```bash
finance-csv parse <file>                            # auto-detect source
finance-csv parse <file> --bank btg_pf|btg_pj|inter|hotmart   # override
finance-csv parse <file> --out canonical.json       # write to file (default: stdout)

finance-csv classify "<descricao>" --cache <path>

finance-csv reconcile \
  --csv canonical.json \
  --sheet sheet-dump.json \
  --cache groups/finance/classification-cache.json \
  --markers groups/finance/imports/processed \
  --out result.json
```

## Commands

### parse — Convert bank file to canonical JSON

Auto-detection runs in two stages: file extension + magic bytes (`.xls` → BTG PF via OLE2), then content match on the first non-empty data row (for CSVs).

Output schema:

```json
{
  "banco": "btg_pf" | "btg_pj" | "inter" | "hotmart",
  "conta_inferida": "BTG D" | "BTG PJ" | "Inter PF" | "Hotmart",
  "escopo": "PF" | "PJ",
  "periodo": { "inicio": "yyyy-mm-dd", "fim": "yyyy-mm-dd" },
  "linhas": [
    {
      "linha_id": "<banco>-yyyy-mm-dd-NNN",
      "data": "yyyy-mm-dd",
      "valor": 80.00,
      "tipo": "despesa" | "receita" | "estorno" | "transferencia_interna",
      "descricao_raw": "UBER *TRIP 3829",
      "banco_tx_id": "HP3885105953" | null,
      "meio_pagamento_hint": "PIX" | "Cartão C1" | "Boleto" | "Transferência" | null,
      "categoria_hint": "Antecipação" | null
    }
  ]
}
```

`linha_id` is deterministic (`{banco}-{data}-{seq}`) — re-parsing the same file produces identical IDs, enabling the `skipped_reimport` bucket in reconcile.

`categoria_hint` comes from the source's own classification column (currently Hotmart's `Categoria`). The classify step maps it through `hotmart-categoria-map.json` to the agent's taxonomy before falling back to cache lookup.

### classify — Look up categoria/subcategoria for a description

```bash
finance-csv classify "UBER *TRIP 3829" --cache groups/finance/classification-cache.json
```

Output: `{ "categoria": "Pessoal", "subcategoria": "Transporte", "fonte": "cache", "confidence": 0.95 }` or `null`.

### reconcile — Match canonical against sheet state

```bash
finance-csv reconcile \
  --csv canonical.json \
  --sheet sheet-dump.json \
  --cache groups/finance/classification-cache.json \
  --markers groups/finance/imports/processed \
  --out result.json
```

`sheet-dump.json` shape (agent assembles from Composio `BATCH_GET`):

```json
{
  "lancamentos":          [{ "id", "data", "tipo", "valor", "categoria", "descricao", "recorrente_id" }, ...],
  "recorrentes_ativos":   [{ "id", "codigo", "nome", "valor", "dia_do_mes", "pago_no_mes" }, ...],
  "recebiveis_esperados": [{ "id", "descricao", "valor", "data_prevista" }, ...]
}
```

Output bucketed result per the spec section "Result structure".

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Generic error (stderr has details) |
| 2 | Unknown source (parse only — stderr shows header dump) |
| 3 | Already imported (reconcile only — stderr shows processed_at) |
| 4 | Invalid input file (missing, empty, unreadable) |
```
