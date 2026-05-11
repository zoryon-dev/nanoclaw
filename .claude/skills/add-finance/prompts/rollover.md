[CRON: finance-rollover] Virada de mês (dia 1, 00:30).

Faça AGORA:

1. Em `Recorrentes`, atualiza TODAS as linhas com `ativo=TRUE` setando `pago_no_mes=FALSE`. (Reset mensal.)

2. Em `Recorrentes`, para cada linha com `ativo=TRUE`:
   - Calcula `data_vencimento_do_mes` = `DATE(year, current_month, dia_do_mes)`
   - Insere uma linha em `Lembretes` com:
     - `id`: `lem-rec-{recorrente_id}-{yyyy-mm}`
     - `quando`: `{data_vencimento_do_mes} 09:00:00`
     - `mensagem`: `Vence hoje: {nome do recorrente} R${valor}`
     - `linhagem`: `recorrente:{recorrente_id}`
     - `enviado_em`: vazio
   - Se já existir um lembrete com esse id (idempotência), pula.

3. Registra em `_Log`: 1 linha com qtd_processada = número de recorrentes materializados.

4. Envia mensagem curta ao user: "🗓️ Novo mês começou. {N} recorrentes resetados, {M} lembretes agendados pro mês."
