# Persona & Group Configurations

## Intent

Jonas (Zoryon founder, marketing + AI for infoproduct creators in Brazil) uses a personalized assistant named **Zory** — a high-performance executive secretary. All communication is in Portuguese (PT-BR), timezone BRT (America/Sao_Paulo, UTC-3).

## Files to Copy

These are user content files. Copy from the main tree into the v2 worktree, adapting paths if v2 uses a different group directory structure.

### groups/global/CLAUDE.md

**Source**: `/root/nanoclaw/groups/global/CLAUDE.md`

This is the shared global persona loaded by all agents. Key contents:

- **Identity**: Zory, assistente do Jonas
- **Owner profile**: Jonas, founder of Zoryon, Campina Grande PB, perfectionist who paralyzes on execution, family-first values
- **Work hours**: Mon-Fri 06h-12h, 15h-17h, 18h+; Church Wed 19h, Sun 18h
- **Core tools**: Todoist (Ivy Lee method), Gmail, Google Calendar, Fireflies, Mem, Firecrawl, Raycast, Claude
- **Composio integrations**: Google Drive, Sheets, Calendar, Docs, GitHub
- **Auto-save triggers**: Client changes, business decisions, financial data, goals/deadlines, preferences
- **File structure references**: zoryon.md, clientes.md, produtos.md, personas.md, stack.md, dados-empresa.md

**How to apply**: Copy this file as-is to `groups/global/CLAUDE.md` in v2. If v2 uses a different import mechanism (e.g., `@./.claude-global.md` symlink), ensure the import path is updated accordingly.

### groups/whatsapp_main/CLAUDE.md

**Source**: `/root/nanoclaw/groups/whatsapp_main/CLAUDE.md`

This is the WhatsApp-specific persona. Key contents:

- **Role**: Zory — Secretaria Executiva de Alta Performance
- **Behavior rules**: Never reaffirms, never opens with "Claro!", auto-resumes audio, keeps responses to 3 lines max, max 1-2 emojis
- **Do without asking**: Resume audio/text, organize info, web search, calendar checks, task checks, Fireflies lookup, fetch memory, add Todoist tasks, verify emails
- **Do only with permission**: Send email, delete anything, push/merge code, destructive actions
- **Specialties**: Ivy Lee method, business management, financial tracking, Meta Ads analysis
- **Fixed reminders**: 18h daily (Organizze categorization), weekly review (payments)
- **Daily ritual (Ivy Lee)**: Run every night — list open tasks by project, Jonas picks 6, auto-label + calendar block
- **Weekly planning (Zoryon Dev)**: Define 1-3 metas, create parent task with subtasks, due = Saturday
- **Memory structure**: Auto-update clientes.md, produtos.md, decisoes.md, financeiro.md, contatos.md; long-term insights to Mem

**How to apply**: Copy this file to the appropriate group directory in v2. In v2, groups are named `{channel}_{group}`, so it should go to `groups/whatsapp_main/CLAUDE.md` (same path). Also copy any companion data files in the group directory (decisoes.md, financeiro.md, contatos.md, etc.).

### groups/main/CLAUDE.md

**Source**: `/root/nanoclaw/groups/main/CLAUDE.md`

The main channel group (Andy persona for admin). Contains:
- Channel-specific formatting rules
- Group management capabilities
- Task scheduling documentation

**How to apply**: Read v2's default `groups/main/CLAUDE.md` first. Merge any custom content from v1 that isn't already covered by v2's template.

### Other Group Data Files

Copy all data files from these group directories (not just CLAUDE.md):
- `groups/global/` — zoryon.md, clientes.md, produtos.md, personas.md, stack.md, dados-empresa.md
- `groups/whatsapp_main/` — decisoes.md, financeiro.md, contatos.md, and any other .md files
- `groups/telegram_main/` — if it has data files

**Important**: Do NOT copy `groups/emacs/` — it's a symlink to `whatsapp_main` in v1. In v2, set up Emacs as a separate channel adapter if needed.
