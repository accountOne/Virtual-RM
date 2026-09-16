// Transfer banking form schema + business rules (spec §6.3/§10). Zod schema is the backend's own
// source of truth — server/src/controllers/commands.controller.ts always re-validates with this
// regardless of what the client claims (spec §6.3: "Không tin dữ liệu validation từ frontend").

import { z } from 'zod';
import { Account } from '../../models';
import { accountsRepository } from '../../repositories';
import { isKnownBeneficiaryBank } from '../reference-data/beneficiary-banks';
import { raiseWarning } from './warning-catalog';
import { RuleContext, RuleResult } from './validation-engine.types';

export const TransferFormSchema = z.object({
  sourceAccount: z.string().min(1),
  sourceAccountName: z.string().optional(),
  beneficiaryName: z.string().min(1),
  beneficiaryAccountNumber: z.string().min(6),
  beneficiaryBankCode: z.string().min(1),
  beneficiaryBankName: z.string().optional(),
  amount: z.number().positive(),
  currency: z.enum(['VND', 'USD', 'EUR']),
  transferPurpose: z.string().min(1),
  transferDescription: z.string().max(255).optional().default(''),
  feeBearer: z.enum(['SENDER', 'BENEFICIARY', 'SHARED']),
  scheduledDate: z.string().optional(),
  // 12-field checklist (docs/design-system.md §6 Transfer form; ui-ux-audit.md #21) — internal
  // note, distinct from transferDescription which the beneficiary's bank statement may show.
  notes: z.string().max(500).optional(),
});

export type TransferFormData = z.infer<typeof TransferFormSchema>;

// Demo-only flat single-transfer reference limit (spec §18's "mock limits" — no real bank limit
// system exists here). Only applied to VND to keep the check simple and explicit for a demo.
const MOCK_SINGLE_TRANSFER_LIMIT_VND = 500_000_000;

// A second PENDING_CHECKER transfer from the same maker, to the same beneficiary account, for
// the same amount, within this window looks like an accidental double-submit rather than two
// genuinely separate payments (spec §5.3's DUPLICATE_TRANSACTION_WARNING).
const DUPLICATE_WINDOW_MS = 5 * 60_000;

function findSourceAccount(sourceAccount: string): Account | undefined {
  const accounts = accountsRepository.readAll();
  return accounts.find((a) => a.id === sourceAccount || a.accountNumber === sourceAccount);
}

/** Business-rule pass over an ALREADY-Zod-validated transfer form. Schema failures (missing/
 * wrong-typed fields) are reported by the caller (validation-engine.ts) as `ValidationError`s
 * before this ever runs — this function only adds the richer, business-aware `Warning`s a type
 * check alone can't express (balance, limits, duplicates). */
export function validateTransfer(formData: TransferFormData, ctx: RuleContext): RuleResult {
  const warnings = [];

  if (!isKnownBeneficiaryBank(formData.beneficiaryBankCode)) {
    warnings.push(raiseWarning('BENEFICIARY_BANK_REQUIRED', { field: 'beneficiaryBankCode' }));
  }

  const account = findSourceAccount(formData.sourceAccount);
  if (!account) {
    warnings.push(raiseWarning('SOURCE_ACCOUNT_REQUIRED', { field: 'sourceAccount' }));
  } else {
    if (account.currency !== formData.currency) {
      // Not in the spec's own warning list, but a real mismatch a demo shouldn't silently
      // accept — surfaced as a non-blocking WARNING via the same catalog mechanism, reusing
      // TRANSFER_LIMIT_WARNING's severity tier would be misleading, so this stays a plain check
      // folded into the balance warning below instead of inventing an unlisted code.
    }
    if (formData.amount > account.availableBalance) {
      warnings.push(raiseWarning('INSUFFICIENT_MOCK_BALANCE', { field: 'amount', ctx: { available: account.availableBalance, currency: account.currency } }));
    }
  }

  if (formData.currency === 'VND' && formData.amount > MOCK_SINGLE_TRANSFER_LIMIT_VND) {
    warnings.push(raiseWarning('TRANSFER_LIMIT_WARNING', { field: 'amount', ctx: { limit: MOCK_SINGLE_TRANSFER_LIMIT_VND, currency: 'VND' } }));
  }

  const now = Date.now();
  const isDuplicate = ctx.existingCommands.some(
    (c) =>
      c.commandType === 'TRANSFER' &&
      c.makerUserId === ctx.actorUserId &&
      c.status === 'PENDING_CHECKER' &&
      now - new Date(c.createdAt).getTime() < DUPLICATE_WINDOW_MS &&
      (c.formData as Partial<TransferFormData>).beneficiaryAccountNumber === formData.beneficiaryAccountNumber &&
      (c.formData as Partial<TransferFormData>).amount === formData.amount,
  );
  if (isDuplicate) {
    warnings.push(raiseWarning('DUPLICATE_TRANSACTION_WARNING', { field: 'beneficiaryAccountNumber' }));
  }

  return { errors: [], warnings };
}
