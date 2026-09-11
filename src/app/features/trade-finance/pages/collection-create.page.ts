import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CollectionDirection, CollectionSubType } from '../../../core/models';
import { TradeFinanceService } from '../../../core/services/trade-finance.service';
import { ToastService } from '../../../core/services/toast.service';

const STEP_LABELS = ['Loại nhờ thu', 'Các bên liên quan', 'Giá trị & hạn', 'Xem lại'];

/** Phase 7 — /trade-finance/collections/create. DEMO ONLY — creates a mock PROCESSING
 * record, never actually initiates a real collection with the counterparty bank. */
@Component({
  selector: 'app-collection-create-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-2xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <div>
        <h1 class="text-xl font-semibold text-ink-800">Yêu cầu nhờ thu mới</h1>
        <p class="text-sm text-ink-500 mt-1">Biểu mẫu demo — yêu cầu sẽ được ghi nhận ở trạng thái đang xử lý.</p>
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
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Drawer (bên ký phát)</span>
              <input class="input" [(ngModel)]="form.drawer" name="drawer" placeholder="ABC Manufacturing JSC" />
            </label>
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Drawee (bên trả tiền)</span>
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
            <label class="block"><span class="text-xs font-medium text-ink-600 mb-1 block">Due Date</span>
              <input class="input" type="date" [(ngModel)]="form.dueDate" name="dueDate" />
            </label>
          </ng-container>

          <ng-container *ngSwitchCase="4">
            <p class="text-sm font-semibold text-ink-800">Xem lại yêu cầu</p>
            <dl class="text-sm space-y-1.5 mt-2">
              <div class="flex justify-between"><dt class="text-ink-400">Chiều / Loại</dt><dd>{{ form.direction }} · {{ form.subType }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Drawer → Drawee</dt><dd>{{ form.drawer || '—' }} → {{ form.drawee || '—' }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Giá trị</dt><dd>{{ form.amount | number }} {{ form.currency }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Due Date</dt><dd>{{ form.dueDate || '—' }}</dd></div>
            </dl>
            <p class="text-xs text-ink-400 mt-3">Đây là demo — yêu cầu sẽ được tạo với trạng thái "Đang xử lý".</p>
          </ng-container>
        </ng-container>
      </div>

      <div class="flex justify-between">
        <button class="btn-secondary" *ngIf="step() > 1" (click)="step.set(step() - 1)">← Quay lại</button>
        <span *ngIf="step() === 1"></span>
        <button class="btn-primary" *ngIf="step() < 4" (click)="step.set(step() + 1)">Tiếp tục →</button>
        <button class="btn-primary" *ngIf="step() === 4" [disabled]="submitting()" (click)="submit()">Gửi yêu cầu</button>
      </div>
    </div>
  `,
})
export class CollectionCreatePageComponent {
  private readonly tf = inject(TradeFinanceService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly stepLabels = STEP_LABELS;
  readonly step = signal(1);
  readonly submitting = signal(false);

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

  async submit(): Promise<void> {
    this.submitting.set(true);
    try {
      const created = await this.tf.createCollection({
        type: this.form.type,
        subType: this.form.subType,
        direction: this.form.direction,
        drawer: this.form.drawer || 'Drawer (demo)',
        drawee: this.form.drawee || 'Drawee (demo)',
        currency: this.form.currency,
        amount: Number(this.form.amount) || 0,
        dueDate: this.form.dueDate || new Date().toISOString().slice(0, 10),
      });
      this.toast.success(`Đã gửi yêu cầu nhờ thu ${created.collectionNumber} (mô phỏng).`);
      this.router.navigateByUrl(`/trade-finance/collections/${created.collectionNumber}`);
    } finally {
      this.submitting.set(false);
    }
  }
}
