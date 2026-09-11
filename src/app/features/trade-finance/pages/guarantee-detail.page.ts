import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BankGuarantee } from '../../../core/models';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { TradeFinanceService } from '../../../core/services/trade-finance.service';
import { ToastService } from '../../../core/services/toast.service';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { VndPipe } from '../../../shared/pipes/vnd.pipe';
import { DOCUMENT_STATUS_LABEL, GUARANTEE_TYPE_LABEL, statusLabel, statusTone } from '../trade-finance-ui.util';

@Component({
  selector: 'app-guarantee-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink, BadgeComponent, LoadingSpinnerComponent, VndPipe],
  template: `
    <div class="max-w-4xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <a routerLink="/trade-finance/guarantees" class="text-xs text-ink-400 hover:text-ink-600">← Danh sách bảo lãnh</a>

      <app-loading-spinner *ngIf="loading()" />

      <ng-container *ngIf="!loading() && guarantee() as g">
        <div class="card p-5 sm:p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-xl font-semibold text-ink-800">{{ g.bgNumber }}</h1>
                <app-badge [tone]="statusTone(g.status)" [label]="statusLabel(g.status)" />
              </div>
              <p class="text-sm text-ink-500 mt-1">{{ typeLabel(g.type) }}</p>
              <p class="text-2xl font-semibold text-ink-800 mt-2">{{ g.amount | vnd: g.currency }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button class="btn-secondary text-xs" (click)="requestExtension()">Yêu cầu gia hạn</button>
              <button class="btn-secondary text-xs" (click)="requestAmendment()">Yêu cầu tu chỉnh</button>
              <a routerLink="/virtual-rm" class="btn-secondary text-xs">Liên hệ RM</a>
            </div>
          </div>
        </div>

        <div class="card p-5 sm:p-6">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Thông tin chung</p>
          <dl class="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt class="text-ink-400">Applicant</dt><dd class="text-ink-800 font-medium">{{ g.applicant }}</dd></div>
            <div><dt class="text-ink-400">Beneficiary</dt><dd class="text-ink-800 font-medium">{{ g.beneficiary }}</dd></div>
            <div><dt class="text-ink-400">Issue Date</dt><dd class="text-ink-800 font-medium">{{ g.issueDate }}</dd></div>
            <div><dt class="text-ink-400">Expiry Date</dt><dd class="text-ink-800 font-medium">{{ g.expiryDate }}</dd></div>
            <div><dt class="text-ink-400">Outstanding</dt><dd class="text-ink-800 font-medium">{{ g.outstandingAmount | vnd: g.currency }}</dd></div>
            <div><dt class="text-ink-400">Gia hạn</dt><dd class="text-ink-800 font-medium">{{ g.extensionRequested ? 'Đã yêu cầu' : 'Chưa yêu cầu' }}</dd></div>
          </dl>
        </div>

        <div class="card p-5 sm:p-6" *ngIf="g.documents.length > 0">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Chứng từ</p>
          <ul class="space-y-2">
            <li *ngFor="let d of g.documents" class="flex items-center justify-between text-sm py-1.5 border-b border-ink-50 last:border-0">
              <span class="text-ink-700">{{ d.documentType }}</span>
              <app-badge [tone]="docTone(d.status)" [label]="docIcon(d.status) + ' ' + docLabel(d.status)" [dot]="false" />
            </li>
          </ul>
        </div>

        <div id="claims" class="card p-5 sm:p-6 scroll-mt-4" *ngIf="g.claims.length > 0">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Yêu cầu gọi bảo lãnh (Claim) ⚠ {{ g.claims.length }}</p>
          <div *ngFor="let c of g.claims" class="flex items-center justify-between text-sm py-2 border-b border-ink-50 last:border-0">
            <div>
              <p class="text-ink-700 font-medium">{{ c.amount | vnd: g.currency }}</p>
              <p class="text-xs text-ink-400">{{ c.claimDate }}</p>
            </div>
            <app-badge [tone]="c.status === 'SETTLED' ? 'positive' : c.status === 'REJECTED' ? 'neutral' : 'critical'" [label]="c.status" />
          </div>
          <p class="text-xs text-ink-400 mt-2">Claim chỉ được xử lý/settle bởi ngân hàng — Virtual RM không tự động settle claim.</p>
        </div>
      </ng-container>

      <div *ngIf="!loading() && !guarantee()" class="card p-8 text-center text-sm text-ink-500">Không tìm thấy bảo lãnh này.</div>
    </div>
  `,
})
export class GuaranteeDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tf = inject(TradeFinanceService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);

  readonly guarantee = signal<BankGuarantee | undefined>(undefined);
  readonly loading = signal(true);

  readonly statusLabel = statusLabel;
  readonly statusTone = statusTone;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.guarantee.set(await this.tf.guaranteeById(id));
    this.loading.set(false);
    const fragment = this.route.snapshot.fragment;
    if (fragment) queueMicrotask(() => document.getElementById(fragment)?.scrollIntoView({ block: 'start' }));
  }

  typeLabel(type: string): string {
    return GUARANTEE_TYPE_LABEL[type] ?? type;
  }
  docTone(status: string) {
    return DOCUMENT_STATUS_LABEL[status]?.tone ?? 'neutral';
  }
  docIcon(status: string): string {
    return DOCUMENT_STATUS_LABEL[status]?.icon ?? '·';
  }
  docLabel(status: string): string {
    return DOCUMENT_STATUS_LABEL[status]?.label ?? status;
  }

  async requestExtension(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Yêu cầu gia hạn bảo lãnh',
      message: 'Đây là thao tác mô phỏng — yêu cầu sẽ được ghi nhận, hệ thống không tự động gia hạn bảo lãnh.',
      confirmLabel: 'Gửi yêu cầu',
    });
    if (ok) this.toast.success('Đã ghi nhận yêu cầu gia hạn (mô phỏng).');
  }

  async requestAmendment(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Yêu cầu tu chỉnh bảo lãnh',
      message: 'Đây là thao tác mô phỏng — yêu cầu sẽ được ghi nhận, hệ thống không tự động sửa đổi bảo lãnh.',
      confirmLabel: 'Gửi yêu cầu',
    });
    if (ok) this.toast.success('Đã ghi nhận yêu cầu tu chỉnh (mô phỏng).');
  }
}
