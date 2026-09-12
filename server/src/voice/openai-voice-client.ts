// Cloud voice (TTS + STT) for the Virtual RM chat's voice feature — plain global `fetch`/
// `FormData`/`Blob` (Node 18+, no SDK dependency), matching this repo's existing "thin client
// over a provider's REST API, no vendor SDK" pattern (see ../ai/ai-client.ts). Both functions
// throw if OPENAI_API_KEY isn't configured; voice.controller.ts catches that (and any request
// failure) and responds with a `fallback: true` signal so the frontend degrades to the browser's
// own Web Speech API instead of failing outright — same "no key configured -> safe fallback,
// never a hard failure" shape ai-client.ts already uses for the Reasoning Engine.

const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy';
const OPENAI_STT_MODEL = process.env.OPENAI_STT_MODEL || 'whisper-1';

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  return key;
}

export function cloudVoiceConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function synthesizeSpeech(text: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OPENAI_TTS_MODEL, voice: OPENAI_TTS_VOICE, input: text, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS request failed: ${res.status} ${await res.text()}`);
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType: 'audio/mpeg' };
}

/** `mimeType` is whatever `MediaRecorder.mimeType` the browser actually recorded with (see
 * rm-voice.service.ts) — used only to pick a matching filename extension so OpenAI's API can
 * sniff the container format; it does not need to be exhaustive since every mainstream browser
 * MediaRecorder implementation produces one of these four. */
export async function transcribeSpeech(audio: Buffer, mimeType: string): Promise<string> {
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : mimeType.includes('wav') ? 'wav' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mimeType }), `audio.${ext}`);
  form.append('model', OPENAI_STT_MODEL);
  form.append('language', 'vi');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI STT request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { text: string };
  return data.text;
}
