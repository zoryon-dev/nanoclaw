# ADAPTER — Função Reels ↔ ferramentas do Caio

Camada fina que liga o núcleo do pacote (em `modules/`, intocado) às ferramentas
reais do Caio. Três responsabilidades: **diagrama**, **voz de marca**,
**entregável**. O núcleo nunca muda; tudo que é específico do Caio mora aqui.

Caminhos no container: a skill está em `/app/skills/funcao-reels/`. Os IDs de
Notion/Drive vêm de `/workspace/agent/read-post-targets.json` (campos `reels_*`).

---

## 1. Diagrama — Napkin é SEMPRE a base (Magnific e HTML→PNG só se Napkin falhar)

**Napkin é o motor primário e padrão — sempre tente Napkin primeiro.** Os
fallbacks abaixo só entram se o Napkin sair com código ≠ 0.

O `modules/04-BIBLIOTECA-DIAGRAMAS.md` e `templates/brief-diagrama-napkin.md`
ajudam a **estruturar o `content`** — o tipo de diagrama (curva, comparação,
loop, funil…) o Napkin **auto-seleciona pela estrutura do texto**, então capriche
no texto cru (extremos/passos/relações claros). Não há parâmetro `visual_query`.

### Primário — Napkin (script)

```bash
python3 /app/skills/funcao-reels/scripts/napkin_generate.py \
  --content "<texto cru estruturado do brief>" \
  --format png --language pt-BR --color-mode dark --transparent \
  --out diagrama.png
# opcionais: --orientation vertical|horizontal · --style-id <id> · --number-of-visuals N · --format svg
```

Auth: nenhuma — o gateway injeta o token do Napkin (`api.napkin.ai`,
`Authorization: Bearer`). É assíncrono; o script cuida do POST + polling +
download e imprime o caminho salvo. Se sair **código ≠ 0** (token ausente / erro
/ geração falhou), ele imprime a instrução de fallback e **só então** você cai
para o Magnific (abaixo) e, se também falhar, para o HTML→PNG. Não invente o
arquivo.

### Multi-slide congruente — diagrama que evolui pelas etapas (opt-in)

Default: **1 diagrama** por reel. Mas quando o conceito **evolui ao longo dos
beats** (ex.: beat 3 monta o setup → beat 4 destaca o exemplo → beat 5 resolve),
gere um **set de slides congruentes** — o workflow Napkin de "gere o visual de
cada bloco" (módulo 04 / referências). Continua **um conceito por reel**; o que
muda é que o visual vira um storyboard mapeado às etapas, não uma imagem estática.

Quebre o conceito em N blocos (um por etapa) num JSON e rode:

```bash
# blocks.json: [{"content":"<texto cru do bloco>","label":"beat3-setup"}, ...]
python3 /app/skills/funcao-reels/scripts/napkin_slides.py \
  --blocks blocks.json --out-dir . --prefix diagrama \
  --format png --language pt-BR --color-mode dark --transparent
# salva diagrama-1-<label>.png … diagrama-N-<label>.png (na ordem dos beats)
```

Congruência é garantida pelo script: o **slide 1 define o `style_id`** do Napkin
e os **demais reusam o mesmo** → cara visual idêntica entre os slides. (Pra fixar
um estilo específico em todos, passe `--style-id <id>`.) No `roteiro-reel.md`,
marque em qual beat cada slide entra. Se algum slide falhar, o script diz qual e
você cai pro fallback (abaixo). Para 1 só diagrama, use `napkin_generate.py`.

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

### Fallback final — HTML→PNG (zero credencial, sempre disponível)

Se **ambos** (Napkin e Magnific) estiverem indisponíveis (sem credencial /
OAuth não autenticado), monte o diagrama em **HTML/CSS** seguindo a estrutura do
brief (o `templates/brief-diagrama-napkin.md` já prevê este fallback manual) e
renderize em PNG via Chromium (já no container). Regras:

- Use a paleta e a tipografia da **marca** (do brand-wiki): Zoryon → fundo
  `#141420`, accent `#837BF4`, sans (Sora/Inter); Faryon → fundo verde-escuro,
  accent dourado, serif no título. Fundo escuro sempre (combina com o canvas).
- Título = a tese do beat 3; layout = o tipo de diagrama do brief (duas
  entradas/saídas, comparação 2 colunas, curva em U, loop, etc.).
- Rótulos em **PT-BR**, 1 ideia visual, espaço pra anotação ao vivo.
- Salve `diagrama.html` + `diagrama.png` (≥1400px de largura) no folder do reel.
- Anote no entregável: **motor = fallback manual HTML→PNG**.

Este tier é determinístico e não depende de nenhuma API — é a garantia de que o
diagrama **sempre** sai. Napkin/Magnific são preferidos quando credenciados
(menos trabalho), mas o HTML→PNG nunca trava.

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

> `--objetivo` deve ser **um dos valores canônicos** (`salvar|enviar|comentar|
> seguir|clicar`) — o script normaliza. NÃO passe a frase inteira do CTA aí
> (ex. "Comenta DIAGNÓSTICO…"), senão o Notion cria uma opção de select nova e
> polui o campo. A frase do CTA vai no `--hook` ou no corpo; o `Objetivo` é a
> categoria.

---

## Resumo do fluxo

calibragem (+marca do wiki) → roteiro+hook (3 textos) → brief → diagrama
(Napkin/Magnific) → Drive → Notion → QA (`modules/07`). Otimize **retenção**,
um conceito por reel, sem prova inventada.
