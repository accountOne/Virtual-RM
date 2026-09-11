import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { DashboardPriority, PriorityTask } from '../../../../core/models';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { BadgeComponent, BadgeTone } from '../../../../shared/components/badge/badge.component';

const PRIORITY_TONE: Record<DashboardPriority, BadgeTone> = { URGENT: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };
const PRIORITY_LABEL: Record<DashboardPriority, string> = { URGENT: 'Khẩn cấp', HIGH: 'Cao', MEDIUM: 'Trung bình', LOW: 'Thấp' };

/** Phase 5.5 BRD alignment — Urgent Items card (spec §10/§35): top-3 cross-domain priorities
 * with why + CTA, built on the Priority Engine (server/src/reasoning/priority-engine.ts) —
 * the same ranking DAILY_PRIORITY already uses in chat, now also surfaced on the dashboard
 * itself rather than only reachable by asking. */
@Component({
  selector: 'app-urgent-items-card',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, BadgeComponent],
  template: `
    <div class="card p-5">
      <h3 class="text-sm font-semibold text-ink-800 mb-3">🎯 Hôm nay anh/chị nên ưu tiên</h3>

      <app-empty-state *ngIf="items.length === 0" icon="🌿" title="Không có việc gì khẩn cấp" subtitle="Không có mục nào cần ưu tiên đặc biệt hôm nay." />

      <div class="space-y-2.5">
        <div
          *ngFor="let item of items; let i = index"
          class="rounded-lg border border-ink-100 p-3.5 flex items-start gap-3 cursor-pointer hover:border-brand-200"
          (click)="go(item)"
        >
          <span class="text-sm font-semibold text-ink-400 w-4 shrink-0 mt-0.5">{{ i + 1 }}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-sm font-medium text-ink-800">{{ item.title }}</p>
              <app-badge [tone]="priorityTone[item.priority]" [label]="priorityLabel[item.priority]" [dot]="false" />
            </div>
            <p class="text-xs text-ink-500 mt-1">{{ item.reason }}</p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class UrgentItemsCardComponent {
  @Input() items: PriorityTask[] = [];
  readonly priorityTone = PRIORITY_TONE;
  readonly priorityLabel = PRIORITY_LABEL;

  constructor(private readonly router: Router) {}

  go(item: PriorityTask): void {
    if (item.navigation) this.router.navigateByUrl(item.navigation.route);
  }
}
