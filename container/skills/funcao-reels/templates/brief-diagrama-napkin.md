# Template — Brief de Diagrama Napkin

> Preencha e use como input pra geração via skill `napkin-visuals` (MCP `napkin_generate` ou script). Pré-requisito: `NAPKIN_API_TOKEN` no ambiente. Ver 04-BIBLIOTECA-DIAGRAMAS.

---

## Conceito

- **Tese que o diagrama precisa provar (beat 3):** [a afirmação central, 1 frase]
- **Estrutura do argumento:** [ranking / dois extremos / composição % / estágios / trade-off / loop causal / fases no tempo / ...]
- **Tipo de diagrama escolhido (#):** [ex: #2 curva em U] — ver mapa conceito→diagrama no módulo 04

---

## Conteúdo pro Napkin (texto cru estruturado)

> Curto e estruturado. Não jogue documento inteiro. Liste extremos / passos / nós / relações.

```
[ex:
Eixo X: cobrar caro (menor volume) ↔ cobrar barato (maior volume)
Eixo Y: resultado
Meio = "pântano": inferno operacional, margens insuficientes
Extremos = bons]
```

---

## Parâmetros de geração

| Parâmetro | Valor |
|---|---|
| `content` | (o texto cru acima, distilado) |
| `visual_query` | [flowchart / comparison / cycle / pyramid / timeline / chart / mindmap] |
| `style` | [ex: "Monochrome Pro" / "Elegant Outline" — combinar com fundo escuro] |
| `language` | `pt-BR` |
| `format` | `png` (compor no vídeo) ou `svg` (editar) |
| `color_mode` | `dark` |
| `transparent_background` | `true` |
| `width` (se png) | [ex: 1400] |
| `number_of_visuals` | 1 (só peça variações se for escolher) |

---

## Pós-geração

- [ ] Rótulos claros e em PT-BR
- [ ] 1 ideia visual (não poluído)
- [ ] Fundo escuro/transparente combina com o canvas
- [ ] Estilo consistente com a série
- [ ] Espaço pra anotação ao vivo (seta/círculo vermelho no ponto-chave)
- [ ] Exportado em resolução que aguenta o crop 9:16

**Anotação ao vivo planejada:** [o que marcar em vermelho — ex: circular o "pântano" no meio da curva]

---

## Fallback (sem token / sem Napkin)

Se não houver `NAPKIN_API_TOKEN`, gere o brief visual textual acima e produza o diagrama manualmente (Figma/Canva/whiteboard) seguindo a mesma estrutura. O importante é a estrutura do argumento, não a ferramenta.
