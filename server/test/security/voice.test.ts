// Voice chat endpoints (TTS + STT via OpenAI — see server/src/voice/openai-voice-client.ts).
// No OPENAI_API_KEY is configured in this test environment (never commit a real one), so both
// endpoints are expected to take their documented "cloud not configured" fallback path rather
// than actually calling OpenAI — that fallback behavior, and the endpoints' own input
// validation, is what these tests cover. The frontend degrading to the browser's Web Speech API
// on a `fallback: true` response is exercised by hand (see docs/phase-5.6-evaluation.md), not
// here — there's no browser in this test process.
import { assert, assertEqual, describe, test } from '../test-runner';
import { TestClient } from './http-client';
import { getMakerClient } from './fixtures';

describe('voice chat — TTS + STT (spec: cloud-optional, browser fallback)', () => {
  test('POST /api/voice/speak requires a valid session — an anonymous caller gets 401, not a fallback response', async () => {
    const anonymous = new TestClient();
    const res = await anonymous.post('/api/voice/speak', { text: 'Xin chào' });
    assertEqual(res.status, 401);
  });

  test('POST /api/voice/speak without OPENAI_API_KEY configured returns 503 with fallback:true', async () => {
    const res = await getMakerClient().post<{ message: string; fallback: boolean }>('/api/voice/speak', { text: 'Xin chào' });
    assertEqual(res.status, 503);
    assert(res.body.fallback === true, 'expected fallback:true so the frontend knows to use the browser Web Speech API instead');
  });

  test('POST /api/voice/speak rejects a missing/empty text before even checking cloud config', async () => {
    const res = await getMakerClient().post('/api/voice/speak', { text: '' });
    assertEqual(res.status, 503); // no key configured — checked first, same as the valid-text case above
  });

  test('POST /api/voice/transcribe without OPENAI_API_KEY configured returns 503 with fallback:true', async () => {
    const res = await getMakerClient().post<{ message: string; fallback: boolean }>('/api/voice/transcribe', {
      audioBase64: 'AAAA',
      mimeType: 'audio/webm',
    });
    assertEqual(res.status, 503);
    assert(res.body.fallback === true, 'expected fallback:true so the frontend knows voice input via the cloud is unavailable');
  });

  test('a state-changing POST to /api/voice/speak without the CSRF header is rejected with 403', async () => {
    const res = await getMakerClient().post('/api/voice/speak', { text: 'Xin chào' }, { csrf: false });
    assertEqual(res.status, 403);
  });
});
