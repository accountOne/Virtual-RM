// BankingCommand status state machine (spec §5.1) — mirrors the same disciplined pattern
// server/src/agent/workflow-engine.ts already established for the Agent's own workflow: a single
// table of legal edges, one function that's the only place a status may change, an explicit
// error class instead of silently allowing an illegal edge. This is a PERSISTED command though
// (JSON file, not in-memory), so unlike workflow-engine.ts this file has no store of its own —
// commands.service.ts owns reading/writing via the repository and calls `assertTransition` first.

import { CommandStatus } from '../models';

const ALLOWED_TRANSITIONS: Record<CommandStatus, CommandStatus[]> = {
  DRAFT: ['PENDING_CHECKER', 'CANCELLED'],
  PENDING_CHECKER: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
  FAILED: [],
};

export class InvalidCommandTransitionError extends Error {
  constructor(
    readonly from: CommandStatus,
    readonly to: CommandStatus,
  ) {
    super(`Illegal command transition: ${from} -> ${to}`);
    this.name = 'InvalidCommandTransitionError';
  }
}

/** Throws rather than returning a boolean — callers (commands.service.ts) never need a separate
 * `if` branch to turn "not allowed" into an error; one call either proceeds or the whole request
 * fails with a clear cause (a double-approve is exactly this: the second call's `from` is already
 * APPROVED, which has zero outgoing edges). */
export function assertTransition(from: CommandStatus, to: CommandStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidCommandTransitionError(from, to);
  }
}
