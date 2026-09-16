import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuditEvent, BankingCommand, CommandsService } from '../../../../core/services/commands.service';
import { ConfirmDialogService } from '../../../../core/services/confirm-dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { WarningPanelComponent } from '../../../../shared/components/warning-panel/warning-panel.component';

interface DetailField {
  label: string;
  value: string;
}

const TYPE_LABEL: Record<string, string> = { TRANSFER: 'Chuyển tiền', LC: 'Thư tín dụng', GUARANTEE: 'Bảo lãnh', COLLECTION: 'Nhờ thu' };

const AUDIT_EVENT_LABEL: Record<string, string> = {
  DRAFT_CREATED: 'Tạo bản nháp',
  FIELD_UPDATED: 'Chỉnh sửa thông tin',
  VALIDATED: 'Kiểm tra hợp lệ',
  SUBMITTED: 'Gửi duyệt',
  VIEWED_BY_CHECKER: 'Checker đã xem',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  EXECUTED: 'Đã thực hiện (mô phỏng)',
  FAILED: 'Thất bại',
};

/** Read-only Checker view of a BankingCommand — the SAME data the Maker submitted (spec §2/§14
 * "Checker phải xem chính xác các lệnh Maker đã tạo"), same <app-warning-panel> the Maker form
 * uses (Slice 3), plus the audit timeline and Approve/Reject actions. */
