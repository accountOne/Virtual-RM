import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GuaranteeSubType } from '../../../core/models';
import { BankingCommand, CommandsService } from '../../../core/services/commands.service';
import { ToastService } from '../../../core/services/toast.service';
import { WarningPanelComponent } from '../../../shared/components/warning-panel/warning-panel.component';
import { GUARANTEE_TYPE_LABEL } from '../trade-finance-ui.util';

const TYPE_OPTIONS: GuaranteeSubType[] = ['BID_BOND', 'PERFORMANCE_BOND', 'ADVANCE_PAYMENT', 'PAYMENT_GUARANTEE', 'WARRANTY', 'CUSTOMS', 'TAX', 'OTHER'];
const STEP_LABELS = ['Loại bảo lãnh', 'Các bên liên quan', 'Giá trị & hiệu lực', 'Xem lại'];

/** Phase 7 — /trade-finance/guarantees/create. Maker/Checker upgrade (Slice 6): submits a real
 * BankingCommand DRAFT instead of writing straight to trade-finance.service.ts — a Checker now
 * has an actual approve/reject path for this (docs/MAKER_CHECKER_AUDIT.md gap #2). DEMO ONLY —
 * no real guarantee is issued until a Checker approves. */
@Component({
  selector: 'app-guarantee-create-page',
  standalone: true,
  imports: [CommonModule, FormsModule, WarningPanelComponent],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <div>
        <h1 class="text-xl font-semibold text-ink-800">Yêu cầu phát hành bảo lãnh</h1>
        <p class="text-sm text-ink-500 mt-1">Biểu mẫu demo — không phát hành bảo lãnh thật, yêu cầu sẽ chờ Checker phê duyệt.</p>
      </div>

      <div class="flex items-center gap-1.5 flex-wrap" *ngIf="!submitted()">
        <span
          *ngFor="let label of stepLabels; let i = index"
          class="text-[11px] px-2.5 py-1 rounded-full"
          [ngClass]="i + 1 === step() ? 'bg-brand-500 text-white font-semibold' : i + 1 < step() ? 'bg-positive/10 text-positive' : 'bg-ink-100 text-ink-400'"
        >
          {{ i + 1 }}. {{ label }}
        </span>
      </div>

      <div class="card p-5 sm:p-6 space-y-4" *ngIf="!submitted()">
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
            <app-warning-panel [warnings]="command()?.warnings ?? []" />
            <p class="text-xs text-ink-400 mt-3">Đây là demo — yêu cầu sẽ được gửi tới Checker với trạng thái "Chờ duyệt".</p>
          </ng-container>
        </ng-container>
      </div>

      <div class="flex justify-between" *ngIf="!submitted()">
        <button class="btn-secondary" *ngIf="step() > 1" (click)="step.set(step() - 1)">← Quay lại</button>
        <span *ngIf="step() === 1"></span>
        <button class="btn-primary" *ngIf="step() < 4" [disabled]="checking()" (click)="nextStep()">{{ step() === 3 ? (checking() ? 'Đang kiểm tra...' : 'Kiểm tra & Xem lại →') : 'Tiếp tục →' }}</button>
        <button class="btn-primary" *ngIf="step() === 4" [disabled]="submitting() || !canSubmit()" (click)="submit()">Gửi yêu cầu phê duyệt</button>
      </div>

      <div class="card p-6 text-center" *ngIf="submitted() && command() as cmd">
        <div class="w-14 h-14 rounded-full bg-teal-50 text-positive flex items-center justify-center text-2xl mx-auto">✓</div>
        <p class="text-base font-semibold text-ink-800 mt-3">Yêu cầu đã được gửi tới Checker</p>
        <p class="text-sm text-ink-500 mt-1">{{ cmd.referenceNo }} — {{ form.amount | number }} {{ form.currency }} đang chờ phê duyệt.</p>
      </div>
    </div>
  `,
})
export class GuaranteeCreatePageComponent {
  private readonly commands = inject(CommandsService);
  private readonly toast = inject(ToastService);

  readonly stepLabels = STEP_LABELS;
  readonly typeOptions = TYPE_OPTIONS;
  readonly step = signal(1);
  readonly checking = signal(false);
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly command = signal<BankingCommand | null>(null);

  readonly form = {
    type: 'PERFORMANCE_BOND' as GuaranteeSubType,
    beneficiary: '',
    applicant: 'ABC Manufacturing JSC',
    currency: 'VND',
    amount: 0,
    expiryDate: '',
  };

  constructor() {
    // Maker/Checker upgrade, Slice 6 — same Agent hand-off mechanism as single-transfer.page.ts
    // (Slice 5) / lc-create.page.ts.
    const state = history.state as { commandId?: string } | undefined;
    if (state?.commandId) void this.loadDraft(state.commandId);
  }

  private async loadDraft(commandId: string): Promise<void> {
    try {
      const cmd = await this.commands.get(commandId);
      this.command.set(cmd);
      Object.assign(this.form, cmd.formData);
      this.toast.show(`Đã tải sẵn thông tin từ Virtual RM (${cmd.referenceNo}) — vui lòng kiểm tra lại.`, 'info');
    } catch {
      this.toast.error('Không tải được bản nháp từ Virtual RM — vui lòng nhập lại thủ công.');
    }
  }

  typeLabel(type: string): string {
    return GUARANTEE_TYPE_LABEL[type] ?? type;
  }

  canSubmit(): boolean {
    return !this.command()?.warnings.some((w) => w.blocking);
  }

  private formData(): Record<string, unknown> {
    return {
      type: this.form.type,
      beneficiary: this.form.beneficiary || 'Beneficiary (demo)',
      applicant: this.form.applicant,
      currency: this.form.currency,
      amount: Number(this.form.amount) || 0,
      expiryDate: this.form.expiryDate || new Date().toISOString().slice(0, 10),
    };
  }

  async nextStep(): Promise<void> {
    if (this.step() !== 3) {
      this.step.set(this.step() + 1);
      return;
    }
    this.checking.set(true);
    try {
      const existing = this.command();
      const cmd = existing ? await this.commands.updateDraft(existing.id, this.formData()) : await this.commands.create('GUARANTEE', this.formData());
      this.command.set(await this.commands.validate(cmd.id));
      this.step.set(4);
    } catch {
      this.toast.show('Không thể kiểm tra yêu cầu — vui lòng thử lại.', 'error');
    } finally {
      this.checking.set(false);
    }
  }

  async submit(): Promise<void> {
    const cmd = this.command();
    if (!cmd) return;
    this.submitting.set(true);
    try {
      const submittedCmd = await this.commands.submit(cmd.id);
      this.command.set(submittedCmd);
      this.submitted.set(true);
      this.toast.show(`Đã gửi yêu cầu ${submittedCmd.referenceNo} tới Checker.`, 'success');
    } catch (err) {
      const message = (err as { error?: { message?: string } })?.error?.message ?? 'Không thể gửi yêu cầu. Vui lòng thử lại.';
      this.toast.show(message, 'error');
    } finally {
      this.submitting.set(false);
    }
  }
}
