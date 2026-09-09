import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RmDataService } from '../../core/services/rm-data.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { VndPipe } from '../../shared/pipes/vnd.pipe';

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Hoàn tất',
  PENDING_APPROVAL: 'Chờ phê duyệt',
  REJECTED: 'Từ chối',
};
const STATUS_CLASS: Record<string, string> = {
  COMPLETED: 'bg-teal-50 text-positive',
  PENDING_APPROVAL: 'bg-amber-50 text-warn',
  REJECTED: 'bg-red-50 text-negative',
};

@Component({
  selector: 'app-accounts-page',
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent, EmptyStateComponent, VndPipe],
  template: `
    <div class="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 pb-24">
      <app-loading-spinner *ngIf="rmData.loading() && !rmData.loaded()" />

      <ng-container *ngIf="rmData.loaded()">
        <h1 class="text-xl font-semibold text-ink-800">Tài khoản</h1>

        <div class="grid sm:grid-cols-2 gap-4">
          <button
            *ngFor="let acc of rmData.accounts()"
            (click)="selectedAccountId.set(acc.id)"
            class="card p-5 text-left transition-shadow hover:shadow-pop"
            [class.ring-2]="selectedAccountId() === acc.id"
            [class.ring-brand-300]="selectedAccountId() === acc.id"
          >
            <div class="flex items-center justify-between">
              <p class="text-xs text-ink-400">{{ acc.type }}</p>
              <span class="badge bg-ink-100 text-ink-600">{{ acc.currency }}</span>
            </div>
            <p class="text-sm text-ink-500 mt-2">{{ acc.accountName }}</p>
            <p class="text-xs text-ink-400 font-mono mt-0.5">{{ acc.accountNumber }}</p>
            <p class="text-2xl font-semibold text-ink-800 mt-3">{{ acc.balance | vnd: acc.currency }}</p>
            <p class="text-xs text-ink-400 mt-1">Khả dụng: {{ acc.availableBalance | vnd: acc.currency }}</p>
          </button>
        </div>

        <div class="card p-5">
          <h2 class="text-sm font-semibold text-ink-800 mb-3">Lịch sử giao dịch</h2>
          <app-empty-state *ngIf="filteredTransactions().length === 0" icon="📭" title="Chưa có giao dịch" />
          <div class="overflow-x-auto">
            <table class="w-full text-sm" *ngIf="filteredTransactions().length > 0">
              <thead>
                <tr class="text-left text-xs text-ink-400 border-b border-ink-100">
                  <th class="py-2 pr-3 font-medium">Ngày</th>
                  <th class="py-2 pr-3 font-medium">Nội dung</th>
                  <th class="py-2 pr-3 font-medium">Đối tác</th>
                  <th class="py-2 pr-3 font-medium">Trạng thái</th>
                  <th class="py-2 pl-3 font-medium text-right">Số tiền</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let t of filteredTransactions()" class="border-b border-ink-50 last:border-0">
                  <td class="py-2.5 pr-3 text-ink-400 whitespace-nowrap">{{ t.date | slice: 0:10 }}</td>
                  <td class="py-2.5 pr-3 text-ink-700">{{ t.description }}</td>
                  <td class="py-2.5 pr-3 text-ink-500">{{ t.counterparty }}</td>
                  <td class="py-2.5 pr-3">
                    <span class="badge" [ngClass]="statusClass[t.status]">{{ statusLabel[t.status] }}</span>
                  </td>
                  <td
                    class="py-2.5 pl-3 text-right font-medium whitespace-nowrap"
                    [class.text-positive]="t.type === 'CREDIT'"
                    [class.text-negative]="t.type === 'DEBIT'"
                  >
                    {{ t.type === 'CREDIT' ? '+' : '-' }}{{ t.amount | vnd: t.currency }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class AccountsPageComponent {
  readonly rmData = inject(RmDataService);
  readonly selectedAccountId = signal<string | null>(null);
  readonly statusLabel = STATUS_LABEL;
  readonly statusClass = STATUS_CLASS;

  filteredTransactions() {
    const id = this.selectedAccountId();
    const all = this.rmData.transactions();
    return id ? all.filter((t) => t.accountId === id) : all;
  }
}
