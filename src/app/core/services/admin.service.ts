import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Account, Alert, Customer, Product, Recommendation, Task, Transaction } from '../models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  updateCustomer(patch: Partial<Customer>): Promise<Customer> {
    return firstValueFrom(this.http.put<Customer>('/api/admin/customer', patch));
  }

  updateAccount(id: string, patch: Partial<Account>): Promise<Account> {
    return firstValueFrom(this.http.put<Account>(`/api/admin/accounts/${id}`, patch));
  }

  updateTransaction(id: string, patch: Partial<Transaction>): Promise<Transaction> {
    return firstValueFrom(this.http.put<Transaction>(`/api/admin/transactions/${id}`, patch));
  }

  updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    return firstValueFrom(this.http.put<Task>(`/api/admin/tasks/${id}`, patch));
  }

  updateAlert(id: string, patch: Partial<Alert>): Promise<Alert> {
    return firstValueFrom(this.http.put<Alert>(`/api/admin/alerts/${id}`, patch));
  }

  updateProduct(id: string, patch: Partial<Product>): Promise<Product> {
    return firstValueFrom(this.http.put<Product>(`/api/admin/products/${id}`, patch));
  }

  updateRecommendation(id: string, patch: Partial<Recommendation>): Promise<Recommendation> {
    return firstValueFrom(this.http.put<Recommendation>(`/api/admin/recommendations/${id}`, patch));
  }

  reset(): Promise<{ message: string }> {
    return firstValueFrom(this.http.post<{ message: string }>('/api/admin/reset', {}));
  }
}
