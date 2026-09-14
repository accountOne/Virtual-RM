import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Loan } from '../../core/models';
import { RmDataService } from '../../core/services/rm-data.service';
import { ToastService } from '../../core/services/toast.service';
import { VndPipe } from '../../shared/pipes/vnd.pipe';

/** Rounds a maturity date's remaining days against "today" — display-only, not a business
 * calculation, so a plain client-side diff (no anchorToday fetch) is fine here. */
function daysUntil(dateOnly: string): number {
  const target = new Date(dateOnly + 'T00:00:00Z').getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86_400_000);
}

@Component({
  selector: 'app-loans-page',
  standalone: true,
  imports: [CommonModule, VndPipe],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <h1 class="text-xl font-semibold text-ink-800">Khoản vay</h1>

      <div *ngFor="let loan of activeLoans()" class="card p-5" [class.border-l-4]="loan.dueSoon" [class.border-warn]="loan.dueSoon">
        <p *ngIf="loan.dueSoon" class="text-xs text-warn font-semibold">📅 SẮP ĐẾN HẠN</p>
        <p class="text-sm text-ink-800 mt-1">{{ loan.purpose }} — {{ loan.loanNumber }}</p>
        <div class="grid grid-cols-2 gap-3 mt-3 text-sm">
          <div><p class="text-xs text-ink-400">Dư nợ hiện tại</p><p class="font-semibold text-ink-800">{{ loan.outstanding | vnd }}</p></div>
          <div><p class="text-xs text-ink-400">Ngày đến hạn</p><p class="font-semibold text-ink-800">{{ loan.maturityDate }}</p></div>
          <div><p class="text-xs text-ink-400">Lãi suất</p><p class="font-semibold text-ink-800">{{ loan.interestRate }}%/năm</p></div>
          <div><p class="text-xs text-ink-400">Dư nợ gốc</p><p class="font-semibold text-ink-800">{{ loan.principal | vnd }}</p></div>
        </div>
        <button class="btn-primary mt-4" (click)="payNow(loan)">Thanh toán ngay</button>
      </div>
      <p *ngIf="activeLoans().length === 0" class="text-sm text-ink-400 text-center py-8">Không có khoản vay nào đang hoạt động.</p>

      <div class="card p-5" *ngIf="hasLimitConfirmTask()">
        <p class="text-sm font-semibold text-ink-800">Hạn mức tín dụng mới đã được duyệt</p>
        <p class="text-sm text-ink-500 mt-1">MSB đã duyệt hạn mức tín dụng mới. Xác nhận để kích hoạt.</p>
        <button class="btn-secondary mt-3" (click)="confirmLimit()">Xác nhận kích hoạt hạn mức</button>
      </div>
    </div>
  `,
})
export class LoansPageComponent {
  readonly rmData = inject(RmDataService);
  private readonly toast = inject(ToastService);

  readonly activeLoans = computed(() =>
    this.rmData
      .loans()
      .filter((l) => l.status === 'ACTIVE')
      .map((l) => ({ ...l, dueSoon: daysUntil(l.maturityDate) <= 7 })),
  );

  readonly hasLimitConfirmTask = computed(() => this.rmData.tasks().some((t) => t.actionLink === '/loans' && t.status === 'OPEN'));

  payNow(loan: Loan): void {
    this.toast.success(`Đã ghi nhận yêu cầu thanh toán khoản vay ${loan.loanNumber} (mô phỏng).`);
  }

  async confirmLimit(): Promise<void> {
    const tasks = this.rmData.tasks().filter((t) => t.actionLink === '/loans' && t.status === 'OPEN');
    for (const t of tasks) {
      await this.rmData.completeTask(t.id);
    }
    this.toast.success('Đã kích hoạt hạn mức tín dụng mới (mô phỏng trên dữ liệu demo).');
  }
}
