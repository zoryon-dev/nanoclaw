import { describe, it, expect } from 'vitest';

import { transcribeVoiceAttachments } from './transcription.js';

const audioContent = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    text: '',
    sender: 'Jonas',
    attachments: [
      { type: 'voice', mimeType: 'audio/ogg', size: 1234, data: Buffer.from('fake-ogg').toString('base64') },
    ],
    ...extra,
  });

describe('transcribeVoiceAttachments', () => {
  it('injects [Voice: ...] into text and drops the audio attachment on success', async () => {
    const out = await transcribeVoiceAttachments(audioContent(), async () => 'oi, tudo bem?');
    const parsed = JSON.parse(out);
    expect(parsed.text).toBe('[Voice: oi, tudo bem?]');
    expect(parsed.attachments).toEqual([]);
    expect(parsed.sender).toBe('Jonas'); // other fields preserved
  });

  it('preserves existing text and appends the transcript', async () => {
    const out = await transcribeVoiceAttachments(audioContent({ text: 'legenda' }), async () => 'corpo do audio');
    expect(JSON.parse(out).text).toBe('legenda\n[Voice: corpo do audio]');
  });

  it('falls back when transcription returns null (no key / API error)', async () => {
    const out = await transcribeVoiceAttachments(audioContent(), async () => null);
    const parsed = JSON.parse(out);
    expect(parsed.text).toContain('transcription unavailable');
    expect(parsed.attachments).toEqual([]); // audio still removed; agent knows a voice note arrived
  });

  it('detects audio by audio/* mimeType even when type is generic', async () => {
    const content = JSON.stringify({
      text: '',
      attachments: [{ type: 'file', mimeType: 'audio/mpeg', data: Buffer.from('x').toString('base64') }],
    });
    const out = await transcribeVoiceAttachments(content, async () => 'mp3 transcript');
    expect(JSON.parse(out).text).toBe('[Voice: mp3 transcript]');
  });

  it('leaves non-audio attachments (images) untouched', async () => {
    const content = JSON.stringify({
      text: 'olha isso',
      attachments: [{ type: 'image', mimeType: 'image/jpeg', data: 'zzz' }],
    });
    const out = await transcribeVoiceAttachments(content, async () => 'should-not-run');
    const parsed = JSON.parse(out);
    expect(parsed.text).toBe('olha isso');
    expect(parsed.attachments).toHaveLength(1);
  });

  it('returns content unchanged when there are no attachments', async () => {
    const content = JSON.stringify({ text: 'só texto' });
    expect(await transcribeVoiceAttachments(content, async () => 'x')).toBe(content);
  });

  it('returns content unchanged on non-JSON input', async () => {
    expect(await transcribeVoiceAttachments('not json', async () => 'x')).toBe('not json');
  });
});
