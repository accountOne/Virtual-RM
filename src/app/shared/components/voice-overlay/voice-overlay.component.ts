import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Number of animated waveform bars — purely decorative, no real audio-level analysis (this repo
 * uses MediaRecorder/cloud STT, not a live Web Audio analyser node, so there's no per-frame
 * amplitude to visualize honestly; staggered CSS animation reads as "listening" without
 * pretending to reflect actual mic input). */
const WAVEFORM_BARS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Full-screen voice-capture visualization (mobile mockup's dedicated "Voice-overlay" screen) —
 * shown while `RmVoiceService.listening()` is true. Purely presentational: wraps the EXISTING
 * STT flow (`virtual-rm-chat.page.ts`'s `toggleVoiceInput()`/`RmVoiceService.startListening()`/
 * `.stopListening()`) without any change to how speech is captured or transcribed. Replaces the
 * previous small-inline-mic-only experience with a dedicated full-screen state; the mic button
 * itself (and its existing click handler) stays exactly where it was as the trigger.
 */
@Component({
  selector: 'app-voice-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="listening"
      class="fixed inset-0 z-[65] text-white flex flex-col items-center justify-center gap-6 p-6"
      style="background: radial-gradient(80% 60% at 50% 35%, rgba(56,189,248,0.4) 0%, rgba(14,116,144,0.2) 25%, transparent 55%), #05070d"
      role="dialog"
      aria-modal="true"
      aria-label="Đang nghe giọng nói"
    >
      <button type="button" class="absolute top-5 right-5 p-2 rounded-full hover:bg-white/10" (click)="stop.emit()" aria-label="Đóng">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>

      <!-- Blue/cyan glow (distinct from the brand-orange used elsewhere) — a "the app is
           listening" state reads as a different color language than brand/primary-action orange
           in the reference mockup. -->
      <div class="relative w-32 h-32 flex items-center justify-center">
        <span class="absolute inset-0 rounded-full bg-sky-400/20 animate-ping"></span>
        <span class="absolute inset-4 rounded-full bg-sky-400/15 animate-pulse"></span>
        <span class="relative w-20 h-20 rounded-full bg-sky-400/25 border border-sky-300/40 backdrop-blur flex items-center justify-center text-sky-100">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </span>
      </div>

      <div class="text-center">
        <p class="text-lg font-semibold">Đang nghe...</p>
        <p class="text-sm text-white/70 mt-1 flex items-center justify-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-negative animate-pulse"></span>
          Đang ghi âm...
        </p>
      </div>

      <div class="flex items-end gap-1 h-8">
        <span *ngFor="let bar of bars" class="w-1 rounded-full bg-sky-300/80 voice-bar" [style.animation-delay.ms]="bar * 90"></span>
      </div>

      <button type="button" class="mt-4 w-14 h-14 rounded-full bg-sky-400/20 hover:bg-sky-400/30 border border-sky-300/30 flex items-center justify-center" (click)="stop.emit()" aria-label="Dừng ghi âm">
        <span class="w-5 h-5 rounded bg-white"></span>
      </button>
    </div>
  `,
  styles: [
    `
      .voice-bar {
        height: 8px;
        animation: voice-bar-bounce 0.9s ease-in-out infinite;
      }
      @keyframes voice-bar-bounce {
        0%,
        100% {
          height: 8px;
        }
        50% {
          height: 28px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .voice-bar {
          animation: none;
          height: 16px;
        }
      }
    `,
  ],
})
export class VoiceOverlayComponent {
  @Input() listening = false;
  @Output() stop = new EventEmitter<void>();

  readonly bars = WAVEFORM_BARS;
}
