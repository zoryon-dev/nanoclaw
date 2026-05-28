# 13 — Media Pipeline: Voice Transcription + Image Vision (2026-05)

Added since the 2026-04-28 sync. Host-side normalization/transcription plus
container-side multimodal content blocks. Based on the `add-voice-transcription`
and `add-image-vision` skills but implemented as custom code (do not assume the
upstream skills are byte-identical — reapply the code below).

**Custom — always reapply.**

## Dependencies (host `package.json`)

Add runtime deps:

```json
"openai": "^6.35.0",
"sharp": "^0.34.5"
```

Run `npm install` to refresh the lockfile.

## 1. Voice transcription — `src/transcription.ts` (new)

Transcribes audio attachments via OpenAI Whisper. Returns `null` (caller uses a
fallback string) when the key is missing or the call fails.

```typescript
import { readEnvFile } from './env.js';
import { log } from './log.js';

const FALLBACK = '[Voice Message - transcription unavailable]';

export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string | undefined,
  name: string | undefined,
): Promise<string | null> {
  const apiKey = readEnvFile(['OPENAI_API_KEY']).OPENAI_API_KEY;
  if (!apiKey) {
    log.warn('OPENAI_API_KEY not set — voice messages will not be transcribed');
    return null;
  }
  try {
    const { default: OpenAI, toFile } = await import('openai');
    const openai = new OpenAI({ apiKey });
    const filename = name || (mimeType?.includes('ogg') ? 'voice.ogg' : 'voice.mp3');
    const file = await toFile(buffer, filename, mimeType ? { type: mimeType } : undefined);
    const transcript = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'text',
    });
    const text = (transcript as unknown as string).trim();
    log.info('Transcribed voice message', { chars: text.length, bytes: buffer.length });
    return text || null;
  } catch (err) {
    log.error('OpenAI transcription failed', { err });
    return null;
  }
}

export const TRANSCRIPTION_FALLBACK = FALLBACK;
```

> NOTE: `readEnvFile` is the fork's env accessor. If upstream's env API changed,
> swap to the current accessor but keep the `OPENAI_API_KEY` lookup.

## 2. Image normalization — `src/image.ts` (new) + `src/image.test.ts`

Normalizes inbound images (HEIC, oversized) to JPEG, longest edge ≤ 1568px, so
they fit the agent-runner formatter limits (jpeg/png/gif/webp, ≤ ~6.7MB base64).

```typescript
import sharp from 'sharp';
import { log } from './log.js';

const MAX_EDGE_PX = 1568;
const JPEG_QUALITY = 85;
export const NEEDS_NORMALIZATION_THRESHOLD = 6_000_000; // base64 chars
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export interface NormalizeResult {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

export async function normalizeImage(buffer: Buffer, mimeType: string | undefined): Promise<NormalizeResult> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const longestEdge = Math.max(width, height);
  const needsResize = longestEdge > MAX_EDGE_PX;

  let pipeline = sharp(buffer);
  if (needsResize) {
    pipeline = pipeline.resize(MAX_EDGE_PX, MAX_EDGE_PX, { fit: 'inside', withoutEnlargement: true });
  }
  const outBuffer = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  const outMeta = await sharp(outBuffer).metadata();
  return {
    buffer: outBuffer,
    mimeType: 'image/jpeg',
    width: outMeta.width ?? width,
    height: outMeta.height ?? height,
  };
}
```

Recreate `src/image.test.ts` covering: resize of oversized, passthrough-to-JPEG
for small supported, conversion of unsupported formats.

## 3. Wire into `src/channels/chat-sdk-bridge.ts`

Imports at top:

```typescript
import { transcribeAudio, TRANSCRIPTION_FALLBACK } from '../transcription.js';
import { normalizeImage } from '../image.js';
```

In the attachment download loop, branch by type before assigning base64:

