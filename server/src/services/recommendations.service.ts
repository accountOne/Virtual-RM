import { recommendationsRepository, accountsRepository, transactionsRepository } from '../repositories';
import { Recommendation } from '../models';
import { evaluateRule } from '../rules/recommendation-rules';
import { getAnchorDates } from './transactions.service';

export const recommendationsService = {
  /** Returns only recommendations whose deterministic rule currently evaluates true. */
  listActive(): Recommendation[] {
    const { yesterday } = getAnchorDates();
    const ctx = {
      accounts: accountsRepository.readAll(),
      transactions: transactionsRepository.readAll(),
      anchorDate: yesterday,
    };
    return recommendationsRepository
      .readAll()
      .filter((r) => evaluateRule(r.ruleKey, ctx))
      .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));
  },

  listAll(): Recommendation[] {
    return recommendationsRepository.readAll();
  },
};

function priorityWeight(p: string): number {
  return p === 'HIGH' ? 3 : p === 'MEDIUM' ? 2 : 1;
}
