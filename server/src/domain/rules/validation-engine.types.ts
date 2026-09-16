// Shared types between validation-engine.ts and each per-command-type rule file. Split into its
// own module so a rule file (transfer.rules.ts, lc.rules.ts, ...) never has to import
// validation-engine.ts itself — that file imports THEM (dispatcher pattern), so a reverse import
// would be circular.

import { BankingCommand, ValidationError, Warning } from '../../models';

export interface RuleContext {
  actorUserId: string;
  /** Other commands already in storage, for cross-command rules (duplicate detection). Passed
   * in rather than read from the repository inside the rule file, so rule files stay pure/unit-
   * testable without touching the filesystem. */
  existingCommands: BankingCommand[];
}

export interface RuleResult {
  errors: ValidationError[];
  warnings: Warning[];
}
