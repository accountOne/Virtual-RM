// Cloud voice (TTS + STT) for the Virtual RM chat — via Gemini, reusing the same GEMINI_API_KEY
// already configured for the main AI Agent instead of requiring a second paid provider (this
// replaced an earlier OpenAI-based client — see git history — at the user's explicit request, to
// avoid a second billing account). Plain global `fetch` (Node 18+, no SDK dependency), same "thin
// client over a provider's own REST API" pattern ../ai/ai-client.ts and ../agent/gemini-client.ts
// already use — deliberately NOT the @google/generative-ai SDK gemini-client.ts uses, since that
// SDK (as of this writing) has no TTS/audio-response support; the plain REST endpoint documented
// at ai.google.dev/gemini-api/docs/generate-content/speech-generation does. Both functions throw
// if GEMINI_API_KEY isn't configured; voice.controller.ts catches that (and any request failure)
// and responds with a `fallback: true` signal so the frontend degrades to the browser's own Web
// Speech API instead of failing outright — same "no key configured -> safe fallback, never a hard
// failure" shape gemini-client.ts uses for the Agent's own understanding calls.

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Gemini's TTS-capable models are separate from the text/understanding model gemini-client.ts
// uses (GEMINI_MODEL) — a plain chat model does not support responseModalities: ['AUDIO'].
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Kore';
// Audio *understanding* (transcription), unlike TTS, works fine on Gemini's regular text/chat
// models — reuses GEMINI_MODEL (the same one the Agent's own understanding calls use) unless a
// dedicated GEMINI_STT_MODEL is set.
const GEMINI_STT_MODEL = process.env.GEMINI_STT_MODEL || process.env.GEMINI_MODEL || 'gemini-flash-latest';

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  return key;
}

export function cloudVoiceConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

interface GeminiGenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string; inlineData?: { data?: string; mimeType?: string } }[] } }[];
}

async function callGenerateContent(model: string, body: unknown): Promise<GeminiGenerateContentResponse> {
  const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as GeminiGenerateContentResponse;
}

/** Gemini's TTS response is always raw signed 16-bit little-endian PCM at 24kHz mono (documented
 * at the speech-generation URL above) — unlike OpenAI's TTS, which already returns a ready-to-play
 * mp3, this needs a WAV header wrapped around it before a browser <audio> element can play it. */
function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function synthesizeSpeech(text: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const data = await callGenerateContent(GEMINI_TTS_MODEL, {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } } },
    },
  });
  const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) throw new Error('Gemini TTS returned no audio data');
  return { buffer: pcmToWav(Buffer.from(inlineData.data, 'base64')), mimeType: 'audio/wav' };
}

/** `mimeType` is whatever `MediaRecorder.mimeType` the browser actually recorded with (see
 * rm-voice.service.ts) — stripped of any `;codecs=...` parameter since Gemini's inlineData
 * mimeType expects the bare container type (audio/webm, audio/mp4, ...), not a codec string. */
export async function transcribeSpeech(audio: Buffer, mimeType: string): Promise<string> {
  const bareMimeType = mimeType.split(';')[0].trim();
  const data = await callGenerateContent(GEMINI_STT_MODEL, {
    contents: [
      {
        parts: [
          {
            text: 'Transcribe this audio recording verbatim in Vietnamese. Reply with ONLY the transcribed text — no preamble, no explanation, no quotation marks, no translation.',
          },
          { inlineData: { mimeType: bareMimeType, data: audio.toString('base64') } },
        ],
      },
    ],
    generationConfig: { temperature: 0 },
  });
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return text.trim();
}
