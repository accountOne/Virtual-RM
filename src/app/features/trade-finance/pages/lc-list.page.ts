import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LetterOfCredit } from '../../../core/models';
import { TradeFinanceService } from '../../../core/services/trade-finance.service';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { VndShortPipe } from '../../../shared/pipes/vnd.pipe';
import { daysUntil, statusLabel, statusTone } from '../trade-finance-ui.util';

const TODAY = new Date().toISOString().slice(0, 10);

function riskLevel(lc: LetterOfCredit): 'high' | 'medium' | 'low' {
  const openDiscrepancy = lc.discrepancies.some((d) => d.status === 'OPEN');
  const days = daysUntil(lc.expiryDate, TODAY);
  if (lc.status === 'DISCREPANCY' || openDiscrepancy || days <= 7) return 'high';
  if (days <= 30 || lc.documents.some((d) => d.status === 'MISSING' || d.status === 'PENDING')) return 'medium';
  return 'low';
}

/** Phase 7 — /trade-finance/lc. A proper filterable LC list, same table pattern as
 * payments/approval.page.ts, so this reads like a native Business Banking screen rather
 * than a bolted-on demo view. */
@Component({
  selector: 'app-lc-list-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BadgeComponent, EmptyStateComponent, LoadingSpinnerComponent, VndShortPipe],
  template: `
    <div class="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-ink-800">Thư tín dụng (LC)</h1>
          <p class="text-sm text-ink-500 mt-1">{{ filtered().length }} / {{ tf.lcs().length }} thư tín dụng.</p>
        </div>
        <a routerLink="/trade-finance/lc/create" class="btn-primary">+ Yêu cầu mở LC mới</a>
      </div>

      <div class="card p-3 flex flex-wrap gap-2">
        <input
          class="input flex-1 min-w-[160px]"
          placeholder="Tìm theo beneficiary / số LC..."
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
        />
        <select class="input w-auto" [ngModel]="typeFilter()" (ngModelChange)="typeFilter.set($event)">
          <option value="">Tất cả loại</option>
          <option value="IMPORT">Nhập khẩu</option>
          <option value="EXPORT">Xuất khẩu</option>
        </select>
        <select class="input w-auto" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
          <option value="">Tất cả trạng thái</option>
          <option *ngFor="let s of statusOptions" [value]="s">{{ statusLabel(s) }}</option>
        </select>
        <select class="input w-auto" [ngModel]="riskFilter()" (ngModelChange)="riskFilter.set($event)">
          <option value="">Mọi mức rủi ro</option>
          <option value="high">Rủi ro cao</option>
          <option value="medium">Rủi ro trung bình</option>
          <option value="low">Rủi ro thấp</option>
        </select>
      </div>

      <app-loading-spinner *ngIf="tf.loading() && !tf.loaded()" />

      <app-empty-state *ngIf="tf.loaded() && filtered().length === 0" icon="📄" title="Không có LC phù hợp bộ lọc" />

      <div class="card overflow-hidden" *ngIf="tf.loaded() && filtered().length > 0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-ink-400 border-b border-ink-100">
                <th class="py-2.5 px-4 font-medium">Số LC</th>
                <th class="py-2.5 px-3 font-medium">Loại</th>
                <th class="py-2.5 px-3 font-medium">Applicant / Beneficiary</th>
                <th class="py-2.5 px-3 font-medium text-right">Giá trị</th>
                <th class="py-2.5 px-3 font-medium">Hết hạn</th>
                <th class="py-2.5 px-3 font-medium">Chứng từ</th>
                <th class="py-2.5 px-3 font-medium">Rủi ro</th>
                <th class="py-2.5 px-3 font-medium">Trạng thái</th>
                <th class="py-2.5 px-4 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let lc of filtered()" class="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                <td class="py-3 px-4 font-medium text-ink-800 whitespace-nowrap">{{ lc.lcNumber }}</td>
                <td class="py-3 px-3 text-ink-500 whitespace-nowrap">{{ lc.type === 'IMPORT' ? 'Nhập khẩu' : 'Xuất khẩu' }} · {{ lc.subType }}</td>
                <td class="py-3 px-3 text-ink-600 max-w-[220px]">
                  <p class="truncate">{{ lc.applicant }}</p>
                  <p class="truncate text-xs text-ink-400">{{ lc.beneficiary }}</p>
                </td>
                <td class="py-3 px-3 text-right font-medium text-ink-800 whitespace-nowrap">{{ lc.amount | vndShort }} {{ lc.currency }}</td>
                <td class="py-3 px-3 text-ink-500 whitespace-nowrap">{{ lc.expiryDate }}</td>
                <td class="py-3 px-3 text-ink-500 whitespace-nowrap">{{ receivedCount(lc) }}/{{ lc.documents.length }}</td>
                <td class="py-3 px-3"><app-badge [tone]="riskLevel(lc)" [label]="riskLabel(riskLevel(lc))" /></td>
                <td class="py-3 px-3"><app-badge [tone]="statusTone(lc.status)" [label]="statusLabel(lc.status)" /></td>
                <td class="py-3 px-4 text-right">
                  <a [routerLink]="['/trade-finance/lc', lc.lcNumber]" class="text-brand-600 hover:underline text-xs font-semibold">Xem chi tiết →</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class LcListPageComponent implements OnInit {
  readonly tf = inject(TradeFinanceService);

  readonly search = signal('');
  readonly typeFilter = signal('');
  readonly statusFilter = signal('');
  readonly riskFilter = signal('');

  readonly statusOptions: LetterOfCredit['status'][] = ['ACTIVE', 'DOCUMENT_PENDING', 'DISCREPANCY', 'PENDING_APPROVAL', 'EXPIRED', 'COMPLETED', 'CANCELLED'];

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.tf.lcs().filter((lc) => {
      if (this.typeFilter() && lc.type !== this.typeFilter()) return false;
      if (this.statusFilter() && lc.status !== this.statusFilter()) return false;
      if (this.riskFilter() && riskLevel(lc) !== this.riskFilter()) return false;
      if (q && !lc.lcNumber.toLowerCase().includes(q) && !lc.beneficiary.toLowerCase().includes(q) && !lc.applicant.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  readonly statusLabel = statusLabel;
  readonly statusTone = statusTone;
  readonly riskLevel = riskLevel;

  ngOnInit(): void {
    if (!this.tf.loaded()) void this.tf.loadAll();
  }

  receivedCount(lc: LetterOfCredit): number {
    return lc.documents.filter((d) => d.received).length;
  }

  riskLabel(level: 'high' | 'medium' | 'low'): string {
    return level === 'high' ? 'Cao' : level === 'medium' ? 'Trung bình' : 'Thấp';
  }
}
