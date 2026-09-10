import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Account,
  Alert,
  Briefing,
  Customer,
  Product,
  Recommendation,
  RmAnswer,
  Task,
  Transaction,
} from '../models';

/**
 * Single shared data hub for everything the Virtual RM experience needs.
 * Loaded once at app start, refreshed after any mutating action, so every
 * widget/page reading these signals always reflects the latest mock state.
 */
@Injectable({ providedIn: 'root' })
export class RmDataService {
  private readonly http = inject(HttpClient);

  readonly customer = signal<Customer | null>(null);
  readonly accounts = signal<Account[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly tasks = signal<Task[]>([]);
  readonly alerts = signal<Alert[]>([]);
  readonly products = signal<Product[]>([]);
  readonly recommendations = signal<Recommendation[]>([]);
  readonly briefing = signal<Briefing | null>(null);
  readonly loading = signal<boolean>(false);
  readonly loaded = signal<boolean>(false);

  readonly openTasks = computed(() => this.tasks().filter((t) => t.status === 'OPEN'));
  readonly pendingTransactions = computed(() => this.transactions().filter((t) => t.status === 'PENDING_APPROVAL'));

  async loadAll(): Promise<void> {
    this.loading.set(true);
    try {
      const [customer, accounts, transactions, tasks, alerts, products, recommendations, briefing] = await Promise.all([
        firstValueFrom(this.http.get<Customer>('/api/customer')),
        firstValueFrom(this.http.get<Account[]>('/api/accounts')),
        firstValueFrom(this.http.get<Transaction[]>('/api/transactions')),
        firstValueFrom(this.http.get<Task[]>('/api/tasks')),
        firstValueFrom(this.http.get<Alert[]>('/api/alerts')),
        firstValueFrom(this.http.get<Product[]>('/api/products')),
        firstValueFrom(this.http.get<Recommendation[]>('/api/recommendations')),
        firstValueFrom(this.http.get<Briefing>('/api/rm/briefing')),
      ]);
      this.customer.set(customer);
      this.accounts.set(accounts);
      this.transactions.set(transactions);
      this.tasks.set(tasks);
      this.alerts.set(alerts);
      this.products.set(products);
      this.recommendations.set(recommendations);
      this.briefing.set(briefing);
      this.loaded.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Re-pulls the data most likely to change after a mutating action (approve/reject/complete):
   * approving/rejecting a transaction moves money (accounts), changes the pending queue
   * (transactions), and can clear the seeded approval task/alert (tasks, alerts, briefing). */
  async refreshDynamic(): Promise<void> {
    const [accounts, transactions, tasks, alerts, briefing, recommendations] = await Promise.all([
      firstValueFrom(this.http.get<Account[]>('/api/accounts')),
      firstValueFrom(this.http.get<Transaction[]>('/api/transactions')),
      firstValueFrom(this.http.get<Task[]>('/api/tasks')),
      firstValueFrom(this.http.get<Alert[]>('/api/alerts')),
      firstValueFrom(this.http.get<Briefing>('/api/rm/briefing')),
      firstValueFrom(this.http.get<Recommendation[]>('/api/recommendations')),
    ]);
    this.accounts.set(accounts);
    this.transactions.set(transactions);
    this.tasks.set(tasks);
    this.alerts.set(alerts);
    this.briefing.set(briefing);
    this.recommendations.set(recommendations);
  }

  async approveTransaction(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`/api/transactions/${id}/approve`, {}));
    await this.refreshDynamic();
  }

  async rejectTransaction(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`/api/transactions/${id}/reject`, {}));
    await this.refreshDynamic();
  }

  async completeTask(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`/api/tasks/${id}/complete`, {}));
    await this.refreshDynamic();
  }

  async askRm(question: string): Promise<RmAnswer> {
    return firstValueFrom(this.http.post<RmAnswer>('/api/rm/query', { question }));
  }

  accountById(id: string): Account | undefined {
    return this.accounts().find((a) => a.id === id);
  }
}
