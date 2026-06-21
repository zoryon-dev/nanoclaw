# Design — Caio Content Manager, Subsystem E: Scheduling + Publishing

**Date:** 2026-06-21
**Status:** Approved (design), pending implementation plan
**Initiative:** Caio → Content Manager. Subsystem **E of six** (A–F). See memory `caio-content-manager-initiative`. Depends on C (persona/router) and D (carousel creation + Drive/Notion delivery). Builds the third core responsibility Jonas named at kickoff: "agendar o post."

## Goal

Let Caio schedule a created carousel for a future time, track it on an editorial calendar, and **publish it to Instagram automatically** at that time — with a reminder/confirmation path as the safety net. (User chose "1+2 juntos": calendar+reminder AND auto-publish, together.)

## Decisions (locked, user 2026-06-21)

- **Caio schedules himself** (he has the `schedule_task` MCP tool + Notion). No internal scheduler agent.
- **Editorial calendar = extend the existing "Carrosséis — Entregas" Notion DB** (add a publish date + an "Agendado" status), not a new DB. A Notion calendar view on that date = the editorial calendar.
- **Auto-publish via Composio's Instagram toolkit** (confirmed it supports organic carousels): `INSTAGRAM_CREATE_CAROUSEL_CONTAINER` (2–10 items) → `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH`. NOT the raw Meta Graph API.
- **Reminder/confirmation is the safety net:** on publish success → notify Jonas + set Status=Publicado; on failure → fall back to a reminder with everything ready so Jonas publishes manually.

## Prerequisites the user provides (flagged — not buildable by the agent)

1. **Composio Instagram toolkit connected** with an **Instagram Business/Creator account** + the **content-publish** scope (OAuth, Composio web UI). The agent can't do this OAuth.
2. The **IG Business account id** (for the publish calls).
3. **Public, direct image URLs for the slide PNGs** — Instagram fetches each carousel image by URL. Drive share links are NOT reliable direct-image. **Recommended host: Cloudflare R2** (the user has Cloudflare; there's an R2 MCP). The slide PNGs are uploaded to a public R2 bucket → stable `https://<bucket>.r2.dev/...` URLs. (Alternative to confirm: a public web host / the OneCLI tunnel.)

## Components

### E1 — Editorial calendar (Notion)
Add to the "Carrosséis — Entregas" data source (`collection://4fac81ae-...`): a **`Data de publicação`** (date) property, and a **`Agendado`** option on the existing `Status` select (so the flow is Rascunho → Entregue → **Agendado** → Publicado). Add a calendar **view** keyed on `Data de publicação`. The `notion_delivery.py` writer (or a small update helper) sets these when scheduling. A Notion calendar view becomes the visible editorial calendar.

### E2 — Scheduling (Caio, `schedule_task`)
When Jonas says "agenda esse carrossel pra <data/hora>", Caio:
1. Updates the carousel's Notion row: `Data de publicação` = the time, `Status` = Agendado.
2. Creates a `schedule_task` with `process_after` = the publish time and **content carrying the publish job**: which carousel (Drive folder / slide URLs + caption + Notion page id). One-off (or recurrent for a cadence). BRT timezone.

### E3 — Publish handler (fires at the scheduled time)
The scheduled task wakes Caio with the publish job. Caio:
1. Ensures the slide images have **public URLs** (upload the slide PNGs to the public host — R2 — if not already; cache the URLs).
2. `INSTAGRAM_CREATE_CAROUSEL_CONTAINER` with the slide image URLs (2–10) + the caption (from the delivery).
3. `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH` the container (Composio waits for processing).
4. **On success:** set Notion `Status = Publicado`; notify Jonas in the Caio DM ("Publicado: <link do post>").
5. **On failure** (or if the IG connection isn't configured yet): fall back to a **reminder** — send Jonas everything ready (PDF, Drive link, caption) so he publishes manually, and ask him to confirm so Caio sets Publicado. This makes the system useful even before the IG connection/host exist.

### E4 — Slide image hosting (public URLs)
A small uploader puts the carousel slide PNGs into a public bucket (Cloudflare R2 recommended) and returns direct URLs. Reused by E3. (This is the one new piece of infra; it ALSO unblocks the Magnific brand-ref hosting from D and any future "needs a public image URL" case.)

### E5 — Persona/router wiring (C)
Update the BLOCO 2 router + capabilities map: "agendar" moves from "em construção" to **ativo** (calendar + schedule + publish). Add the scheduling/publish flow to the system-prompt (a new Etapa or BLOCO) + CLAUDE.local note.

## Data flow

```
Carrossel pronto (Etapa 5.5: Drive + Notion "Carrosséis — Entregas")
  → Jonas: "agenda pra <data/hora>"
  → Caio: Notion (Data de publicação + Agendado) + schedule_task(process_after, publish-job)
  → [no horário] task acorda Caio
  → slides → host público (R2) → URLs
  → Composio: CREATE_CAROUSEL_CONTAINER(urls, caption) → PUBLISH
  → sucesso: Notion Status=Publicado + avisa Jonas | falha: lembrete pra publicar manual
```

## Verification
1. Notion DB has `Data de publicação` + `Agendado`; a calendar view exists.
2. "agenda esse carrossel pra amanhã 9h" → Notion row updated (Agendado, date) + a `schedule_task` appears (list tasks).
3. At the time, the task fires and Caio runs the publish path (or, until IG/host configured, the reminder path) — verified live.
4. With the IG connection + R2 configured: a real carousel publishes to the IG Business account; Status→Publicado; Jonas notified with the post link.
5. Failure path: with IG disconnected, Caio reminds Jonas with the ready assets instead of silently failing.

## Out of scope
- Subsystem F (auditoria).
- Blog/reel multi-format scheduling (only carousels now).
- Building the Composio IG OAuth connection or the Meta app (user-side prereq).
- A full content-calendar planner / cadence autopilot (the cadence "1 carrossel/dia" is informational; auto-generating a schedule is future).
