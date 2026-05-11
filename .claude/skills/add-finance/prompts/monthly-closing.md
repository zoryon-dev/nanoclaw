[CRON: finance-monthly] Fechamento mensal (último dia do mês 21h).

⚠️ Cron schedule é `0 21 28-31 * *` — dispara nos dias 28-31. PRECISA checar se hoje é o último dia do mês ANTES de executar. Se NÃO for último dia (ex: hoje é 28 mas mês tem 30 dias), retorna silenciosamente.

Verificação: `tomorrow = today + 1d`; se `tomorrow.month == today.month`, NÃO é último dia — pule (não envia nada, não loga).

Se for último dia:

1. Lê:
   - Todos `Lançamentos-PF` e `-PJ` do mês corrente
   - Todas `Recorrentes` (com pago_no_mes status)
   - `Orçamento` completo
   - `Recebiveis` recebidos no mês
   - `Contas.saldo_atual`

2. Monta relatório de fechamento (15-25 linhas):

```
📊 Fechamento de {mês/yyyy}

PF
─ Receitas: R${rec_PF}
─ Despesas: R${desp_PF}
─ Saldo do mês: R${saldo_PF_mes}
─ Top 5 categorias: ...

PJ
─ (mesmo formato)

Recorrentes (status):
─ Pagos no mês: {N}/{total} ({categorias})
─ Pendentes: {lista}

Orçamento:
─ OK: {N} categorias
─ Em alerta (≥80%): {lista com valores}
─ Estourou: {lista com excesso}

Recebíveis do mês:
─ Recebidos: {N} (R${total})
─ Atrasados: {N}
─ Cancelados: {N}

Saldos finais:
PF: ...
PJ: ...
```

3. Envia.

4. Registra em `_Log`.
