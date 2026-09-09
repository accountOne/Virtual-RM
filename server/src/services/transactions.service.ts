import { transactionsRepository } from '../repositories';
import { Transaction } from '../models';
import { addDays, isSameDate, toDateOnly, isWithinLastNDays } from '../utils/date.util';

/** The mock dataset's latest *settled* transaction date stands in for "yesterday" so the
 * daily briefing always has fresh-looking numbers regardless of the real calendar date.
 * Pending-approval items are excluded — they represent today's in-flight work, not
 * completed history, and would otherwise skew the anchor forward. */
export function getAnchorDates(): { today: string; yesterday: string } {
  const settled = transactionsRepository.readAll().filter((t) => t.status !== 'PENDING_APPROVAL');
  const latest = settled.reduce((max, t) => (t.date > max ? t.date : max), settled[0]?.date ?? new Date().toISOString());
  const yesterday = toDateOnly(latest);
  const today = addDays(yesterday, 1);
  return { today, yesterday };
}

export const transactionsService = {
  list(): Transaction[] {
    return transactionsRepository.readAll().sort((a, b) => (a.date < b.date ? 1 : -1));
  },

  getById(id: string): Transaction | undefined {
    return transactionsRepository.findById(id);
  },

  pendingApproval(): Transaction[] {
    return transactionsRepository.readAll().filter((t) => t.status === 'PENDING_APPROVAL');
  },

  approve(id: string): Transaction | undefined {
    return transactionsRepository.update(id, { status: 'COMPLETED' });
  },

  reject(id: string): Transaction | undefined {
    return transactionsRepository.update(id, { status: 'REJECTED' });
  },

  yesterdaySummary(): { incoming: number; outgoing: number; count: number } {
    const { yesterday } = getAnchorDates();
    const all = transactionsRepository.readAll().filter((t) => isSameDate(t.date, yesterday));
    return {
      incoming: all.filter((t) => t.type === 'CREDIT').reduce((s, t) => s + t.amount, 0),
      outgoing: all.filter((t) => t.type === 'DEBIT').reduce((s, t) => s + t.amount, 0),
      count: all.length,
    };
  },

  largestYesterday(): Transaction | undefined {
    const { yesterday } = getAnchorDates();
    const all = transactionsRepository
      .readAll()
      .filter((t) => isSameDate(t.date, yesterday) && t.type === 'DEBIT');
    return all.sort((a, b) => b.amount - a.amount)[0];
  },

  monthToDateIncoming(): number {
    const { yesterday } = getAnchorDates();
    const monthPrefix = yesterday.slice(0, 7);
    return transactionsRepository
      .readAll()
      .filter((t) => t.type === 'CREDIT' && toDateOnly(t.date).startsWith(monthPrefix))
      .reduce((s, t) => s + t.amount, 0);
  },

  countByCategoryLastNDays(category: string, days: number): number {
    const { yesterday } = getAnchorDates();
    return transactionsRepository
      .readAll()
      .filter((t) => t.category === category && isWithinLastNDays(t.date, yesterday, days)).length;
  },

  /** Weekly spend insight: this 7-day window vs. the average of the prior 4 weeks. */
  weeklySpendInsight(): { thisWeek: number; baselineAvgWeek: number; pctChange: number } {
    const { yesterday } = getAnchorDates();
    const weekStart = addDays(yesterday, -6);
    const baselineEnd = addDays(weekStart, -1);
    const baselineStart = addDays(baselineEnd, -27);

    const all = transactionsRepository.readAll().filter((t) => t.type === 'DEBIT');
    const thisWeek = all
      .filter((t) => toDateOnly(t.date) >= weekStart && toDateOnly(t.date) <= yesterday)
      .reduce((s, t) => s + t.amount, 0);
    const baselineTotal = all
      .filter((t) => toDateOnly(t.date) >= baselineStart && toDateOnly(t.date) <= baselineEnd)
      .reduce((s, t) => s + t.amount, 0);
    const baselineAvgWeek = baselineTotal / 4;
    const pctChange = baselineAvgWeek > 0 ? ((thisWeek - baselineAvgWeek) / baselineAvgWeek) * 100 : 0;
    return { thisWeek, baselineAvgWeek, pctChange };
  },
};
