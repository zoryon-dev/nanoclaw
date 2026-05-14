# Scheduled Job: Daily Focus Check

Sistema de check-ins suaves durante o dia. Diferente da mensagem matinal (fixa
no horário), os check-ins do dia são contextuais e o Lobby decide se vale ou
não enviar.

## Princípio fundamental: não bombardear

Máximo 1-2 check-ins por dia além da mensagem matinal. Em caso de dúvida sobre
mandar ou não, **NÃO mande**. Silêncio bem colocado vale mais que mensagem mal
colocada.

## Schedule

**Cron**: dispara em três janelas potenciais:

- `0 11 * * *` (11:00 - janela pré-almoço)
- `0 15 * * *` (15:00 - janela meio da tarde)
- `0 19 * * *` (19:00 - janela pós-jantar / pré-treino noturno)

Cada disparo do cron NÃO necessariamente envia mensagem. O Lobby avalia o
contexto antes de decidir.

## Lógica de decisão por janela

### Janela 11:00 (pré-almoço)

**Considerar enviar se**:

- Aluno está em Mounjaro e historicamente não atinge meta proteica diária
- Hoje é dia de treino tarde/noite (lembrete de comer bem antes)
- Última conversa indicou esquecimento alimentar
- Apple Health mostra passos zerados de manhã (sedentarismo do dia)

**Mensagem tipo (proteína - usuário Mounjaro)**:
```
[nome], só uma lembrança rápida: almoço de hoje é uma janela importante de
proteína. Tenta fechar 30-40g aí (palma da mão de proteína animal cobre).
Com Mounjaro o apetite baixa, mas se for líquido depois pra completar, vale.
```

**Mensagem tipo (movimento de manhã zerado)**:
```
[nome], vi que os passos hoje tão em [X]. Sem cobrança, mas se rolar uma
caminhada de 10 minutinhos antes do almoço, ajuda o resto do dia. Tem como?
```

**Não enviar se**:

- Já mandou mensagem matinal substantiva nas últimas 2-3h
- Aluno acabou de responder/conversar ativamente
- É domingo (a menos que seja dia de treino)

### Janela 15:00 (meio da tarde)

**Considerar enviar se**:

- Aluno tem treino programado para essa tarde/noite (check pré-treino)
- Apple Health indica sono ruim na noite anterior (oferecer ajuste de volume)
- Houve resposta de manhã que pedia follow-up

**Mensagem tipo (pré-treino)**:
```
[nome], como você está chegando pra sessão de hoje? Energia? Já comeu nas
últimas 2-3 horas?
```

**Mensagem tipo (sono ruim → ajuste)**:
```
[nome], pelo Apple Health você dormiu [X horas]. Se quiser, posso reduzir o
volume da sessão de hoje em 20-30%. Sem prejuízo do plano, só ajuste à realidade
do corpo. O que prefere?
```

**Não enviar se**:

- Aluno não programou sessão para tarde/noite
- Não houve mudança relevante desde manhã
- Já mandou check-in às 11h hoje

### Janela 19:00 (pós-jantar / pré-treino noturno)

**Considerar enviar se**:

- Aluno completou treino hoje (debrief curto)
- Aluno deveria ter treinado e não treinou (sem pressão, só presença)
- Algum sintoma relatado de manhã pedia checagem ("a dor melhorou?")

**Mensagem tipo (debrief pós-treino)**:
```
[nome], como foi a sessão hoje? RPE de cada bloco, se quiser registrar comigo.
Algum movimento que você sentiu diferente do esperado?
```

**Mensagem tipo (não treinou)**:
```
Oi, [nome]. Hoje não rolou treino? Sem cobrança, só quero saber se foi escolha,
imprevisto, ou se algo mudou no corpo. Me conta como você tá.
```

**Mensagem tipo (follow-up de sintoma)**:
```
[nome], a [dor/desconforto] que você mencionou de manhã melhorou ao longo do dia?
```

**Não enviar se**:

- Aluno claramente offline (não respondeu nada o dia inteiro)
- Conversa do dia já foi suficiente
- É domingo à noite e aluno tem padrão de não interagir nesse horário

## Foco contextual do dia

Em paralelo aos check-ins de janela, o Lobby pode determinar **UMA prioridade
comportamental** para o dia, baseada no contexto. Esse "foco do dia" não é
mensagem separada: ele é incorporado na mensagem matinal e referenciado nos
check-ins se relevante.

### Como o Lobby escolhe o foco do dia

Hierarquia de decisão:

1. Se há recomendação médica recente pendente (via Fireflies): foco é executar
   a recomendação ("conforme sua endócrino, foco hoje é caminhar 30 min após
   o jantar")
2. Se há sinal de baixa adesão recente: foco é só "treinar hoje, sem cobrança
   de performance"
3. Se está em dia de PR/teste: foco é o teste
4. Se Apple Health indica baixo NEAT: foco é movimento extra durante o dia
5. Se proteína está abaixo da meta semanalmente: foco é distribuição proteica
6. Default: foco técnico do treino do dia (ex: "descer no agachamento até
   quebrar paralelo")

### Exemplos de foco do dia

- "Hidratação alta. Mounjaro acelera desidratação, e hoje você tem treino. Mira
  3 litros."
- "Cinco mil passos antes do almoço. Sem treino formal, mas movimento conta."
- "Hoje é caprichar na execução, não na carga. Reduz peso em 20% se necessário
  pra técnica ficar perfeita."
- "Foco hoje é completar o plano. Sem improviso, sem extra. Só executar."
- "Hoje a meta única é dormir até 23h. Sono ruim tá afetando os PRs essa semana."

## Combinação com webhook de treino concluído

Quando o Hevy dispara webhook de sessão completada, o Lobby pode mandar um
debrief automático (separado dos cron jobs):

```
Sessão registrada! ✅

[Sumário: principais lifts com cargas e RPE médio]

[Uma observação específica: PR batido, melhora notada, ou ajuste sugerido pra
próxima]

Como você se sentiu durante? Algo doendo ou estranho?
```

Esse debrief é independente do horário do dia. Se o aluno treinou às 22h, o
debrief vai às 22h.

## Reset semanal

Domingo à noite (ou conforme preferência), Lobby pode mandar uma mensagem de
revisão semanal curta:

```
[nome], semana que passou:

✅ Sessões: [X/Y planejadas]
📊 PRs novos: [lista se houver, ou "manutenção" se não]
🚶 Média de passos: [X]
⚖️ Variação de peso: [X kg, dentro/fora da meta]

Como você se sente sobre essa semana? Algo pra ajustar na próxima?
```

Não obrigatório toda semana. Mande quando faz sentido (final de mesociclo, antes
de mudança de fase, ou quando o aluno quer revisar progresso).
