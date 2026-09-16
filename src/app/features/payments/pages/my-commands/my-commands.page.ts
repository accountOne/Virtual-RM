import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BankingCommand, CommandStatus, CommandType, CommandsService } from '../../../../core/services/commands.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { VndPipe } from '../../../../shared/pipes/vnd.pipe';

/** Maker's own view of every BankingCommand they created, across all 4 types — the "Lệnh giao
 * dịch" nav item (docs/ui-ux-audit.md #1/#7/#23: the backend `GET /api/commands` already scopes
 * this to the caller, but until this page there was no UI calling it at all). Read-only; editing
 * only happens on the DRAFT form itself (single-transfer/lc-create/etc.), never here. */
@Component({
  selector: 'app-my-commands-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, EmptyStateComponent, VndPipe],
  template: `
    <div class="max-w-5xl mx-auto p-4 sm:p-6 space-y-6 pb-24">
      <div>
        <h1 class="text-xl font-semibold text-ink-800">Lệnh giao dịch</h1>
        <p class="text-sm text-ink-500 mt-1" *ngIf="loaded()">
          {{ filtered().length }} / {{ all().length }} lệnh bạn đã tạo
        </p>
      </div>

      <div class="card p-3 grid grid-cols-2 sm:grid-cols-3 gap-2" *ngIf="loaded()">
        <div>
          <label class="block text-xs font-medium text-ink-500 mb-1">Loại</label>
          <select class="input w-full" [(ngModel)]="filterType" name="filterType">
            <option value="">Tất cả</option>
            <option value="TRANSFER">Chuyển tiền</option>
            <option value="LC">Thư tín dụng</option>
            <option value="GUARANTEE">Bảo lãnh</option>
            <option value="COLLECTION">Nhờ thu</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-ink-500 mb-1">Trạng thái</label>
          <select class="input w-full" [(ngModel)]="filterStatus" name="filterStatus">
            <option value="">Tất cả</option>
            <option value="DRAFT">Nháp</option>
            <option value="PENDING_CHECKER">Chờ kiểm soát</option>
            <option value="APPROVED">Đã duyệt</option>
            <option value="REJECTED">Từ chối</option>
            <option value="CANCELLED">Đã hủy</option>
            <option value="FAILED">Thất bại</option>
          </select>
        </div>
      </div>

      <app-loading-spinner *ngIf="!loaded()" />

      <app-empty-state
        *ngIf="loaded() && filtered().length === 0"
        icon="🗂️"
        title="Chưa có lệnh nào"
        subtitle="Tạo lệnh chuyển tiền hoặc tài trợ thương mại — lệnh của bạn sẽ hiện ở đây ngay khi lưu nháp."
      />

      <div class="card overflow-hidden" *ngIf="loaded() && filtered().length > 0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-ink-400 border-b border-ink-100">
                <th class="py-2.5 px-4 font-medium">Số tham chiếu</th>
                <th class="py-2.5 px-3 font-medium">Loại</th>
                <th class="py-2.5 px-3 font-medium">Người thụ hưởng</th>
                <th class="py-2.5 px-3 font-medium text-right">Số tiền</th>
                <th class="py-2.5 px-3 font-medium">Trạng thái</th>
                <th class="py-2.5 px-3 font-medium">Cập nhật</th>
                <th class="py-2.5 px-4 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of filtered()" class="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                <td class="py-3 px-4 text-ink-700 font-medium whitespace-nowrap">{{ c.referenceNo }}</td>
                <td class="py-3 px-3 text-ink-500">{{ typeLabel(c.commandType) }}</td>
                <td class="py-3 px-3 text-ink-500">{{ beneficiaryName(c) }}</td>
                <td class="py-3 px-3 text-right font-medium text-ink-800 whitespace-nowrap">{{ amount(c) | vnd: currency(c) }}</td>
                <td class="py-3 px-3"><span class="badge" [ngClass]="statusClass(c.status)">{{ statusLabel(c.status) }}</span></td>
                <td class="py-3 px-3 text-ink-400 whitespace-nowrap">{{ c.updatedAt | slice: 0:10 }}</td>
                <td class="py-3 px-4 text-right">
                  <a [routerLink]="['/payments/my-commands', c.id]" class="text-sm font-medium text-brand-600 hover:underline">Xem chi tiết</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class MyCommandsPageComponent implements OnInit {
  private readonly commands = inject(CommandsService);

  readonly all = signal<BankingCommand[]>([]);
  readonly loaded = signal(false);
  readonly filterType = signal<CommandType | ''>('');
  readonly filterStatus = signal<CommandStatus | ''>('');

  readonly filtered = computed(() => {
    const type = this.filterType();
    const status = this.filterStatus();
    return this.all().filter((c) => (!type || c.commandType === type) && (!status || c.status === status));
  });

  ngOnInit(): void {
    this.load();
  }

  private async load(): Promise<void> {
    try {
      this.all.set(await this.commands.list());
    } finally {
      this.loaded.set(true);
    }
  }

  typeLabel(type: BankingCommand['commandType']): string {
    return { TRANSFER: 'Chuyển tiền', LC: 'Thư tín dụng', GUARANTEE: 'Bảo lãnh', COLLECTION: 'Nhờ thu' }[type];
  }

  beneficiaryName(c: BankingCommand): string {
    const data = c.formData as { beneficiaryName?: string; beneficiary?: string; drawee?: string };
    return data.beneficiaryName ?? data.beneficiary ?? data.drawee ?? '—';
  }

  amount(c: BankingCommand): number {
    return (c.formData as { amount?: number }).amount ?? 0;
  }

  currency(c: BankingCommand): string {
    return (c.formData as { currency?: string }).currency ?? 'VND';
  }

  statusLabel(status: CommandStatus): string {
    return {
      DRAFT: 'Nháp',
      PENDING_CHECKER: 'Chờ kiểm soát',
      APPROVED: 'Đã duyệt',
      REJECTED: 'Từ chối',
      CANCELLED: 'Đã hủy',
      FAILED: 'Thất bại',
    }[status];
  }

  statusClass(status: CommandStatus): Record<string, boolean> {
    return {
      'bg-ink-100 text-ink-600': status === 'DRAFT' || status === 'CANCELLED',
      'bg-amber-50 text-warn': status === 'PENDING_CHECKER',
      'bg-teal-50 text-positive': status === 'APPROVED',
      'bg-red-50 text-negative': status === 'REJECTED' || status === 'FAILED',
    };
  }
}
