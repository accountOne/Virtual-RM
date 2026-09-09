import {
  customerRepository,
  accountsRepository,
  transactionsRepository,
  tasksRepository,
  alertsRepository,
  productsRepository,
  recommendationsRepository,
  resettableRepositories,
} from '../repositories';
import { Customer, Account, Transaction, Task, Alert, Product, Recommendation } from '../models';

export const adminService = {
  updateCustomer(patch: Partial<Customer>): Customer {
    return customerRepository.update(patch);
  },
  replaceAccounts(accounts: Account[]): Account[] {
    return accountsRepository.replaceAll(accounts);
  },
  updateAccount(id: string, patch: Partial<Account>): Account | undefined {
    return accountsRepository.update(id, patch);
  },
  updateTransaction(id: string, patch: Partial<Transaction>): Transaction | undefined {
    return transactionsRepository.update(id, patch);
  },
  updateTask(id: string, patch: Partial<Task>): Task | undefined {
    return tasksRepository.update(id, patch);
  },
  updateAlert(id: string, patch: Partial<Alert>): Alert | undefined {
    return alertsRepository.update(id, patch);
  },
  updateProduct(id: string, patch: Partial<Product>): Product | undefined {
    return productsRepository.update(id, patch);
  },
  updateRecommendation(id: string, patch: Partial<Recommendation>): Recommendation | undefined {
    return recommendationsRepository.update(id, patch);
  },
  resetAll(): void {
    resettableRepositories.forEach((repo) => repo.reset());
  },
};
