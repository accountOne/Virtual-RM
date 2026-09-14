import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LcAssistService, PoExtractedFields } from '../../../core/services/lc-assist.service';
import { TradeFinanceService } from '../../../core/services/trade-finance.service';
import { ToastService } from '../../../core/services/toast.service';

const STEP_LABELS = ['Thông tin cơ bản', 'Các bên liên quan', 'Giá trị & tiền tệ', 'Giao hàng', 'Chứng từ', 'Xem lại'];
const REQUIRED_DOCUMENT_OPTIONS = ['COMMERCIAL_INVOICE', 'PACKING_LIST', 'BILL_OF_LADING', 'CERTIFICATE_OF_ORIGIN', 'INSURANCE_CERTIFICATE'];

/** Phase 7 — /trade-finance/lc/create. DEMO ONLY: submitting creates a mock record with
 * status PENDING_APPROVAL via POST /api/trade-finance/lc — this never issues a real LC
 * (spec §14's human-in-the-loop rule: Virtual RM/this form may prepare and submit a
 * request, never autonomously issue/approve one).
 *
 * Phase 5.5 BRD alignment — LC PO-upload assistant (docs/phase-5.5-lc-assistant.md): the
 * Virtual RM chat can hand this page a partially-filled `form` via router state (read from
 * `history.state` below) after "analyzing" an uploaded PO — no shared service needed, this is
 * the one place that state is consumed. */
