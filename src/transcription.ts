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
