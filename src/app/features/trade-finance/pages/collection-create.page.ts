import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CollectionDirection, CollectionSubType } from '../../../core/models';
import { BankingCommand, CommandsService } from '../../../core/services/commands.service';
import { ToastService } from '../../../core/services/toast.service';
import { WarningPanelComponent } from '../../../shared/components/warning-panel/warning-panel.component';

const STEP_LABELS = ['Loại nhờ thu', 'Các bên liên quan', 'Giá trị & hạn', 'Xem lại'];

/** Phase 7 — /trade-finance/collections/create. Maker/Checker upgrade (Slice 6): now submits a
 * real BankingCommand DRAFT and waits for Checker approval, same as LC/Guarantee — previously
 * this wrote straight to trade-finance.service.ts with NO approval step at all (status went
 * directly to PROCESSING), which the audit's confirmed scope brings in line with the other 3
 * command types for one consistent Maker/Checker gate. DEMO ONLY. */
@Component({
  selector: 'app-collection-create-page',
  standalone: true,
  imports: [CommonModule, FormsModule, WarningPanelComponent],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <div>
        <h1 class="text-xl font-semibold text-ink-800">Yêu cầu nhờ thu mới</h1>
        <p class="text-sm text-ink-500 mt-1">Biểu mẫu demo — yêu cầu sẽ chờ Checker phê duyệt trước khi được ghi nhận chính thức.</p>
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
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Chiều nhờ thu</span>
              <select class="input" [(ngModel)]="form.direction" name="direction">
                <option value="OUTWARD">Outward (doanh nghiệp ký phát)</option>
                <option value="INWARD">Inward (doanh nghiệp nhận yêu cầu)</option>
              </select>
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Loại nhờ thu</span>
              <select class="input" [(ngModel)]="form.subType" name="subType">
                <option value="DP">D/P — Documents against Payment</option>
                <option value="DA">D/A — Documents against Acceptance</option>
              </select>
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Loại giao dịch</span>
              <select class="input" [(ngModel)]="form.type" name="type">
                <option value="EXPORT">Xuất khẩu</option>
                <option value="IMPORT">Nhập khẩu</option>
              </select>
            </label>
          </ng-container>

          <ng-container *ngSwitchCase="2">
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Bên ký phát</span>
              <input class="input" [(ngModel)]="form.drawer" name="drawer" placeholder="ABC Manufacturing JSC" />
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Bên trả tiền</span>
              <input class="input" [(ngModel)]="form.drawee" name="drawee" placeholder="Tên đối tác" />
            </label>
          </ng-container>

          <ng-container *ngSwitchCase="3">
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Loại tiền</span>
              <select class="input" [(ngModel)]="form.currency" name="currency">
                <option value="USD">USD</option>
                <option value="VND">VND</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Giá trị</span>
              <input class="input" type="number" [(ngModel)]="form.amount" name="amount" placeholder="0" />
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Ngày đến hạn</span>
              <input class="input" type="date" [(ngModel)]="form.dueDate" name="dueDate" />
            </label>
          </ng-container>

          <ng-container *ngSwitchCase="4">
            <p class="text-sm font-semibold text-ink-800">Xem lại yêu cầu</p>
            <dl class="text-sm space-y-1.5 mt-2">
              <div class="flex justify-between"><dt class="text-ink-400">Chiều / Loại</dt><dd>{{ form.direction }} · {{ form.subType }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Bên ký phát → Bên trả tiền</dt><dd>{{ form.drawer || '—' }} → {{ form.drawee || '—' }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Giá trị</dt><dd>{{ form.amount | number }} {{ form.currency }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Ngày đến hạn</dt><dd>{{ form.dueDate || '—' }}</dd></div>
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
        <button class="btn-primary" *ngIf="step() === 4" [disabled]="submitting() || !canSubmit()" (click)="submit()">Gửi yêu cầu</button>
      </div>

      <div class="card p-6 text-center" *ngIf="submitted() && command() as cmd">
        <div class="w-14 h-14 rounded-full bg-teal-50 text-positive flex items-center justify-center text-2xl mx-auto">✓</div>
        <p class="text-base font-semibold text-ink-800 mt-3">Yêu cầu đã được gửi tới Checker</p>
        <p class="text-sm text-ink-500 mt-1">{{ cmd.referenceNo }} — {{ form.amount | number }} {{ form.currency }} đang chờ phê duyệt.</p>
      </div>
    </div>
  `,
})
export class CollectionCreatePageComponent {
  private readonly commands = inject(CommandsService);
  private readonly toast = inject(ToastService);

  readonly stepLabels = STEP_LABELS;
  readonly step = signal(1);
  readonly checking = signal(false);
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly command = signal<BankingCommand | null>(null);

  readonly form = {
    direction: 'OUTWARD' as CollectionDirection,
    subType: 'DP' as CollectionSubType,
    type: 'EXPORT' as 'IMPORT' | 'EXPORT',
    drawer: 'ABC Manufacturing JSC',
    drawee: '',
    currency: 'USD',
    amount: 0,
    dueDate: '',
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
      this.toast.show('Không tải được bản nháp từ Virtual RM — vui lòng nhập lại thủ công.', 'error');
    }
  }

  canSubmit(): boolean {
    return !this.command()?.warnings.some((w) => w.blocking);
  }

  private formData(): Record<string, unknown> {
    return {
      type: this.form.type,
      subType: this.form.subType,
      direction: this.form.direction,
      drawer: this.form.drawer || 'Drawer (demo)',
      drawee: this.form.drawee || 'Drawee (demo)',
      currency: this.form.currency,
      amount: Number(this.form.amount) || 0,
      dueDate: this.form.dueDate || new Date().toISOString().slice(0, 10),
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
      const cmd = existing ? await this.commands.updateDraft(existing.id, this.formData()) : await this.commands.create('COLLECTION', this.formData());
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
