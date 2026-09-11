import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Collection } from '../../../core/models';
import { TradeFinanceService } from '../../../core/services/trade-finance.service';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { VndShortPipe } from '../../../shared/pipes/vnd.pipe';
import { statusLabel, statusTone } from '../trade-finance-ui.util';

/** Phase 7 — /trade-finance/collections. Outward/Inward, D/P vs D/A — same filterable-table
 * pattern as LC/Guarantee. */
@Component({
  selector: 'app-collection-list-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BadgeComponent, EmptyStateComponent, LoadingSpinnerComponent, VndShortPipe],
  template: `
    <div class="max-w-6xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-ink-800">Nhờ thu (Documentary Collection)</h1>
          <p class="text-sm text-ink-500 mt-1">{{ filtered().length }} / {{ tf.collections().length }} bộ nhờ thu.</p>
        </div>
        <a routerLink="/trade-finance/collections/create" class="btn-primary">+ Yêu cầu nhờ thu mới</a>
      </div>

      <div class="card p-3 flex flex-wrap gap-2">
        <input class="input flex-1 min-w-[160px]" placeholder="Tìm theo counterparty / số nhờ thu..." [ngModel]="search()" (ngModelChange)="search.set($event)" />
        <select class="input w-auto" [ngModel]="subTypeFilter()" (ngModelChange)="subTypeFilter.set($event)">
          <option value="">D/P và D/A</option>
          <option value="DP">D/P</option>
          <option value="DA">D/A</option>
        </select>
        <select class="input w-auto" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
          <option value="">Tất cả trạng thái</option>
          <option *ngFor="let s of statusOptions" [value]="s">{{ statusLabel(s) }}</option>
        </select>
      </div>

      <app-loading-spinner *ngIf="tf.loading() && !tf.loaded()" />
      <app-empty-state *ngIf="tf.loaded() && filtered().length === 0" icon="📥" title="Không có bộ nhờ thu phù hợp bộ lọc" />

      <div class="card overflow-hidden" *ngIf="tf.loaded() && filtered().length > 0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-ink-400 border-b border-ink-100">
                <th class="py-2.5 px-4 font-medium">Số nhờ thu</th>
                <th class="py-2.5 px-3 font-medium">Loại</th>
                <th class="py-2.5 px-3 font-medium">Drawer / Drawee</th>
                <th class="py-2.5 px-3 font-medium text-right">Giá trị</th>
                <th class="py-2.5 px-3 font-medium">Đến hạn</th>
                <th class="py-2.5 px-3 font-medium">Chứng từ</th>
                <th class="py-2.5 px-3 font-medium">Trạng thái</th>
                <th class="py-2.5 px-4 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of filtered()" class="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                <td class="py-3 px-4 font-medium text-ink-800 whitespace-nowrap">{{ c.collectionNumber }}</td>
                <td class="py-3 px-3 text-ink-500 whitespace-nowrap">{{ c.direction === 'INWARD' ? 'Inward' : 'Outward' }} · {{ c.subType }}</td>
                <td class="py-3 px-3 text-ink-600 max-w-[220px]">
                  <p class="truncate">{{ c.drawer }}</p>
                  <p class="truncate text-xs text-ink-400">→ {{ c.drawee }}</p>
                </td>
                <td class="py-3 px-3 text-right font-medium text-ink-800 whitespace-nowrap">{{ c.amount | vndShort }} {{ c.currency }}</td>
                <td class="py-3 px-3 text-ink-500 whitespace-nowrap">{{ c.dueDate }}</td>
                <td class="py-3 px-3 text-ink-500">{{ receivedCount(c) }}/{{ c.documents.length }}</td>
                <td class="py-3 px-3"><app-badge [tone]="statusTone(c.status)" [label]="statusLabel(c.status)" /></td>
                <td class="py-3 px-4 text-right">
                  <a [routerLink]="['/trade-finance/collections', c.collectionNumber]" class="text-brand-600 hover:underline text-xs font-semibold">Xem chi tiết →</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class CollectionListPageComponent implements OnInit {
  readonly tf = inject(TradeFinanceService);

  readonly search = signal('');
  readonly subTypeFilter = signal('');
  readonly statusFilter = signal('');

  readonly statusOptions: Collection['status'][] = ['AWAITING_PAYMENT', 'AWAITING_ACCEPTANCE', 'ACCEPTED', 'OVERDUE', 'PROCESSING', 'COMPLETED', 'CANCELLED'];

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.tf.collections().filter((c) => {
      if (this.subTypeFilter() && c.subType !== this.subTypeFilter()) return false;
      if (this.statusFilter() && c.status !== this.statusFilter()) return false;
      if (q && !c.collectionNumber.toLowerCase().includes(q) && !c.counterparty.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  readonly statusLabel = statusLabel;
  readonly statusTone = statusTone;

  ngOnInit(): void {
    if (!this.tf.loaded()) void this.tf.loadAll();
  }

  receivedCount(c: Collection): number {
    return c.documents.filter((d) => d.received).length;
  }
}
