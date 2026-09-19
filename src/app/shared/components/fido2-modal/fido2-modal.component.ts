import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Fido2Service } from '../../../core/services/fido2.service';

/**
 * Renders the "Demo FIDO2" authenticating/success overlay — presentational only, driven entirely
 * by `Fido2Service.step()`/`.copy()`. Mounted once at `AppComponent` level (same pattern as
 * `<app-confirm-dialog>`/`<app-toast-container>`), so both call sites (login, transaction
 * approval) share one instance instead of each page owning its own modal markup.
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
      class="fixed inset-0 z-[70] bg-ink-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="fido2.copy().title"
    >
      <div class="card w-full max-w-xs p-6 shadow-pop text-center">
        <span class="badge bg-ink-100 text-ink-500 mb-4">🔐 Demo FIDO2</span>

        <div class="relative w-20 h-20 mx-auto mb-5 flex items-center justify-center">
          <ng-container *ngIf="fido2.step() === 'authenticating'">
            <span class="absolute inset-0 rounded-full bg-brand-100 animate-ping"></span>
            <span class="absolute inset-2 rounded-full bg-brand-200/70 animate-pulse"></span>
            <span class="relative w-12 h-12 rounded-full bg-brand-500 text-white flex items-center justify-center text-2xl">
              🔑
            </span>
          </ng-container>
          <ng-container *ngIf="fido2.step() === 'success'">
            <span class="w-16 h-16 rounded-full bg-positive/15 flex items-center justify-center">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" class="text-positive">
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

        <h3 class="text-base font-semibold text-ink-800">{{ fido2.copy().title }}</h3>
        <p class="text-sm text-ink-500 mt-1.5">
          {{ fido2.step() === 'success' ? 'Xác thực thành công' : fido2.copy().subtitle }}
        </p>
        <p *ngIf="fido2.step() === 'authenticating'" class="text-xs text-ink-400 mt-3">
          Đang chờ xác thực... Chạm vào khoá bảo mật hoặc hoàn tất sinh trắc học
        </p>

        <button *ngIf="fido2.step() === 'authenticating'" class="btn-secondary w-full mt-5" (click)="fido2.cancel()">Huỷ</button>
      </div>
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
}
