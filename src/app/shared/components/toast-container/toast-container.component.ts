import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

const ICONS: Record<string, string> = {
  success: '✅',
  error: '⚠️',
  info: 'ℹ️',
};

const TONE_CLASSES: Record<string, string> = {
  success: 'border-l-4 border-positive',
  error: 'border-l-4 border-negative',
  info: 'border-l-4 border-brand-500',
};

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed z-50 bottom-4 right-4 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm">
      <div
        *ngFor="let toast of toastService.toasts()"
        class="card px-4 py-3 flex items-start gap-2 animate-[fadeIn_.2s_ease-out]"
        [ngClass]="toneClasses[toast.kind]"
      >
        <span>{{ icons[toast.kind] }}</span>
        <p class="text-sm text-ink-700 flex-1">{{ toast.message }}</p>
        <button class="text-ink-300 hover:text-ink-600" (click)="toastService.dismiss(toast.id)">✕</button>
      </div>
    </div>
  `,
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);
  readonly icons = ICONS;
  readonly toneClasses = TONE_CLASSES;
}
