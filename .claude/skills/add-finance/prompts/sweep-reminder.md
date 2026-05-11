[CRON: finance-sweep] Hora de checar lembretes vencidos.

Faça AGORA:

1. Lê `Lembretes!A:E` na workbook.
2. Filtra linhas onde `quando` <= NOW() E `enviado_em` está vazio.
3. Para CADA uma dessas linhas, envia uma mensagem no chat (texto livre): "🔔 Lembrete: {mensagem}". Uma mensagem por linha.
4. Imediatamente DEPOIS de cada envio, atualiza a célula `enviado_em` da linha com o timestamp atual (ISO).
5. Registra em `_Log!A:E`: 1 linha por execução do sweep com timestamp, job='finance-sweep', status='success', qtd_processada=<número de lembretes enviados>, detalhes=''.

Se NÃO houver lembretes vencidos, NÃO envie nada ao user — só atualize `_Log` com qtd_processada=0.

Se algum erro, log em `_Log` com status='error' e detalhes=<msg do erro>.
