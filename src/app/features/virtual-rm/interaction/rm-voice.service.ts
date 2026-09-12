import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';

// Phase 5.6 follow-up — voice input/output for the full-screen chat.
//
// Output (TTS): tries the backend's cloud endpoint first (POST /api/voice/speak — OpenAI
// gpt-4o-mini-tts, natural-sounding Vietnamese; see server/src/voice/openai-voice-client.ts) and
// falls back to the browser's own `speechSynthesis` if that call fails for any reason (no
// OPENAI_API_KEY configured on the server, network error, ...) — never a hard failure, just a
// lower-quality voice.
//
// Input (STT): records audio with MediaRecorder (supported on every mainstream browser,
// including Safari/iOS — unlike SpeechRecognition, which Safari never implemented; that gap was
// the actual cause of the mic silently doing nothing there) and sends it to the backend's cloud
// endpoint (POST /api/voice/transcribe — OpenAI Whisper) for transcription. Falls back to the
// older browser-native SpeechRecognition only on the rare browser with no MediaRecorder at all.
const SPEECH_OUTPUT_KEY = 'vrm_voice_output';
const RECOGNITION_LANG = 'vi-VN';
const RECORDER_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

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
  private currentAudio: HTMLAudioElement | null = null;

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
    if (!next) this.stopSpeaking();
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
   * server/src/voice/openai-voice-client.ts), falling back to the browser's own `speechSynthesis`
   * if that call fails for any reason (no key configured, network error, ...). */
  async speak(text: string): Promise<void> {
    if (!this.speechEnabled() || !text) return;
    try {
      const res = await firstValueFrom(this.http.post<CloudSpeakResponse>('/api/voice/speak', { text }));
      this.playBase64Audio(res.audioBase64, res.mimeType);
    } catch {
      this.speakBrowser(text);
    }
  }

  stopSpeaking(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  private playBase64Audio(base64: string, mimeType: string): void {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.currentAudio = audio;
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(() => URL.revokeObjectURL(url));
  }

  private speakBrowser(text: string): void {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = RECOGNITION_LANG;
    window.speechSynthesis.speak(utterance);
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
