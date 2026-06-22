# Função Reels — Pacote Completo

> Sistema modular, portável e skill-ready para produzir **reels educacionais de alta retenção** que atraem público **qualificado** (não vaidade). Cobre desde a captura de um conceito cru até o reel pronto para publicar — com dois grandes caminhos de formato: **visual (Napkin + talking head)** e **só-gravação (sem diagrama)**.
>
> **Versão:** 1.1 · **Idioma:** PT-BR · **Dependências externas:** nenhuma obrigatória (Napkin é opcional, só para os formatos visuais).
>
> **Base de construção:** análise frame a frame de 6 reels de referência + 3 playbooks de hooks/estruturas (2025–2026) + frameworks de copy Hormozi ($100M Offers/Leads) e Dunford (Obviously Awesome / Sales Pitch).

---

## 1. A tese (por que esse sistema existe)

O formato carro-chefe junta duas coisas que fazem alguém te levar a sério:

- **O rosto** — gera conexão.
- **A prova visível** (diagrama, demonstração ou enquadramento de conversa) — mostra que você domina o assunto.

O objetivo declarado **não é view nem like**: é **cliente qualificado**. Quem é só curioso vai embora nos primeiros segundos; quem se identifica fica até o fim. Por isso o sistema otimiza **retenção**, não alcance bruto.

Regra de ouro do formato: **só funciona se o conceito for bom E a prova for boa.** Diagrama genérico, B-roll de banco ou fala vaga quebram o efeito. É por isso que o sistema separa a *engine de roteiro* da *alavanca de autoridade* e exige **calibragem antes de escrever**.

---

## 2. Estrutura da pasta

```
funcao-reels/
├── README.md                    ← você está aqui (visão completa)
├── 00-INDICE-MESTRE.md          → pipeline, glossário, princípios
│
├── 01-CALIBRAGEM.md             → inputs obrigatórios antes de escrever
├── 02-ROTEIRO-ENGINE.md         → espinha de 6 beats, blueprint segundo-a-segundo, script de legenda, Dunford/Hormozi
├── 03-BANCO-DE-HOOKS.md         → taxonomia, 4 camadas, triple-hook, 70+ fórmulas, erros que matam hook
├── 04-BIBLIOTECA-DIAGRAMAS.md   → 15 tipos de diagrama, mapa conceito→diagrama, receita Napkin
├── 05-COMPOSICAO.md             → layouts de tela A/B/C, legenda animada, anotação ao vivo, specs técnicas
├── 06-CTA-E-METRICAS.md         → CTA por objetivo, métricas, A/B test, benchmarks
├── 07-QA-CHECKLIST.md           → checklist pré-publicação, anti-slop, voz, originalidade
├── 08-FORMATOS-SO-GRAVACAO.md   → 3 formatos sem Napkin (R1, R2, R3) — só gravação
│
├── templates/
│   ├── roteiro-reel.md          → template preenchível do reel completo
│   └── brief-diagrama-napkin.md → template do brief de diagrama
│
└── referencias/                 → material-fonte (não é instrução; é a pesquisa que originou o sistema)
    ├── analise-reels-referencia.md          → análise dos 6 reels que originaram o formato
    ├── playbook-hooks-01-gpt-deep.md        → playbook de hooks (relatório aprofundado)
    ├── playbook-hooks-02-estudo-instagram-2026.md → estudo de hooks/formatos 2026
    └── playbook-hooks-03-compass-playbook.md → playbook-referência PT-BR (hooks + estruturas + métricas)
```

