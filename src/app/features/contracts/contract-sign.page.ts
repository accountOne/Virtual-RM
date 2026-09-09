import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RmDataService } from '../../core/services/rm-data.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-contract-sign-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <h1 class="text-xl font-semibold text-ink-800">Ký hợp đồng dịch vụ</h1>

      <div class="card p-5">
        <p class="text-sm font-semibold text-ink-800">Hợp đồng gia hạn dịch vụ Cash Management năm 2026</p>
        <div class="mt-3 rounded-lg bg-ink-50 p-4 text-xs text-ink-500 leading-relaxed max-h-40 overflow-y-auto">
          Hợp đồng này quy định các điều khoản cung cấp dịch vụ Cash Management giữa MSB và
          {{ rmData.customer()?.companyName }}, bao gồm: quản lý dòng tiền tập trung, báo cáo số dư đa tài khoản,
          và các dịch vụ giá trị gia tăng khác. Hiệu lực hợp đồng: 12 tháng kể từ ngày ký...
        </div>

        <label class="flex items-start gap-2 mt-4 text-sm text-ink-600">
          <input type="checkbox" [(ngModel)]="agreed" name="agree" class="mt-0.5" />
          Tôi đã đọc và đồng ý với các điều khoản của hợp đồng
        </label>

        <button class="btn-primary w-full mt-4" [disabled]="!agreed || signed()" (click)="sign()">
          {{ signed() ? '✓ Đã ký hợp đồng' : 'Ký hợp đồng (OTP mô phỏng)' }}
        </button>
      </div>
    </div>
  `,
})
export class ContractSignPageComponent {
  readonly rmData = inject(RmDataService);
  private readonly toast = inject(ToastService);
  agreed = false;
  readonly signed = signal(false);

  async sign(): Promise<void> {
    this.signed.set(true);
    const tasks = this.rmData.tasks().filter((t) => t.actionLink === '/contracts/sign' && t.status === 'OPEN');
    for (const t of tasks) {
      await this.rmData.completeTask(t.id);
    }
    this.toast.success('Đã ký hợp đồng thành công.');
  }
}
