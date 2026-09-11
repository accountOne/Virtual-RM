import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { ApprovalSummary } from '../../../../core/models';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { VndPipe } from '../../../../shared/pipes/vnd.pipe';

/** Phase 5.5 BRD alignment — Pending Approval card (spec §9): oldest-first, age, expiry-risk
 * warning, CTA to the approval screen. Data from GET /api/virtual-rm/daily-dashboard
 * (server/src/reasoning/approval-risk.ts). */
@Component({
  selector: 'app-pending-approvals-card',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, VndPipe],
  template: `
    <div class="card p-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-ink-800">📝 Lệnh chờ duyệt</h3>
        <span class="text-xs text-ink-400" *ngIf="summary">{{ summary.count }} lệnh</span>
      </div>

      <app-empty-state *ngIf="!summary || summary.count === 0" icon="✅" title="Không có lệnh nào chờ duyệt" subtitle="Mọi lệnh đã được xử lý." />

      <div class="space-y-2.5" *ngIf="summary">
        <div *ngFor="let item of summary.items" class="rounded-lg border border-ink-100 p-3.5 flex items-start gap-3">
          <span class="text-base leading-none mt-0.5">{{ item.expiringSoon ? '🔴' : '🟢' }}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-ink-800">{{ item.description }}</p>
            <p class="text-xs text-ink-500 mt-0.5">{{ item.amount | vnd: item.currency }}</p>
            <p class="text-xs mt-1" [class.text-negative]="item.expiringSoon" [class.text-ink-400]="!item.expiringSoon">
              Chờ {{ item.ageDays }} ngày
              <span *ngIf="item.expiringSoon">— ⚠️ Sắp hết hạn duyệt (còn {{ item.daysRemaining }} ngày)</span>
            </p>
          </div>
        </div>
      </div>

      <div class="flex justify-center pt-3" *ngIf="summary && summary.count > 0">
        <button class="btn-secondary text-xs" (click)="router.navigateByUrl('/payments/approval')">Xem lệnh chờ duyệt</button>
      </div>
    </div>
  `,
})
export class PendingApprovalsCardComponent {
  @Input() summary: ApprovalSummary | null = null;

  constructor(readonly router: Router) {}
}
