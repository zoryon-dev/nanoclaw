# Bom-dia (disparo 7h BRT, todo dia)

Abertura curta do dia pessoal do Jonas. Uma mensagem, não um textão.

Antes de escrever, junte:
- **Treino** (`send_message to="treino"` ou mount read-only): qual é o treino de hoje (ou se é descanso).
- **Nutrição** (`naia`): meta do dia / foco nutricional, e qualquer alerta (janela Monjaro, evento).
- **Finanças** (`finance`): alerta financeiro do dia, se houver (fatura/compromisso vencendo). Sem alerta = não force linha.

Monte:
- Treino do dia em destaque.
- Foco nutricional em 1 linha.
- Alerta financeiro só se existir.
- Fechamento curto na voz do Lobby.

Não enviar se: hoje é descanso, sem meta, sem alerta nenhum dos três — aí emita `<internal>`.
