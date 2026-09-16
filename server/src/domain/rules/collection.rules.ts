// Documentary Collection BankingCommand schema + business rules — Slice 6 (see lc.rules.ts's
// header). Note: the pre-existing trade-finance.service.ts::createCollection wrote status
// PROCESSING directly (no approval step at all, unlike LC/Guarantee's PENDING_APPROVAL) — this
// slice intentionally brings Collection into the same Maker/Checker gate as the other 3 command
// types for consistency (docs/MAKER_CHECKER_AUDIT.md's confirmed "single source of truth" scope),
// so a Collection request now also waits for Checker approval before the real record is created.

import { z } from 'zod';
import { raiseWarning } from './warning-catalog';
import { RuleContext, RuleResult } from './validation-engine.types';

export const CollectionFormSchema = z.object({
  type: z.enum(['IMPORT', 'EXPORT']),
  subType: z.enum(['DP', 'DA']),
  direction: z.enum(['INWARD', 'OUTWARD']),
  drawer: z.string().min(1),
  drawee: z.string().min(1),
  currency: z.enum(['VND', 'USD', 'EUR']),
  amount: z.number().positive(),
  dueDate: z.string().min(1),
});

export type CollectionFormData = z.infer<typeof CollectionFormSchema>;

export function validateCollection(formData: CollectionFormData, _ctx: RuleContext): RuleResult {
  const warnings = [];

  if (new Date(formData.dueDate).getTime() < Date.now()) {
    warnings.push(raiseWarning('COLLECTION_DUE_DATE_PAST', { field: 'dueDate' }));
  }

  return { errors: [], warnings };
}
