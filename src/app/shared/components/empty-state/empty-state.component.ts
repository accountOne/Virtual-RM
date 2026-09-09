import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col items-center justify-center text-center py-10 px-4">
      <div class="w-12 h-12 rounded-full bg-ink-100 flex items-center justify-center text-2xl mb-3">{{ icon }}</div>
      <p class="text-sm font-medium text-ink-700">{{ title }}</p>
      <p *ngIf="subtitle" class="text-xs text-ink-400 mt-1 max-w-xs">{{ subtitle }}</p>
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() icon = '📭';
  @Input() title = 'Không có dữ liệu';
  @Input() subtitle = '';
}
