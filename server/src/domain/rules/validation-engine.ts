// Single validation entry point (spec §10) — the ONLY place formData is turned into a
// ValidationResult. Called from the SAME code path whether the caller is a Maker submitting a
// draft, the backend re-validating before a Checker approves, or (once wired, spec §15) Virtual
// RM previewing a draft — never re-implemented per caller, which is exactly what spec §11 means
// by "warning phải nhất quán giữa Maker và Checker".

import { CommandType, ValidationResult } from '../../models';
import { TransferFormSchema, validateTransfer } from './transfer.rules';
import { RuleContext } from './validation-engine.types';

/** Commands types with a rule file wired in so far — LC/GUARANTEE/COLLECTION are added in
 * Slice 6 (docs/MAKER_CHECKER_AUDIT.md §7); calling validateCommand with one of those today
 * throws rather than silently returning `valid: true`. */
const SUPPORTED_COMMAND_TYPES: ReadonlySet<CommandType> = new Set(['TRANSFER']);

export function isCommandTypeSupported(commandType: CommandType): boolean {
  return SUPPORTED_COMMAND_TYPES.has(commandType);
}

export class UnsupportedCommandTypeError extends Error {
  constructor(commandType: string) {
    super(`Command type "${commandType}" is not yet wired into the validation engine.`);
    this.name = 'UnsupportedCommandTypeError';
  }
}

/**
 * Validates formData for a given commandType: Zod schema first (structural — missing/wrong-typed
 * fields become `ValidationError`s, matching spec §5.2's separate errors[] from warnings[]), then
 * the commandType's own business-rule pass (richer Warning[] a type check can't express).
 * `formData` is returned untouched — callers persist the ORIGINAL input, not a coerced/defaulted
 * copy, so a stored command always reflects exactly what the Maker submitted.
 */
export function validateCommand(commandType: CommandType, formData: Record<string, unknown>, ctx: RuleContext): ValidationResult {
  if (commandType !== 'TRANSFER') throw new UnsupportedCommandTypeError(commandType);

  const parsed = TransferFormSchema.safeParse(formData);
  const checkedAt = new Date().toISOString();

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      code: issue.code,
      message: issue.message,
    }));
    return { valid: false, errors, warnings: [], checkedAt };
  }

  const { warnings } = validateTransfer(parsed.data, ctx);
  const blocking = warnings.some((w) => w.blocking);
  return { valid: !blocking, errors: [], warnings, checkedAt };
}
