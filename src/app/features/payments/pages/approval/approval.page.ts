import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BankingCommand, CommandStatus, CommandType, CommandsService } from '../../../../core/services/commands.service';
import { ConfirmDialogService } from '../../../../core/services/confirm-dialog.service';
import { RmDataService } from '../../../../core/services/rm-data.service';
import { ToastService } from '../../../../core/services/toast.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { VndPipe } from '../../../../shared/pipes/vnd.pipe';

@Component({
  selector: 'app-approval-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, EmptyStateComponent, VndPipe],
  template: `
    <div class="max-w-5xl mx-auto p-4 sm:p-6 space-y-8 pb-24">
      <!-- New BankingCommand queue — see docs/MAKER_CHECKER_AUDIT.md. Every command created
           through the (now real) Maker banking forms lands here, with the exact same backend
           record the Maker submitted. -->
      <div>
        <div>
          <h1 class="text-xl font-semibold text-ink-800">Lệnh chờ duyệt</h1>
          <p class="text-sm text-ink-500 mt-1" *ngIf="commandsLoaded()">
            {{ filteredCommands().length }} / {{ allCommands().length }} lệnh
          </p>
        </div>

        <div class="card p-3 mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2" *ngIf="commandsLoaded()">
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
              <option value="PENDING_CHECKER">Chờ kiểm soát</option>
              <option value="">Tất cả</option>
              <option value="APPROVED">Đã duyệt</option>
              <option value="REJECTED">Từ chối</option>
              <option value="CANCELLED">Đã hủy</option>
              <option value="FAILED">Thất bại</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-ink-500 mb-1">Người lập lệnh</label>
            <input class="input w-full" type="text" placeholder="Tên Maker" [(ngModel)]="filterMaker" name="filterMaker" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-ink-500 mb-1">Từ (VND)</label>
              <input class="input w-full" type="number" min="0" [(ngModel)]="filterMinAmount" name="filterMinAmount" />
            </div>
            <div>
              <label class="block text-xs font-medium text-ink-500 mb-1">Đến (VND)</label>
              <input class="input w-full" type="number" min="0" [(ngModel)]="filterMaxAmount" name="filterMaxAmount" />
            </div>
          </div>
        </div>

        <app-loading-spinner *ngIf="!commandsLoaded()" />

        <app-empty-state
          *ngIf="commandsLoaded() && filteredCommands().length === 0"
          icon="✅"
          title="Không có lệnh nào khớp bộ lọc"
          subtitle="Thử đổi bộ lọc hoặc chọn 'Tất cả' ở trạng thái."
        />

        <div class="card overflow-hidden mt-3" *ngIf="commandsLoaded() && filteredCommands().length > 0">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-ink-400 border-b border-ink-100">
                  <th class="py-2.5 px-4 font-medium">Số tham chiếu</th>
                  <th class="py-2.5 px-3 font-medium">Loại</th>
                  <th class="py-2.5 px-3 font-medium">Người lập lệnh</th>
                  <th class="py-2.5 px-3 font-medium">Người thụ hưởng</th>
                  <th class="py-2.5 px-3 font-medium text-right">Số tiền</th>
                  <th class="py-2.5 px-3 font-medium">Cảnh báo</th>
                  <th class="py-2.5 px-3 font-medium">Trạng thái</th>
                  <th class="py-2.5 px-3 font-medium">Gửi lúc</th>
                  <th class="py-2.5 px-4 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let c of filteredCommands()" class="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                  <td class="py-3 px-4 text-ink-700 font-medium whitespace-nowrap">{{ c.referenceNo }}</td>
                  <td class="py-3 px-3 text-ink-500">{{ typeLabel(c.commandType) }}</td>
                  <td class="py-3 px-3 text-ink-500">{{ c.makerName }}</td>
                  <td class="py-3 px-3 text-ink-500">{{ beneficiaryName(c) }}</td>
                  <td class="py-3 px-3 text-right font-medium text-ink-800 whitespace-nowrap">{{ amount(c) | vnd: currency(c) }}</td>
                  <td class="py-3 px-3">
                    <span *ngIf="c.warnings.length === 0" class="text-ink-300">—</span>
                    <span *ngIf="c.warnings.length > 0" class="badge" [ngClass]="highestSeverityClass(c)">{{ c.warnings.length }} cảnh báo</span>
                  </td>
                  <td class="py-3 px-3"><span class="badge" [ngClass]="statusClass(c.status)">{{ statusLabel(c.status) }}</span></td>
                  <td class="py-3 px-3 text-ink-400 whitespace-nowrap">{{ c.submittedAt | slice: 0:10 }}</td>
                  <td class="py-3 px-4 text-right">
                    <a [routerLink]="['/payments/approval', c.id]" class="text-sm font-medium text-brand-600 hover:underline">Xem chi tiết</a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Legacy Transaction approve/reject — kept for historical/seeded data (audit's backward
           compatibility plan). Any NEW transfer no longer flows through here. -->
      <div class="border-t border-ink-100 pt-6">
        <div>
          <h2 class="text-base font-semibold text-ink-700">Giao dịch cũ chờ phê duyệt</h2>
          <p class="text-xs text-ink-400 mt-1">
            {{ rmData.pendingTransactions().length }} giao dịch (dữ liệu lịch sử) · tổng {{ pendingTotal() | vnd }}
          </p>
        </div>

        <div class="card overflow-hidden mt-3" *ngIf="rmData.pendingTransactions().length > 0">
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
                        (click)="approveLegacy(t.id, t.description)"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      </button>
                      <button
                        class="w-7 h-7 rounded-full flex items-center justify-center text-negative hover:bg-red-50 disabled:opacity-40"
                        [disabled]="busyId() === t.id"
                        [attr.aria-label]="'Từ chối ' + t.description"
                        (click)="rejectLegacy(t.id, t.description)"
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
      </div>
    </div>
  `,
})
export class ApprovalPageComponent implements OnInit {
  readonly rmData = inject(RmDataService);
  private readonly commands = inject(CommandsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  readonly busyId = signal<string | null>(null);

  readonly allCommands = signal<BankingCommand[]>([]);
  readonly commandsLoaded = signal(false);

  // Filters (audit ui-ux-audit.md #24 — Checker queue had no filter UI at all before this).
  readonly filterType = signal<CommandType | ''>('');
  readonly filterStatus = signal<CommandStatus | ''>('PENDING_CHECKER');
  readonly filterMaker = signal('');
  readonly filterMinAmount = signal<number | null>(null);
  readonly filterMaxAmount = signal<number | null>(null);

  readonly filteredCommands = computed(() => {
    const type = this.filterType();
    const status = this.filterStatus();
    const maker = this.filterMaker().trim().toLowerCase();
    const min = this.filterMinAmount();
    const max = this.filterMaxAmount();
    return this.allCommands().filter((c) => {
      if (type && c.commandType !== type) return false;
      if (status && c.status !== status) return false;
      if (maker && !c.makerName.toLowerCase().includes(maker)) return false;
      const amt = this.amount(c);
      if (min != null && amt < min) return false;
      if (max != null && amt > max) return false;
      return true;
    });
  });

  ngOnInit(): void {
    this.loadCommands();
  }

  private async loadCommands(): Promise<void> {
    try {
      // Fetch every status once; filtering happens client-side (small demo dataset) so switching
      // "Trạng thái" in the filter bar doesn't need a new round-trip each time.
      this.allCommands.set(await this.commands.checkerQueue());
    } finally {
      this.commandsLoaded.set(true);
    }
  }

  typeLabel(type: BankingCommand['commandType']): string {
    return { TRANSFER: 'Chuyển tiền', LC: 'Thư tín dụng', GUARANTEE: 'Bảo lãnh', COLLECTION: 'Nhờ thu' }[type];
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

  /** LC/Guarantee formData uses `beneficiary`, Collection uses `drawee` (its actual counterparty
   * field) — Transfer is the only type with a `beneficiaryName` field. Checked in this order so
   * the queue's "Người thụ hưởng" column reads sensibly for every commandType without needing a
   * per-type branch in the template. */
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

  highestSeverityClass(c: BankingCommand): Record<string, boolean> {
    const hasBlocking = c.warnings.some((w) => w.blocking);
    const hasHigh = c.warnings.some((w) => w.severity === 'HIGH');
    const hasWarning = c.warnings.some((w) => w.severity === 'WARNING');
    // Matches warning-panel.component.ts's severity→color mapping exactly (design-system.md §7) —
    // this table previously collapsed INFO into the same amber as WARNING (ui-ux-audit.md #25).
    return {
      'bg-red-50 text-negative': hasBlocking,
      'bg-orange-50 text-orange-700': !hasBlocking && hasHigh,
      'bg-amber-50 text-warn': !hasBlocking && !hasHigh && hasWarning,
      'bg-sky-50 text-sky-700': !hasBlocking && !hasHigh && !hasWarning,
    };
  }

  pendingTotal(): number {
    return this.rmData.pendingTransactions().reduce((s, t) => s + t.amount, 0);
  }

  async approveLegacy(id: string, description: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Phê duyệt giao dịch',
      message: `Xác nhận phê duyệt "${description}"? Đây là thao tác mô phỏng trên dữ liệu demo.`,
      confirmLabel: 'Phê duyệt',
    });
    if (!ok) return;
    this.busyId.set(id);
    try {
      await this.rmData.approveTransaction(id);
      this.toast.show('Đã phê duyệt giao dịch (mô phỏng trên dữ liệu demo).', 'success');
    } finally {
      this.busyId.set(null);
    }
  }

  async rejectLegacy(id: string, description: string): Promise<void> {
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
      this.toast.show('Đã từ chối giao dịch (mô phỏng trên dữ liệu demo).', 'success');
    } finally {
      this.busyId.set(null);
    }
  }
}
