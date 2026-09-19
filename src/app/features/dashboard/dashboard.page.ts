import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { RmDataService } from '../../core/services/rm-data.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { QuickAction, QuickActionGridComponent } from '../../shared/components/quick-action-grid/quick-action-grid.component';
import { HERO_DARK_BG } from '../../shared/ui-tokens';
import { VndPipe } from '../../shared/pipes/vnd.pipe';

const SEVERITY_ICON: Record<string, string> = { CRITICAL: '🚨', WARNING: '⚠️', INFO: 'ℹ️' };

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingSpinnerComponent, VndPipe, QuickActionGridComponent],
  template: `
    <app-loading-spinner *ngIf="rmData.loading() && !rmData.loaded()" class="block max-w-5xl mx-auto p-4 sm:p-6" />

    <ng-container *ngIf="rmData.loaded()">
      <!-- Dark hero band (mockup screen 3) — company greeting + total balance, full-bleed so it
           reads edge-to-edge on mobile instead of sitting inside the same padded card column as
           the rest of the page. -->
      <div class="text-white px-4 sm:px-6 pt-6 pb-8" [style.background]="heroBg">
        <div class="max-w-5xl mx-auto">
          <p class="text-xs text-white/60">Xin chào, Doanh nghiệp</p>
          <h1 class="text-lg font-semibold mt-0.5">{{ rmData.customer()?.companyName }}</h1>
          <p class="text-xs text-white/50 mt-0.5">MSB Business Banking</p>

          <div class="flex items-center gap-2 mt-6 mb-1">
            <p class="text-xs text-white/60">Tổng số dư</p>
            <button
              class="text-white/60 hover:text-white p-0.5"
              [attr.aria-label]="balanceHidden() ? 'Hiện số dư' : 'Ẩn số dư'"
              (click)="balanceHidden.set(!balanceHidden())"
            >
              <svg *ngIf="!balanceHidden()" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>
              <svg *ngIf="balanceHidden()" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.9 5.1A11.6 11.6 0 0 1 12 5c7 0 11 7 11 7a13.4 13.4 0 0 1-3.2 3.9M6.6 6.6C3.5 8.6 1 12 1 12s4 7 11 7a10.6 10.6 0 0 0 4.2-.86" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <div class="flex flex-wrap gap-x-6 gap-y-1">
            <p *ngFor="let entry of balanceByCurrency()" class="text-2xl font-bold">
              {{ balanceHidden() ? '••••••' : (entry.total | vnd: entry.currency) }}
              <span class="text-sm font-normal text-white/60">{{ entry.currency }}</span>
            </p>
          </div>
        </div>
      </div>

      <div class="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 pb-24 -mt-4 relative z-10 bg-ink-50 rounded-t-2xl">
        <p class="text-sm text-ink-500">Tổng quan tài khoản doanh nghiệp hôm nay</p>

        <div class="grid sm:grid-cols-2 gap-4">
          <div *ngFor="let acc of rmData.accounts()" class="card p-5">
            <div class="flex items-center justify-between">
              <p class="text-xs text-ink-400">{{ acc.type }}</p>
              <span class="badge bg-ink-100 text-ink-600">{{ acc.currency }}</span>
            </div>
            <p class="text-sm text-ink-500 mt-2">{{ acc.accountName }}</p>
            <p class="text-xs text-ink-400 font-mono mt-0.5">{{ acc.accountNumber }}</p>
            <p class="text-2xl font-semibold text-ink-800 mt-3">{{ acc.balance | vnd: acc.currency }}</p>
            <p class="text-xs text-ink-400 mt-1">Khả dụng: {{ acc.availableBalance | vnd: acc.currency }}</p>
          </div>
        </div>

        <div class="card p-5" *ngIf="rmData.alerts().length > 0">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-ink-800">
              Thông báo hôm nay
              <span class="badge bg-red-50 text-negative ml-1">{{ rmData.alerts().length }}</span>
            </h2>
            <a routerLink="/notifications" class="text-xs font-semibold text-brand-600 hover:underline">Xem tất cả →</a>
          </div>
          <div class="divide-y divide-ink-100">
            <a
              *ngFor="let alert of rmData.alerts().slice(0, 3)"
              [routerLink]="alert.actionLink"
              class="py-2.5 flex items-start gap-2.5 hover:bg-ink-50/60 -mx-1 px-1 rounded transition-colors"
            >
              <span class="text-base leading-none shrink-0">{{ severityIcon[alert.severity] }}</span>
              <div class="min-w-0 flex-1">
                <p class="text-sm text-ink-700 truncate">{{ alert.title }}</p>
                <p class="text-xs text-ink-400">{{ alert.date | slice: 0:10 }}</p>
              </div>
            </a>
          </div>
        </div>

        <div class="card p-5" *ngIf="rmData.pendingTransactions().length > 0">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-ink-800">
              Yêu cầu chờ duyệt
              <span class="badge bg-amber-50 text-warn ml-1">{{ rmData.pendingTransactions().length }}</span>
            </h2>
            <a routerLink="/payments/approval" class="text-xs font-semibold text-brand-600 hover:underline">Xem tất cả →</a>
          </div>
          <div class="divide-y divide-ink-100">
            <div *ngFor="let t of rmData.pendingTransactions().slice(0, 4)" class="py-2.5 flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm text-ink-700 truncate">{{ t.description }}</p>
                <p class="text-xs text-ink-400">{{ t.date | slice: 0:10 }} · {{ t.counterparty }}</p>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <p class="text-sm font-medium text-ink-800">{{ t.amount | vnd: t.currency }}</p>
                <span class="badge bg-amber-50 text-warn">Chờ duyệt</span>
              </div>
            </div>
          </div>
        </div>

        <div class="card p-5">
          <h2 class="text-sm font-semibold text-ink-800 mb-3">Thao tác nhanh</h2>
          <app-quick-action-grid [actions]="quickActions()" />
        </div>

        <div class="card p-5">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-ink-800">Giao dịch gần đây</h2>
            <a routerLink="/accounts" class="text-xs font-semibold text-brand-600 hover:underline">Xem tất cả →</a>
          </div>
          <div class="divide-y divide-ink-100">
            <div *ngFor="let t of rmData.transactions().slice(0, 5)" class="py-2.5 flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm text-ink-700 truncate">{{ t.description }}</p>
                <p class="text-xs text-ink-400">{{ t.date | slice: 0:10 }} · {{ t.counterparty }}</p>
              </div>
              <p class="text-sm font-medium shrink-0" [class.text-positive]="t.type === 'CREDIT'" [class.text-negative]="t.type === 'DEBIT'">
                {{ t.type === 'CREDIT' ? '+' : '-' }}{{ t.amount | vnd: t.currency }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </ng-container>
  `,
})
export class DashboardPageComponent {
  readonly rmData = inject(RmDataService);
  readonly auth = inject(AuthService);
  readonly balanceHidden = signal(false);
  readonly severityIcon = SEVERITY_ICON;
  readonly heroBg = HERO_DARK_BG;

  readonly balanceByCurrency = computed(() => {
    const totals = new Map<string, number>();
    for (const acc of this.rmData.accounts()) {
      totals.set(acc.currency, (totals.get(acc.currency) ?? 0) + acc.balance);
    }
    return Array.from(totals, ([currency, total]) => ({ currency, total }));
  });

  readonly quickActions = computed<QuickAction[]>(() => {
    const actions: QuickAction[] = [{ icon: '💸', label: 'Chuyển tiền', route: '/payments/single-transfer' }];
    if (this.auth.hasRole('CHECKER', 'ADMIN')) {
      actions.push({
        icon: '✅',
        label: 'Phê duyệt',
        route: '/payments/approval',
        badgeCount: this.rmData.pendingTransactions().length || undefined,
      });
    }
    actions.push({ icon: '💱', label: 'FX Business', route: '/fx' }, { icon: '👩‍💼', label: 'Virtual RM', route: '/virtual-rm' });
    return actions;
  });
}
