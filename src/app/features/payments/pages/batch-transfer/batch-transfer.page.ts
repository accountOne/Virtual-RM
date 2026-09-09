import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ToastService } from '../../../../core/services/toast.service';

interface BatchRow {
  beneficiary: string;
  account: string;
  amount: number;
}

const SAMPLE_ROWS: BatchRow[] = [
  { beneficiary: 'Nguyễn Văn A', account: '0071000011122', amount: 18500000 },
  { beneficiary: 'Trần Thị B', account: '0071000033344', amount: 22000000 },
  { beneficiary: 'Lê Văn C', account: '0071000055566', amount: 15750000 },
];

@Component({
  selector: 'app-batch-transfer-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <h1 class="text-xl font-semibold text-ink-800">Chuyển tiền hàng loạt</h1>
      <p class="text-sm text-ink-500">Tải lên danh sách chi lương / thanh toán nhà cung cấp (mô phỏng).</p>

      <div class="card p-5">
        <div class="border-2 border-dashed border-ink-200 rounded-xl p-8 text-center" *ngIf="!uploaded()">
          <p class="text-3xl">📄</p>
          <p class="text-sm text-ink-600 mt-2">Kéo thả file Excel/CSV hoặc</p>
          <button class="btn-primary mt-3" (click)="upload()">Chọn file mẫu demo</button>
        </div>

        <div *ngIf="uploaded()">
          <table class="w-full text-sm mb-4">
            <thead>
              <tr class="text-left text-xs text-ink-400 border-b border-ink-100">
                <th class="py-2 font-medium">Người thụ hưởng</th>
                <th class="py-2 font-medium">Số tài khoản</th>
                <th class="py-2 font-medium text-right">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of rows" class="border-b border-ink-50 last:border-0">
                <td class="py-2 text-ink-700">{{ row.beneficiary }}</td>
                <td class="py-2 text-ink-500 font-mono">{{ row.account }}</td>
                <td class="py-2 text-right text-ink-800 font-medium">{{ row.amount | number: '1.0-0' }} VNĐ</td>
              </tr>
            </tbody>
          </table>
          <div class="flex items-center justify-between">
            <p class="text-sm text-ink-600">Tổng cộng: <span class="font-semibold">{{ total() | number: '1.0-0' }} VNĐ</span> · {{ rows.length }} giao dịch</p>
            <button class="btn-primary" (click)="submitBatch()" [disabled]="submitted()">
              {{ submitted() ? 'Đã gửi phê duyệt' : 'Gửi phê duyệt' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class BatchTransferPageComponent {
  private readonly toast = inject(ToastService);
  readonly rows = SAMPLE_ROWS;
  readonly uploaded = signal(false);
  readonly submitted = signal(false);

  upload(): void {
    this.uploaded.set(true);
    this.toast.success('Đã tải lên danh sách chuyển tiền mẫu.');
  }

  total(): number {
    return this.rows.reduce((s, r) => s + r.amount, 0);
  }

  submitBatch(): void {
    this.submitted.set(true);
    this.toast.success('Đã gửi lô giao dịch để phê duyệt (mô phỏng).');
  }
}