@Component({
  selector: 'app-command-detail-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent, WarningPanelComponent],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <a routerLink="/payments/approval" class="text-xs text-ink-400 hover:text-ink-600">← Hàng chờ duyệt</a>

      <app-loading-spinner *ngIf="loading()" />

      <ng-container *ngIf="!loading() && command() as cmd">
        <div class="flex items-start justify-between">
          <div>
            <h1 class="text-xl font-semibold text-ink-800">{{ cmd.referenceNo }}</h1>
            <p class="text-sm text-ink-500 mt-0.5">{{ typeLabel(cmd.commandType) }} · Người lập lệnh: {{ cmd.makerName }}</p>
          </div>
          <span class="badge" [ngClass]="statusClass(cmd.status)">{{ statusLabel(cmd.status) }}</span>
        </div>

        <div class="card p-5 space-y-3">
          <p class="text-xs font-semibold text-ink-500 uppercase tracking-wide">Thông tin giao dịch</p>
          <dl class="text-sm space-y-1.5">
            <div class="flex justify-between" *ngFor="let f of detailFields(cmd)">
              <dt class="text-ink-400">{{ f.label }}</dt>
              <dd class="text-ink-800">{{ f.value }}</dd>
            </div>
          </dl>
        </div>

        <app-warning-panel [warnings]="cmd.warnings" />

        <div class="card p-5" *ngIf="cmd.status === 'PENDING_CHECKER'">
          <div class="flex gap-3" *ngIf="!showRejectForm()">
            <button class="btn-secondary flex-1" (click)="showRejectForm.set(true)" [disabled]="busy()">Từ chối</button>
            <button class="btn-primary flex-1" (click)="approve(cmd)" [disabled]="busy()">
              {{ busy() ? 'Đang xử lý...' : 'Phê duyệt' }}
            </button>
          </div>
          <div class="space-y-3" *ngIf="showRejectForm()">
            <label class="text-xs font-medium text-ink-600">Lý do từ chối (bắt buộc)</label>
            <textarea [(ngModel)]="rejectReason" name="rejectReason" rows="3" class="input" placeholder="Vd: Thông tin người nhận chưa chính xác"></textarea>
            <div class="flex gap-3">
              <button class="btn-secondary flex-1" (click)="showRejectForm.set(false)" [disabled]="busy()">Hủy</button>
              <button class="btn-danger flex-1" (click)="reject(cmd)" [disabled]="busy() || !rejectReason.trim()">
                {{ busy() ? 'Đang xử lý...' : 'Xác nhận từ chối' }}
              </button>
            </div>
          </div>
        </div>

        <div class="card p-5 space-y-3" *ngIf="cmd.status === 'REJECTED' && cmd.rejectReason">
          <p class="text-xs font-semibold text-ink-500 uppercase tracking-wide">Lý do từ chối</p>
          <p class="text-sm text-ink-700">{{ cmd.rejectReason }}</p>
        </div>

        <div class="card p-5 space-y-3" *ngIf="auditEvents().length">
          <p class="text-xs font-semibold text-ink-500 uppercase tracking-wide">Lịch sử xử lý</p>
          <ol class="space-y-2.5">
            <li class="flex items-start gap-2.5 text-sm" *ngFor="let e of auditEvents()">
              <span class="w-1.5 h-1.5 rounded-full bg-brand-400 mt-1.5 flex-shrink-0"></span>
              <div>
                <p class="text-ink-700">{{ eventLabel(e.eventType) }} <span class="text-ink-400">— {{ e.actorRole }}</span></p>
                <p class="text-xs text-ink-400">{{ e.createdAt | date: 'dd/MM/yyyy HH:mm' }}</p>
              </div>
            </li>
          </ol>
        </div>
      </ng-container>
    </div>
  `,
  styles: [
    `
      .input {
        @apply w-full rounded-lg border border-ink-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400;
      }
      .btn-danger {
        @apply rounded-lg bg-red-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50;
      }
    `,
  ],
})
export class CommandDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly commands = inject(CommandsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly command = signal<BankingCommand | null>(null);
  readonly auditEvents = signal<AuditEvent[]>([]);
  readonly busy = signal(false);
  readonly showRejectForm = signal(false);
  rejectReason = '';

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      const id = pm.get('id');
      if (id) this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const [cmd, events] = await Promise.all([this.commands.checkerDetail(id), this.commands.auditTrail(id)]);
      this.command.set(cmd);
      this.auditEvents.set(events);
    } catch {
      this.toast.show('Không tìm thấy lệnh này.', 'error');
      this.router.navigateByUrl('/payments/approval');
    } finally {
      this.loading.set(false);
    }
  }

  typeLabel(type: string): string {
    return TYPE_LABEL[type] ?? type;
  }

  private money(amount: unknown, currency: unknown): string {
    const n = typeof amount === 'number' ? amount : Number(amount);
    if (!Number.isFinite(n)) return '—';
    const formatted = n.toLocaleString('vi-VN');
    return currency === 'VND' ? `${formatted} VNĐ` : `${formatted} ${currency ?? ''}`;
  }

  /** Field labels/order per commandType — LC/GUARANTEE/COLLECTION each have their own formData
   * shape (server/src/domain/rules/{lc,guarantee,collection}.rules.ts), so this is one place per
   * type rather than trying to force a single generic shape onto all 4. */
  detailFields(cmd: BankingCommand): DetailField[] {
    const d = cmd.formData as Record<string, unknown>;
    switch (cmd.commandType) {
      case 'TRANSFER':
        return [
          { label: 'Tài khoản nguồn', value: String(d['sourceAccount'] ?? '—') },
          { label: 'Người thụ hưởng', value: String(d['beneficiaryName'] ?? '—') },
          { label: 'Số tài khoản', value: String(d['beneficiaryAccountNumber'] ?? '—') },
          { label: 'Ngân hàng', value: String(d['beneficiaryBankName'] ?? d['beneficiaryBankCode'] ?? '—') },
          { label: 'Số tiền', value: this.money(d['amount'], d['currency']) },
          { label: 'Mục đích', value: String(d['transferPurpose'] ?? '—') },
          ...(d['transferDescription'] ? [{ label: 'Nội dung', value: String(d['transferDescription']) }] : []),
          { label: 'Người chịu phí', value: String(d['feeBearer'] ?? '—') },
        ];
      case 'LC':
        return [
          { label: 'Loại LC', value: `${d['type'] ?? '—'} · ${d['subType'] ?? '—'}` },
          { label: 'Người thụ hưởng', value: String(d['beneficiary'] ?? '—') },
          { label: 'Applicant', value: String(d['applicant'] ?? '—') },
          { label: 'Giá trị', value: this.money(d['amount'], d['currency']) },
          { label: 'Ngày giao hàng muộn nhất', value: String(d['latestShipmentDate'] ?? '—') },
          { label: 'Ngày hết hạn', value: String(d['expiryDate'] ?? '—') },
        ];
      case 'GUARANTEE':
        return [
          { label: 'Loại bảo lãnh', value: String(d['type'] ?? '—') },
          { label: 'Người thụ hưởng', value: String(d['beneficiary'] ?? '—') },
          { label: 'Applicant', value: String(d['applicant'] ?? '—') },
          { label: 'Giá trị', value: this.money(d['amount'], d['currency']) },
          { label: 'Ngày hết hạn', value: String(d['expiryDate'] ?? '—') },
        ];
      case 'COLLECTION':
        return [
          { label: 'Chiều / Loại', value: `${d['direction'] ?? '—'} · ${d['subType'] ?? '—'}` },
          { label: 'Drawer', value: String(d['drawer'] ?? '—') },
          { label: 'Drawee', value: String(d['drawee'] ?? '—') },
          { label: 'Giá trị', value: this.money(d['amount'], d['currency']) },
          { label: 'Ngày đến hạn', value: String(d['dueDate'] ?? '—') },
        ];
    }
  }

  eventLabel(type: string): string {
    return AUDIT_EVENT_LABEL[type] ?? type;
  }

  statusLabel(status: string): string {
    return { DRAFT: 'Nháp', PENDING_CHECKER: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối', CANCELLED: 'Đã hủy', FAILED: 'Thất bại' }[status] ?? status;
  }

  statusClass(status: string): Record<string, boolean> {
    return {
      'bg-amber-50 text-warn': status === 'PENDING_CHECKER',
      'bg-teal-50 text-positive': status === 'APPROVED',
      'bg-red-50 text-negative': status === 'REJECTED' || status === 'FAILED',
      'bg-ink-100 text-ink-500': status === 'DRAFT' || status === 'CANCELLED',
    };
  }

  async approve(cmd: BankingCommand): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Phê duyệt lệnh chuyển tiền',
      message: `Xác nhận phê duyệt ${cmd.referenceNo}? Đây là thao tác mô phỏng trên dữ liệu demo.`,
      confirmLabel: 'Phê duyệt',
    });
    if (!ok || !cmd.idempotencyKey) return;
    this.busy.set(true);
    try {
      const approved = await this.commands.approve(cmd.id, cmd.idempotencyKey);
      this.command.set(approved);
      this.toast.show(`Đã phê duyệt ${approved.referenceNo}.`, 'success');
      await this.load(cmd.id);
    } catch {
      this.toast.show('Không thể phê duyệt — vui lòng thử lại.', 'error');
    } finally {
      this.busy.set(false);
    }
  }

  async reject(cmd: BankingCommand): Promise<void> {
    if (!this.rejectReason.trim()) return;
    this.busy.set(true);
    try {
      const rejected = await this.commands.reject(cmd.id, this.rejectReason.trim());
      this.command.set(rejected);
      this.showRejectForm.set(false);
      this.toast.show(`Đã từ chối ${rejected.referenceNo}.`, 'success');
    } catch {
      this.toast.show('Không thể từ chối — vui lòng thử lại.', 'error');
    } finally {
      this.busy.set(false);
    }
  }
}
