// Single validation entry point (spec §10) — the ONLY place formData is turned into a
// ValidationResult. Called from the SAME code path whether the caller is a Maker submitting a
// draft, the backend re-validating before a Checker approves, or (once wired, spec §15) Virtual
// RM previewing a draft — never re-implemented per caller, which is exactly what spec §11 means
// by "warning phải nhất quán giữa Maker và Checker".

import { z } from 'zod';
import { CommandType, ValidationResult } from '../../models';
import { CollectionFormSchema, validateCollection } from './collection.rules';
import { GuaranteeFormSchema, validateGuarantee } from './guarantee.rules';
import { LcFormSchema, validateLc } from './lc.rules';
import { TransferFormSchema, validateTransfer } from './transfer.rules';
import { RuleContext } from './validation-engine.types';

const SUPPORTED_COMMAND_TYPES: ReadonlySet<CommandType> = new Set(['TRANSFER', 'LC', 'GUARANTEE', 'COLLECTION']);

const SCHEMA_BY_TYPE: Record<CommandType, z.ZodTypeAny> = {
  TRANSFER: TransferFormSchema,
  LC: LcFormSchema,
  GUARANTEE: GuaranteeFormSchema,
  COLLECTION: CollectionFormSchema,
};

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
  if (!isCommandTypeSupported(commandType)) throw new UnsupportedCommandTypeError(commandType);

  const parsed = SCHEMA_BY_TYPE[commandType].safeParse(formData);
  const checkedAt = new Date().toISOString();

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      code: issue.code,
      message: issue.message,
    }));
    return { valid: false, errors, warnings: [], checkedAt };
  }

  // `parsed.data`'s type is `unknown` here because SCHEMA_BY_TYPE is keyed generically — but the
  // schema actually used to produce it was already selected by the SAME commandType switch below,
  // so the cast is sound: each branch's schema matches its validate function's expected input.
  const data = parsed.data as never;
  const { warnings } =
    commandType === 'TRANSFER'
      ? validateTransfer(data, ctx)
      : commandType === 'LC'
        ? validateLc(data, ctx)
        : commandType === 'GUARANTEE'
          ? validateGuarantee(data, ctx)
          : validateCollection(data, ctx);
  const blocking = warnings.some((w) => w.blocking);
  return { valid: !blocking, errors: [], warnings, checkedAt };
}
