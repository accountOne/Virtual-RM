import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { CommandWarning } from '../../../core/services/commands.service';

/** Renders a BankingCommand's warnings — used by BOTH the Maker form and the Checker detail
 * screen (spec §11: "Không dùng màu hoặc wording khác nhau giữa Maker và Checker"). One
 * component, one set of severity styles, so the two screens can never visually drift apart. */
@Component({
  selector: 'app-warning-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-2" *ngIf="warnings.length">
      <div
        *ngFor="let w of warnings"
        class="rounded-lg border px-3 py-2.5 text-sm flex items-start gap-2.5"
        [ngClass]="{
          'bg-sky-50 border-sky-200 text-sky-800': w.severity === 'INFO',
          'bg-amber-50 border-amber-200 text-amber-800': w.severity === 'WARNING',
          'bg-orange-50 border-orange-300 text-orange-800': w.severity === 'HIGH',
          'bg-red-50 border-red-300 text-red-800': w.severity === 'BLOCKING'
        }"
      >
        <span class="text-base leading-none mt-0.5">{{ iconFor(w.severity) }}</span>
        <div class="min-w-0">
          <p class="font-medium">{{ w.title }}</p>
          <p class="opacity-90 mt-0.5">{{ w.message }}</p>
          <p class="text-xs opacity-60 mt-1" *ngIf="w.blocking">Không thể gửi/duyệt cho đến khi khắc phục — mã: {{ w.code }}</p>
          <p class="text-xs opacity-60 mt-1" *ngIf="!w.blocking">Cảnh báo, vẫn có thể tiếp tục — mã: {{ w.code }}</p>
        </div>
      </div>
    </div>
  `,
})
export class WarningPanelComponent {
  @Input() warnings: CommandWarning[] = [];

  iconFor(severity: CommandWarning['severity']): string {
    switch (severity) {
      case 'INFO':
        return 'ℹ️';
      case 'WARNING':
        return '⚠️';
      case 'HIGH':
        return '🔶';
      case 'BLOCKING':
        return '⛔';
    }
  }
}
