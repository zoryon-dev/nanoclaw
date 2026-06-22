# 04 — Biblioteca de Diagramas

> O diferencial deste formato. Cada reel tem UM diagrama que carrega o domínio do assunto e sustenta a tese. Este módulo dá a biblioteca de tipos, o mapa conceito→diagrama, e a receita de geração via Napkin.
>
> Regra de ouro: **o diagrama serve ao argumento, não enfeita.** Se o visual não sustenta a tese do beat 3, é o diagrama errado.

---

## Como o diagrama é gerado (workflow Napkin)

O método observado nos reels de referência:

1. Pegue o **texto cru do conceito** (estruturado: passos, extremos, relações).
2. Jogue no **Napkin** (gera o visual a partir do texto).
3. Selecione o bloco → gere o visual daquele trecho.
4. **Edite o layout** até o formato padrão da sua série.
5. Aplique **efeito/estilo** próprio pra dar cara de marca.
6. **Exporte** (SVG pra editar, PNG pra compor no reel).
7. Adicione **anotação ao vivo** (rabisco/seta vermelha) na edição do vídeo — ver `05`.

### Receita de chamada (skill `napkin-visuals` / API Napkin)

Via MCP (`napkin_generate`) ou script:
```
content        = texto cru e estruturado do conceito (curto: passos/extremos/relações)
visual_query   = tipo de layout desejado (flowchart, comparison, cycle, pyramid, timeline…)
style          = look da série (ex: "Monochrome Pro", "Elegant Outline" pra fundo escuro)
language       = "pt-BR"   (sempre — melhora muito o resultado)
format         = "svg" (editar) ou "png" (compor no vídeo; setar width OU height)
color_mode     = "dark"   (combina com o fundo preto do formato)
transparent_background = true  (pra sobrepor no canvas preto)
```

Dicas:
- **Distile o conteúdo.** Texto curto e estruturado gera diagrama melhor. Não jogue documento inteiro.
- `visual_query` é dica, não garantia — se o conteúdo não casa com a forma, o Napkin escolhe outra.
- Gere 1 por vez; só peça variações (2–4) quando realmente quiser escolher (gasta créditos).
- Pré-requisito: `NAPKIN_API_TOKEN` no ambiente. Sem token, a skill para e pede.

---

## A biblioteca (15 tipos)

Cada tipo é um molde de modelo mental. A coluna "Napkin visual_query" sugere o layout a pedir.

| # | Diagrama | Comunica | Quando usar | Napkin `visual_query` |
|---|---|---|---|---|
| 1 | **Tier list (S/A/B/C/D/E)** | Ranking opinativo | Hook forte; "meu ranking de [X]" | comparison / list |
| 2 | **Curva em U / "pântano"** | Dois extremos bons, meio ruim | Trade-off com vale no meio (caro vs barato) | chart / comparison |
| 3 | **Haltere (dumbbell)** | Foco nas extremidades, evitar centro | "estratégia haltere", LT vs HT | comparison |
| 4 | **Barras empilhadas** | Composição % entre cenários | ICP low/mid/high, conversão vs volume | chart / comparison |
| 5 | **Funil de consciência** | Estágios do lead | Problema não reconhecido → pronto pra comprar | pyramid / funnel |
| 6 | **Reta Preço × Demanda + ponto ideal** | Trade-off com sweet spot | Achar o ponto de conversão | chart |
| 7 | **Loop causal / sistema** | Causa-efeito circular | Criação de demanda ↔ diferenciação; (+)/(−) | cycle / flowchart |
| 8 | **Pros vs Cons (VS)** | Comparação direta | "X de conteúdo": prós vs contras | comparison |
| 9 | **Curvas de ciclo no tempo** | Fases de um fenômeno | "Ciclos do digital": fascínio→ganância→medo | timeline / chart |
| 10 | **Duas retas espelhadas** | Dois regimes opostos | Mercado por ganância vs por medo | comparison / chart |
| 11 | **Fractal (Sierpinski)** | Escala / repetição | "milhão de pessoas", composição que se repete | mindmap |
| 12 | **Caos → Ordem** | Transformação de estado | Rabisco → seta limpa; antes/depois conceitual | flowchart |
| 13 | **Sandbox vs Produção (20/80)** | Dois ambientes + fluxo | Importar/exportar, teste vs real | flowchart / comparison |
| 14 | **Círculos aninhados (system thinking)** | Camadas de um sistema | Análise vs dinâmica; o todo e as partes | mindmap / cycle |
| 15 | **Doc de texto / nota** | Ensaio/argumento escrito | "X para views vs sistema de receita" | (sem query; texto) |

---

## Mapa conceito → diagrama

Use a forma lógica do conceito pra escolher o diagrama. Pergunta-chave: **qual é a estrutura do argumento?**

| Se o conceito é… | Use diagrama… | # |
|---|---|---|
| Um ranking / ordem de preferência | Tier list | 1 |
| "Os extremos funcionam, o meio é cilada" | Curva em U / Haltere | 2, 3 |
| Comparar 2–3 cenários por composição | Barras empilhadas | 4 |
| Estágios que o cliente atravessa | Funil de consciência | 5 |
| Um trade-off com ponto ótimo | Preço × Demanda | 6 |
| Causa e efeito que se retroalimentam | Loop causal | 7 |
| "X é bom/ruim por estas razões" | Pros vs Cons | 8 |
| Como algo evolui em fases no tempo | Curvas de ciclo | 9 |
| Dois regimes/mercados opostos | Duas retas espelhadas | 10 |
| Algo que se repete em escala | Fractal | 11 |
| Transformação de bagunça pra clareza | Caos → Ordem | 12 |
| Dois ambientes com fluxo entre eles | Sandbox vs Produção | 13 |
| Um sistema com camadas | Círculos aninhados | 14 |
| Argumento longo, texto é o ponto | Doc / nota | 15 |

Se nenhum encaixa: o conceito provavelmente é **dois conceitos** (separe em dois reels) ou ainda não está estruturado o suficiente (volte à calibragem).

---

## Checklist do diagrama

- [ ] O diagrama representa a **tese do beat 3**, não um detalhe lateral.
- [ ] Tem **rótulos claros** nos eixos/extremos/nós (o espectador entende em 2s).
- [ ] **1 ideia visual** — não um diagrama poluído com 5 conceitos.
- [ ] **Fundo escuro / transparente** pra casar com o canvas preto do formato.
- [ ] Estilo **consistente com a série** (mesma paleta, mesma fonte de rótulo).
- [ ] Cabe espaço pra **anotação ao vivo** (uma seta/círculo vermelho destacando o ponto-chave).
- [ ] Exportado em resolução que aguenta o crop 9:16 sem borrar os rótulos.

---

## Anti-slop do diagrama

O que quebra o efeito (o próprio criador de referência alerta): diagrama genérico gerado sem curadoria. Evite:

- Diagrama que **não bate com a fala** (o visual diz uma coisa, a narração outra).
- Rótulos **vagos ou em inglês** quando o público é PT-BR.
- **Excesso de elementos** — se precisa explicar o diagrama por 10s, simplifique.
- Layout **padrão demais** (cara de template) — aplique o efeito/estilo da marca.
- Diagrama **decorativo** que não muda o entendimento — se removê-lo não muda nada, está errado.
