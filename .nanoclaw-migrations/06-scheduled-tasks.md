# Scheduled Tasks

## Intent

Jonas has automated daily briefings, weekly reviews, and monitoring reports. In v1, these were configured via scripts and the task scheduler. In v2, tasks are managed via the `schedule_task` MCP tool — the agent creates them itself.

## Tasks to Recreate

After v2 is running, send a message to the agent asking it to set up these scheduled tasks:

### Daily Tasks

1. **Morning Briefing** — Daily @ 08:00 BRT
   - Summarize today's Todoist tasks + Google Calendar events
   - Deliver via WhatsApp

2. **Afternoon Check-in** — Daily @ 16:00 BRT
   - Review pending tasks, enforce Ivy Lee method
   - Deliver via WhatsApp

### Weekly Tasks

3. **Weekly Review Part 1** — Friday @ 17:00 BRT
   - Inbox cleanup, overdue tasks, deliveries, project status
   - Deliver via WhatsApp

4. **Weekly Review Part 2** — Sunday @ 20:00 BRT
   - Set priorities for next week, review calendar
   - Deliver via WhatsApp

5. **Anthropic Updates** — Monday @ 07:00 BRT
   - Research latest Anthropic news/updates
   - Deliver via email (detailed) + WhatsApp (summary)

6. **NanoClaw Updates** — Monday @ 07:00 BRT
   - Check NanoClaw repo for new releases/changes
   - Deliver via email + WhatsApp

7. **Top 3 AI Market** — Monday @ 07:00 BRT
   - Research top 3 AI market developments
   - Deliver via email + WhatsApp

### Monthly Tasks

8. **Monthly Review** — 28th of each month @ 10:00 BRT
   - Retrospective: goals achieved, missed, lessons learned
   - Set next month's goals
   - Deliver via WhatsApp

## How to Apply

In v2, scheduled tasks are created by the agent itself via the `schedule_task` MCP tool. After first boot:

1. Send a message to the agent via WhatsApp asking it to create all scheduled tasks listed above
2. The agent will use `schedule_task` with cron expressions:
   - Daily 08:00 BRT: `0 8 * * *`
   - Daily 16:00 BRT: `0 16 * * *`
   - Friday 17:00 BRT: `0 17 * * 5`
   - Sunday 20:00 BRT: `0 20 * * 0`
   - Monday 07:00 BRT: `0 7 * * 1`
   - Monthly 28th 10:00 BRT: `0 10 28 * *`

3. Verify tasks were created: ask the agent to `list_tasks`

**Note**: v2's scheduler respects the `TZ` env var, so cron expressions should use local time (BRT).

## Fixed Reminders (in persona, not scheduler)

These are documented in the WhatsApp group's CLAUDE.md and the agent handles them based on context:
- 18h daily: Organizze categorization reminder
- Weekly: Payment review reminder
