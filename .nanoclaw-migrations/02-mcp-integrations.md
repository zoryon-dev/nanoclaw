# MCP Server Integrations

## Intent

Jonas uses 8 external MCP servers for extended agent capabilities. In v1, these were hardcoded in `container/agent-runner/src/index.ts`. In v2, MCP servers are configured via the `NANOCLAW_MCP_SERVERS` JSON environment variable on the host side.

## MCP Servers to Configure

### 1. Parallel AI (Search + Task)

**Purpose**: AI-powered web search and task execution
**Type**: HTTP (streamable)
**Config**:
```json
{
  "parallel-search": {
    "type": "url",
    "url": "https://api.getparallel.ai/v1/mcp/search",
    "headers": { "X-API-Key": "${PARALLEL_API_KEY}" }
  },
  "parallel-task": {
    "type": "url",
    "url": "https://api.getparallel.ai/v1/mcp/task",
    "headers": { "X-API-Key": "${PARALLEL_API_KEY}" }
  }
}
```
**Env var required**: `PARALLEL_API_KEY`
**Conditional**: Only add if `PARALLEL_API_KEY` is set

### 2. Fireflies (Meeting Transcripts)

**Purpose**: Access meeting recordings and transcripts
**Type**: npx command
**Config**:
```json
{
  "fireflies": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "fireflies-mcp-server"],
    "env": { "FIREFLIES_API_KEY": "${FIREFLIES_API_KEY}" }
  }
}
```
**Env var required**: `FIREFLIES_API_KEY`
**Conditional**: Only add if `FIREFLIES_API_KEY` is set

### 3. Composio (Google Workspace + External APIs)

**Purpose**: Google Drive, Sheets, Calendar, Docs, GitHub access via OAuth
**Type**: HTTP (streamable)
**Config**:
```json
{
  "composio": {
    "type": "url",
    "url": "https://connect.composio.dev/mcp"
  }
}
```
**No env var needed**: Authentication is handled by Composio's OAuth (pre-configured via `scripts/composio-oauth.mjs`)
**Always active**: No conditional

### 4. Firecrawl (Web Scraping/Research)

**Purpose**: Web page scraping, crawling, and content extraction
**Type**: HTTP (streamable)
**Config**:
```json
{
  "firecrawl": {
    "type": "url",
    "url": "https://mcp.firecrawl.dev/sse?key=${FIRECRAWL_API_KEY}"
  }
}
```
**Env var required**: `FIRECRAWL_API_KEY`
**Conditional**: Only add if `FIRECRAWL_API_KEY` is set

### 5. Mem (Long-term Memory)

**Purpose**: Persistent memory storage and retrieval (Mem.ai)
**Type**: HTTP (streamable)
**Config**:
```json
{
  "mem": {
    "type": "url",
    "url": "https://mcp.mem.ai",
    "headers": { "Authorization": "Bearer ${MEM_API_KEY}" }
  }
}
```
**Env var required**: `MEM_API_KEY`
**Conditional**: Only add if `MEM_API_KEY` is set

### 6. Todoist (Task Management)

**Purpose**: Task management with Ivy Lee method (6-task system)
**Type**: npx command
**Config**:
```json
{
  "todoist": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@anthropic-ai/claude-code", "mcp", "serve", "todoist"],
    "env": { "TODOIST_API_TOKEN": "${TODOIST_API_TOKEN}" }
  }
}
```
**Env var required**: `TODOIST_API_TOKEN`
**Conditional**: Only add if `TODOIST_API_TOKEN` is set

### 7. QMD (Conversation Search)

**Purpose**: Search past conversations via local QMD MCP server
**Type**: HTTP (streamable)
**Config**:
```json
{
  "qmd": {
    "type": "url",
    "url": "http://host.docker.internal:8182/mcp"
  }
}
```
**No env var needed**: Runs locally
**Always active**: Assumes QMD server is running on host

### 8. Ollama (Local Models — optional)

**Purpose**: Run local LLMs, manage model library
**Type**: HTTP or stdio
**Conditional**: Only if `OLLAMA_ADMIN_TOOLS` is set
**Note**: Configuration depends on Ollama setup; see ollama-tool skill

## How to Apply

In v2, set the `NANOCLAW_MCP_SERVERS` environment variable in `.env` with a JSON object containing all server configs. The v2 host passes this to containers at spawn time.

Example `.env` entry:
```bash
NANOCLAW_MCP_SERVERS='{"parallel-search":{"type":"url","url":"https://api.getparallel.ai/v1/mcp/search","headers":{"X-API-Key":"${PARALLEL_API_KEY}"}},"composio":{"type":"url","url":"https://connect.composio.dev/mcp"},"qmd":{"type":"url","url":"http://host.docker.internal:8182/mcp"}}'
```

**Important**: Check v2's exact format for `NANOCLAW_MCP_SERVERS` before applying. The JSON structure may differ from the examples above. Read `container/agent-runner/src/index.ts` in the v2 worktree to confirm the expected schema.

## Tool Allowlist

In v1, these tool patterns were added to the agent-runner allowlist:
- `mcp__parallel-search__*`
- `mcp__parallel-task__*`
- `mcp__fireflies__*`
- `mcp__composio__*`
- `mcp__firecrawl__*`
- `mcp__mem__*`
- `mcp__todoist__*`
- `mcp__qmd__*`

In v2, check if the agent-runner uses a similar allowlist and add these patterns.
