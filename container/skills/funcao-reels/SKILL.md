---
name: funcao-reels
description: >-
  Produção de Reels educacionais de alta retenção (modelo mental visualizado +
  talking head + legenda animada) para atrair público qualificado. Use quando o
  pedido envolver "reel", "reels", "roteiro de reel", "vídeo curto", ou produzir
  conteúdo de vídeo para Zoryon/Faryon. NÃO é para carrossel/post estático (isso
  é /read-post + criação de carrossel). Carrega o pacote Função Reels na íntegra
  (calibragem → roteiro/hook → diagrama → composição → CTA/QA) e entrega sempre
  os 3 textos + o diagrama, registrados no Notion e no Drive.
---

# Função Reels — roteador

Este skill é **só navegação**. Todo o conteúdo do sistema vive, na íntegra, em
`modules/`, `templates/` e `referencias/`. Não resuma esses arquivos — abra-os.

**A tese (não a repita; leia em `modules/00-INDICE-MESTRE.md`):** o formato junta
rosto (conexão) + prova visível (diagrama) pra atrair cliente qualificado, não
view. Só funciona se o conceito for bom E a prova for boa.

## Comece sempre aqui

1. Leia **`modules/00-INDICE-MESTRE.md`** (pipeline, glossário, 8 princípios).
2. Para gerar o diagrama, adaptar a voz da marca e entregar os artefatos, leia
   **`ADAPTER.md`** — é a camada que liga o núcleo do pacote às ferramentas reais
   do Caio (Napkin/Magnific, brand-wiki, Notion, Drive).

## O pipeline → qual módulo abrir

| Etapa | O que decidir | Abra |
|---|---|---|
| 1. Conceito cru | o modelo mental autoral (1 por reel) | (você traz) |
| 2. Calibragem | best-fit, objetivo, funil, alternativas, **Marca** | `modules/01-CALIBRAGEM.md` + `ADAPTER.md` (marca) |
| 3. Roteiro + Hook | 6 beats, script de legenda, 70+ hooks | `modules/02-ROTEIRO-ENGINE.md`, `modules/03-BANCO-DE-HOOKS.md` |
| 4. Prova (visual) | diagrama (15 tipos, receita) | `modules/04-BIBLIOTECA-DIAGRAMAS.md` + `ADAPTER.md` (Napkin/Magnific) |
| 4. Prova (gravação) | R1/R2/R3 sem diagrama | `modules/08-FORMATOS-SO-GRAVACAO.md` |
| 5. Composição | layout A/B/C, legenda, specs | `modules/05-COMPOSICAO.md` |
| 6. CTA + métricas | CTA único, o que medir | `modules/06-CTA-E-METRICAS.md` |
| QA | checklist anti-slop, bloqueantes | `modules/07-QA-CHECKLIST.md` |

Atalho de produção: `templates/roteiro-reel.md` (reel inteiro) e
`templates/brief-diagrama-napkin.md` (brief do diagrama). Ambos referenciam o
módulo onde decidir cada coisa.

## Material-fonte

`referencias/` é a pesquisa que originou o sistema (6 reels analisados + 3
playbooks de hooks). Consulta opcional — não precisa ler pra produzir.

## Entregável (sempre — ver `ADAPTER.md` para os comandos exatos)

Todo reel produz e salva: **(1)** `roteiro-reel.md` preenchido com a **narração**
e o **script de legenda**, **(2)** `brief-diagrama.md` com o **texto cru
estruturado** que alimenta o diagrama, **(3)** o **diagrama** (Napkin → fallback
Magnific). Depois espelha no **Drive** e registra no **Notion**.
