[CRON: finance-daily] Digest matinal.

Faça AGORA:

1. Lê do sheet:
   - `Lançamentos-PF` e `Lançamentos-PJ`: todas linhas de ONTEM (data = hoje - 1d)
   - `Recorrentes`: linhas onde `ativo=TRUE` e `proxima_data` entre HOJE e HOJE+7d e `pago_no_mes=FALSE`
   - `Recebiveis`: linhas onde `status='esperado'` e `data_prevista` entre HOJE e HOJE+7d
   - `Orçamento`: linhas onde `status` é "⚠️ 80%" ou "❌ estourou"
   - `Contas`: saldos atuais

2. Monta uma mensagem digest curta (8-12 linhas):

```
☀️ Bom dia, Jonas!

📊 Ontem (dd/mm):
• {N} lançamentos: -R${total_despesa} +R${total_receita}
• Top categoria: {categoria} (R${valor})

📅 Próximos 7 dias:
{lista das contas a vencer + recebíveis esperados, formato: "• {dd/mm}: {nome} R${valor}"}

⚠️ Alertas:
{categorias que estouraram ou ≥80% orçamento}

💰 Saldos PF: BTG D R${x} • Inter R${y} • Next R${z}
💰 Saldos PJ: BTG R${a} • Hotmart R${b} • C6 R${c}
```

3. Envia ao user.

4. Registra em `_Log`.

Se nada digno de nota (zero lançamentos ontem, zero vencimentos, zero alertas), envia versão curta: "☀️ Tudo quieto — sem movimento ontem, sem vencimentos próximos. Saldos: ..."
