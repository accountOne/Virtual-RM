import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';

// Phase 5.6 follow-up — voice input/output for the full-screen chat.
//
// Output (TTS): tries the backend's cloud endpoint first (POST /api/voice/speak — Gemini TTS,
// natural-sounding Vietnamese; see server/src/voice/gemini-voice-client.ts) and falls back to the
// browser's own `speechSynthesis` if that call fails for any reason (no GEMINI_API_KEY configured
// on the server, network error, free-tier quota exhausted — Gemini's free tier caps TTS at a low
// per-day request count, so this fallback is the COMMON case in practice, not a rare edge case —
// never a hard failure, just a lower-quality voice.
//
// Input (STT): records audio with MediaRecorder (supported on every mainstream browser,
// including Safari/iOS — unlike SpeechRecognition, which Safari never implemented; that gap was
// the actual cause of the mic silently doing nothing there) and sends it to the backend's cloud
// endpoint (POST /api/voice/transcribe — Gemini) for transcription. Falls back to the older
// browser-native SpeechRecognition only on the rare browser with no MediaRecorder at all.
const SPEECH_OUTPUT_KEY = 'vrm_voice_output';
const RECOGNITION_LANG = 'vi-VN';
const RECORDER_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
// Minimal valid 44-byte WAV (PCM, 8kHz, 8-bit, zero-length silent data) — used only to "unlock"
// programmatic audio playback on iOS Safari (see unlockAudio() below), never actually heard.
const SILENT_WAV_DATA_URI = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

interface CloudSpeakResponse {
  audioBase64: string;
  mimeType: string;
}
interface CloudTranscribeResponse {
  text: string;
}

// SpeechRecognition is a non-standard, webkit-prefixed API not in TypeScript's DOM lib — the
// minimal shape this file's fallback path actually uses, not a full spec.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function getSupportedRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return RECORDER_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

@Injectable({ providedIn: 'root' })
export class RmVoiceService {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  private readonly recognitionCtor = getRecognitionCtor();
  private readonly recorderMimeType = getSupportedRecorderMimeType();
  private recognition: SpeechRecognitionLike | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  // One reusable <audio> element instead of a fresh `new Audio()` per reply — see unlockAudio().
  private readonly audioEl = typeof Audio !== 'undefined' ? new Audio() : null;
  private audioUnlocked = false;
  /** Resolves the in-flight `speak()` call's promise early — set only while a speak() is
   * actually in progress, so `stopSpeaking()` can unblock a caller awaiting completion (a real
   * sequential queue needs `speak()` to resolve on STOP too, not just on natural end, or an
   * interrupted message would hang the whole queue forever). */
  private pendingSpeechResolve: (() => void) | null = null;

  /** True while a voice-input capture (recording, or mid-transcription waiting on the cloud) is
   * in progress — the mic button reflects this. */
  readonly listening = signal(false);
  /** Feature-detected once at construction: MediaRecorder (works on Safari/iOS too) or, failing
   * that, the older SpeechRecognition. The mic button disables itself when neither exists. */
  readonly supported = signal(!!this.recorderMimeType || !!this.recognitionCtor);
  /** Voice OUTPUT toggle (RM replies read aloud). Off by default; persisted across reloads. */
  readonly speechEnabled = signal(loadSpeechEnabled());

  toggleSpeechOutput(): void {
    const next = !this.speechEnabled();
    this.speechEnabled.set(next);
    try {
      localStorage.setItem(SPEECH_OUTPUT_KEY, next ? '1' : '0');
    } catch {
      // ignore — the toggle just won't survive a reload
    }
    if (next) this.unlockAudio();
    else this.stopSpeaking();
  }

  /** iOS Safari (and some other WebKit browsers) only allow `HTMLAudioElement.play()` without a
   * direct user gesture once that SAME element has already successfully played as a direct
   * result of one. `speak()` below is triggered automatically — seconds after the user's actual
   * tap, once an RM reply arrives via `effect()` in virtual-rm-chat.page.ts — which is well
   * outside any gesture WebKit still recognizes, so auto-played replies silently produced no
   * sound at all on iPhone even when voice output was toggled on and a real API key was
   * configured server-side. Call this synchronously from a genuine gesture handler (the send
   * button, the mic button, or this toggle) to "prime" the one shared `audioEl` with a silent
   * clip; every later `playBase64Audio()` call reuses that same already-unlocked element instead
   * of a fresh one, so it keeps working without needing a gesture each time. Idempotent/cheap to
   * call from multiple gesture entry points. */
  unlockAudio(): void {
    if (this.audioUnlocked || !this.audioEl) return;
    this.audioUnlocked = true;
    this.audioEl.src = SILENT_WAV_DATA_URI;
    this.audioEl.play().catch(() => {
      // If even the silent clip is blocked, allow a retry on the next gesture instead of
      // permanently giving up.
      this.audioUnlocked = false;
    });
    this.primeSpeechSynthesis();
  }

  /** `speechSynthesis.speak()` on iOS Safari has a stricter version of the same restriction
   * unlockAudio() above works around for `<audio>` — every call must be directly, synchronously
   * gesture-connected; there is no fully-reliable "unlock once, reuse later" guarantee like
   * `<audio>.play()` has. Speaking an empty utterance from within a real gesture (immediately
   * cancelled) is a commonly-used best-effort priming trick that measurably helps on many iOS
   * Safari versions even though it is not part of any spec — worth doing since it's nearly free,
   * but this is the browser fallback path (used whenever cloud TTS is down or, in practice, quota-
   * exhausted — see the top-of-file comment), so it may still occasionally miss on iOS regardless. */
  private primeSpeechSynthesis(): void {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  }

