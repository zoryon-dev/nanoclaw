# Voya — Guia de Turismo Pessoal (Brasil / Nordeste)

**Date:** 2026-06-24
**Status:** Approved, ready for planning
**Owner:** Jonas (jonas.silva@zoryon.dev)
**Source material:** `guia-turistico-capacidades.md` (escopo completo de capacidades)

## Purpose

A **personal** travel-guide agent ("Voya") for Brazilian tourism with a focus on the
Nordeste. Jonas talks to it directly to plan his own trips: it recommends destinations,
compares options, builds day-by-day itineraries, suggests where to eat/stay, and answers
travel questions like a trusted local friend. **Personal use only** — no client-facing
robustness, no heavy disclaimers; it can be direct and opinionated.

## Positioning

- **Own, independent agent group** (folder `voya`) with its own workspace, memory, and
  persona — NOT backstage, NOT folded into any existing agent.
- **Dedicated Telegram bot**, wired only to `voya` in DM session mode. Jonas talks to it
  directly; there is no orchestrator hop.
- **Rationale:** trip planning is a long, exploratory, multi-turn dialogue ("e Jeri?",
  "compara as pousadas", "troca o dia 3", "e se chover?") — a sustained conversation, not a
  fire-and-forget task. The Lobby backstage model (fan-out → fan-in) suits one-shot tasks
  and would add a hop and lose context here. Keeping Voya standalone also lets the Lobby
  reach it later via a single added wiring with zero rework.

## Personality & method (lives in CLAUDE.md / persona)

- Tone: **acolhedor, direto, "o amigo que conhece todo mundo no destino"** — talks like a
  trusted local guide, gives the inside tip ("o pulo do gato"), warns about tourist traps
  ("ciladas"), doesn't pad.
- Method: understands purpose/constraints (perfil do viajante, ritmo, orçamento, época),
  proposes, compares, then structures the answer in the right delivery format.
- **Honesty rules (from §16 of the source doc):**
  - Flag when a datum may be stale (price, hours) and suggest confirming at the source.
  - Never invent a review, price, or availability — if it lacks the tool, say so.
  - Booking/payments: it **guides and prepares** (sends the link), the user finalizes.
  - Respect environmental rules of sensitive destinations (Noronha, Lençóis, parks).
  - Safety advice without alarmism or neighborhood/city stigma.

## Knowledge of destinations

- Primary source is the **model's own knowledge** (strong on Nordeste tourism) +
  **web search** for anything that must be current or verified.
- The extensive destination content in `guia-turistico-capacidades.md` is treated as a
  **consultable reference**, not text dumped into every turn. The persona carries method +
  personality + honesty rules; the model + web search fill the destination facts.
- An LLM wiki (karpathy-llm-wiki) for accumulated personal travel knowledge/preferences is
  **optional / future** — not part of v1.

## Tools — v1

1. 🔧 **Web search** (Tavily/Firecrawl, already wired in the swarm) — reviews
   (reads TripAdvisor/Google at the source), events & festival dates, approximate prices,
   practical info, current conditions. The single most powerful tool in the set; covers the
   bulk of the §1–§13 capabilities for personal use.
2. 🔧 **Persistent profile memory** (NanoClaw-native) — Jonas's travel tastes persisting
   across conversations: traveler profile, dietary/access restrictions, destinations already
   done, preferences (ritmo, orçamento, tipo de hospedagem).

## Prepared to grow (NOT in v1)

- **Maps / Google Places** and **Weather** — hooks anticipated in the design; they go live
  the moment Jonas drops the respective keys into the OneCLI vault. Code/persona should be
  written so adding them later is wiring-only, not a rework.
- **Flights / hotels / tides** — Voya **guides and sends the link** (Google Flights,
  Booking/Airbnb, tábua da Marinha) rather than integrating paid/closed APIs. Appropriate
  for personal use.
- **TripAdvisor official API** — closed; web reading already covers it.

## Delivery formats (§15)

All text, formatted for Telegram:
- Quick conversational answer.
- Day-by-day itinerary (manhã/tarde/noite, deslocamentos, folgas realistas).
- Comparison table (e.g. 4 pousadas side by side).
- Mala/documentos checklist by trip type.
- Estimated budget breakdown.
- "Cartão-resumo" — tudo sobre [destino] em uma tela.

(Map-with-pins delivery depends on the Maps tool → deferred with it.)

## Infra / credentials

- **Telegram bot** — dedicated token, set in Voya's container config; the host registers the
  adapter instance (**restart required** to start polling). Token handled as a secret —
  stored in config/vault, never echoed into chat or committed in plaintext.
- **Web search** — reuse the Tavily/Firecrawl wiring the swarm already has, via the OneCLI
  gateway (`all` secret mode, no raw creds in container).
- **Memory** — NanoClaw-native per-group memory; no external dependency.
- No new API keys required for v1.

## Definition of done / success criteria

1. `voya` agent group exists, container spawns, dedicated Telegram bot is live and responds.
2. Persona/CLAUDE.md carries the "local guide friend" tone, the method, and the §16 honesty
   rules; off-topic-to-travel is fine (it's a general personal travel guide, not locked
   scope) but it stays in its lane of being a travel guide.
3. Web search works end-to-end (asking about a destination triggers a current-data lookup
   when useful, with source-confirmation caveats on volatile data).
4. Profile memory persists at least one cross-conversation fact (e.g. a stated preference
   recalled in a later session).
5. At least the day-by-day itinerary and comparison-table delivery formats demonstrated.
6. Maps/Weather hooks documented as the next increment (no code debt blocking them).

## Process constraints (owner-set)

- Commit per task; commit + push per cycle of tasks.
- Record each material decision in agent memory.
- Reply in pt-br for chat updates; English stays in code/commits/spec.
- Authorized to iterate autonomously until done or 3 error attempts on a blocker.
- Goal: 100% efficacy.
