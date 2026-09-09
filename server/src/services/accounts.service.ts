import { accountsRepository } from '../repositories';
import { Account } from '../models';

export const accountsService = {
  list(): Account[] {
    return accountsRepository.readAll();
  },
  getById(id: string): Account | undefined {
    return accountsRepository.findById(id);
  },
  update(id: string, patch: Partial<Account>): Account | undefined {
    return accountsRepository.update(id, patch);
  },
  totalBalance(): number {
    return accountsRepository
      .readAll()
      .filter((a) => a.currency === 'VND')
      .reduce((sum, a) => sum + a.balance, 0);
  },
  averageBalance(): number {
    const accounts = accountsRepository.readAll();
    if (accounts.length === 0) return 0;
    return accounts.reduce((sum, a) => sum + a.balance, 0) / accounts.length;
  },
};