  /** Starts one voice-input capture. `onInterim` gives immediate UI feedback while
   * recording/transcribing (there's no true partial transcript with the cloud approach — Whisper
   * only returns a final result); `onFinal` fires once with the transcribed text. No-ops if
   * unsupported or a capture is already running. */
  async startListening(onInterim: (text: string) => void, onFinal: (text: string) => void): Promise<void> {
    if (this.listening()) return;
    if (this.recorderMimeType && navigator.mediaDevices) {
      await this.startCloudRecording(onInterim, onFinal);
    } else if (this.recognitionCtor) {
      this.startBrowserRecognition(onInterim, onFinal);
    }
  }

  stopListening(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop(); // triggers onstop below, which transcribes + cleans up
      return;
    }
    this.recognition?.stop();
    this.recognition = null;
    this.listening.set(false);
  }

  private async startCloudRecording(onInterim: (text: string) => void, onFinal: (text: string) => void): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.toast.error('Không thể truy cập micro. Vui lòng kiểm tra quyền truy cập micro cho trình duyệt.');
      return;
    }
    this.mediaStream = stream;
    const mimeType = this.recorderMimeType as string;
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      this.mediaStream?.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
      onInterim('⏳ Đang nhận diện giọng nói...');
      try {
        const blob = new Blob(chunks, { type: mimeType });
        const audioBase64 = await blobToBase64(blob);
        const res = await firstValueFrom(this.http.post<CloudTranscribeResponse>('/api/voice/transcribe', { audioBase64, mimeType }));
        if (res.text?.trim()) onFinal(res.text.trim());
        else this.toast.error('Không nhận diện được nội dung. Anh/chị thử nói lại nhé.');
      } catch {
        this.toast.error('Không thể nhận diện giọng nói lúc này. Anh/chị vui lòng nhập trực tiếp.');
      } finally {
        this.listening.set(false);
        this.mediaRecorder = null;
      }
    };
    this.mediaRecorder = recorder;
    this.listening.set(true);
    onInterim('🎙️ Đang nghe...');
    recorder.start();
  }

  private startBrowserRecognition(onInterim: (text: string) => void, onFinal: (text: string) => void): void {
    const recognition = new (this.recognitionCtor as SpeechRecognitionCtor)();
    recognition.lang = RECOGNITION_LANG;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (interimText) onInterim(interimText);
      if (finalText) onFinal(finalText);
    };
    recognition.onerror = () => this.listening.set(false);
    recognition.onend = () => this.listening.set(false);
    this.recognition = recognition;
    this.listening.set(true);
    recognition.start();
  }

  /** Reads text aloud if voice output is enabled: cloud TTS first (natural-sounding, see
   * server/src/voice/gemini-voice-client.ts), falling back to the browser's own `speechSynthesis`
   * if that call fails for any reason (no key configured, network error, free-tier quota, ...).
   * The returned promise resolves only once playback actually FINISHES (or is stopped) — not just
   * once it starts — so `RmVoiceQueueService` can safely await one message before starting the
   * next instead of letting replies overlap. No-op (resolves immediately) when voice output is
   * off or the text is empty, so a queue awaiting this never hangs on a muted session. */
  async speak(text: string): Promise<void> {
    if (!this.speechEnabled() || !text) return;
    try {
      const res = await firstValueFrom(this.http.post<CloudSpeakResponse>('/api/voice/speak', { text }));
      await this.playBase64Audio(res.audioBase64, res.mimeType);
    } catch {
      await this.speakBrowser(text);
    }
  }

  /** Stops whatever is currently playing/speaking and immediately resolves the `speak()` call
   * that was waiting on it, if any — required so a queue's `await speak(...)` can't be left
   * hanging forever by an interrupted message. */
  stopSpeaking(): void {
    this.audioEl?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.resolvePendingSpeech();
  }

  /** Best-effort pause/resume of whatever is currently playing — both `<audio>` and
   * `speechSynthesis` support pausing in place natively; used by `RmVoiceQueueService`'s PAUSED
   * state. Does not resolve the pending `speak()` promise (unlike `stopSpeaking()`) since the
   * message isn't actually finished. */
  pauseSpeaking(): void {
    this.audioEl?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.pause();
  }

  resumeSpeaking(): void {
    if (this.audioEl && this.audioEl.src && this.audioEl.paused) void this.audioEl.play().catch(() => {});
    if ('speechSynthesis' in window) window.speechSynthesis.resume();
  }

  private resolvePendingSpeech(): void {
    const resolve = this.pendingSpeechResolve;
    this.pendingSpeechResolve = null;
    resolve?.();
  }

  private playBase64Audio(base64: string, mimeType: string): Promise<void> {
    if (!this.audioEl) return Promise.resolve();
    return new Promise((resolve) => {
      this.pendingSpeechResolve = resolve;
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      this.audioEl!.src = url;
      const finish = () => {
        URL.revokeObjectURL(url);
        this.resolvePendingSpeech();
      };
      this.audioEl!.onended = finish;
      this.audioEl!.play().catch(finish);
    });
  }

  private speakBrowser(text: string): Promise<void> {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    return new Promise((resolve) => {
      this.pendingSpeechResolve = resolve;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = RECOGNITION_LANG;
      utterance.onend = () => this.resolvePendingSpeech();
      utterance.onerror = () => this.resolvePendingSpeech();
      window.speechSynthesis.speak(utterance);
    });
  }
}

function loadSpeechEnabled(): boolean {
  try {
    return localStorage.getItem(SPEECH_OUTPUT_KEY) === '1';
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error as DOMException);
    reader.readAsDataURL(blob);
  });
}
