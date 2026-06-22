# ADAPTER — Função Reels ↔ ferramentas do Caio

Camada fina que liga o núcleo do pacote (em `modules/`, intocado) às ferramentas
reais do Caio. Três responsabilidades: **diagrama**, **voz de marca**,
**entregável**. O núcleo nunca muda; tudo que é específico do Caio mora aqui.

Caminhos no container: a skill está em `/app/skills/funcao-reels/`. Os IDs de
Notion/Drive vêm de `/workspace/agent/read-post-targets.json` (campos `reels_*`).

---

## 1. Diagrama — Napkin primário, Magnific fallback

O `modules/04-BIBLIOTECA-DIAGRAMAS.md` e `templates/brief-diagrama-napkin.md`
definem a receita genérica (`content`, `visual_query`, `style`, `language`,
`format`, `color_mode`, `transparent_background`). Preencha o brief primeiro;
depois gere assim:

### Primário — Napkin (script)

```bash
python3 /app/skills/funcao-reels/scripts/napkin_generate.py \
  --content "<texto cru estruturado do brief>" \
  --visual-query <flowchart|comparison|cycle|pyramid|timeline|chart|mindmap> \
  --style "Monochrome Pro" \
  --language pt-BR --format png --color-mode dark --transparent \
  --width 1400 --out diagrama.png
```

Auth: nenhuma — o gateway injeta o token do Napkin. Se sair **código ≠ 0**
(sem token / API beta indisponível / erro), o script imprime a instrução de
fallback e **você cai para o Magnific** (abaixo). Não invente o arquivo.

### Fallback — Magnific (MCP, já no Caio)

Use a tool MCP `images_generate_svg` (texto → SVG) com o **mesmo texto cru** do
brief, traduzido para um prompt de diagrama. Sempre: rótulos em **PT-BR**, fundo
**escuro/transparente**, 1 ideia visual, espaço pra anotação ao vivo. Mapa
`visual_query` (do módulo 04) → prompt Magnific:

| # | Diagrama (módulo 04) | `visual_query` | Prompt Magnific (esqueleto) |
|---|---|---|---|
| 1 | Tier list S/A/B/C/D/E | comparison/list | "tier list vertical S→E, rótulos PT-BR, fundo escuro" |
| 2 | Curva em U / pântano | chart/comparison | "U-shaped curve, extremos altos, vale no meio rotulado 'pântano', dark" |
| 3 | Haltere (dumbbell) | comparison | "dumbbell: dois pesos nas pontas, barra fina no meio, dark" |
| 4 | Barras empilhadas | chart | "stacked bar chart comparando 2–3 cenários, % visíveis, dark" |
| 5 | Funil de consciência | pyramid/funnel | "funil de estágios do lead, topo→fundo rotulado, dark" |
| 6 | Preço × Demanda + ponto | chart | "duas retas cruzando, ponto ótimo marcado, eixos rotulados, dark" |
| 7 | Loop causal / sistema | cycle/flowchart | "loop circular causa→efeito com setas (+/−), dark" |
| 8 | Pros vs Cons (VS) | comparison | "duas colunas VS, prós à esquerda, contras à direita, dark" |
| 9 | Curvas de ciclo no tempo | timeline/chart | "curva de fases ao longo do tempo, fases rotuladas, dark" |
| 10 | Duas retas espelhadas | comparison/chart | "duas retas espelhadas (regimes opostos), dark" |
| 11 | Fractal (Sierpinski) | mindmap | "padrão fractal que se repete em escala, dark" |
| 12 | Caos → Ordem | flowchart | "lado esquerdo caótico → seta → lado direito limpo/ordenado, dark" |
| 13 | Sandbox vs Produção | flowchart/comparison | "dois ambientes com fluxo entre eles (20/80), dark" |
| 14 | Círculos aninhados | mindmap/cycle | "círculos concêntricos (camadas de um sistema), rotulados, dark" |
| 15 | Doc de texto / nota | (texto) | renderize como nota/doc — pode ser HTML→imagem, sem IA |

Depois do Magnific: `creations_wait` → baixe o SVG/PNG para o arquivo de saída.
Anote no entregável que o diagrama saiu do **fallback Magnific** (não Napkin).

---

## 2. Voz de marca — Zoryon / Faryon (do brand-wiki)

Núcleo único, voz puxada em runtime. **Antes de escrever o roteiro:**

1. Na calibragem (`modules/01`), fixe a **Marca** (Zoryon ou Faryon).
2. Leia as páginas relevantes do brand-wiki montado em `/workspace/agent/brand-wiki/`
   (ou `brand-wiki/` conforme o mount) para a marca escolhida: voz, best-fit,
   posicionamento, exemplos, cor de acento.
3. Deixe a voz/best-fit/exemplo do hook e dos beats refletirem essa marca. O
   núcleo (estrutura de 6 beats, hooks, diagramas) é o mesmo; o que muda é a voz.
4. **Tague a Marca em todo entregável** (arquivo, Drive, Notion) — casa com a
   coluna `Marca` das DBs de conteúdo.

Sem presets fixos: a fonte da verdade é o wiki.

---

## 3. Entregável (contrato — sempre os 3 textos + diagrama + Drive + Notion)

Trabalhe numa pasta por reel, ex: `/workspace/reels/<YYYY-MM-DD>-<marca>-<slug>/`.

**(1) Roteiro** — preencha `templates/roteiro-reel.md` e salve como
`roteiro-reel.md`. Inclui obrigatoriamente a **narração** (prosa dos 6 beats) e
o **script de legenda** palavra-a-palavra (`modules/02`).

**(2) Brief do diagrama** — preencha `templates/brief-diagrama-napkin.md` e salve
como `brief-diagrama.md`. Inclui o **texto cru estruturado** que alimenta o
gerador (`modules/04`). (Para R1/R2/R3 sem diagrama, anote "sem diagrama —
formato de gravação" e descreva a alavanca de autoridade.)

**(3) Diagrama** — gere conforme a seção 1 (Napkin → Magnific). Salve no folder.

**(4) Drive** — espelhe a pasta inteira (diagrama + os 2 .md):

```bash
python3 /app/skills/google-native/scripts/drive_upload.py \
  --parent-name "Reels — Entregas" \
  --subfolder "<YYYY-MM-DD> — <Marca> — <slug>" \
  roteiro-reel.md brief-diagrama.md diagrama.png
# imprime o link da subpasta → guarde para o Notion
```

**(5) Notion** — registre na DB "Reels — Entregas":

```bash
python3 /app/skills/funcao-reels/scripts/notion_reel.py \
  --titulo "<headline/conceito do reel>" \
  --marca <Zoryon|Faryon> \
  --data <YYYY-MM-DD> \
  --formato <Napkin|R1|R2|R3> \
  --duracao "<ex: 15–30s>" \
  --objetivo "<salvar|enviar|comentar|seguir|clicar>" \
  --drive "<link Drive da etapa 4>" \
  --hook "<o hook escolhido>" \
  --legenda-file roteiro-reel.md
# imprime a URL da página criada
```

Auth: nenhuma — o gateway injeta o bearer do Notion. IDs vêm baked no script +
em `read-post-targets.json`. Nunca escreva o token Notion à mão.

---

## Resumo do fluxo

calibragem (+marca do wiki) → roteiro+hook (3 textos) → brief → diagrama
(Napkin/Magnific) → Drive → Notion → QA (`modules/07`). Otimize **retenção**,
um conceito por reel, sem prova inventada.
