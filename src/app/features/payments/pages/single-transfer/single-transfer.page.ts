import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BankingCommand, CommandsService } from '../../../../core/services/commands.service';
import { RmDataService } from '../../../../core/services/rm-data.service';
import { ToastService } from '../../../../core/services/toast.service';
import { WarningPanelComponent } from '../../../../shared/components/warning-panel/warning-panel.component';
import { VndPipe } from '../../../../shared/pipes/vnd.pipe';

// Mirrors server/src/domain/reference-data/beneficiary-banks.ts — deliberately duplicated (not
// fetched) since it's small, static reference data, same pattern the rest of this app already
// uses for front/back constants that don't need a round trip.
const BENEFICIARY_BANKS = [
  { code: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam (MSB)' },
  { code: 'VCB', name: 'Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)' },
  { code: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)' },
  { code: 'CTG', name: 'Ngân hàng TMCP Công thương Việt Nam (VietinBank)' },
  { code: 'TCB', name: 'Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)' },
  { code: 'MBB', name: 'Ngân hàng TMCP Quân đội (MB Bank)' },
  { code: 'ACB', name: 'Ngân hàng TMCP Á Châu (ACB)' },
];

type Stage = 'editing' | 'previewing' | 'submitted';

interface TransferForm {
  sourceAccount: string;
  beneficiaryName: string;
  beneficiaryAccountNumber: string;
  beneficiaryBankCode: string;
  amount: number | null;
  currency: 'VND' | 'USD' | 'EUR';
  transferPurpose: string;
  transferDescription: string;
  feeBearer: 'SENDER' | 'BENEFICIARY' | 'SHARED';
  scheduledDate: string;
  notes: string;
}

function emptyForm(): TransferForm {
  return {
    sourceAccount: '',
    beneficiaryName: '',
    beneficiaryAccountNumber: '',
    beneficiaryBankCode: '',
    amount: null,
    currency: 'VND',
    transferPurpose: '',
    transferDescription: '',
    feeBearer: 'SENDER',
    scheduledDate: '',
    notes: '',
  };
}

@Component({
  selector: 'app-single-transfer-page',
  standalone: true,
  imports: [CommonModule, FormsModule, VndPipe, WarningPanelComponent],
  template: `
    <div class="max-w-lg mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <h1 class="text-xl font-semibold text-ink-800">Chuyển tiền</h1>

      <!-- EDITING -->
      <div class="card p-5" *ngIf="stage() === 'editing'">
        <form (ngSubmit)="preview()" class="space-y-4">
          <div>
            <label class="text-xs font-medium text-ink-600">Tài khoản nguồn</label>
            <select [(ngModel)]="form.sourceAccount" name="sourceAccount" class="input mt-1" required>
              <option value="" disabled>Chọn tài khoản nguồn</option>
              <option *ngFor="let acc of rmData.accounts()" [value]="acc.id">
                {{ acc.accountNumber }} — {{ acc.accountName }}
              </option>
            </select>
          </div>

          <!-- Tên tài khoản nguồn / Số dư khả dụng — shown as standalone read-only fields once a
               source account is selected (ui-ux-audit.md #21: these were previously only visible
               inline inside the <option> label, not as fields a Maker could double-check). -->
          <div class="grid grid-cols-2 gap-3" *ngIf="selectedAccount() as acc">
            <div>
              <label class="text-xs font-medium text-ink-600">Tên tài khoản nguồn</label>
              <p class="input mt-1 bg-ink-50 text-ink-700">{{ acc.accountName }}</p>
            </div>
            <div>
              <label class="text-xs font-medium text-ink-600">Số dư khả dụng</label>
              <p class="input mt-1 bg-ink-50 text-ink-700">{{ acc.availableBalance | vnd: acc.currency }}</p>
            </div>
          </div>

          <div class="border-t border-ink-100 pt-4">
            <p class="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Thông tin người thụ hưởng</p>
            <div class="space-y-3">
              <div>
                <label class="text-xs font-medium text-ink-600">Tên người/đơn vị thụ hưởng</label>
                <input [(ngModel)]="form.beneficiaryName" name="beneficiaryName" class="input mt-1" placeholder="Nguyễn Văn A" required />
              </div>
              <div>
                <label class="text-xs font-medium text-ink-600">Số tài khoản người thụ hưởng</label>
                <input [(ngModel)]="form.beneficiaryAccountNumber" name="beneficiaryAccountNumber" class="input mt-1" placeholder="0123456789" required />
              </div>
              <div>
                <label class="text-xs font-medium text-ink-600">Ngân hàng thụ hưởng</label>
                <select [(ngModel)]="form.beneficiaryBankCode" name="beneficiaryBankCode" class="input mt-1" required>
                  <option value="" disabled>Chọn ngân hàng</option>
                  <option *ngFor="let b of banks" [value]="b.code">{{ b.name }}</option>
                </select>
              </div>
            </div>
          </div>

          <div class="border-t border-ink-100 pt-4">
            <p class="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Số tiền</p>
            <div class="grid grid-cols-3 gap-3">
              <div class="col-span-2">
                <label class="text-xs font-medium text-ink-600">Số tiền</label>
                <input [(ngModel)]="form.amount" name="amount" type="number" min="1" class="input mt-1" placeholder="0" required />
              </div>
              <div>
                <label class="text-xs font-medium text-ink-600">Loại tiền</label>
                <select [(ngModel)]="form.currency" name="currency" class="input mt-1">
                  <option value="VND">VND</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
          </div>

          <div class="border-t border-ink-100 pt-4 space-y-3">
            <div>
              <label class="text-xs font-medium text-ink-600">Mục đích chuyển tiền</label>
              <input [(ngModel)]="form.transferPurpose" name="transferPurpose" class="input mt-1" placeholder="Thanh toán hàng hóa/dịch vụ" required />
            </div>
            <div>
              <label class="text-xs font-medium text-ink-600">Nội dung chuyển tiền</label>
              <input [(ngModel)]="form.transferDescription" name="transferDescription" class="input mt-1" maxlength="255" placeholder="Nội dung (tuỳ chọn)" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-medium text-ink-600">Người chịu phí</label>
                <select [(ngModel)]="form.feeBearer" name="feeBearer" class="input mt-1">
                  <option value="SENDER">Người chuyển (SENDER)</option>
                  <option value="BENEFICIARY">Người nhận (BENEFICIARY)</option>
                  <option value="SHARED">Chia đôi (SHARED)</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-medium text-ink-600">Ngày hiệu lực (tuỳ chọn)</label>
                <input [(ngModel)]="form.scheduledDate" name="scheduledDate" type="date" class="input mt-1" />
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-ink-600">Ghi chú (tuỳ chọn)</label>
              <textarea [(ngModel)]="form.notes" name="notes" rows="2" maxlength="255" class="input mt-1" placeholder="Ghi chú nội bộ, không hiển thị cho người thụ hưởng"></textarea>
            </div>
          </div>

          <button type="submit" class="btn-primary w-full" [disabled]="!canPreview() || previewing()">
            {{ previewing() ? 'Đang kiểm tra...' : 'Kiểm tra & Xem trước' }}
          </button>
        </form>
      </div>

      <!-- PREVIEWING -->
      <div class="space-y-4" *ngIf="stage() === 'previewing' && command() as cmd">
        <div class="card p-5 space-y-3">
          <p class="text-sm font-semibold text-ink-700">Xem trước lệnh chuyển tiền — {{ cmd.referenceNo }}</p>
          <dl class="text-sm space-y-1.5">
            <div class="flex justify-between"><dt class="text-ink-400">Người thụ hưởng</dt><dd class="text-ink-800 font-medium">{{ form.beneficiaryName }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-400">Số tài khoản</dt><dd class="text-ink-800">{{ form.beneficiaryAccountNumber }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-400">Ngân hàng</dt><dd class="text-ink-800">{{ bankName(form.beneficiaryBankCode) }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-400">Số tiền</dt><dd class="text-ink-800 font-semibold">{{ form.amount | vnd: form.currency }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-400">Người chịu phí</dt><dd class="text-ink-800">{{ feeBearerLabel(form.feeBearer) }}</dd></div>
            <div class="flex justify-between" *ngIf="form.notes"><dt class="text-ink-400">Ghi chú</dt><dd class="text-ink-800">{{ form.notes }}</dd></div>
          </dl>
        </div>

        <app-warning-panel [warnings]="cmd.validationResult.warnings" />

        <div class="flex gap-3">
          <button class="btn-secondary flex-1" (click)="backToEdit()" [disabled]="submitting()">Sửa lại</button>
          <button class="btn-primary flex-1" (click)="submit()" [disabled]="!cmd.validationResult.valid || submitting()">
            {{ submitting() ? 'Đang gửi...' : 'Gửi duyệt' }}
          </button>
        </div>
        <p class="text-xs text-ink-400 text-center" *ngIf="!cmd.validationResult.valid">
          Còn cảnh báo chặn (⛔) ở trên — vui lòng sửa lại trước khi gửi.
        </p>
      </div>

      <!-- SUBMITTED -->
      <div class="card p-6 text-center" *ngIf="stage() === 'submitted' && command() as cmd">
        <div class="w-14 h-14 rounded-full bg-teal-50 text-positive flex items-center justify-center text-2xl mx-auto">✓</div>
        <p class="text-base font-semibold text-ink-800 mt-3">Lệnh chuyển tiền đã được gửi tới Checker</p>
        <p class="text-sm text-ink-500 mt-1">
          {{ cmd.referenceNo }} — {{ form.amount | vnd: form.currency }} tới {{ form.beneficiaryName }} đang chờ phê duyệt.
        </p>
        <button class="btn-secondary mt-4" (click)="reset()">Tạo lệnh mới</button>
      </div>
    </div>
  `,
})
export class SingleTransferPageComponent {
  readonly rmData = inject(RmDataService);
  private readonly commands = inject(CommandsService);
  private readonly toast = inject(ToastService);

  readonly banks = BENEFICIARY_BANKS;
  readonly form: TransferForm = emptyForm();

  readonly stage = signal<Stage>('editing');
  readonly command = signal<BankingCommand | null>(null);
  readonly previewing = signal(false);
  readonly submitting = signal(false);
  readonly loadingDraft = signal(false);

  constructor() {
    // Maker/Checker upgrade, Slice 5 — the Virtual RM Agent hands off a create_transfer intent
    // by navigating here with `{ commandId }` in router state (rm-message-builder.ts's
    // buildAgentMessages(), same mechanism the LC PO-upload assistant already uses for structured
    // prefill — see lc-create.page.ts's own constructor). Loads the REAL draft the Agent already
    // created server-side rather than re-deriving it client-side.
    const state = history.state as { commandId?: string } | undefined;
    if (state?.commandId) void this.loadDraft(state.commandId);
  }

  private async loadDraft(commandId: string): Promise<void> {
    this.loadingDraft.set(true);
    try {
      const cmd = await this.commands.get(commandId);
      this.command.set(cmd);
      const data = cmd.formData as Partial<TransferForm>;
      Object.assign(this.form, emptyForm(), data);
      this.toast.show(`Đã tải sẵn thông tin từ Virtual RM (${cmd.referenceNo}) — vui lòng bổ sung phần còn thiếu.`, 'info');
    } catch {
      this.toast.show('Không tải được bản nháp từ Virtual RM — vui lòng nhập lại thủ công.', 'error');
    } finally {
      this.loadingDraft.set(false);
    }
  }

  canPreview(): boolean {
    const f = this.form;
    return !!(f.sourceAccount && f.beneficiaryName && f.beneficiaryAccountNumber && f.beneficiaryBankCode && f.amount && f.amount > 0 && f.transferPurpose);
  }

  bankName(code: string): string {
    return this.banks.find((b) => b.code === code)?.name ?? code;
  }

  selectedAccount() {
    return this.rmData.accounts().find((acc) => acc.id === this.form.sourceAccount) ?? null;
  }

  feeBearerLabel(value: TransferForm['feeBearer']): string {
    return { SENDER: 'Người chuyển', BENEFICIARY: 'Người nhận', SHARED: 'Chia đôi' }[value];
  }

  private formData(): Record<string, unknown> {
    const f = this.form;
    return {
      sourceAccount: f.sourceAccount,
      beneficiaryName: f.beneficiaryName,
      beneficiaryAccountNumber: f.beneficiaryAccountNumber,
      beneficiaryBankCode: f.beneficiaryBankCode,
      beneficiaryBankName: this.bankName(f.beneficiaryBankCode),
      amount: f.amount,
      currency: f.currency,
      transferPurpose: f.transferPurpose,
      transferDescription: f.transferDescription,
      feeBearer: f.feeBearer,
      scheduledDate: f.scheduledDate || undefined,
      notes: f.notes || undefined,
    };
  }

  async preview(): Promise<void> {
    if (!this.canPreview() || this.previewing()) return;
    this.previewing.set(true);
    try {
      const existing = this.command();
      const cmd = existing ? await this.commands.updateDraft(existing.id, this.formData()) : await this.commands.create('TRANSFER', this.formData());
      const validated = await this.commands.validate(cmd.id);
      this.command.set(validated);
      this.stage.set('previewing');
    } catch {
      this.toast.show('Không thể kiểm tra lệnh chuyển tiền — vui lòng thử lại.', 'error');
    } finally {
      this.previewing.set(false);
    }
  }

  backToEdit(): void {
    this.stage.set('editing');
  }

  async submit(): Promise<void> {
    const cmd = this.command();
    if (!cmd || this.submitting()) return;
    this.submitting.set(true);
    try {
      const submitted = await this.commands.submit(cmd.id);
      this.command.set(submitted);
      this.stage.set('submitted');
      this.toast.show(`Đã gửi lệnh ${submitted.referenceNo} tới Checker.`, 'success');
    } catch {
      this.toast.show('Không thể gửi lệnh — vui lòng kiểm tra lại thông tin.', 'error');
    } finally {
      this.submitting.set(false);
    }
  }

  reset(): void {
    Object.assign(this.form, emptyForm());
    this.command.set(null);
    this.stage.set('editing');
  }
}
