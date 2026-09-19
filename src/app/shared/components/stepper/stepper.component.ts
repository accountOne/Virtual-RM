import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

/** Small horizontal step indicator for a multi-stage flow (first used by Transfer's existing
 * editing → previewing → submitted stages, per the mockup's "1 Nhập thông tin · 2 Xem lại ·
 * 3 Hoàn tất" pill row). Purely presentational — the caller owns its own stage signal/enum and
 * just passes the current index in. */
@Component({
  selector: 'app-stepper',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center gap-1.5" role="list" aria-label="Các bước thực hiện">
      <ng-container *ngFor="let step of steps; let i = index; let last = last">
        <div class="flex items-center gap-1.5 text-xs font-medium" [class.text-brand-600]="i <= activeIndex" [class.text-ink-400]="i > activeIndex" role="listitem">
          <span
            class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
            [class.bg-brand-500]="i < activeIndex"
            [class.text-white]="i < activeIndex"
            [class.border]="i >= activeIndex"
            [class.border-brand-400]="i === activeIndex"
            [class.text-brand-600]="i === activeIndex"
            [class.border-ink-200]="i > activeIndex"
            [class.text-ink-400]="i > activeIndex"
          >
            <span *ngIf="i < activeIndex">✓</span>
            <span *ngIf="i >= activeIndex">{{ i + 1 }}</span>
          </span>
          <span class="hidden sm:inline">{{ step.label }}</span>
        </div>
        <span *ngIf="!last" class="flex-1 h-px" [class.bg-brand-300]="i < activeIndex" [class.bg-ink-200]="i >= activeIndex"></span>
      </ng-container>
    </div>
  `,
})
export class StepperComponent {
  @Input({ required: true }) steps: { label: string }[] = [];
  @Input() activeIndex = 0;
}
