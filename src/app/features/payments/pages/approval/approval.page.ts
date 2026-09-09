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
    <div class="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
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

        <div class="space-y-3">
          <div *ngFor="let t of rmData.pendingTransactions()" class="card p-4 flex items-start gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-ink-800">{{ t.description }}</p>
              <p class="text-xs text-ink-400 mt-0.5">{{ t.counterparty }} · {{ t.date | slice: 0:10 }} · {{ t.category }}</p>
              <p class="text-lg font-semibold text-ink-800 mt-2">{{ t.amount | vnd: t.currency }}</p>
            </div>
            <div class="flex flex-col gap-2 shrink-0">
              <button class="btn-primary !py-1.5 !text-xs" [disabled]="busyId() === t.id" (click)="approve(t.id, t.description)">
                ✓ Phê duyệt
              </button>
              <button class="btn-danger !py-1.5 !text-xs" [disabled]="busyId() === t.id" (click)="reject(t.id, t.description)">
                ✕ Từ chối
              </button>
            </div>
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
      this.toast.success('Đã phê duyệt giao dịch.');
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
      this.toast.success('Đã từ chối giao dịch.');
    } finally {
      this.busyId.set(null);
    }
  }
}
