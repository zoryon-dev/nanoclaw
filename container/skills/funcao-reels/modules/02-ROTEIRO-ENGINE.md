# 02 — Roteiro Engine

> Transforma o conceito calibrado em roteiro falado + script de legenda. A estrutura é a mesma observada nos reels de referência e validada pelos playbooks de retenção: abre cedo, prova cedo, explica curto, fecha em loop.

---

## A espinha de 6 beats

Todo reel educacional deste formato roda sobre estes 6 beats. Eles mapeiam direto pro blueprint segundo-a-segundo abaixo.

| # | Beat | Função | Exemplo (reel de referência) |
|---|---|---|---|
| 1 | **Hook contraintuitivo** | Parar o scroll com afirmação que contraria o senso comum. | "Concorrência é algo bom." / "Tem 2 caminhos que funcionam — e o meio é armadilha." |
| 2 | **Erro comum / tensão** | Nomear o que a maioria faz errado. Cria autorrelevância e o problema. | "A maioria está exatamente no meio." / "Quem apela precisa de volume." |
| 3 | **Modelo mental (diagrama entra)** | O conceito autoral visualizado. O diagrama sustenta a tese aqui. | Curva em U / haltere / loop causal aparece na tela. |
| 4 | **Exemplo numérico / prova** | Aterrar o abstrato com um número concreto. | "2 mil pra quem ganha 5 mil é metade da renda dela." |
| 5 | **Virada / conselho acionável** | O payoff: o que fazer com isso. Cumpre a promessa do hook. | "Automatize a entrega e priorize uma das pontas." |
| 6 | **CTA + loop** | Pedido único de ação + final que conecta ao início (favorece replay). | "Salva isso." / fecha repetindo a tese de abertura. |

**Regra:** o beat 3 (modelo) e o beat 4 (exemplo) são o coração. Se o reel tem hook forte mas o modelo não aparece visualmente ou o exemplo é vago, a retenção cai no meio.

---

## Blueprint segundo-a-segundo (referência 30–45s)

Ajuste a escala pela duração-alvo (ver `05`). As faixas são proporcionais.

| Faixa | Beat | O que precisa acontecer |
|---|---|---|
| 0.0–0.8s | Interrupção | Movimento/rosto/contraste + 1ª palavra do hook em tela. Nada de intro/logo. |
| 0.8–3.0s | Hook (beat 1) | Triple-hook: texto na tela (3–7 palavras) + fala direta + visual. A afirmação contraintuitiva inteira. |
| 3–8s | Erro comum (beat 2) | "A maioria faz X / acha Y" — nomear o erro, criar tensão. |
| 8–18s | Modelo (beat 3) | Diagrama entra na tela. Explicar o conceito apoiado no visual. Anotação ao vivo aqui. |
| 18–26s | Exemplo (beat 4) | Número concreto / mini-case. Aterrar. |
| 26–35s | Virada (beat 5) | O conselho acionável. Cumprir a promessa do hook. |
| 35–fim | CTA + loop (beat 6) | CTA único + frase final que ecoa a abertura. |

> Os 3 primeiros segundos decidem o destino do reel. Até ~50% sai antes do segundo 3. Toda a engenharia de hook (módulo `03`) existe para vencer essa janela.

---

## Frameworks de copy: quando usar cada um

Este formato é educacional/topo-de-funil por natureza, então **Dunford domina**. Hormozi entra só quando o reel puxa pra oferta (fundo de funil).

| Estágio de funil | Dunford (Insight/positioning) | Hormozi (oferta/valor) |
|---|---|---|
| **Topo** (descoberta, autoridade) | 100% — o reel inteiro é um Insight visualizado | 0% — não force venda onde a peça é pra educar |
| **Meio** (consideração) | 80% — Insight + Alternatives + Perfect World | 20% — pode insinuar o Dream Outcome no beat 5 |
| **Fundo** (decisão, reel de oferta) | 50% — Insight ainda abre | 50% — Value Equation + redução de risco no beat 5/6 |

### Dunford no roteiro

- **Insight** (beat 1): a tese de mercado que reframe como o cliente lê o próprio problema. É o hook. Ex: "o mercado mudou de ganância pra medo — a equação de venda virou."
- **Alternatives** (beat 2): o que ele faz hoje (o erro comum) — contrastado.
- **Perfect World** (beat 5): a forma certa, implícita no conselho acionável.

### Hormozi no roteiro (só fundo de funil)

- **Dream Outcome** específico + **redução de esforço/tempo** no beat 5.
- **Value Equation** mentalmente: (resultado × probabilidade) ÷ (tempo × esforço). O conselho deve aumentar resultado/probabilidade e baixar tempo/esforço.
- **Redução de risco / garantia** se houver CTA de oferta.

---

## Script de legenda (palavra-a-palavra)

A legenda animada não é transcrição passiva — é parte do hook e da retenção. Boa parte da audiência assiste no mudo no autoplay inicial.

Regras:

- **Texto na 1ª tela: 3–7 palavras**, legível num olhar, alto contraste.
- **Palavra-chave destacada** (cor de acento, ex: amarelo) — uma por frase, a que carrega o sentido. Ex: "funcionam muito **bem**", "e ganhar **mais**".
- **1–2 frases por bloco de tela**, sincronizadas com a fala (1–2s cada).
- **Fora dos 14% inferiores** da tela (zona de UI). Centralizada na "costura" se o layout for split (ver `05`).
- **Headline fixa** opcional no topo durante todo o reel (ex: "se você vende nessa faixa, cuidado com isso:") — funciona como promessa persistente.

### Como gerar o script

1. Escreva a fala dos 6 beats em prosa corrida (o que a pessoa vai narrar).
2. Quebre em blocos de 3–7 palavras na ordem da fala.
3. Marque a palavra-chave de cada bloco com `**`.
4. Anote onde a headline fixa aparece e onde o diagrama entra.

Exemplo de saída (trecho):
```
[headline fixa: "se você vende nessa faixa, cuidado:"]
... | tem dois caminhos | que **funcionam** | ou vende **caro** pra poucos | ou **barato** pra muitos |
[DIAGRAMA entra: curva em U] | qualquer coisa | no **meio** | é armadilha | ...
```

---

## Erros de roteiro que matam o reel

- **Preâmbulo** ("oi gente, hoje eu quero falar sobre…"). Sentença de morte. Comece pela tese.
- **Modelo sem visual.** Se o beat 3 é só fala, perde o diferencial do formato. O diagrama tem que entrar.
- **Exemplo vago.** "Faz muita diferença" não prova nada. Número concreto ou case.
- **Promessa não cumprida.** Hook promete X, payoff entrega Y → o algoritmo detecta pela queda de saves/sends.
- **Dois conceitos no mesmo reel.** Confunde. Vira dois reels.
- **CTA empilhado.** "Salva, comenta, compartilha e segue" → escolhe um (ver `06`).

---

## Saída deste módulo

Ao final você tem: os 6 beats escritos + o script de legenda palavra-a-palavra + a marcação de onde o diagrama entra. Leve o conceito estruturado pro módulo `04` (diagrama) e a marcação de hook pro `03` se ainda não fechou a abertura. Use `templates/roteiro-reel.md` pra montar tudo.
