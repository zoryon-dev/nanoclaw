# Função Reels — Índice Mestre

> Pacote modular, portável e skill-ready para produzir **reels educacionais** no formato **modelo mental visualizado (estilo Napkin) + talking head + legenda animada**. Cada reel é construído em torno de UM conceito autoral, com o objetivo de atrair **público qualificado** (retenção até o fim), não vaidade.
>
> Núcleo genérico — sem dependência de caminhos, MCPs ou diretores de nenhum sistema específico. Acoplável a qualquer pipeline.
>
> Versão 1.0 · Base: análise de 6 reels de referência + 3 playbooks de hooks (2025–2026) + frameworks Hormozi/Dunford.

---

## A tese (por que esse formato funciona)

O formato carro-chefe junta duas coisas que fazem alguém te levar a sério: **o rosto, que gera conexão**, e **o visual/diagrama, que prova domínio do assunto** — principalmente quando é um conceito próprio. O objetivo declarado não é view nem like: é **cliente qualificado**. Quem é só curioso vai embora; quem se identifica fica até o final.

Regra de ouro: **só funciona se o conceito for bom E o diagrama for bom.** Diagrama genérico cuspido por IA sem curadoria quebra o efeito. Por isso este pacote separa a engine de roteiro da engine de diagrama, e exige calibragem antes de escrever.

---

## O pipeline (conceito cru → reel pronto)

```
┌─────────────┐   ┌────────────┐   ┌──────────────┐   ┌─────────────────┐   ┌──────────────┐   ┌───────────┐
│ 1. CONCEITO │ → │ 2. CALIBRAR│ → │ 3. ROTEIRO   │ → │ 4. DIAGRAMA     │ → │ 5. COMPOSIÇÃO│ → │ 6. CTA+QA │
│   cru/ideia │   │ best-fit,  │   │ hook+espinha │   │ mapear conceito │   │ formato A/B/C│   │ métricas, │
│             │   │ objetivo,  │   │ +script de   │   │ → tipo de       │   │ legenda      │   │ checklist │
│             │   │ funil,pilar│   │ legenda      │   │ diagrama→Napkin │   │ animada      │   │ anti-slop │
└─────────────┘   └────────────┘   └──────────────┘   └─────────────────┘   └──────────────┘   └───────────┘
       │                 │                │                    │                    │                 │
   (você traz)      01-CALIBRAGEM   02-ROTEIRO-ENGINE   04-BIBLIOTECA       05-COMPOSICAO    06-CTA + 07-QA
                                    03-BANCO-DE-HOOKS    -DIAGRAMAS
```

Texto cru do conceito é a matéria-prima dos DOIS lados: vira roteiro falado (legenda) E vira o diagrama (joga o texto estruturado no Napkin). É o mesmo conceito em duas formas.

---

## Os módulos

| # | Arquivo | O que entrega | Quando abrir |
|---|---|---|---|
| 00 | `00-INDICE-MESTRE.md` | Este arquivo. Pipeline, glossário, como usar. | Sempre primeiro |
| 01 | `01-CALIBRAGEM.md` | As perguntas/inputs obrigatórios antes de escrever. Sem isso, vira slop. | Antes de qualquer reel |
| 02 | `02-ROTEIRO-ENGINE.md` | Espinha narrativa (6 beats), blueprint segundo-a-segundo, script de legenda palavra-a-palavra, frameworks Dunford/Hormozi. | Escrever o roteiro |
| 03 | `03-BANCO-DE-HOOKS.md` | Taxonomia de hooks, modelo de 4 camadas, triple-hook, 70+ fórmulas, erros que matam hook. | Escrever a abertura |
| 04 | `04-BIBLIOTECA-DIAGRAMAS.md` | 15 tipos de diagrama, mapa conceito→diagrama, receita de chamada Napkin (content/visual_query/style/pt-BR). | Gerar o visual |
| 05 | `05-COMPOSICAO.md` | Formatos de tela A/B/C, regras de legenda animada, anotação ao vivo, specs técnicas (9:16, capa, fontes, safe zones). | Montar/editar o vídeo |
| 06 | `06-CTA-E-METRICAS.md` | CTA por objetivo, métricas que importam, variáveis de A/B test, benchmarks de retenção. | Fechar + medir |
| 07 | `07-QA-CHECKLIST.md` | Checklist pré-publicação, scan anti-slop, voice, originalidade. | Antes de publicar |
| 08 | `08-FORMATOS-SO-GRAVACAO.md` | 3 formatos sem Napkin (R1 direto à câmera, R2 demonstração, R3 recorte de conversa) — só gravação. Mesma engine, sem diagrama. | Quando não houver diagrama |
| — | `templates/roteiro-reel.md` | Template preenchível do reel completo. | Produção |
| — | `templates/brief-diagrama-napkin.md` | Template do brief de diagrama Napkin. | Produção |