@Component({
  selector: 'app-lc-create-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <div>
        <h1 class="text-xl font-semibold text-ink-800">Yêu cầu mở LC mới</h1>
        <p class="text-sm text-ink-500 mt-1">Biểu mẫu demo — không phát hành LC thật, yêu cầu sẽ ở trạng thái chờ phê duyệt.</p>
      </div>

      <div *ngIf="prefilled()" class="rounded-lg bg-brand-50 border border-brand-100 px-3.5 py-2.5 text-xs text-brand-700 leading-relaxed">
        ✨ Đã điền sẵn một phần từ đơn hàng (PO) qua Virtual RM. Anh/chị vui lòng kiểm tra lại các
        trường trước khi gửi.
      </div>
      <a
        *ngIf="!prefilled()"
        routerLink="/virtual-rm/chat"
        class="block rounded-lg bg-brand-50 border border-brand-100 px-3.5 py-2.5 text-xs text-brand-700 hover:bg-brand-100/70 transition-colors"
      >
        ✨ Tạo đề nghị dễ dàng với Virtual RM — tải lên đơn hàng (PO), em điền form giúp anh/chị →
      </a>

      <div class="flex items-center gap-1.5 flex-wrap">
        <span
          *ngFor="let label of stepLabels; let i = index"
          class="text-[11px] px-2.5 py-1 rounded-full"
          [ngClass]="i + 1 === step() ? 'bg-brand-500 text-white font-semibold' : i + 1 < step() ? 'bg-positive/10 text-positive' : 'bg-ink-100 text-ink-400'"
        >
          {{ i + 1 }}. {{ label }}
        </span>
      </div>

      <div class="card p-5 sm:p-6 space-y-4">
        <ng-container [ngSwitch]="step()">
          <ng-container *ngSwitchCase="1">
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Loại LC</span>
              <select class="input" [(ngModel)]="form.type" name="type">
                <option value="IMPORT">Nhập khẩu (Import)</option>
                <option value="EXPORT">Xuất khẩu (Export)</option>
              </select>
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Subtype</span>
              <select class="input" [(ngModel)]="form.subType" name="subType">
                <option value="SIGHT">Sight (trả ngay)</option>
                <option value="USANCE">Usance (trả chậm)</option>
              </select>
            </label>
          </ng-container>

          <ng-container *ngSwitchCase="2">
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Beneficiary</span>
              <input class="input" [(ngModel)]="form.beneficiary" name="beneficiary" placeholder="Tên đơn vị thụ hưởng" />
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Applicant</span>
              <input class="input" [(ngModel)]="form.applicant" name="applicant" placeholder="ABC Manufacturing JSC" />
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Issuing Bank</span>
              <input class="input" [(ngModel)]="form.issuingBank" name="issuingBank" placeholder="MSB" />
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Advising Bank</span>
              <input class="input" [(ngModel)]="form.advisingBank" name="advisingBank" placeholder="Tên ngân hàng thông báo" />
            </label>
          </ng-container>

          <ng-container *ngSwitchCase="3">
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Loại tiền</span>
              <select class="input" [(ngModel)]="form.currency" name="currency">
                <option value="VND">VND</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Giá trị</span>
              <input class="input" type="number" [(ngModel)]="form.amount" name="amount" placeholder="0" />
            </label>
          </ng-container>

          <ng-container *ngSwitchCase="4">
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Latest Shipment Date</span>
              <input class="input" type="date" [(ngModel)]="form.latestShipmentDate" name="latestShipmentDate" />
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Expiry Date</span>
              <input class="input" type="date" [(ngModel)]="form.expiryDate" name="expiryDate" />
            </label>
          </ng-container>

          <ng-container *ngSwitchCase="5">
            <p class="text-xs font-medium text-ink-600 mb-1">Chứng từ yêu cầu</p>
            <label *ngFor="let d of documentOptions" class="flex items-center gap-2 text-sm py-1">
              <input type="checkbox" [checked]="form.requiredDocuments.includes(d)" (change)="toggleDoc(d)" />
              {{ d }}
            </label>
          </ng-container>

          <ng-container *ngSwitchCase="6">
            <p class="text-sm font-semibold text-ink-800">Xem lại yêu cầu</p>
            <dl class="text-sm space-y-1.5 mt-2">
              <div class="flex justify-between"><dt class="text-ink-400">Loại</dt><dd>{{ form.type }} · {{ form.subType }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Beneficiary</dt><dd>{{ form.beneficiary || '—' }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Applicant</dt><dd>{{ form.applicant || '—' }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Giá trị</dt><dd>{{ form.amount | number }} {{ form.currency }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Latest Shipment</dt><dd>{{ form.latestShipmentDate || '—' }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Expiry</dt><dd>{{ form.expiryDate || '—' }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Chứng từ</dt><dd>{{ form.requiredDocuments.length }} loại</dd></div>
            </dl>
            <p class="text-xs text-ink-400 mt-3">Đây là demo — yêu cầu sẽ được tạo với trạng thái "Chờ phê duyệt", không phát hành LC thật.</p>

            <button type="button" class="text-xs font-medium text-brand-600 hover:text-brand-700 mt-3" (click)="toggleDraftPreview()">
              {{ draftMessage() ? '▲ Ẩn bản nháp điện LC' : '👁️ Xem bản nháp điện LC' }}
            </button>
            <pre
              *ngIf="draftMessage()"
              class="text-[11px] leading-relaxed bg-ink-50 rounded-lg p-3 mt-2 whitespace-pre-wrap font-mono text-ink-700"
              >{{ draftMessage() }}</pre
            >
          </ng-container>
        </ng-container>
      </div>

      <div class="flex justify-between">
        <button class="btn-secondary" *ngIf="step() > 1" (click)="step.set(step() - 1)">← Quay lại</button>
        <span *ngIf="step() === 1"></span>
        <button class="btn-primary" *ngIf="step() < 6" (click)="step.set(step() + 1)">Tiếp tục →</button>
        <button class="btn-primary" *ngIf="step() === 6" [disabled]="submitting()" (click)="submit()">Gửi yêu cầu phê duyệt</button>
      </div>
    </div>
  `,
})
export class LcCreatePageComponent {
  private readonly tf = inject(TradeFinanceService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly lcAssist = inject(LcAssistService);

  readonly stepLabels = STEP_LABELS;
  readonly documentOptions = REQUIRED_DOCUMENT_OPTIONS;
  readonly step = signal(1);
  readonly submitting = signal(false);
  readonly prefilled = signal(false);
  readonly draftMessage = signal<string | null>(null);

  readonly form = {
    type: 'IMPORT' as 'IMPORT' | 'EXPORT',
    subType: 'SIGHT' as 'SIGHT' | 'USANCE',
    beneficiary: '',
    applicant: 'ABC Manufacturing JSC',
    issuingBank: 'MSB',
    advisingBank: '',
    currency: 'USD',
    amount: 0,
    latestShipmentDate: '',
    expiryDate: '',
    requiredDocuments: ['COMMERCIAL_INVOICE', 'PACKING_LIST', 'BILL_OF_LADING'] as string[],
  };

  constructor() {
    const prefill = history.state as Partial<PoExtractedFields> | undefined;
    if (prefill && (prefill.beneficiary || prefill.amount)) {
      if (prefill.type) this.form.type = prefill.type;
      if (prefill.subType) this.form.subType = prefill.subType;
      if (prefill.beneficiary) this.form.beneficiary = prefill.beneficiary;
      if (prefill.applicant) this.form.applicant = prefill.applicant;
      if (prefill.currency) this.form.currency = prefill.currency;
      if (prefill.amount) this.form.amount = prefill.amount;
      if (prefill.latestShipmentDate) this.form.latestShipmentDate = prefill.latestShipmentDate;
      if (prefill.expiryDate) this.form.expiryDate = prefill.expiryDate;
      if (prefill.requiredDocuments?.length) this.form.requiredDocuments = prefill.requiredDocuments;
      this.prefilled.set(true);
    }
  }

  toggleDoc(doc: string): void {
    this.form.requiredDocuments = this.form.requiredDocuments.includes(doc)
      ? this.form.requiredDocuments.filter((d) => d !== doc)
      : [...this.form.requiredDocuments, doc];
  }

  async toggleDraftPreview(): Promise<void> {
    if (this.draftMessage()) {
      this.draftMessage.set(null);
      return;
    }
    try {
      const message = await this.lcAssist.draftMessage({
        type: this.form.type,
        subType: this.form.subType,
        beneficiary: this.form.beneficiary || 'Beneficiary (demo)',
        applicant: this.form.applicant,
        issuingBank: this.form.issuingBank,
        advisingBank: this.form.advisingBank || undefined,
        currency: this.form.currency,
        amount: Number(this.form.amount) || 0,
        latestShipmentDate: this.form.latestShipmentDate || '(chưa xác định)',
        expiryDate: this.form.expiryDate || '(chưa xác định)',
        requiredDocuments: this.form.requiredDocuments,
      });
      this.draftMessage.set(message);
    } catch {
      this.toast.error('Không thể tạo bản nháp điện LC lúc này.');
    }
  }

  async submit(): Promise<void> {
    this.submitting.set(true);
    try {
      const created = await this.tf.createLc({
        type: this.form.type,
        subType: this.form.subType,
        beneficiary: this.form.beneficiary || 'Beneficiary (demo)',
        applicant: this.form.applicant,
        currency: this.form.currency,
        amount: Number(this.form.amount) || 0,
        issuingBank: this.form.issuingBank,
        advisingBank: this.form.advisingBank || undefined,
        latestShipmentDate: this.form.latestShipmentDate || new Date().toISOString().slice(0, 10),
        expiryDate: this.form.expiryDate || new Date().toISOString().slice(0, 10),
        requiredDocuments: this.form.requiredDocuments,
      });
      this.toast.success(`Đã gửi yêu cầu mở LC ${created.lcNumber} — chờ phê duyệt (mô phỏng).`);
      this.router.navigateByUrl(`/trade-finance/lc/${created.lcNumber}`);
    } catch (err) {
      // BRD §26 — a Checker's request is rejected server-side (403) with the exact message
      // the BRD specifies; surfaced here rather than a generic failure toast.
      const message = (err as { error?: { message?: string } })?.error?.message ?? 'Không thể gửi yêu cầu mở LC. Vui lòng thử lại.';
      this.toast.error(message);
    } finally {
      this.submitting.set(false);
    }
  }
}
