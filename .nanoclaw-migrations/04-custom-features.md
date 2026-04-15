# Custom Features

## 1. Model Selection (Sonnet for chat, Haiku for CRON)

### Intent

Different models for different task types to optimize cost vs quality:
- **Interactive messages**: Sonnet (balanced quality/speed)
- **Scheduled/CRON tasks**: Haiku (fast/cheap) — though currently overridden to Sonnet in .env
- Agent can escalate to Opus mid-conversation via `setModel()`

### v1 Implementation

In `src/config.ts`:
```typescript
export const NANOCLAW_MODEL = process.env.NANOCLAW_MODEL || 'sonnet';
export const NANOCLAW_CRON_MODEL = process.env.NANOCLAW_CRON_MODEL || 'haiku';
```

In `container/agent-runner/src/index.ts`, the model is selected based on whether the message is a scheduled task:
```typescript
const model = isScheduledTask ? process.env.NANOCLAW_CRON_MODEL || 'haiku' : process.env.NANOCLAW_MODEL || 'sonnet';
```

### v2 Status

v2 uses a provider abstraction (`src/providers/`) but does not have per-task model selection. The model is determined by the Claude Agent SDK defaults.

### How to Apply in v2

Check v2's `container/agent-runner/src/providers/claude.ts` for where the model is configured. Add model selection logic:
1. Pass `NANOCLAW_MODEL` and `NANOCLAW_CRON_MODEL` env vars to the container
2. In the Claude provider, select model based on task type (check if the incoming message has a `kind: 'task'` field or similar)
3. If v2's provider doesn't support model override, this may require modifying the provider interface

**Env vars**: `NANOCLAW_MODEL=sonnet`, `NANOCLAW_CRON_MODEL=sonnet` (both currently set to sonnet)

---

## 2. Status Tracker (Emoji Reaction Feedback)

### Intent

Visual feedback on message processing status via WhatsApp emoji reactions:
- 👀 RECEIVED — message arrived
- 💭 THINKING — container starting
- 🔄 WORKING — processing
- ✅ DONE — success
- ❌ FAILED — error

Persists state to JSON for recovery on restart. Heartbeat check detects stale messages.

### v1 Implementation

Custom file `src/status-tracker.ts` (~360 lines). Integrated into `src/index.ts` message loop.

### v2 Status

v2's delivery system (`src/delivery.ts`) handles message routing but doesn't have status tracking with emoji reactions. v2's WhatsApp adapter does support `add_reaction` as an MCP tool.

### How to Apply in v2

**Option A (Recommended)**: Skip for now. v2's architecture is different enough that reimplementing the status tracker would require understanding the new delivery pipeline. The `add_reaction` MCP tool means the agent can react to messages, but automatic status tracking would need host-side code.

**Option B**: If desired, implement a lightweight version in v2's delivery pipeline:
1. Hook into the message delivery lifecycle in `src/delivery.ts`
2. Use the WhatsApp adapter's reaction method to send status emojis
3. Track state in the session DB instead of a JSON file

---

## 3. Image Vision Support

### Intent

Process WhatsApp image attachments: resize with Sharp, convert to base64, send to Claude as multimodal content blocks.

### v1 Implementation

Custom file `src/image.ts` (~65 lines) using Sharp library. Images resized to max 1024px, stored as JPEG 85% quality.

### v2 Status

v2's WhatsApp adapter downloads media files natively. Vision support may need the `/add-image-vision` skill.

### How to Apply in v2

1. Check if `upstream/skill/image-vision` branch is compatible with v2
2. If yes, merge the skill branch
3. If not, the core logic is simple — resize with Sharp, encode as base64, add as `image` content block in the message to Claude
4. Ensure `sharp` is in the container's `package.json` dependencies

---

## 4. Voice Transcription

### Intent

Transcribe WhatsApp voice notes using OpenAI's Whisper API so the agent can read and respond to them.

### v1 Implementation

Via `skill/voice-transcription` branch merge. Uses `openai` npm package.

### v2 Status

Check if skill branch is v2-compatible.

### How to Apply in v2

1. Check if `upstream/skill/voice-transcription` is compatible with v2
2. If yes, merge the skill branch
3. If not, the core logic: download audio from WhatsApp, send to OpenAI Whisper API, replace audio message with transcribed text
4. Requires `OPENAI_API_KEY` env var
