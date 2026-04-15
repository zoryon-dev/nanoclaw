# Container Skills to Port

## Intent

Custom container skills teach the agent how to use specific tools and follow specific workflows. These are loaded into the agent container at runtime via `container/skills/`. Copy them to the v2 container skills directory.

## Skills to Port

### 1. meta-ads-analyst

**Source**: `container/skills/meta-ads-analyst/SKILL.md`
**Purpose**: Meta Ads campaign analysis using Composio MCP tools. Portuguese/Brazilian focus — interprets metrics (CPA, ROAS, CTR, LTV, CPL) with business context.
**Dependencies**: Composio MCP server (for Meta Ads API access)
**How to apply**: Copy `container/skills/meta-ads-analyst/` to v2's `container/skills/` directory. Verify Composio MCP is configured.

### 2. ivy-lee-todoist

**Source**: `container/skills/ivy-lee-todoist/SKILL.md`
**Purpose**: Implements the Ivy Lee productivity method (6 tasks/day) using Todoist MCP. Nightly ritual: list open tasks, user picks 6, auto-label and calendar block.
**Dependencies**: Todoist MCP server
**How to apply**: Copy `container/skills/ivy-lee-todoist/` to v2's `container/skills/` directory.

### 3. mem

**Source**: `container/skills/mem/SKILL.md` + `container/skills/mem/mem-cli`
**Purpose**: Long-term memory storage via Mem.ai. Includes a CLI binary for direct Mem API access.
**Dependencies**: Mem MCP server, `MEM_API_KEY`
**How to apply**: Copy `container/skills/mem/` to v2's `container/skills/` directory. Ensure `mem-cli` binary is included and executable.

### 4. pdf-reader

**Source**: `container/skills/pdf-reader/SKILL.md` + `container/skills/pdf-reader/pdf-reader`
**Purpose**: PDF text extraction using poppler-utils (pdftotext). Handles WhatsApp attachments, URLs, and local files.
**Dependencies**: `poppler-utils` installed in container (via Dockerfile)
**How to apply**: Copy `container/skills/pdf-reader/` to v2. Check if v2's Dockerfile already includes `poppler-utils` — if not, add it. Also ensure the `pdf-reader` binary is copied to `/usr/local/bin/` in the Dockerfile.

### 5. qmd

**Source**: `container/skills/qmd/SKILL.md`
**Purpose**: Conversation search via QMD MCP server running on host.
**Dependencies**: QMD MCP server running on host at port 8182, `@tobilu/qmd` npm package in container
**How to apply**: Copy `container/skills/qmd/` to v2. Check if v2's Dockerfile includes the `@tobilu/qmd` global install — if not, add `RUN npm install -g @tobilu/qmd` to the Dockerfile.

### 6. reactions

**Source**: `container/skills/reactions/SKILL.md`
**Purpose**: WhatsApp emoji reaction support (receive, send, store, search).
**Dependencies**: WhatsApp channel with reaction support
**How to apply**: v2's WhatsApp adapter has native reaction support. Check if this skill is still needed or if v2 handles it natively. If v2 covers it, skip this skill.

## Skills Already in v2 (do NOT copy)

These v1 skills are replaced by v2 equivalents:
- **agent-browser** — v2 has its own version
- **capabilities** — replaced by v2's `self-customize` skill
- **status** — removed in v2
- **slack-formatting** — v2 has built-in channel formatting

## Dockerfile Changes

If porting pdf-reader and qmd, add to v2's Dockerfile:
```dockerfile
# PDF extraction
RUN apt-get update && apt-get install -y poppler-utils && rm -rf /var/lib/apt/lists/*

# QMD conversation search
RUN npm install -g @tobilu/qmd

# PDF reader CLI
COPY container/skills/pdf-reader/pdf-reader /usr/local/bin/pdf-reader
RUN chmod +x /usr/local/bin/pdf-reader
```

Check v2's Dockerfile first — some of these may already be included.
