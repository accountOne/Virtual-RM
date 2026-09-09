import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center py-10 gap-3">
      <div class="w-8 h-8 rounded-full border-2 border-ink-200 border-t-brand-500 animate-spin"></div>
      <p class="text-xs text-ink-400">{{ label }}</p>
    </div>
  `,
})
export class LoadingSpinnerComponent {
  @Input() label = 'Đang tải...';
}
