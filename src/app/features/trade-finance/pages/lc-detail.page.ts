import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LetterOfCredit } from '../../../core/models';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { TradeFinanceService } from '../../../core/services/trade-finance.service';
import { ToastService } from '../../../core/services/toast.service';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { VndPipe } from '../../../shared/pipes/vnd.pipe';
import { DOCUMENT_STATUS_LABEL, LC_SUBTYPE_LABEL, statusLabel, statusTone } from '../trade-finance-ui.util';

const STAGES = ['Request', 'Review', 'Approval', 'Issued', 'Advised', 'Shipment', 'Document Presentation', 'Examination', 'Payment', 'Settlement', 'Closed'];

/** Index into STAGES for the current stage of the LC's (simplified, demo) lifecycle —
 * derived from status + document/discrepancy state, since this mock data has no explicit
 * stage field. Not a real ICC-standard lifecycle engine (out of scope per the architecture
 * doc's own "no formal LC lifecycle state machine" — this is a visual aid, not a workflow). */
function lcStage(lc: LetterOfCredit, today: string): number {
  if (lc.status === 'PENDING_APPROVAL') return 2;
  if (lc.status === 'EXPIRED' || lc.status === 'CANCELLED' || lc.status === 'COMPLETED') return 10;
  const shipped = new Date(lc.latestShipmentDate).getTime() < new Date(today).getTime();
  if (!shipped) return 5;
  const hasOpenDiscrepancy = lc.discrepancies.some((d) => d.status === 'OPEN') || lc.status === 'DISCREPANCY';
  const allDocsReceived = lc.documents.length > 0 && lc.documents.every((d) => d.received);
  if (!allDocsReceived) return 6;
  if (hasOpenDiscrepancy) return 7;
  return 8;
}

