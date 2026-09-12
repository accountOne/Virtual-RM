import { Injectable, signal } from '@angular/core';

// Phase 5.6 follow-up — voice input/output for the full-screen chat. Uses the browser's native
// Web Speech API only (SpeechRecognition for input, SpeechSynthesis for output) — no new
// dependency, and both degrade gracefully: `supported` feature-detects recognition so the mic
// button can disable itself on browsers without it (Firefox desktop, most non-Chromium engines),
// while `speak()` no-ops silently if `speechSynthesis` isn't present at all.
//
// SpeechRecognition is a non-standard API (webkit-prefixed on most engines) and isn't part of
// TypeScript's DOM lib — these are the minimal shapes this file actually uses, not a full spec.

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

const SPEECH_OUTPUT_KEY = 'vrm_voice_output';
const RECOGNITION_LANG = 'vi-VN';

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

@Injectable({ providedIn: 'root' })
export class RmVoiceService {
  private readonly recognitionCtor = getRecognitionCtor();
  private recognition: SpeechRecognitionLike | null = null;

  /** True while a voice-input capture is active. */
  readonly listening = signal(false);
  /** Feature-detected once at construction — the mic button disables itself when false. */
  readonly supported = signal(!!this.recognitionCtor);
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

  /** Starts one voice-input capture. `onInterim` streams partial transcripts (for live UI
   * feedback); `onFinal` fires once with the final transcript when the browser detects the
   * customer stopped talking. No-ops if the API isn't supported or a capture is already running. */
  startListening(onInterim: (text: string) => void, onFinal: (text: string) => void): void {
    if (!this.recognitionCtor || this.listening()) return;
    const recognition = new this.recognitionCtor();
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

  stopListening(): void {
    this.recognition?.stop();
    this.recognition = null;
    this.listening.set(false);
  }

  /** Reads text aloud if voice output is enabled. Silently no-ops otherwise, or if the browser
   * has no `speechSynthesis` at all. */
  speak(text: string): void {
    if (!this.speechEnabled() || !text || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = RECOGNITION_LANG;
    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking(): void {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}

function loadSpeechEnabled(): boolean {
  try {
    return localStorage.getItem(SPEECH_OUTPUT_KEY) === '1';
  } catch {
    return false;
  }
}
