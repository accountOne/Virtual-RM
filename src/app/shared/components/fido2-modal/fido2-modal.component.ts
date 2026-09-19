import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Fido2Service } from '../../../core/services/fido2.service';
import { HERO_DARK_BG } from '../../ui-tokens';

/**
 * Renders the "Demo FIDO2" authenticating/success takeover — presentational only, driven entirely
 * by `Fido2Service.step()`/`.copy()`. Mounted once at `AppComponent` level (same pattern as
 * `<app-confirm-dialog>`/`<app-toast-container>`), so both call sites (login, transaction
 * approval) share one instance instead of each page owning its own markup.
 *
 * Full-bleed dark screen (the same `HERO_DARK_BG` as login), not a small white card floating over
 * a dimmed backdrop — matches the mockup's dedicated "Xác thực bằng FIDO2" screen, which fills the
 * whole viewport rather than reading as a dialog interrupting another page.
 *
 * Always visibly labeled "Demo FIDO2" (spec §20 — a mock security step must never look like a
 * production implementation) — this is a simulated timing/animation only, no
 * `navigator.credentials` call anywhere.
 */
@Component({
  selector: 'app-fido2-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="fido2.step() !== 'idle'"
      class="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 p-6 text-white text-center"
      [style.background]="heroBg"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="fido2.copy().title"
    >
      <span class="absolute top-6 left-6 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 border border-white/15">🔐 Demo FIDO2</span>

      <div class="relative w-28 h-28 flex items-center justify-center">
        <ng-container *ngIf="fido2.step() === 'authenticating'">
          <span class="absolute inset-0 rounded-full bg-brand-400/20 animate-ping"></span>
          <span class="absolute inset-3 rounded-full border border-brand-300/40 animate-pulse"></span>
          <span class="relative w-16 h-16 rounded-full bg-white/10 border border-white/20 backdrop-blur flex items-center justify-center text-3xl">
            🔑
          </span>
        </ng-container>
        <ng-container *ngIf="fido2.step() === 'success'">
          <span class="w-20 h-20 rounded-full bg-positive/20 border border-positive/40 flex items-center justify-center">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" class="text-positive">
              <path
                d="M5 12.5l4.5 4.5L19 7"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                pathLength="1"
                class="fido2-check-path"
              />
            </svg>
          </span>
        </ng-container>
      </div>

      <div>
        <h3 class="text-xl font-semibold">{{ fido2.copy().title }}</h3>
        <p class="text-sm text-white/70 mt-1.5 max-w-xs mx-auto">
          {{ fido2.step() === 'success' ? 'Xác thực thành công' : fido2.copy().subtitle }}
        </p>
        <p *ngIf="fido2.step() === 'authenticating'" class="text-xs text-white/50 mt-3 max-w-xs mx-auto">
          Đang chờ xác thực... Chạm vào khoá bảo mật hoặc hoàn tất sinh trắc học
        </p>
      </div>

      <button
        *ngIf="fido2.step() === 'authenticating'"
        type="button"
        class="w-full max-w-xs !py-3 !text-base rounded-lg font-medium border border-white/30 text-white hover:bg-white/10 transition-colors"
        (click)="fido2.cancel()"
      >
        Huỷ
      </button>
    </div>
  `,
  styles: [
    `
      .fido2-check-path {
        stroke-dasharray: 1;
        stroke-dashoffset: 1;
        animation: fido2-draw 0.4s ease-out forwards;
      }
      @keyframes fido2-draw {
        to {
          stroke-dashoffset: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .fido2-check-path {
          animation: none;
          stroke-dashoffset: 0;
        }
      }
    `,
  ],
})
export class Fido2ModalComponent {
  readonly fido2 = inject(Fido2Service);
  readonly heroBg = HERO_DARK_BG;
}