```typescript
if (att.type === 'image') {
  try {
    const normalized = await normalizeImage(buffer, att.mimeType);
    entry.data = normalized.buffer.toString('base64');
    entry.mimeType = normalized.mimeType;
    entry.width = normalized.width;
    entry.height = normalized.height;
  } catch (imgErr) {
    log.warn('Failed to normalize image, falling back to raw', { name: att.name, err: imgErr });
    entry.data = buffer.toString('base64');
  }
} else {
  entry.data = buffer.toString('base64');
}
if (att.type === 'audio') {
  const transcript = await transcribeAudio(buffer, att.mimeType, att.name);
  entry.transcript = transcript ?? TRANSCRIPTION_FALLBACK;
  voiceTranscripts.push(transcript ?? TRANSCRIPTION_FALLBACK);
}
```

After the loop, prepend voice transcripts to the serialized message text:

```typescript
if (voiceTranscripts.length > 0) {
  const voiceText = voiceTranscripts.map((t) => `[Voice: ${t}]`).join('\n');
  serialized.text = serialized.text ? `${serialized.text}\n${voiceText}` : voiceText;
}
```

> The exact download loop in new upstream may differ — find where attachment
> bytes are turned into base64 and graft these branches there.

## 4. Container image-vision — `container/agent-runner/`

Multimodal content blocks to the Claude SDK. Touches `formatter.ts`,
`poll-loop.ts`, `providers/types.ts`, `providers/claude.ts`.

**`providers/types.ts`** — add image types and extend `QueryInput`:

```typescript
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
export interface ImageAttachment {
  mediaType: ImageMediaType;
  data: string; // base64, no data: prefix
  name?: string;
}
// QueryInput gains:  images?: ImageAttachment[];
```

**`formatter.ts`** — extract validated images from inbound messages:

```typescript
import type { ImageAttachment, ImageMediaType } from './providers/types.js';

const SUPPORTED_IMAGE_TYPES = new Set<ImageMediaType>(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_BASE64_BYTES = 6_700_000;

export function extractImageAttachments(messages: MessageInRow[]): ImageAttachment[] {
  const images: ImageAttachment[] = [];
  for (const msg of messages) {
    const content = parseContent(msg.content);
    const attachments = content.attachments;
    if (!Array.isArray(attachments)) continue;
    for (const att of attachments) {
      if (att?.type !== 'image') continue;
      if (typeof att.data !== 'string' || att.data.length === 0) continue;
      if (att.data.length > MAX_BASE64_BYTES) continue;
      const mediaType = (att.mimeType ?? 'image/jpeg') as ImageMediaType;
      if (!SUPPORTED_IMAGE_TYPES.has(mediaType)) continue;
      images.push({ mediaType, data: att.data, name: att.name });
    }
  }
  return images;
}
```

**`poll-loop.ts`** — extract and pass images to the provider:

```typescript
import { extractImageAttachments } from './formatter.js';
const images = extractImageAttachments(normalMessages);
const query = config.provider.query({
  prompt,
  images: images.length > 0 ? images : undefined,
  continuation,
  // ...
});
```

Log line gains image count:

```typescript
log(
  `Processing ${normalMessages.length} message(s), kinds: ${[...new Set(normalMessages.map((m) => m.kind))].join(',')}` +
    (images.length > 0 ? `, images: ${images.length}` : ''),
);
```

**`providers/claude.ts`** — build multimodal content for the SDK:

```typescript
type SDKContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: ImageAttachment['mediaType']; data: string } };

function buildMultimodalContent(text: string, images: ImageAttachment[]): SDKContentBlock[] {
  const blocks: SDKContentBlock[] = [{ type: 'text', text }];
  for (const img of images) {
    blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
  }
  return blocks;
}
// In query(): use buildMultimodalContent(input.prompt, input.images) when images present, else input.prompt.
```

Recreate `formatter.test.ts` coverage for image extraction (unsupported format,
oversized, missing base64, malformed JSON, multi-message).

> Container `package.json` does NOT need openai/sharp — normalization/transcription
> happen host-side; the container only receives already-normalized base64.
