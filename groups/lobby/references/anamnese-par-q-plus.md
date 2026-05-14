# Anamnese e triagem pré-exercício

Protocolo de coleta de dados antes de qualquer prescrição. Baseado no PAR-Q+ (Physical
Activity Readiness Questionnaire), padrão internacional validado para triagem de
risco em exercício, adaptado para o contexto do Lobby (Telegram, antiobesidade,
usuários de GLP-1).

## Como conduzir

Não jogue todas as perguntas de uma vez. Faça uma por mensagem, no máximo duas
relacionadas. Espere a resposta antes de seguir. Se o aluno der resposta solta
fora da ordem, extraia o que conseguir e siga.

Tom: curioso, não inquisitivo. Você não está fazendo formulário burocrático, está
conhecendo a pessoa. Quando uma resposta abrir gancho relevante (ex: "tive uma
lesão de joelho ano passado"), aprofunde brevemente antes de seguir.

Duração realista: 10 a 15 minutos de conversa fluida.

## Sequência sugerida

### Bloco 1: Identificação básica

1. Confirmar nome, idade, sexo biológico
2. Altura
3. Peso atual (se souber, sem balança não tem problema, a gente mede depois)
4. Cidade onde mora

### Bloco 2: Histórico de movimento

5. Há quanto tempo está sem treinar regularmente?
6. Já treinou antes? Quando, por quanto tempo, com qual foco?
7. Tem alguma modalidade que gostou particularmente no passado?
8. Atualmente faz alguma atividade física (caminhada, esporte, dança, qualquer coisa)?

### Bloco 3: Saúde — bandeiras vermelhas (PAR-Q+ adaptado)

Estas perguntas vêm do PAR-Q+ e existem para identificar risco cardiovascular ou
condição que exige liberação médica antes de exercício. Faça com cuidado.

9. O médico já disse que você tem alguma condição do coração? Pressão alta?
10. Você sente dor no peito durante esforço físico ou em repouso?
11. Já desmaiou ou teve tontura forte nos últimos 12 meses?
12. Tem algum problema ósseo, articular, ou muscular que possa piorar com exercício?
13. Atualmente toma alguma medicação para pressão, coração, ou condição clínica?
14. Conhece alguma outra razão pela qual não deveria fazer atividade física?

Se qualquer uma das respostas 9 a 14 for sim com sintomas ativos ou descontrolados,
pause e pergunte detalhes. Se houver descontrole evidente (HAS não controlada,
dor torácica recente, síncope recente), redirecione para liberação médica antes
de prosseguir com qualquer prescrição.

### Bloco 4: Comorbidades específicas (foco obesidade)

15. Tem diabetes ou pré-diabetes? Em tratamento?
16. Colesterol ou triglicerídeos alterados?
17. Apneia do sono diagnosticada?
18. Problema de tireoide? Em tratamento?
19. Esteatose hepática (gordura no fígado)?
20. Já fez cirurgia bariátrica? Qual tipo, quando?

### Bloco 5: Medicação

21. Toma alguma medicação atualmente? Quais e para quê?

**Atenção especial para Mounjaro / GLP-1 / GIP**: se aluno menciona Mounjaro,
Ozempic, Wegovy, Saxenda, Zepbound, ou Trulicity, aprofunde:

22. Qual a dose atual?
23. Há quanto tempo está usando?
24. Está em escalonamento de dose ou estabilizado?
25. Tem sentido efeitos colaterais (náusea, fadiga, alteração intestinal)?
26. Qual médica acompanha esse tratamento?

Carregue `mounjaro-protocol.md` na sequência para aplicar protocolo específico.

### Bloco 6: Lesões e dores ativas

27. Tem alguma dor ou desconforto persistente atualmente? Onde?
28. Já teve lesão importante? Quando, qual região, fez fisioterapia, está liberado?
29. Cirurgias prévias (ortopédicas ou outras relevantes para exercício)?

Para cada item relatado, documente: região, tipo, status atual, e quais exercícios
ou movimentos foram interditados ou liberados pelo profissional que atendeu.

### Bloco 7: Disponibilidade e equipamento

30. Quantos dias por semana você consegue treinar de forma realista?
31. Quanto tempo por sessão você tem disponível?
32. Em que horário do dia funciona melhor?
33. Onde você treina ou pretende treinar (academia, casa, parque)?
34. Que equipamentos você tem hoje? (Pergunte especificamente sobre elástico
    extensor / tubing, pois é especialidade do Lobby)

### Bloco 8: Time de saúde

35. Quem te acompanha hoje no time de saúde? (Médica generalista, endócrino,
    cardiologista, nutricionista, fisioterapeuta?)
36. Com que frequência você consulta cada uma?
37. As consultas são gravadas no Fireflies?

Se sim para Fireflies, peça permissão explícita para acessar transcrições quando
relevante para prescrição.

### Bloco 9: Objetivo e motivação

38. Qual é seu objetivo principal (saúde, perda de peso, ganho de força, energia,
    estética, função)?
39. Por que esse objetivo importa agora?
40. Qual é o "porquê" mais profundo? (Cave aqui sem forçar. Pode ser filhos,
    saúde de longo prazo, autoestima, evento específico, recuperação pós-doença.
    Esse "porquê" vai te ajudar nos momentos de baixa adesão.)

### Bloco 10: Preferências e gatilhos

41. Tem algum exercício que você ama ou tem curiosidade de aprender?
42. Algum que você detesta ou tem trauma de tentar?
43. Como você prefere que eu te aborde quando estiver desmotivado: firme, gentil,
    ou só me dar espaço?

## Devolutiva pós-anamnese

Depois de completar, faça um resumo curto e estruturado do que você entendeu.
Confirme com o aluno. Exemplo de formato:

```
Beleza, então deixa eu te devolver o que entendi pra confirmar:

• Você é o [nome], [idade] anos, [altura], [peso] atual.
• Parado há [X], já treinou [contexto].
• Hoje toma [Mounjaro/outros] na dose [X], acompanhado por [Dra. nome].
• Tem [comorbidades], com [status].
• [Lesão/dor ativa se houver].
• Equipamento: [resumo].
• Pode treinar [X] dias na semana, [Y] minutos cada, geralmente [período].
• Seu objetivo: [resumo].
• O "porquê" que mais pesa: [resumo emocional].

Tá batendo com a realidade? Me corrige o que precisar.
```

Após confirmação, atualize `CLAUDE.md` com tudo coletado. Esse é o passo crucial:
sem `CLAUDE.md` atualizado, todas as próximas sessões começam do zero.

## Alinhamento de expectativa

Após CLAUDE.md preenchido, antes de prescrever a primeira semana, faça
alinhamento de expectativa realista. Para o perfil antiobesidade com Mounjaro:

- Perda de peso realista: 0.5% a 1% do peso por semana (acima disso vira perda
  muscular)
- Ganho de força mensurável: primeiras adaptações neurais em 2-4 semanas, hipertrofia
  visível em 8-12 semanas
- Aderência é mais importante que intensidade no início (consistência destrava
  resultado)
- Primeira fase é adaptação anatômica: aprender padrão motor, criar hábito, baixa
  carga. Não vai parecer "treino de verdade" pros padrões do imaginário popular.
  Isso é proposital e correto.

## Bandeiras vermelhas que adiam prescrição

Não prescreva (e direcione para liberação médica) se na anamnese aparecer:

- Dor torácica em esforço ou repouso nas últimas 4 semanas, sem investigação
- Síncope ou pré-síncope nas últimas 4 semanas, sem investigação
- HAS sem controle medicamentoso atual (pressão habitualmente > 160/100)
- Diabetes com glicemia instável (hipo ou hiperglicemias frequentes)
- Cirurgia bariátrica há menos de 3 meses sem liberação da equipe
- Lesão musculoesquelética aguda sem avaliação ortopédica
- Sinais de transtorno alimentar ativo (priorize encaminhamento para psiquiatra /
  psicólogo / nutricionista especializado em TCA)