---

## Como usar (fluxo curto)

1. Traga o **conceito cru** (um parágrafo ou bullets do modelo mental que você quer ensinar).
2. Rode a **calibragem** (`01`) — best-fit, objetivo, estágio de funil, pilar. 3-5 respostas.
3. Escreva o **roteiro** (`02` + `03`): escolha o hook, monte a espinha de 6 beats, escreva o script de legenda.
4. Mapeie o conceito pro **diagrama certo** (`04`) e gere no Napkin com a receita de chamada.
5. **Componha** (`05`): escolha o formato A/B/C, aplique legenda animada + anotação ao vivo.
6. Feche com **CTA** alinhado ao objetivo e passe o **QA** (`06` + `07`) antes de publicar.

Para produção rápida, vá direto pros `templates/` — eles referenciam os módulos onde precisa decidir algo.

---

## Glossário

| Termo | Significado |
|---|---|
| **Conceito autoral** | Modelo mental próprio que o reel ensina (não dica genérica). É o que justifica o diagrama. |
| **Talking head** | Pessoa falando à câmera, em estúdio, com mic. Carrega a conexão/autoridade. |
| **Diagrama Napkin** | Visual gerado a partir do texto cru do conceito (curva, haltere, funil, loop, etc). Carrega o domínio. |
| **Legenda animada** | Texto palavra-a-palavra na "costura" da tela, com a palavra-chave destacada (ex: amarelo). |
| **Anotação ao vivo** | Rabisco/seta sobre o diagrama (geralmente vermelho) — reforça "o raciocínio acontecendo". |
| **Espinha (spine)** | A sequência de 6 beats do roteiro: hook → erro comum → modelo → exemplo → virada → CTA. |
| **Best-Fit Customer** | (Dunford) O cliente exato que tem que ler e dizer "é pra mim". Não é o TAM. |
| **Insight** | (Dunford) A tese de mercado que reframe como o cliente lê o próprio problema. Mora no hook. |
| **Triple-hook** | Texto + visual + fala alinhados dizendo a mesma coisa nos primeiros segundos. |
| **Skip rate** | % que sai nos 3 primeiros segundos. Mede a força do hook. Quanto menor, melhor. |
| **Sends per reach** | Envios em DM por alcance. Melhor preditor de alcance entre não-seguidores. |

---

## Princípios não-negociáveis

1. **Um conceito por reel.** Se tem dois modelos mentais, são dois reels.
2. **Calibra antes de escrever.** Sem best-fit + objetivo + alternativas, a copy é ruído.
3. **Específico vence genérico.** "2 mil pra quem ganha 5 mil é metade da renda" vence "preço importa".
4. **Diagrama serve ao argumento, não enfeita.** Se o diagrama não sustenta a tese, troca o diagrama.
5. **Não inventa prova.** Sem número/case real → placeholder, nunca valor fabricado.
6. **Cumpre a promessa do hook.** Sem clickbait. O payoff entrega o que o hook prometeu.
7. **Otimiza retenção, não duração.** Um reel de 20s com 80% de retenção bate um de 60s com 30%.
8. **Originalidade real.** Reinterpretar, contextualizar, prova própria, voz própria — nunca repost sem transformação.