@Component({
  selector: 'app-lc-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink, BadgeComponent, LoadingSpinnerComponent, VndPipe],
  template: `
    <div class="max-w-4xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <a routerLink="/trade-finance/lc" class="text-xs text-ink-400 hover:text-ink-600">← Danh sách LC</a>

      <app-loading-spinner *ngIf="loading()" />

      <ng-container *ngIf="!loading() && lc() as l">
        <!-- Header -->
        <div class="card p-5 sm:p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-xl font-semibold text-ink-800">{{ l.lcNumber }}</h1>
                <app-badge [tone]="statusTone(l.status)" [label]="statusLabel(l.status)" />
              </div>
              <p class="text-sm text-ink-500 mt-1">{{ l.type === 'IMPORT' ? 'LC Nhập khẩu' : 'LC Xuất khẩu' }} · {{ lcSubtypeLabel(l.subType) }}</p>
              <p class="text-2xl font-semibold text-ink-800 mt-2">{{ l.amount | vnd: l.currency }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button class="btn-secondary text-xs" (click)="requestAmendment()">Yêu cầu tu chỉnh</button>
              <button class="btn-secondary text-xs" (click)="requestExtension()">Yêu cầu gia hạn</button>
              <button class="btn-secondary text-xs" (click)="scrollToDocuments()">Xem chứng từ</button>
              <a routerLink="/virtual-rm" class="btn-secondary text-xs">Liên hệ RM</a>
            </div>
          </div>
        </div>

        <!-- Overview -->
        <div class="card p-5 sm:p-6">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Thông tin chung</p>
          <dl class="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt class="text-ink-400">Reference No.</dt><dd class="text-ink-800 font-medium">{{ l.referenceNo }}</dd></div>
            <div><dt class="text-ink-400">Applicant</dt><dd class="text-ink-800 font-medium">{{ l.applicant }}</dd></div>
            <div><dt class="text-ink-400">Beneficiary</dt><dd class="text-ink-800 font-medium">{{ l.beneficiary }}</dd></div>
            <div><dt class="text-ink-400">Issuing Bank</dt><dd class="text-ink-800 font-medium">{{ l.issuingBank }}</dd></div>
            <div><dt class="text-ink-400">Advising Bank</dt><dd class="text-ink-800 font-medium">{{ l.advisingBank }}</dd></div>
            <div><dt class="text-ink-400">Payment Term</dt><dd class="text-ink-800 font-medium">{{ l.paymentTerm }} · {{ l.availableWith }}</dd></div>
            <div><dt class="text-ink-400">Issue Date</dt><dd class="text-ink-800 font-medium">{{ l.issueDate }}</dd></div>
            <div><dt class="text-ink-400">Expiry Date</dt><dd class="text-ink-800 font-medium">{{ l.expiryDate }}</dd></div>
            <div><dt class="text-ink-400">Latest Shipment Date</dt><dd class="text-ink-800 font-medium">{{ l.latestShipmentDate }}</dd></div>
            <div><dt class="text-ink-400">Presentation Period</dt><dd class="text-ink-800 font-medium">{{ l.presentationPeriodDays }} ngày</dd></div>
            <div><dt class="text-ink-400">Outstanding</dt><dd class="text-ink-800 font-medium">{{ l.outstandingAmount | vnd: l.currency }}</dd></div>
          </dl>
        </div>

        <!-- Lifecycle -->
        <div class="card p-5 sm:p-6">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-4">Vòng đời LC</p>
          <div class="overflow-x-auto">
            <div class="flex items-center gap-1 min-w-max">
              <ng-container *ngFor="let s of stages; let i = index; let last = last">
                <div class="flex flex-col items-center w-24 text-center">
                  <div
                    class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                    [ngClass]="i < stage() ? 'bg-positive text-white' : i === stage() ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-400'"
                  >
                    {{ i < stage() ? '✓' : i === stage() ? '●' : '○' }}
                  </div>
                  <p class="text-[10px] mt-1.5 leading-tight" [class.text-ink-800]="i <= stage()" [class.font-semibold]="i === stage()" [class.text-ink-400]="i > stage()">{{ s }}</p>
                </div>
                <div *ngIf="!last" class="h-0.5 flex-1 min-w-[16px]" [ngClass]="i < stage() ? 'bg-positive' : 'bg-ink-100'"></div>
              </ng-container>
            </div>
          </div>
        </div>

        <!-- Documents -->
        <div id="documents" class="card p-5 sm:p-6 scroll-mt-4">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Chứng từ ({{ receivedCount(l) }}/{{ l.documents.length }})</p>
          <ul class="space-y-2">
            <li *ngFor="let d of l.documents" class="flex items-center justify-between text-sm py-1.5 border-b border-ink-50 last:border-0">
              <span class="text-ink-700">{{ d.documentType }}</span>
              <app-badge [tone]="docTone(d.status)" [label]="docIcon(d.status) + ' ' + docLabel(d.status)" [dot]="false" />
            </li>
            <li *ngIf="l.documents.length === 0" class="text-sm text-ink-400 py-2">Chưa có chứng từ nào được yêu cầu.</li>
          </ul>
        </div>

        <!-- Discrepancies -->
        <div id="discrepancy" class="card p-5 sm:p-6 scroll-mt-4" *ngIf="l.discrepancies.length > 0">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Sai biệt ⚠ {{ l.discrepancies.length }}</p>
          <div *ngFor="let d of l.discrepancies" class="text-sm py-2 border-b border-ink-50 last:border-0">
            <p class="text-ink-700">{{ d.description }}</p>
            <div class="flex items-center gap-2 mt-1">
              <app-badge [tone]="d.status === 'OPEN' ? 'critical' : 'positive'" [label]="d.status" />
              <span class="text-xs text-ink-400">{{ d.raisedDate }}</span>
            </div>
          </div>
          <p class="text-xs text-ink-400 mt-2">Sai biệt chỉ được xử lý bởi ngân hàng/RM — Virtual RM không tự động waive sai biệt.</p>
        </div>

        <!-- Amendments -->
        <div id="amendment" class="card p-5 sm:p-6 scroll-mt-4" *ngIf="l.amendments.length > 0">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Tu chỉnh (Amendment)</p>
          <div *ngFor="let a of l.amendments; let i = index" class="flex items-center justify-between text-sm py-2 border-b border-ink-50 last:border-0">
            <span class="text-ink-700">Amendment #{{ i + 1 }} — {{ a.description }}</span>
            <app-badge [tone]="a.status === 'ACCEPTED' ? 'positive' : a.status === 'PENDING' ? 'warning' : 'critical'" [label]="a.status" />
          </div>
        </div>

        <!-- Limit / demo note -->
        <div class="card p-5 sm:p-6">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">Hạn mức Trade Finance</p>
          <p class="text-xs text-ink-400">Xem chi tiết hạn mức tại Trade Finance Dashboard. Số liệu phí/collateral trong màn hình này là dữ liệu demo/mock.</p>
        </div>
      </ng-container>

      <div *ngIf="!loading() && !lc()" class="card p-8 text-center text-sm text-ink-500">Không tìm thấy LC này.</div>
    </div>
  `,
})
export class LcDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tf = inject(TradeFinanceService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly stages = STAGES;
  readonly lc = signal<LetterOfCredit | undefined>(undefined);
  readonly loading = signal(true);
  readonly stage = computed(() => {
    const l = this.lc();
    return l ? lcStage(l, new Date().toISOString().slice(0, 10)) : 0;
  });

  readonly statusLabel = statusLabel;
  readonly statusTone = statusTone;

  ngOnInit(): void {
    // Angular reuses this component instance across navigations that only change the `:id`
    // param (same route config, e.g. one Virtual RM CTA to another) — reading the id once from
    // `route.snapshot` here would leave the page frozen on whichever LC loaded first. Subscribe
    // to `paramMap` instead so every id change (including the first) reloads.
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      void this.loadLc(pm.get('id'));
    });
  }

  private async loadLc(id: string | null): Promise<void> {
    this.loading.set(true);
    this.lc.set(id ? await this.tf.lcById(id) : undefined);
    this.loading.set(false);
    // Virtual RM's OPEN_LC_DOCUMENTS/_DISCREPANCY/_AMENDMENT navigate here with a URL
    // fragment (e.g. .../LC-2026-001#documents) so "LC001 thiếu chứng từ gì?" lands
    // straight on that section, not just the top of the detail page.
    const fragment = this.route.snapshot.fragment;
    if (fragment) queueMicrotask(() => document.getElementById(fragment)?.scrollIntoView({ block: 'start' }));
  }

  scrollToDocuments(): void {
    document.getElementById('documents')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  receivedCount(l: LetterOfCredit): number {
    return l.documents.filter((d) => d.received).length;
  }

  lcSubtypeLabel(subType: string): string {
    return LC_SUBTYPE_LABEL[subType] ?? subType;
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

  async requestAmendment(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Yêu cầu tu chỉnh LC',
      message: 'Đây là thao tác mô phỏng — yêu cầu sẽ được ghi nhận và chuyên viên MSB sẽ liên hệ để xử lý, hệ thống không tự động sửa đổi LC.',
      confirmLabel: 'Gửi yêu cầu',
    });
    if (ok) this.toast.success('Đã ghi nhận yêu cầu tu chỉnh (mô phỏng).');
  }

  async requestExtension(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Yêu cầu gia hạn LC',
      message: 'Đây là thao tác mô phỏng — yêu cầu sẽ được ghi nhận và chuyên viên MSB sẽ liên hệ để xử lý, hệ thống không tự động gia hạn LC.',
      confirmLabel: 'Gửi yêu cầu',
    });
    if (ok) this.toast.success('Đã ghi nhận yêu cầu gia hạn (mô phỏng).');
  }
}
