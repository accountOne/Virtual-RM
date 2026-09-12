import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ConfirmDialogService } from '../../../../core/services/confirm-dialog.service';
import { RmDataService } from '../../../../core/services/rm-data.service';
import { ToastService } from '../../../../core/services/toast.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { VndPipe } from '../../../../shared/pipes/vnd.pipe';

@Component({
  selector: 'app-approval-page',
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent, EmptyStateComponent, VndPipe],
  template: `
    <div class="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <app-loading-spinner *ngIf="rmData.loading() && !rmData.loaded()" />

      <ng-container *ngIf="rmData.loaded()">
        <div>
          <h1 class="text-xl font-semibold text-ink-800">Phê duyệt giao dịch</h1>
          <p class="text-sm text-ink-500 mt-1">
            {{ rmData.pendingTransactions().length }} giao dịch đang chờ phê duyệt · tổng
            {{ pendingTotal() | vnd }}
          </p>
        </div>

        <app-empty-state
          *ngIf="rmData.pendingTransactions().length === 0"
          icon="✅"
          title="Không có giao dịch nào đang chờ phê duyệt"
          subtitle="Mọi giao dịch đã được xử lý."
        />

        <div class="card overflow-hidden" *ngIf="rmData.pendingTransactions().length > 0">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-ink-400 border-b border-ink-100">
                  <th class="py-2.5 px-4 font-medium">Thời gian</th>
                  <th class="py-2.5 px-3 font-medium">Loại giao dịch</th>
                  <th class="py-2.5 px-3 font-medium">Đối tác</th>
                  <th class="py-2.5 px-3 font-medium text-right">Số tiền</th>
                  <th class="py-2.5 px-3 font-medium">Loại tiền</th>
                  <th class="py-2.5 px-3 font-medium">Trạng thái</th>
                  <th class="py-2.5 px-4 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let t of rmData.pendingTransactions()" class="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                  <td class="py-3 px-4 text-ink-400 whitespace-nowrap">{{ t.date | slice: 0:10 }}</td>
                  <td class="py-3 px-3 text-ink-700">{{ t.description }}</td>
                  <td class="py-3 px-3 text-ink-500">{{ t.counterparty }}</td>
                  <td class="py-3 px-3 text-right font-medium text-ink-800 whitespace-nowrap">{{ t.amount.toLocaleString('vi-VN') }}</td>
                  <td class="py-3 px-3 text-ink-500">{{ t.currency }}</td>
                  <td class="py-3 px-3"><span class="badge bg-amber-50 text-warn">Chờ duyệt</span></td>
                  <td class="py-3 px-4">
                    <div class="flex items-center justify-end gap-2">
                      <button
                        class="w-7 h-7 rounded-full flex items-center justify-center text-positive hover:bg-teal-50 disabled:opacity-40"
                        [disabled]="busyId() === t.id"
                        [attr.aria-label]="'Phê duyệt ' + t.description"
                        (click)="approve(t.id, t.description)"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      </button>
                      <button
                        class="w-7 h-7 rounded-full flex items-center justify-center text-negative hover:bg-red-50 disabled:opacity-40"
                        [disabled]="busyId() === t.id"
                        [attr.aria-label]="'Từ chối ' + t.description"
                        (click)="reject(t.id, t.description)"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class ApprovalPageComponent {
  readonly rmData = inject(RmDataService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  readonly busyId = signal<string | null>(null);

  pendingTotal(): number {
    return this.rmData.pendingTransactions().reduce((s, t) => s + t.amount, 0);
  }

  async approve(id: string, description: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Phê duyệt giao dịch',
      message: `Xác nhận phê duyệt "${description}"? Đây là thao tác mô phỏng trên dữ liệu demo.`,
      confirmLabel: 'Phê duyệt',
    });
    if (!ok) return;
    this.busyId.set(id);
    try {
      await this.rmData.approveTransaction(id);
      this.toast.success('Đã phê duyệt giao dịch (mô phỏng trên dữ liệu demo).');
    } finally {
      this.busyId.set(null);
    }
  }

  async reject(id: string, description: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Từ chối giao dịch',
      message: `Xác nhận từ chối "${description}"? Đây là thao tác mô phỏng trên dữ liệu demo.`,
      confirmLabel: 'Từ chối',
      danger: true,
    });
    if (!ok) return;
    this.busyId.set(id);
    try {
      await this.rmData.rejectTransaction(id);
      this.toast.success('Đã từ chối giao dịch (mô phỏng trên dữ liệu demo).');
    } finally {
      this.busyId.set(null);
    }
  }
}