**Como ler:** os arquivos **00–08** são o sistema operacional (instruções). A pasta **referencias/** é o material de pesquisa que embasou tudo — consulte quando quiser a fonte por trás de uma decisão, mas não precisa lê-la para produzir.

---

## 3. O pipeline (conceito cru → reel pronto)

```
┌───────────┐  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐  ┌──────────────┐  ┌───────────┐
│ 1.CONCEITO│→ │ 2.CALIBRAR │→ │ 3.ROTEIRO    │→ │ 4.PROVA            │→ │ 5.COMPOSIÇÃO │→ │ 6.CTA+QA  │
│  cru/ideia│  │ best-fit,  │  │ hook+espinha │  │ Napkin (diagrama)  │  │ layout/      │  │ métricas, │
│           │  │ objetivo,  │  │ +script de   │  │   OU               │  │ legenda      │  │ checklist │
│           │  │ funil,pilar│  │ legenda      │  │ gravação(R1/R2/R3) │  │ animada      │  │ anti-slop │
└───────────┘  └────────────┘  └──────────────┘  └────────────────────┘  └──────────────┘  └───────────┘
                  (módulo 01)   (módulos 02+03)   (módulo 04 OU 08)        (módulo 05)      (06 + 07)
```

O texto cru do conceito alimenta os **dois lados**: vira roteiro falado (legenda) **e** vira a prova (diagrama Napkin, ou roteiro de demonstração/recorte). É o mesmo conceito em duas formas.

A bifurcação está no **passo 4 (prova / alavanca de autoridade)**:
- **Caminho visual** → módulo `04` (diagrama Napkin) + layout do `05`.
- **Caminho só-gravação** → módulo `08` (R1/R2/R3), sem diagrama.

Todo o resto da engine (calibragem, hook, espinha, CTA, métricas, QA) é **compartilhado** pelos dois caminhos.

---

## 4. Os formatos de reel

Há dois eixos independentes: **a alavanca de autoridade** (como você prova domínio) e **o layout de tela** (como você arruma a tela). Não confunda.

### 4.1 Por alavanca de autoridade

| Caminho | Formato | Prova de domínio | Módulo | Melhor para |
|---|---|---|---|---|
| Visual | **Napkin** | Diagrama do conceito | `04` | Modelos mentais, trade-offs, sistemas — conceito que precisa ser *visto* |
| Gravação | **R1 — Direto à câmera** | Especificidade verbal + convicção | `08` | Hot take, insight afiado, reel rápido |
| Gravação | **R2 — Demonstração** | Mostrar fazendo (tela/objeto/processo) | `08` | "Como eu faço", tutorial, prova de resultado real |
| Gravação | **R3 — Recorte de conversa** | Credibilidade conversacional | `08` | Opinião, posicionamento, reaproveitar live/podcast |

### 4.2 Por layout de tela (módulo `05`)

| Layout | Arranjo | Usado em |
|---|---|---|
| **A** | Talking head em cima / diagrama embaixo | Napkin (o mais comum) |
| **B** | Board/doc Napkin em cima / talking head embaixo | Napkin "bastidor/meta" |
| **C** | Talking head em card + B-roll cinematográfico | Napkin com metáfora, ou base do R2/R3 |

Os formatos de gravação R1/R2/R3 normalmente usam tela cheia (rosto) com a legenda animada na zona segura; R2 alterna rosto ↔ B-roll; R3 costuma ter headline fixa no topo.

---

## 5. Guia de uso (passo a passo)

1. **Traga o conceito cru.** Um parágrafo ou bullets do modelo mental que você quer ensinar. Se não há um conceito nomeável, pare — ainda não há reel, há dica solta.
2. **Calibre** (`01-CALIBRAGEM.md`). Responda os 5 inputs: conceito, best-fit, objetivo único, estágio de funil, alternativas reais. A calibragem já *deriva* metade das decisões seguintes.
3. **Escolha o caminho de prova:**
   - Conceito abstrato que precisa ser visto → **Napkin** (`04`).
   - Tem algo pra mostrar acontecendo → **R2 demonstração** (`08`).
   - Insight afiado e rápido → **R1 direto à câmera** (`08`).
   - Tem live/podcast pra recortar → **R3 recorte** (`08`).
4. **Escreva o roteiro** (`02` + `03`): escolha o hook (3 variações → a mais específica), monte a espinha de 6 beats, escreva o script de legenda palavra-a-palavra.
5. **Produza a prova:** gere o diagrama Napkin (`04` + `templates/brief-diagrama-napkin.md`) **ou** grave seguindo o formato do `08`.
6. **Componha** (`05`): layout, legenda animada com palavra-chave destacada, anotação ao vivo (se houver diagrama), specs técnicas, duração-alvo.
7. **Feche e meça** (`06`): CTA único alinhado ao objetivo + defina a métrica primária.
8. **Passe o QA** (`07`) antes de publicar. Itens bloqueantes não negociam.

**Atalho de produção:** vá direto a `templates/roteiro-reel.md` — ele referencia o módulo onde decidir cada coisa.

---

## 6. Os módulos em detalhe

### 00 — Índice Mestre
Pipeline, glossário e os 8 princípios não-negociáveis. Ponto de entrada conceitual.

### 01 — Calibragem
Os 5 inputs obrigatórios (conceito, best-fit, objetivo, funil, alternativas) + opcionais (pilar, prova, gatilho, restrição de tom). Tabela de **derivações automáticas** — o que a calibragem já decide pros módulos seguintes. Regra: máx. 5 perguntas; o que faltar vira placeholder, não trava.

### 02 — Roteiro Engine
A **espinha de 6 beats** (hook contraintuitivo → erro comum → modelo/prova → exemplo numérico → virada → CTA+loop). Blueprint **segundo-a-segundo** (referência 30–45s). Quando usar **Dunford vs Hormozi** por estágio de funil (topo = 100% Insight; fundo = entra Value Equation). Como escrever o **script de legenda palavra-a-palavra** com palavra-chave destacada.

### 03 — Banco de Hooks
**Modelo de 4 camadas** (parada → relevância → retenção → conversão). **Triple-hook** (texto + visual + fala alinhados nos 3s). **Taxonomia de 15 tipos** de hook. **70+ fórmulas** preenchíveis em PT-BR, agrupadas por tipo e prontas pra abertura de reel. **Mapa calibragem → tipo de hook**. Lista de **erros que matam um hook** e o **método de 3–5 variações**.

### 04 — Biblioteca de Diagramas
**15 tipos de diagrama** (tier list, curva em U, haltere, barras empilhadas, funil, preço×demanda, loop causal, pros/cons, ciclos no tempo, retas espelhadas, fractal, caos→ordem, sandbox/produção, círculos aninhados, doc de texto). **Mapa conceito → diagrama** (pela estrutura do argumento). **Receita de chamada Napkin** (content/visual_query/style/language/color_mode). Checklist e **anti-slop** do diagrama.

### 05 — Composição
Os **3 layouts de tela A/B/C**. Constantes do formato (fundo preto, legenda na costura, palavra-chave em acento, anotação ao vivo). Regras de **legenda animada**. **Specs técnicas** (9:16 1080×1920, capa 420×654, fontes, safe zones, export). **Duração-alvo** por bucket. Som.

### 06 — CTA e Métricas
**CTA por objetivo** (salvar/enviar/comentar/seguir/clicar) — um só por reel, sempre com motivo. **Métricas que importam** (skip rate, curva de retenção, watch time, sends/reach, saves). **Variáveis de A/B** (uma por vez). **Benchmarks** de retenção e quando mudar de rota.

### 07 — QA Checklist
Três passes: **estrutura**, **anti-slop**, **voz/originalidade/técnico**. Itens **bloqueantes** (não publica se falhar) vs **taste** (corrige se der tempo). Scan rápido de 4 perguntas.

### 08 — Formatos só-gravação
Os **3 formatos sem Napkin** (R1 direto à câmera, R2 demonstração, R3 recorte de conversa), cada um com sua **alavanca de autoridade** substituindo o diagrama. Como a espinha de 6 beats adapta em cada um, notas de gravação, quando usar / quando não usar, e ajuste de QA pra quando não há diagrama.

---

## 7. Templates

| Arquivo | Pra quê |
|---|---|
| `templates/roteiro-reel.md` | Estrutura preenchível do reel inteiro: calibragem → hook → 6 beats → script de legenda → diagrama/gravação → composição → CTA → QA → decisões/placeholders. |
| `templates/brief-diagrama-napkin.md` | Brief pra gerar o diagrama via Napkin (ou manualmente, no fallback): tese, estrutura do argumento, texto cru, parâmetros de geração, pós-geração e anotação ao vivo planejada. |

---

## 8. A pasta `referencias/` (material-fonte)

Não são instruções — é a pesquisa que originou o sistema. Útil quando quiser a fonte por trás de uma escolha.

| Arquivo | O que é |
|---|---|
| `analise-reels-referencia.md` | Análise dos 6 reels de referência: a tese do formato, o workflow Napkin narrado pelo próprio criador, os 3 layouts, a anatomia narrativa e a biblioteca de diagramas observada. |
| `playbook-hooks-01-gpt-deep.md` | Relatório aprofundado sobre hooks no Instagram 2025–2026: taxonomia, benchmarks por formato, blueprints, bibliotecas de openers, métricas e governança. |
| `playbook-hooks-02-estudo-instagram-2026.md` | Estudo de hooks e estruturas virais 2025/2026: psicologia do hook (RAS, pattern interrupt), tipos de alta conversão, ecossistema de formatos, anatomia de reel/carrossel. |
| `playbook-hooks-03-compass-playbook.md` | Playbook-referência PT-BR: anatomia do hook em 4 camadas, 70+ fórmulas, estrutura de reel/carrossel passo a passo, CTAs, métricas e checklists. Foi a principal base do módulo `03`. |

> Observação: os playbooks cobrem também **carrossel e post estático**. Este pacote foca só em **Reels** — mas a base está aqui preservada se um dia quiser módulos irmãos.

---

## 9. Princípios não-negociáveis

1. **Um conceito por reel.** Dois modelos mentais = dois reels.
2. **Calibra antes de escrever.** Sem best-fit + objetivo + alternativas, a copy é ruído.
3. **Específico vence genérico.** "2 mil pra quem ganha 5 mil é metade da renda" vence "preço importa".
4. **A prova serve ao argumento, não enfeita.** Diagrama/B-roll que pode sumir sem perda está errado.
5. **Não inventa prova.** Sem número/case real → placeholder, nunca valor fabricado.
6. **Cumpre a promessa do hook.** Sem clickbait — o algoritmo detecta pela queda de saves/sends.
7. **Otimiza retenção, não duração.** 20s com 80% de retenção bate 60s com 30%.
8. **Originalidade real.** Reinterpretar, contextualizar, prova própria, voz própria.

---

## 10. Glossário rápido

| Termo | Significado |
|---|---|
| **Conceito autoral** | Modelo mental próprio que o reel ensina (não dica genérica). |
| **Alavanca de autoridade** | O que prova domínio: diagrama (Napkin), demonstração (R2), especificidade (R1) ou enquadramento de conversa (R3). |
| **Espinha (6 beats)** | hook → erro comum → modelo/prova → exemplo → virada → CTA+loop. |
| **Triple-hook** | Texto + visual + fala alinhados nos primeiros 3s. |
| **Best-Fit Customer** | (Dunford) O cliente exato que diz "é pra mim". Não é o TAM. |
| **Insight** | (Dunford) A tese que reframe como o cliente lê o próprio problema. Mora no hook. |
| **Skip rate** | % que sai nos 3 primeiros segundos. Mede a força do hook. |
| **Sends per reach** | Envios em DM por alcance. Melhor preditor de alcance entre não-seguidores. |

---

## 11. Portabilidade e próximos passos

- **Portável por padrão.** Nenhum caminho, MCP ou diretor de sistema específico está embutido. Funciona em qualquer pipeline.
- **Napkin é opcional.** Só os formatos visuais usam — e há fallback manual (qualquer ferramenta de diagrama) no `templates/brief-diagrama-napkin.md`. Os formatos R1/R2/R3 não dependem de nada.
- **Integração futura (opcional).** Se for plugar num sistema de squads/diretores, faça uma **camada-adaptador fina** por cima (mapear calibragem ↔ brand voice, diagrama ↔ gerador de visual, QA ↔ voice-check) sem mexer no núcleo. Versionamento e hooks ficam mais limpos num ambiente de dev/CLI.

### Próximos passos sugeridos
1. Rodar um **reel-piloto de ponta a ponta** com um conceito real, escolhendo um formato visual e um só-gravação, pra validar o pipeline na prática.
2. Criar um **banco de conceitos** (lista de modelos mentais autorais a transformar em reels) usando a calibragem como filtro.
3. Se quiser, abrir os **módulos irmãos** (carrossel e estático) reaproveitando o material de `referencias/`.

---

## 12. Changelog

- **v1.1** — Adicionado módulo `08` (3 formatos só-gravação: R1/R2/R3). Consolidação em pasta única + `referencias/` + este README.
- **v1.0** — Pacote inicial: módulos 00–07 + 2 templates. Formato Napkin + talking head, foco em reels educacionais.
