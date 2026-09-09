import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { RmDataService } from '../../core/services/rm-data.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { VndPipe } from '../../shared/pipes/vnd.pipe';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingSpinnerComponent, VndPipe],
  template: `
    <div class="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <app-loading-spinner *ngIf="rmData.loading() && !rmData.loaded()" />

      <ng-container *ngIf="rmData.loaded()">
        <div>
          <h1 class="text-xl font-semibold text-ink-800">Xin chào, {{ rmData.customer()?.companyName }}</h1>
          <p class="text-sm text-ink-500 mt-1">Tổng quan tài khoản doanh nghiệp hôm nay</p>
        </div>

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

        <div class="card p-5">
          <h2 class="text-sm font-semibold text-ink-800 mb-3">Thao tác nhanh</h2>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <a routerLink="/payments/single-transfer" class="quick-action">
              <span class="text-xl">💸</span>
              <span>Chuyển tiền</span>
            </a>
            <a *ngIf="auth.hasRole('CHECKER', 'ADMIN')" routerLink="/payments/approval" class="quick-action">
              <span class="text-xl">✅</span>
              <span>Phê duyệt</span>
              <span *ngIf="rmData.pendingTransactions().length > 0" class="absolute top-2 right-2 badge bg-red-50 text-negative !px-1.5">
                {{ rmData.pendingTransactions().length }}
              </span>
            </a>
            <a routerLink="/fx" class="quick-action">
              <span class="text-xl">💱</span>
              <span>FX Business</span>
            </a>
            <a routerLink="/virtual-rm" class="quick-action">
              <span class="text-xl">👩‍💼</span>
              <span>Virtual RM</span>
            </a>
          </div>
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
      </ng-container>
    </div>
  `,
  styles: [
    `
      .quick-action {
        @apply flex flex-col items-center justify-center gap-1.5 rounded-xl border border-ink-100 py-4 text-xs font-medium text-ink-600 hover:border-brand-200 hover:bg-brand-50/50 transition-colors relative;
      }
    `,
  ],
})
export class DashboardPageComponent {
  readonly rmData = inject(RmDataService);
  readonly auth = inject(AuthService);
}
