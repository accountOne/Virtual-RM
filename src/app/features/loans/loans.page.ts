import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RmDataService } from '../../core/services/rm-data.service';
import { ToastService } from '../../core/services/toast.service';
import { VndPipe } from '../../shared/pipes/vnd.pipe';

@Component({
  selector: 'app-loans-page',
  standalone: true,
  imports: [CommonModule, VndPipe],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <h1 class="text-xl font-semibold text-ink-800">Khoản vay</h1>

      <div class="card p-5 border-l-4 border-warn">
        <p class="text-xs text-warn font-semibold">📅 SẮP ĐẾN HẠN</p>
        <p class="text-sm text-ink-800 mt-1">Khoản vay lưu động — Kỳ hạn 12 tháng</p>
        <div class="grid grid-cols-2 gap-3 mt-3 text-sm">
          <div><p class="text-xs text-ink-400">Dư nợ gốc</p><p class="font-semibold text-ink-800">{{ 2000000000 | vnd }}</p></div>
          <div><p class="text-xs text-ink-400">Ngày đến hạn</p><p class="font-semibold text-ink-800">14/09/2026</p></div>
          <div><p class="text-xs text-ink-400">Lãi suất</p><p class="font-semibold text-ink-800">7.5%/năm</p></div>
          <div><p class="text-xs text-ink-400">Số tiền phải trả kỳ này</p><p class="font-semibold text-negative">{{ 195000000 | vnd }}</p></div>
        </div>
        <button class="btn-primary mt-4" (click)="payNow()">Thanh toán ngay</button>
      </div>

      <div class="card p-5">
        <p class="text-sm font-semibold text-ink-800">Hạn mức tín dụng mới đã được duyệt</p>
        <p class="text-sm text-ink-500 mt-1">MSB đã duyệt hạn mức tín dụng mới trị giá {{ 5000000000 | vnd }}. Xác nhận để kích hoạt.</p>
        <button class="btn-secondary mt-3" (click)="confirmLimit()">Xác nhận kích hoạt hạn mức</button>
      </div>
    </div>
  `,
})
export class LoansPageComponent {
  readonly rmData = inject(RmDataService);
  private readonly toast = inject(ToastService);

  payNow(): void {
    this.toast.success('Đã ghi nhận yêu cầu thanh toán khoản vay (mô phỏng).');
  }

  async confirmLimit(): Promise<void> {
    const tasks = this.rmData.tasks().filter((t) => t.actionLink === '/loans' && t.status === 'OPEN');
    for (const t of tasks) {
      await this.rmData.completeTask(t.id);
    }
    this.toast.success('Đã kích hoạt hạn mức tín dụng mới (mô phỏng trên dữ liệu demo).');
  }
}
