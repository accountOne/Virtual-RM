import { Account, Transaction } from '../models';
import { isWithinLastNDays } from '../utils/date.util';

export interface RuleContext {
  accounts: Account[];
  transactions: Transaction[];
  anchorDate: string;
}

/**
 * Deterministic, hand-written eligibility rules — no ML, no scoring model.
 * Each rule reads live mock data and returns true/false; the matching
 * Recommendation record (title/reason/CTA) comes from recommendations.json.
 */
export const recommendationRules: Record<string, (ctx: RuleContext) => boolean> = {
  FX_HIGH_USAGE: (ctx) =>
    ctx.transactions.filter((t) => t.category === 'FX' && isWithinLastNDays(t.date, ctx.anchorDate, 30)).length >= 10,

  TERM_DEPOSIT_HIGH_BALANCE: (ctx) => {
    const vndAccounts = ctx.accounts.filter((a) => a.currency === 'VND');
    if (vndAccounts.length === 0) return false;
    const avg = vndAccounts.reduce((s, a) => s + a.balance, 0) / vndAccounts.length;
    return avg >= 5_000_000_000;
  },

  PAYROLL_HIGH_VOLUME: (ctx) =>
    ctx.transactions.filter((t) => t.category === 'Payroll' && isWithinLastNDays(t.date, ctx.anchorDate, 30)).length >= 3,

  TRADE_FINANCE_ACTIVITY: (ctx) =>
    ctx.transactions.filter((t) => t.category === 'Trade Finance' && isWithinLastNDays(t.date, ctx.anchorDate, 60)).length >= 2,

  MULTI_ACCOUNT_CASH_MGMT: (ctx) => ctx.accounts.length >= 2,
};

export function evaluateRule(ruleKey: string, ctx: RuleContext): boolean {
  const rule = recommendationRules[ruleKey];
  return rule ? rule(ctx) : false;
}
