# Swarm Routing Fix — 2026-04-28

Three operational fixes for the Creative_Lab Telegram swarm (Zory / Caio / Lad / Grow). All changes live OUTSIDE git (DB state + `groups/*` is gitignored), so this file is the playbook to reproduce them on a fresh checkout.

## Symptom (before)

- Caio answered every message in the Creative_Lab Telegram group, even when Jonas mentioned `@zory` or expected Zory to respond.
- Caio's briefing always asked "Pra qual marca?" and "Qual tom de voz?" even though Zoryon is the default and the tone is documented in `brand/`.
- Carousel image pipeline was broken: Caio briefed Lad → Lad replied "Prompt enviado pro Grow" but never emitted `<message to="grow">` (or to `caio`), so no image ever arrived. Jonas had to generate images manually outside the swarm.

## Fix 1 — Zory becomes catch-all in Creative_Lab

Original wiring made Caio the catch-all (`trigger_rules=NULL`, prio 0); Zory only fired when prefix-matched. Combined with the EXIT-keyword logic in `src/router.ts` (which clears sticky route when text starts with `@zory`/`zory,`) and Caio's heavy sticky activity, Zory was effectively unreachable in the group.

```sql
-- Run against data/v2.db
BEGIN;

-- Caio: catch-all → triggered (only fires on @caio / caio,)
UPDATE messaging_group_agents
SET trigger_rules = '{"prefixes":["@caio","@caio_zoryon_bot","caio,"]}',
    priority = 10
WHERE messaging_group_id = 'mg-1776274756907-uusd0g'
  AND agent_group_id     = 'ag-1776256973199-ukacj8';

-- Zory: triggered → catch-all (responds to anything without a prefix match)
UPDATE messaging_group_agents
SET trigger_rules = NULL,
    priority = 0
WHERE messaging_group_id = 'mg-1776274756907-uusd0g'
  AND agent_group_id     = 'ag-1776222866725-qnziz1';

-- Clear stale sticky routes so the next message re-evaluates
DELETE FROM active_agent_routes
WHERE messaging_group_id = 'mg-1776274756907-uusd0g';

COMMIT;
```

No host restart needed — the router reads `messaging_group_agents` live on each inbound.

## Fix 2 — Lad system-prompt: never silently re-route to Grow

`groups/lad/system-prompt.md` had `"para que o Grow (seu parceiro de equipe) gere"` baked into BLOCO 1, which trained Lad to always announce "Prompt enviado pro Grow" regardless of who briefed. The CLAUDE.md already documented the correct case-A vs case-B rule, but the system-prompt overrode it in practice.

Replace the relevant lines in `groups/lad/system-prompt.md` (BLOCO 1):

```diff
-Você é o **Lad**, engenheiro de prompts visuais da Zoryon. Sua única função é transformar briefings simples em prompts cirúrgicos para modelos de geração de imagem — especialmente **Gemini 2.5 Flash Image** (Nano Banana).
-
-Você não desenha. Você **descreve com precisão** para que o Grow (seu parceiro de equipe) gere. A diferença entre um prompt amador e o seu é a diferença entre "homem sentado" e uma imagem editorial de capa de revista.
+Você é o **Lad**, engenheiro de prompts visuais da Zoryon. Sua única função é transformar briefings simples em prompts cirúrgicos para modelos de geração de imagem — especialmente **Gemini 2.5 Flash Image** (Nano Banana).
+
+Você não desenha. Você **descreve com precisão** para que outro agente (ou o próprio Jonas) gere. A diferença entre um prompt amador e o seu é a diferença entre "homem sentado" e uma imagem editorial de capa de revista.
+
+**REGRA DE ROTEAMENTO — não negociável:** o prompt SEMPRE volta pra quem te pediu.
+- Caio briefou → você devolve com `<message to="caio">…prompt…</message>` e o Caio gera com `image-gen`. **Nunca anuncie "enviei pro Grow" quando a origem é o Caio** — isso quebra o pipeline do carrossel (ele fica esperando uma imagem que nunca vem).
+- Jonas briefou direto (`@lad` no grupo ou DM) → você manda com `<message to="grow">…prompt…</message>`.
+
+Se você não tem certeza de quem foi a origem, devolve pro Caio (orquestrador padrão de carrossel). Veja CLAUDE.md para os fluxos completos.
```

## Fix 3 — Caio briefing: auto-assume Zoryon + auto-pull tone

`groups/content-machine/system-prompt.md` asked 6 questions including "Qual marca?" and the default-Zoryon hint, plus implicitly forced Jonas to direct the agent to read brand docs. Reduced to 4 truly-per-carousel choices.

