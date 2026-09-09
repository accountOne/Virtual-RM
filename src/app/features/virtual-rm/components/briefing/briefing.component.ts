import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Briefing } from '../../../../core/models';
import { VndPipe } from '../../../../shared/pipes/vnd.pipe';

@Component({
  selector: 'app-briefing-card',
  standalone: true,
  imports: [CommonModule, VndPipe],
  template: `
    <div class="card p-5" *ngIf="briefing as b">
      <div class="flex items-start justify-between gap-3 mb-4">
        <div>
          <p class="text-lg font-semibold text-ink-800">Chào buổi sáng, {{ b.companyName }} 👋</p>
          <p class="text-sm text-ink-500 mt-0.5">Tình hình doanh nghiệp hôm nay</p>
        </div>
        <div class="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-lg shrink-0">👩‍💼</div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div class="rounded-xl bg-ink-50 p-3">
          <p class="text-xs text-ink-400 mb-1">💰 Số dư</p>
          <p class="text-sm font-semibold text-ink-800">{{ b.balanceShort }} VNĐ</p>
        </div>
        <div class="rounded-xl bg-ink-50 p-3">
          <p class="text-xs text-ink-400 mb-1">📥 Tiền vào hôm qua</p>
          <p class="text-sm font-semibold text-positive">+{{ b.incomingYesterday | vnd }}</p>
        </div>
        <div class="rounded-xl bg-ink-50 p-3">
          <p class="text-xs text-ink-400 mb-1">📤 Tiền ra hôm qua</p>
          <p class="text-sm font-semibold text-negative">-{{ b.outgoingYesterday | vnd }}</p>
        </div>
        <div class="rounded-xl bg-ink-50 p-3">
          <p class="text-xs text-ink-400 mb-1">📋 Chờ phê duyệt</p>
          <p class="text-sm font-semibold text-ink-800">{{ b.pendingApprovalCount }} giao dịch</p>
        </div>
        <div class="rounded-xl bg-ink-50 p-3">
          <p class="text-xs text-ink-400 mb-1">📅 Việc cần xử lý</p>
          <p class="text-sm font-semibold text-ink-800">{{ b.tasksOpenCount }} việc</p>
        </div>
      </div>

      <div class="mt-4 rounded-xl bg-brand-50 border border-brand-100 p-4">
        <p class="text-xs font-semibold text-brand-700 mb-1">💡 RM Insight</p>
        <p class="text-sm text-brand-700 leading-relaxed">{{ b.insight.message }}</p>
      </div>
    </div>
  `,
})
export class BriefingCardComponent {
  @Input({ required: true }) briefing!: Briefing | null;
}
