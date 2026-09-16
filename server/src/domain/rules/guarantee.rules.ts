// Bank Guarantee BankingCommand schema + business rules — Slice 6 (see lc.rules.ts's header).

import { z } from 'zod';
import { creditLimitsRepository } from '../../repositories';
import { raiseWarning } from './warning-catalog';
import { RuleContext, RuleResult } from './validation-engine.types';

export const GuaranteeFormSchema = z.object({
  type: z.enum(['BID_BOND', 'PERFORMANCE_BOND', 'ADVANCE_PAYMENT', 'PAYMENT_GUARANTEE', 'WARRANTY', 'CUSTOMS', 'TAX', 'OTHER']),
  beneficiary: z.string().min(1),
  applicant: z.string().optional().default('ABC Manufacturing JSC'),
  currency: z.enum(['VND', 'USD', 'EUR']),
  amount: z.number().positive(),
  expiryDate: z.string().min(1),
});

export type GuaranteeFormData = z.infer<typeof GuaranteeFormSchema>;

export function validateGuarantee(formData: GuaranteeFormData, _ctx: RuleContext): RuleResult {
  const warnings = [];

  const limit = creditLimitsRepository.readAll().find((l) => l.limitType === 'TRADE_FINANCE');
  if (limit && formData.amount > limit.availableAmount) {
    warnings.push(raiseWarning('GUARANTEE_LIMIT_WARNING', { field: 'amount', ctx: { available: limit.availableAmount, currency: limit.currency } }));
  }

  return { errors: [], warnings };
}