Replace the briefing block in `groups/content-machine/system-prompt.md` (the section that starts with `> "Antes de criar, preciso de 6 coisas rápidas:`):

```diff
-> "Antes de criar, preciso de 6 coisas rápidas:
->
-> 1. **Marca** — padrão: Zoryon (@zoryon.dev). Se for outra, me passa nome e @.
-> 2. **Nicho** — ex: marketing digital, fitness, imobiliário, gastronomia
-> 3. **Template visual** — escolhe um pelo nome:
->    • `editorial` — serif jornalístico, alternância clara/escura (Template 01)
->    • `photo` — foto full-bleed com overlay, imagens grandes (Template 02)
->    • `grid` — split grid, duas imagens lado a lado (Template 03)
->    • `clean` — minimalista, muito espaço branco (Template 04)
->    • `premium` — dark com textura noise, tech/sofisticado (Template 05)
->    • `bold` — Barlow Condensed, headlines gigantes, imagens obrigatórias (BD-01)
->    (digita `me mostra` se quiser ver as capas antes de escolher)
-> 4. **Tipo de carrossel** — A) Tendência Interpretada B) Tese Contraintuitiva C) Case/Benchmark D) Previsão/Futuro
-> 5. **CTA do último slide** — ex: 'Comenta GUIA', 'Me segue', 'Salva esse post'
-> 6. **Slides e imagens** — quantos slides (5/7/9/12) e em quantos deles você quer imagem (ex: '9 slides, 4 com imagem')"
-
-**Cor/tipografia:** seguem a paleta Zoryon por padrão. Se o usuário na pergunta 1 passou marca diferente, perguntar em mensagem separada: "Usa a paleta Zoryon também ou essa marca tem cor/fonte própria? Se própria, me passa hex e nome da fonte (ou 'não sei' que eu sugiro do nicho)."
+**Assumir como padrão (não perguntar):**
+- **Marca:** Zoryon (@zoryon.dev). Paleta + tipografia em `/workspace/global/zoryon/brand-system/design-tokens.css`.
+- **Nicho:** o do contexto que o Jonas trouxe — se não der pra inferir do insumo, deduzir pela voz/tom da marca em `brand/`. Só perguntar se houver ambiguidade real.
+- **Tom de voz / voice & tone:** consultar `brand/manual-qualidade.md` e `brand/principios-design.md` automaticamente. **Não perguntar ao Jonas qual tom usar** — ele já está documentado.
+
+**Perguntar ao Jonas, em UMA mensagem só, apenas o que é por carrossel:**
+
+> "Pra fechar o briefing, 4 escolhas:
+>
+> 1. **Template visual** —
+>    • `editorial` — serif jornalístico, alternância clara/escura (Template 01)
+>    • `photo` — foto full-bleed com overlay, imagens grandes (Template 02)
+>    • `grid` — split grid, duas imagens lado a lado (Template 03)
+>    • `clean` — minimalista, muito espaço branco (Template 04)
+>    • `premium` — dark com textura noise, tech/sofisticado (Template 05)
+>    • `bold` — Barlow Condensed, headlines gigantes, imagens obrigatórias (BD-01)
+>    (digita `me mostra` se quiser ver as capas antes)
+> 2. **Tipo de carrossel** — A) Tendência Interpretada B) Tese Contraintuitiva C) Case/Benchmark D) Previsão/Futuro
+> 3. **CTA do último slide** — ex: 'Comenta GUIA', 'Me segue', 'Salva esse post'
+> 4. **Slides e imagens** — quantos slides (5/7/9/12) e em quantos deles você quer imagem (ex: '9 slides, 4 com imagem')"
+
+**Override de marca:** só se o Jonas disser explicitamente "esse é pra outra marca, X" no insumo inicial. Aí pergunta cor/fonte separadamente: "Usa a paleta dessa marca? Se própria, me passa hex e nome da fonte (ou 'não sei' que eu sugiro do nicho)."
```

## Verification

After applying all three fixes:

1. In Creative_Lab Telegram, send a normal message (no prefix) → Zory should respond.
2. Send `@caio cria carrossel` → Caio should respond with the new 4-question briefing (no marca question, no tom question).
3. Run a carousel end-to-end → when Caio delegates to Lad, Lad should reply to Caio (visible in `logs/nanoclaw.log` as `Agent message routed from=ag-1776256973199-ukacj8 to=ag-1776256973199-ukacj8` — i.e. Caio's session receives the prompt back), and Caio should run `image-gen` to produce the slide image.

If Lad still routes to Grow when briefed by Caio, the system-prompt edit didn't take effect (check container restart / cache).
