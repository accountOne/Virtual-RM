import { accountsRepository, alertsRepository, tasksRepository, transactionsRepository } from '../repositories';
import { Transaction } from '../models';
import { addDays, isSameDate, toDateOnly, isWithinLastNDays } from '../utils/date.util';

/** Applies the real money movement for an approve/reject decision. A pending DEBIT
 * already holds its amount out of `availableBalance` the moment it's created — approving
 * it settles that hold into the ledger `balance`; rejecting it releases the hold back to
 * `availableBalance` without ever touching `balance`. A pending CREDIT has no effect on
 * either figure until it's approved, at which point both increase together. */
function applyBalanceChange(txn: Transaction, action: 'approve' | 'reject'): void {
  const account = accountsRepository.findById(txn.accountId);
  if (!account) return;

  if (action === 'approve') {
    if (txn.type === 'DEBIT') {
      accountsRepository.update(account.id, { balance: account.balance - txn.amount });
    } else {
      accountsRepository.update(account.id, {
        balance: account.balance + txn.amount,
        availableBalance: account.availableBalance + txn.amount,
      });
    }
  } else if (txn.type === 'DEBIT') {
    accountsRepository.update(account.id, { availableBalance: account.availableBalance + txn.amount });
  }
}

/** The seeded "Duyệt giao dịch" task and "Cần chú ý: N giao dịch..." alert describe the
 * same fact as the live pending-approval queue, not an independent one — keep their
 * count/amount (or removal, once nothing is left to approve) in sync after every
 * approve/reject so a fully-cleared queue doesn't leave a stale warning behind. */
function syncPendingApprovalSignals(): void {
  const pending = transactionsRepository.readAll().filter((t) => t.status === 'PENDING_APPROVAL');
  const count = pending.length;
  const amount = pending.reduce((sum, t) => sum + t.amount, 0);
  const currency = pending[0]?.currency ?? 'VND';
  const amountLabel = `${amount.toLocaleString('vi-VN')} ${currency === 'VND' ? 'VNĐ' : currency}`;

  const task = tasksRepository.readAll().find((t) => t.actionLink === '/payments/approval');
  if (task) {
    if (count === 0) {
      tasksRepository.update(task.id, {
        status: 'COMPLETED',
        description: 'Không còn giao dịch nào chờ phê duyệt.',
        meta: { count: 0, amount: 0, currency },
      });
    } else {
      tasksRepository.update(task.id, {
        status: 'OPEN',
        description: `${count} giao dịch đang chờ phê duyệt, tổng giá trị ${amountLabel}`,
        meta: { count, amount, currency },
      });
    }
  }

  const alert = alertsRepository.readAll().find((a) => a.actionLink === '/payments/approval');
  if (alert) {
    if (count === 0) {
      alertsRepository.delete(alert.id);
    } else {
      alertsRepository.update(alert.id, {
        title: `Cần chú ý: ${count} giao dịch đang chờ phê duyệt`,
        description: `Tổng giá trị ${amountLabel}. Giao dịch cần được phê duyệt để không ảnh hưởng tới đối tác.`,
      });
    }
  }
}

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
    const txn = transactionsRepository.findById(id);
    if (!txn || txn.status !== 'PENDING_APPROVAL') return txn;
    applyBalanceChange(txn, 'approve');
    const updated = transactionsRepository.update(id, { status: 'COMPLETED' });
    syncPendingApprovalSignals();
    return updated;
  },

  reject(id: string): Transaction | undefined {
    const txn = transactionsRepository.findById(id);
    if (!txn || txn.status !== 'PENDING_APPROVAL') return txn;
    applyBalanceChange(txn, 'reject');
    const updated = transactionsRepository.update(id, { status: 'REJECTED' });
    syncPendingApprovalSignals();
    return updated;
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
