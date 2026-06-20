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

type Transcriber = (
  buffer: Buffer,
  mimeType: string | undefined,
  name: string | undefined,
) => Promise<string | null>;

function isAudioAttachment(a: Record<string, unknown>): boolean {
  const mt = typeof a.mimeType === 'string' ? a.mimeType : '';
  const ty = typeof a.type === 'string' ? a.type : '';
  return mt.startsWith('audio/') || ty === 'audio' || ty === 'voice';
}

/**
 * Channel-agnostic voice-note handling for the inbound path.
 *
 * Given a message content JSON string, transcribe any audio attachments (base64
 * `data`) via OpenAI Whisper, inject the result into the message `text` as
 * `[Voice: <transcript>]`, and drop the audio attachment so the agent reads the
 * transcript instead of a useless `.ogg` file path. On transcription failure the
 * fallback marker is injected so the agent still knows a voice note arrived.
 *
 * Returns the original string unchanged when there's nothing to do (non-JSON,
 * no attachments, no audio). `transcriber` is injectable for tests.
 */
export async function transcribeVoiceAttachments(
  contentStr: string,
  transcriber: Transcriber = transcribeAudio,
): Promise<string> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(contentStr);
  } catch {
    return contentStr;
  }

  const attachments = parsed.attachments as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(attachments) || attachments.length === 0) return contentStr;

  const audio = attachments.filter((a) => isAudioAttachment(a) && typeof a.data === 'string');
  if (audio.length === 0) return contentStr;

  const transcripts: string[] = [];
  for (const a of audio) {
    const buffer = Buffer.from(a.data as string, 'base64');
    const t = await transcriber(buffer, a.mimeType as string | undefined, a.name as string | undefined);
    transcripts.push(t ? `[Voice: ${t}]` : FALLBACK);
  }

  parsed.attachments = attachments.filter((a) => !(isAudioAttachment(a) && typeof a.data === 'string'));
  const existing = typeof parsed.text === 'string' ? parsed.text : '';
  parsed.text = [existing, ...transcripts].filter((s) => s.length > 0).join('\n');
  return JSON.stringify(parsed);
}
