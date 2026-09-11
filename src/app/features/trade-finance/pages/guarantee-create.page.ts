import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GuaranteeSubType } from '../../../core/models';
import { TradeFinanceService } from '../../../core/services/trade-finance.service';
import { ToastService } from '../../../core/services/toast.service';
import { GUARANTEE_TYPE_LABEL } from '../trade-finance-ui.util';

const TYPE_OPTIONS: GuaranteeSubType[] = ['BID_BOND', 'PERFORMANCE_BOND', 'ADVANCE_PAYMENT', 'PAYMENT_GUARANTEE', 'WARRANTY', 'CUSTOMS', 'TAX', 'OTHER'];
const STEP_LABELS = ['Loại bảo lãnh', 'Các bên liên quan', 'Giá trị & hiệu lực', 'Xem lại'];

/** Phase 7 — /trade-finance/guarantees/create. DEMO ONLY, same human-in-the-loop rule as
 * the LC create flow: submits a mock PENDING_APPROVAL request, never issues a real guarantee. */
@Component({
  selector: 'app-guarantee-create-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <div>
        <h1 class="text-xl font-semibold text-ink-800">Yêu cầu phát hành bảo lãnh</h1>
        <p class="text-sm text-ink-500 mt-1">Biểu mẫu demo — không phát hành bảo lãnh thật, yêu cầu sẽ ở trạng thái chờ phê duyệt.</p>
      </div>

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
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Loại bảo lãnh</span>
              <select class="input" [(ngModel)]="form.type" name="type">
                <option *ngFor="let t of typeOptions" [value]="t">{{ typeLabel(t) }}</option>
              </select>
            </label>
          </ng-container>

          <ng-container *ngSwitchCase="2">
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Beneficiary</span>
              <input class="input" [(ngModel)]="form.beneficiary" name="beneficiary" placeholder="Bên thụ hưởng" />
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Applicant</span>
              <input class="input" [(ngModel)]="form.applicant" name="applicant" placeholder="ABC Manufacturing JSC" />
            </label>
          </ng-container>

          <ng-container *ngSwitchCase="3">
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Loại tiền</span>
              <select class="input" [(ngModel)]="form.currency" name="currency">
                <option value="VND">VND</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Giá trị</span>
              <input class="input" type="number" [(ngModel)]="form.amount" name="amount" placeholder="0" />
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Expiry Date</span>
              <input class="input" type="date" [(ngModel)]="form.expiryDate" name="expiryDate" />
            </label>
          </ng-container>

          <ng-container *ngSwitchCase="4">
            <p class="text-sm font-semibold text-ink-800">Xem lại yêu cầu</p>
            <dl class="text-sm space-y-1.5 mt-2">
              <div class="flex justify-between"><dt class="text-ink-400">Loại</dt><dd>{{ typeLabel(form.type) }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Beneficiary</dt><dd>{{ form.beneficiary || '—' }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Giá trị</dt><dd>{{ form.amount | number }} {{ form.currency }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Expiry</dt><dd>{{ form.expiryDate || '—' }}</dd></div>
            </dl>
            <p class="text-xs text-ink-400 mt-3">Đây là demo — yêu cầu sẽ được tạo với trạng thái "Chờ phê duyệt".</p>
          </ng-container>
        </ng-container>
      </div>

      <div class="flex justify-between">
        <button class="btn-secondary" *ngIf="step() > 1" (click)="step.set(step() - 1)">← Quay lại</button>
        <span *ngIf="step() === 1"></span>
        <button class="btn-primary" *ngIf="step() < 4" (click)="step.set(step() + 1)">Tiếp tục →</button>
        <button class="btn-primary" *ngIf="step() === 4" [disabled]="submitting()" (click)="submit()">Gửi yêu cầu phê duyệt</button>
      </div>
    </div>
  `,
})
export class GuaranteeCreatePageComponent {
  private readonly tf = inject(TradeFinanceService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly stepLabels = STEP_LABELS;
  readonly typeOptions = TYPE_OPTIONS;
  readonly step = signal(1);
  readonly submitting = signal(false);

  readonly form = {
    type: 'PERFORMANCE_BOND' as GuaranteeSubType,
    beneficiary: '',
    applicant: 'ABC Manufacturing JSC',
    currency: 'VND',
    amount: 0,
    expiryDate: '',
  };

  typeLabel(type: string): string {
    return GUARANTEE_TYPE_LABEL[type] ?? type;
  }

  async submit(): Promise<void> {
    this.submitting.set(true);
    try {
      const created = await this.tf.createGuarantee({
        type: this.form.type,
        beneficiary: this.form.beneficiary || 'Beneficiary (demo)',
        applicant: this.form.applicant,
        currency: this.form.currency,
        amount: Number(this.form.amount) || 0,
        expiryDate: this.form.expiryDate || new Date().toISOString().slice(0, 10),
      });
      this.toast.success(`Đã gửi yêu cầu phát hành bảo lãnh ${created.bgNumber} — chờ phê duyệt (mô phỏng).`);
      this.router.navigateByUrl(`/trade-finance/guarantees/${created.bgNumber}`);
    } finally {
      this.submitting.set(false);
    }
  }
}
