// LC (Letter of Credit) BankingCommand schema + business rules — Slice 6, extends the
// Transfer-only validation engine from Slice 1 to the "3 loại còn lại" the audit's gap #2
// identified (no approve/reject route existed anywhere for LC/BG/Collection before this).

import { z } from 'zod';
import { raiseWarning } from './warning-catalog';
import { RuleContext, RuleResult } from './validation-engine.types';

export const LcFormSchema = z.object({
  type: z.enum(['IMPORT', 'EXPORT']),
  subType: z.enum(['SIGHT', 'USANCE', 'DEFERRED_PAYMENT', 'TRANSFERABLE', 'STANDBY']),
  beneficiary: z.string().min(1),
  applicant: z.string().optional().default('ABC Manufacturing JSC'),
  issuingBank: z.string().optional().default('MSB'),
  advisingBank: z.string().optional().default(''),
  currency: z.enum(['VND', 'USD', 'EUR']),
  amount: z.number().positive(),
  latestShipmentDate: z.string().min(1),
  expiryDate: z.string().min(1),
  requiredDocuments: z.array(z.string()).optional().default([]),
});

export type LcFormData = z.infer<typeof LcFormSchema>;

export function validateLc(formData: LcFormData, _ctx: RuleContext): RuleResult {
  const warnings = [];

  if (new Date(formData.expiryDate).getTime() <= new Date(formData.latestShipmentDate).getTime()) {
    warnings.push(raiseWarning('LC_EXPIRY_BEFORE_SHIPMENT', { field: 'expiryDate' }));
  }
  if (formData.requiredDocuments.length === 0) {
    warnings.push(raiseWarning('LC_NO_REQUIRED_DOCUMENTS', { field: 'requiredDocuments' }));
  }

  return { errors: [], warnings };
}
