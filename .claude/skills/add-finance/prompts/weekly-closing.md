[CRON: finance-weekly] Fechamento da semana (toda domingo 19h).

Faça AGORA:

1. Lê:
   - `Lançamentos-PF` e `Lançamentos-PJ`: linhas onde data está nos últimos 7 dias (hoje-7 a hoje)
   - `Contas.saldo_atual` (todas)
   - `Orçamento`: status atual de cada categoria

2. Monta digest semanal (10-15 linhas):

```
📅 Resumo da semana ({início} a {fim})

PF: -R${despesas_PF} • +R${receitas_PF} • saldo da semana R${diff_PF}
PJ: -R${despesas_PJ} • +R${receitas_PJ} • saldo da semana R${diff_PJ}

Top 3 categorias PF: ...
Top 3 categorias PJ: ...

Orçamento PF: {N} OK, {M} em alerta, {K} estouradas
Orçamento PJ: {N} OK, {M} em alerta, {K} estouradas

Saldos atuais:
PF: BTG D R${x} • Inter R${y} • Next R${z}
PJ: BTG R${a} • Hotmart R${b} • C6 R${c}
```

3. Envia.

4. Registra em `_Log`.
