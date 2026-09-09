import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RmDataService } from '../../core/services/rm-data.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { VndPipe } from '../../shared/pipes/vnd.pipe';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, VndPipe],
  template: `
    <div class="max-w-4xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <h1 class="text-xl font-semibold text-ink-800">Báo cáo</h1>

      <div class="card p-5">
        <h2 class="text-sm font-semibold text-ink-800 mb-3">Dòng tiền theo danh mục (30 ngày gần nhất)</h2>
        <div class="space-y-2.5">
          <div *ngFor="let row of categoryBreakdown()" class="flex items-center gap-3">
            <span class="text-xs text-ink-500 w-36 shrink-0 truncate">{{ row.category }}</span>
            <div class="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
              <div class="h-full bg-brand-400 rounded-full" [style.width.%]="row.pct"></div>
            </div>
            <span class="text-xs text-ink-500 w-24 text-right shrink-0">{{ row.amount | vnd }}</span>
          </div>
        </div>
        <app-empty-state *ngIf="categoryBreakdown().length === 0" icon="📊" title="Chưa có dữ liệu báo cáo" />
      </div>

      <div class="card p-5">
        <h2 class="text-sm font-semibold text-ink-800 mb-2">Báo cáo chi tiết</h2>
        <p class="text-sm text-ink-500">
          Các báo cáo tuỳ chỉnh (dòng tiền, đối chiếu số dư, hiệu suất chi phí) sẽ sớm được bổ sung. Anh/chị có thể hỏi
          Virtual RM để nhận nhanh các số liệu tổng hợp ngay bây giờ.
        </p>
      </div>
    </div>
  `,
})
export class ReportsPageComponent {
  readonly rmData = inject(RmDataService);

  categoryBreakdown() {
    const debits = this.rmData.transactions().filter((t) => t.type === 'DEBIT' && t.status !== 'REJECTED');
    const byCategory = new Map<string, number>();
    for (const t of debits) {
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
    }
    const total = [...byCategory.values()].reduce((s, v) => s + v, 0) || 1;
    return [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount, pct: Math.round((amount / total) * 100) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }
}
