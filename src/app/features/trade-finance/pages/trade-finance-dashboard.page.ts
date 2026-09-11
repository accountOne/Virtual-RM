import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TradeFinanceService } from '../../../core/services/trade-finance.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { VndShortPipe } from '../../../shared/pipes/vnd.pipe';

/** Phase 7 — /trade-finance. The Trade Finance "home base" for Business Banking: LC /
 * Guarantee / Collection at a glance plus a combined risk/action summary, each section
 * linking straight to its dedicated list screen. This is the screen Virtual RM's
 * OPEN_TRADE_FINANCE navigation action lands on — the chat explains, this page is where
 * the actual operational work happens (spec's "chat is not the system of record"). */
@Component({
  selector: 'app-trade-finance-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingSpinnerComponent, VndShortPipe],
  template: `
    <div class="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <app-loading-spinner *ngIf="tf.loading() && !tf.loaded()" />

      <ng-container *ngIf="tf.loaded() && tf.summary() as s">
        <div>
          <h1 class="text-xl font-semibold text-ink-800">Trade Finance</h1>
          <p class="text-sm text-ink-500 mt-1">Tổng quan LC, bảo lãnh ngân hàng và nhờ thu của doanh nghiệp.</p>
        </div>

        <!-- Risk / Action summary -->
        <div class="card p-5 bg-brand-50/60 border-brand-100">
          <p class="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-3">Cần chú ý</p>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p class="text-2xl font-semibold text-negative">{{ s.risk.highPriority }}</p>
              <p class="text-xs text-ink-500 mt-0.5">Mức ưu tiên cao</p>
            </div>
            <div>
              <p class="text-2xl font-semibold text-warn">{{ s.risk.expiringSoon }}</p>
              <p class="text-xs text-ink-500 mt-0.5">Sắp hết hạn (30 ngày)</p>
            </div>
            <div>
              <p class="text-2xl font-semibold text-warn">{{ s.risk.missingDocuments }}</p>
              <p class="text-xs text-ink-500 mt-0.5">Thiếu chứng từ</p>
            </div>
            <div>
              <p class="text-2xl font-semibold text-negative">{{ s.risk.overdue }}</p>
              <p class="text-xs text-ink-500 mt-0.5">Quá hạn</p>
            </div>
          </div>
        </div>

        <!-- Exposure -->
        <div class="card p-5">
          <p class="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Tổng exposure Trade Finance</p>
          <div class="flex flex-wrap gap-x-6 gap-y-2">
            <div *ngFor="let t of s.exposure.total">
              <span class="text-lg font-semibold text-ink-800">{{ t.amount | vndShort }}</span>
              <span class="text-xs text-ink-400 ml-1">{{ t.currency }}</span>
            </div>
          </div>
          <p class="text-xs text-ink-400 mt-2">LC {{ sumOf(s.exposure.lc) | vndShort }} · Bảo lãnh {{ sumOf(s.exposure.guarantee) | vndShort }} · Nhờ thu {{ sumOf(s.exposure.collection) | vndShort }}</p>
          <div class="mt-3" *ngIf="s.limit as l">
            <div class="flex items-center justify-between text-xs text-ink-500 mb-1">
              <span>Hạn mức Trade Finance</span>
              <span>{{ l.usedAmount | vndShort }} / {{ l.totalLimit | vndShort }}</span>
            </div>
            <div class="h-2 rounded-full bg-ink-100 overflow-hidden">
              <div class="h-full bg-brand-500" [style.width.%]="utilization(l)"></div>
            </div>
          </div>
        </div>

        <!-- LC / Guarantee / Collection cards -->
        <div class="grid sm:grid-cols-3 gap-4">
          <div class="card p-5 flex flex-col">
            <p class="text-sm font-semibold text-ink-800">📄 Thư tín dụng (LC)</p>
            <dl class="mt-3 space-y-2 text-sm flex-1">
              <div class="flex justify-between"><dt class="text-ink-500">Đang hiệu lực</dt><dd class="font-medium text-ink-800">{{ s.lc.active }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-500">Tổng dư nợ</dt><dd class="font-medium text-ink-800">{{ sumOf(s.lc.totalOutstanding) | vndShort }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-500">Sắp hết hạn</dt><dd class="font-medium" [class.text-warn]="s.lc.expiringSoon > 0">{{ s.lc.expiringSoon }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-500">Chờ chứng từ</dt><dd class="font-medium" [class.text-warn]="(s.lc.pendingDocuments ?? 0) > 0">{{ s.lc.pendingDocuments }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-500">Sai biệt</dt><dd class="font-medium" [class.text-negative]="(s.lc.discrepancy ?? 0) > 0">{{ s.lc.discrepancy }}</dd></div>
            </dl>
            <a routerLink="/trade-finance/lc" class="btn-primary mt-4 text-center">Xem LC</a>
          </div>

          <div class="card p-5 flex flex-col">
            <p class="text-sm font-semibold text-ink-800">🛡️ Bảo lãnh ngân hàng</p>
            <dl class="mt-3 space-y-2 text-sm flex-1">
              <div class="flex justify-between"><dt class="text-ink-500">Đang hiệu lực</dt><dd class="font-medium text-ink-800">{{ s.guarantee.active }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-500">Tổng dư nợ</dt><dd class="font-medium text-ink-800">{{ sumOf(s.guarantee.totalOutstanding) | vndShort }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-500">Sắp hết hạn</dt><dd class="font-medium" [class.text-warn]="s.guarantee.expiringSoon > 0">{{ s.guarantee.expiringSoon }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-500">Chờ phê duyệt</dt><dd class="font-medium" [class.text-warn]="(s.guarantee.pendingApproval ?? 0) > 0">{{ s.guarantee.pendingApproval }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-500">Yêu cầu gọi bảo lãnh</dt><dd class="font-medium" [class.text-negative]="(s.guarantee.claims ?? 0) > 0">{{ s.guarantee.claims }}</dd></div>
            </dl>
            <a routerLink="/trade-finance/guarantees" class="btn-primary mt-4 text-center">Xem bảo lãnh</a>
          </div>

          <div class="card p-5 flex flex-col">
            <p class="text-sm font-semibold text-ink-800">📥 Nhờ thu</p>
            <dl class="mt-3 space-y-2 text-sm flex-1">
              <div class="flex justify-between"><dt class="text-ink-500">Đang xử lý</dt><dd class="font-medium text-ink-800">{{ s.collection.active }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-500">Tổng giá trị</dt><dd class="font-medium text-ink-800">{{ sumOf(s.collection.totalOutstanding) | vndShort }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-500">Chờ thanh toán</dt><dd class="font-medium" [class.text-warn]="(s.collection.awaitingPayment ?? 0) > 0">{{ s.collection.awaitingPayment }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-500">Chờ chấp nhận</dt><dd class="font-medium" [class.text-warn]="(s.collection.awaitingAcceptance ?? 0) > 0">{{ s.collection.awaitingAcceptance }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-500">Quá hạn</dt><dd class="font-medium" [class.text-negative]="(s.collection.overdue ?? 0) > 0">{{ s.collection.overdue }}</dd></div>
            </dl>
            <a routerLink="/trade-finance/collections" class="btn-primary mt-4 text-center">Xem nhờ thu</a>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class TradeFinanceDashboardPageComponent implements OnInit {
  readonly tf = inject(TradeFinanceService);

  ngOnInit(): void {
    if (!this.tf.loaded()) void this.tf.loadAll();
  }

  sumOf(totals: { currency: string; amount: number }[]): number {
    return totals.reduce((s, t) => s + t.amount, 0);
  }

  utilization(l: { usedAmount: number; totalLimit: number }): number {
    return l.totalLimit > 0 ? Math.min(100, Math.round((l.usedAmount / l.totalLimit) * 100)) : 0;
  }
}
