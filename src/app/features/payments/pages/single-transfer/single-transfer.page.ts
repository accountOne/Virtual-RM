import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RmDataService } from '../../../../core/services/rm-data.service';
import { ToastService } from '../../../../core/services/toast.service';
import { VndPipe } from '../../../../shared/pipes/vnd.pipe';

@Component({
  selector: 'app-single-transfer-page',
  standalone: true,
  imports: [CommonModule, FormsModule, VndPipe],
  template: `
    <div class="max-w-lg mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <h1 class="text-xl font-semibold text-ink-800">Chuyển tiền</h1>

      <div class="card p-5" *ngIf="!submitted()">
        <form (ngSubmit)="submit()" class="space-y-4">
          <div>
            <label class="text-xs font-medium text-ink-600">Tài khoản nguồn</label>
            <select [(ngModel)]="fromAccountId" name="from" class="input mt-1">
              <option *ngFor="let acc of rmData.accounts()" [value]="acc.id">
                {{ acc.accountName }} — {{ acc.balance | vnd: acc.currency }}
              </option>
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-ink-600">Người thụ hưởng</label>
            <input [(ngModel)]="beneficiary" name="beneficiary" class="input mt-1" placeholder="Tên người/đơn vị thụ hưởng" required />
          </div>
          <div>
            <label class="text-xs font-medium text-ink-600">Số tiền (VNĐ)</label>
            <input [(ngModel)]="amount" name="amount" type="number" class="input mt-1" placeholder="0" required />
          </div>
          <div>
            <label class="text-xs font-medium text-ink-600">Nội dung chuyển tiền</label>
            <input [(ngModel)]="note" name="note" class="input mt-1" placeholder="Nội dung" />
          </div>
          <button type="submit" class="btn-primary w-full" [disabled]="!beneficiary || !amount">Chuyển tiền</button>
          <p class="text-xs text-ink-400 text-center">Đây là giao dịch mô phỏng cho mục đích demo.</p>
        </form>
      </div>

      <div class="card p-6 text-center" *ngIf="submitted()">
        <div class="w-14 h-14 rounded-full bg-teal-50 text-positive flex items-center justify-center text-2xl mx-auto">✓</div>
        <p class="text-base font-semibold text-ink-800 mt-3">Lệnh chuyển tiền đã được gửi</p>
        <p class="text-sm text-ink-500 mt-1">
          {{ amount | vnd }} tới {{ beneficiary }} đang chờ xử lý (mô phỏng).
        </p>
        <button class="btn-secondary mt-4" (click)="reset()">Tạo lệnh mới</button>
      </div>
    </div>
  `,
  styles: [
    `
      .input {
        @apply w-full rounded-lg border border-ink-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400;
      }
    `,
  ],
})
export class SingleTransferPageComponent {
  readonly rmData = inject(RmDataService);
  private readonly toast = inject(ToastService);

  fromAccountId = '';
  beneficiary = '';
  amount: number | null = null;
  note = '';
  readonly submitted = signal(false);

  submit(): void {
    this.submitted.set(true);
    this.toast.success('Đã tạo lệnh chuyển tiền (mô phỏng).');
  }

  reset(): void {
    this.submitted.set(false);
    this.beneficiary = '';
    this.amount = null;
    this.note = '';
  }
}
