import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BankGuarantee } from '../../../core/models';
import { TradeFinanceService } from '../../../core/services/trade-finance.service';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { VndShortPipe } from '../../../shared/pipes/vnd.pipe';
import { GUARANTEE_TYPE_LABEL, daysUntil, statusLabel, statusTone } from '../trade-finance-ui.util';

const TODAY = new Date().toISOString().slice(0, 10);

function riskLevel(g: BankGuarantee): 'high' | 'medium' | 'low' {
  const activeClaim = g.claims.some((c) => c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW');
  const days = daysUntil(g.expiryDate, TODAY);
  if (activeClaim || days <= 14) return 'high';
  if (g.extensionRequested || days <= 30) return 'medium';
  return 'low';
}

/** Phase 7 — /trade-finance/guarantees. Supports every guarantee subtype the spec lists
 * (Bid Bond, Performance, Advance Payment, Payment, Warranty, Customs, Tax, Other) via
 * GUARANTEE_TYPE_LABEL — same filterable-table pattern as the LC list. */
@Component({
  selector: 'app-guarantee-list-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BadgeComponent, EmptyStateComponent, LoadingSpinnerComponent, VndShortPipe],
  template: `
    <div class="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-ink-800">Bảo lãnh ngân hàng</h1>
          <p class="text-sm text-ink-500 mt-1">{{ filtered().length }} / {{ tf.guarantees().length }} bảo lãnh.</p>
        </div>
        <a routerLink="/trade-finance/guarantees/create" class="btn-primary">+ Yêu cầu phát hành mới</a>
      </div>

      <div class="card p-3 flex flex-wrap gap-2">
        <input class="input flex-1 min-w-[160px]" placeholder="Tìm theo beneficiary / số bảo lãnh..." [ngModel]="search()" (ngModelChange)="search.set($event)" />
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
      <app-empty-state *ngIf="tf.loaded() && filtered().length === 0" icon="🛡️" title="Không có bảo lãnh phù hợp bộ lọc" />

      <div class="card overflow-hidden" *ngIf="tf.loaded() && filtered().length > 0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-ink-400 border-b border-ink-100">
                <th class="py-2.5 px-4 font-medium">Số bảo lãnh</th>
                <th class="py-2.5 px-3 font-medium">Loại</th>
                <th class="py-2.5 px-3 font-medium">Beneficiary</th>
                <th class="py-2.5 px-3 font-medium text-right">Giá trị</th>
                <th class="py-2.5 px-3 font-medium">Hết hạn</th>
                <th class="py-2.5 px-3 font-medium">Claim</th>
                <th class="py-2.5 px-3 font-medium">Rủi ro</th>
                <th class="py-2.5 px-3 font-medium">Trạng thái</th>
                <th class="py-2.5 px-4 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let g of filtered()" class="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                <td class="py-3 px-4 font-medium text-ink-800 whitespace-nowrap">{{ g.bgNumber }}</td>
                <td class="py-3 px-3 text-ink-500 whitespace-nowrap">{{ typeLabel(g.type) }}</td>
                <td class="py-3 px-3 text-ink-600 max-w-[220px] truncate">{{ g.beneficiary }}</td>
                <td class="py-3 px-3 text-right font-medium text-ink-800 whitespace-nowrap">{{ g.amount | vndShort }} {{ g.currency }}</td>
                <td class="py-3 px-3 text-ink-500 whitespace-nowrap">{{ g.expiryDate }}</td>
                <td class="py-3 px-3 text-ink-500">{{ g.claims.length || '—' }}</td>
                <td class="py-3 px-3"><app-badge [tone]="riskLevel(g)" [label]="riskLabel(riskLevel(g))" /></td>
                <td class="py-3 px-3"><app-badge [tone]="statusTone(g.status)" [label]="statusLabel(g.status)" /></td>
                <td class="py-3 px-4 text-right">
                  <a [routerLink]="['/trade-finance/guarantees', g.bgNumber]" class="text-brand-600 hover:underline text-xs font-semibold">Xem chi tiết →</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class GuaranteeListPageComponent implements OnInit {
  readonly tf = inject(TradeFinanceService);

  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly riskFilter = signal('');

  readonly statusOptions: BankGuarantee['status'][] = ['ACTIVE', 'PENDING_APPROVAL', 'CLAIMED', 'EXPIRED', 'CANCELLED'];

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.tf.guarantees().filter((g) => {
      if (this.statusFilter() && g.status !== this.statusFilter()) return false;
      if (this.riskFilter() && riskLevel(g) !== this.riskFilter()) return false;
      if (q && !g.bgNumber.toLowerCase().includes(q) && !g.beneficiary.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  readonly statusLabel = statusLabel;
  readonly statusTone = statusTone;
  readonly riskLevel = riskLevel;

  ngOnInit(): void {
    if (!this.tf.loaded()) void this.tf.loadAll();
  }

  typeLabel(type: string): string {
    return GUARANTEE_TYPE_LABEL[type] ?? type;
  }

  riskLabel(level: 'high' | 'medium' | 'low'): string {
    return level === 'high' ? 'Cao' : level === 'medium' ? 'Trung bình' : 'Thấp';
  }
}
