import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { CashflowSummary, Greeting } from '../../../../core/models';
import { VndShortPipe } from '../../../../shared/pipes/vnd.pipe';

/** Phase 5.5 BRD alignment — Daily Dashboard greeting + cashflow (docs/phase-5.5-daily-dashboard.md).
 * Replaces the old BriefingCardComponent's hard-coded "Chào buổi sáng" (which never actually
 * varied by time of day) with the real time-of-day-aware greeting from the new Daily Dashboard
 * endpoint, built on the Reasoning/Priority Engine rather than the legacy rm.service.ts path. */
@Component({
  selector: 'app-daily-greeting-card',
  standalone: true,
  imports: [CommonModule, VndShortPipe],
  template: `
    <div class="card p-5" *ngIf="greeting as g">
      <div class="flex items-start justify-between gap-3 mb-4">
        <p class="text-base font-semibold text-ink-800 leading-relaxed">{{ g.message }}</p>
        <div class="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-lg shrink-0">👩‍💼</div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3" *ngIf="cashflow as c">
        <div class="rounded-xl bg-ink-50 p-3">
          <p class="text-xs text-ink-400 mb-1">💰 Số dư hiện tại</p>
          <p class="text-sm font-semibold text-ink-800">{{ c.currentBalance | vndShort }}</p>
        </div>
        <div class="rounded-xl bg-ink-50 p-3">
          <p class="text-xs text-ink-400 mb-1">📥 Tiền vào hôm nay</p>
          <p class="text-sm font-semibold text-positive">+{{ c.totalIncoming | vndShort }}</p>
        </div>
        <div class="rounded-xl bg-ink-50 p-3">
          <p class="text-xs text-ink-400 mb-1">📤 Tiền ra hôm nay</p>
          <p class="text-sm font-semibold text-negative">-{{ c.totalOutgoing | vndShort }}</p>
        </div>
        <div class="rounded-xl bg-ink-50 p-3">
          <p class="text-xs text-ink-400 mb-1">📊 Chênh lệch</p>
          <p class="text-sm font-semibold" [class.text-positive]="c.net >= 0" [class.text-negative]="c.net < 0">
            {{ c.net >= 0 ? '+' : '' }}{{ c.net | vndShort }}
          </p>
        </div>
      </div>

      <div class="mt-4 rounded-xl bg-brand-50 border border-brand-100 p-4" *ngIf="cashflow?.insight">
        <p class="text-xs font-semibold text-brand-700 mb-1">💡 Dòng tiền</p>
        <p class="text-sm text-brand-700 leading-relaxed">{{ cashflow?.insight }}</p>
      </div>
    </div>
  `,
})
export class DailyGreetingCardComponent {
  @Input() greeting: Greeting | null = null;
  @Input() cashflow: CashflowSummary | null = null;
}
