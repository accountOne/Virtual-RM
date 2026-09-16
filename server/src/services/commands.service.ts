// Maker/Checker BankingCommand service (spec §8) — the single place formData becomes a
// persisted, Maker/Checker-shared record. See docs/MAKER_CHECKER_AUDIT.md for the audit this
// implements and the 3 architecture decisions this file assumes: BankingCommand replaces
// Transaction/PaymentOrder/ApprovalRecord for NEW commands, storage is JSON file (existing
// JsonFileRepository), and validateCommand() (domain/rules/validation-engine.ts) is the one
// validation path both submit() and approve() call — never two separate implementations.

import { randomUUID } from 'crypto';
import { accountsRepository, auditEventsRepository, bankingCommandsRepository, commandSnapshotsRepository, transactionsRepository } from '../repositories';
import { AuditEvent, AuditEventType, BankingCommand, CommandSemanticData, CommandStatus, CommandType, Transaction } from '../models';
import { validateCommand } from '../domain/rules/validation-engine';
import { assertTransition } from '../domain/command-workflow';
import { getAnchorDates } from './transactions.service';
import { tradeFinanceService } from './trade-finance.service';

export interface CommandActor {
  userId: string;
  displayName: string;
  role: 'MAKER' | 'CHECKER' | 'ADMIN';
}

export class CommandNotFoundError extends Error {
  constructor(id: string) {
    super(`Banking command not found: ${id}`);
    this.name = 'CommandNotFoundError';
  }
}

export class CommandValidationBlockedError extends Error {
  constructor() {
    super('Command has a blocking validation issue and cannot be submitted/approved.');
    this.name = 'CommandValidationBlockedError';
  }
}

export class SameMakerCheckerError extends Error {
  constructor() {
    super('Người khởi tạo và người phê duyệt không được là cùng một người.');
    this.name = 'SameMakerCheckerError';
  }
}

export class IdempotencyMismatchError extends Error {
  constructor() {
    super('Idempotency key mismatch — this approval has already been processed or is stale.');
    this.name = 'IdempotencyMismatchError';
  }
}

const REFERENCE_PREFIX: Record<CommandType, string> = { TRANSFER: 'TRF', LC: 'LC', GUARANTEE: 'BG', COLLECTION: 'COL' };

function nextReferenceNo(commandType: CommandType, existing: BankingCommand[]): string {
  const ymd = getAnchorDates().today.replace(/-/g, '');
  const prefix = REFERENCE_PREFIX[commandType];
  const stem = `${prefix}-${ymd}`;
  const seq = existing.filter((c) => c.referenceNo.startsWith(stem)).length + 1;
  return `${stem}-${String(seq).padStart(4, '0')}`;
}

function appendAuditEvent(commandId: string, eventType: AuditEventType, actor: CommandActor | { userId: string; role: 'SYSTEM' }, patch: { oldStatus?: string; newStatus?: string; metadata?: Record<string, unknown> } = {}): void {
  const event: AuditEvent = {
    id: `audit-${randomUUID()}`,
    commandId,
    eventType,
    actorUserId: actor.userId,
    actorRole: actor.role,
    oldStatus: patch.oldStatus,
    newStatus: patch.newStatus,
    metadata: patch.metadata,
    createdAt: new Date().toISOString(),
  };
  auditEventsRepository.writeAll([...auditEventsRepository.readAll(), event]);
}

function saveCommand(command: BankingCommand): BankingCommand {
  const items = bankingCommandsRepository.readAll();
  const index = items.findIndex((c) => c.id === command.id);
  if (index === -1) bankingCommandsRepository.writeAll([...items, command]);
  else {
    items[index] = command;
    bankingCommandsRepository.writeAll(items);
  }
  return command;
}

export const commandsService = {
  /** Creates a DRAFT — spec §8.1. `semanticData` is optional, populated by the Agent (Slice 5)
   * when a chat message pre-fills this draft; a plain Maker form submission omits it entirely. */
  createDraft(actor: CommandActor, commandType: CommandType, formData: Record<string, unknown>, semanticData?: CommandSemanticData): BankingCommand {
    const now = new Date().toISOString();
    const existing = bankingCommandsRepository.readAll();
    const command: BankingCommand = {
      id: `cmd-${randomUUID()}`,
      commandType,
      referenceNo: nextReferenceNo(commandType, existing),
      makerUserId: actor.userId,
      makerName: actor.displayName,
      status: 'DRAFT',
      formData,
      semanticData,
      validationResult: { valid: false, errors: [], warnings: [], checkedAt: now },
      warnings: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    saveCommand(command);
    appendAuditEvent(command.id, 'DRAFT_CREATED', actor, { newStatus: 'DRAFT' });
    return command;
  },

  getById(id: string): BankingCommand {
    const command = bankingCommandsRepository.findById(id);
    if (!command) throw new CommandNotFoundError(id);
    return command;
  },

  /** Own-commands list for a Maker (§14 "/maker/commands"); ADMIN sees every command. */
  listForMaker(actor: CommandActor): BankingCommand[] {
    const all = bankingCommandsRepository.readAll();
    return actor.role === 'ADMIN' ? all : all.filter((c) => c.makerUserId === actor.userId);
  },

  /** spec §8.4 — Checker queue, filterable by status (defaults to PENDING_CHECKER, the only
   * status a Checker actually needs to act on; other statuses are reachable for history). */
  listForChecker(status?: CommandStatus): BankingCommand[] {
    const all = bankingCommandsRepository.readAll();
    return status ? all.filter((c) => c.status === status) : all;
  },

  /** Re-runs validateCommand() against the command's CURRENT formData and persists the result —
   * called directly by the Maker's own "kiểm tra" step (§8.2) and internally by submit()/approve()
   * so those two never trust a stale validationResult sitting on the record. */
  revalidate(command: BankingCommand): BankingCommand {
    const existing = bankingCommandsRepository.readAll().filter((c) => c.id !== command.id);
    const validationResult = validateCommand(command.commandType, command.formData, { actorUserId: command.makerUserId, existingCommands: existing });
    const updated: BankingCommand = { ...command, validationResult, warnings: validationResult.warnings, updatedAt: new Date().toISOString() };
    saveCommand(updated);
    return updated;
  },

  /** spec §8.1's own field-update path — a Maker editing a DRAFT bumps `version` (spec §12:
   * a Checker must never silently see edited data without a version change) and invalidates the
   * cached validationResult until `revalidate` runs again. */
  updateDraft(command: BankingCommand, actor: CommandActor, formData: Record<string, unknown>): BankingCommand {
    if (command.status !== 'DRAFT') throw new CommandValidationBlockedError();
    const now = new Date().toISOString();
    const updated: BankingCommand = { ...command, formData, version: command.version + 1, validationResult: { valid: false, errors: [], warnings: [], checkedAt: now }, updatedAt: now };
    saveCommand(updated);
    appendAuditEvent(command.id, 'FIELD_UPDATED', actor, { metadata: { version: updated.version } });
    return updated;
  },

  /** spec §8.3 — DRAFT -> PENDING_CHECKER. Revalidates first (never trusts a cached result from
   * a previous edit) and refuses if anything blocking survives. Mints `idempotencyKey` and takes
   * the submit-time snapshot (spec §12) here, in the ONE place a command becomes visible to a
   * Checker. */
  submit(command: BankingCommand, actor: CommandActor): BankingCommand {
    assertTransition(command.status, 'PENDING_CHECKER');
    const revalidated = this.revalidate(command);
    if (!revalidated.validationResult.valid) throw new CommandValidationBlockedError();

    const now = new Date().toISOString();
    const submitted: BankingCommand = { ...revalidated, status: 'PENDING_CHECKER', submittedAt: now, updatedAt: now, idempotencyKey: randomUUID() };
    saveCommand(submitted);

    commandSnapshotsRepository.writeAll([
      ...commandSnapshotsRepository.readAll(),
      {
        id: `snap-${randomUUID()}`,
        commandId: submitted.id,
        version: submitted.version,
        formData: submitted.formData,
        validationResult: submitted.validationResult,
        warnings: submitted.warnings,
        submittedBy: actor.userId,
        submittedAt: now,
      },
    ]);
    appendAuditEvent(submitted.id, 'SUBMITTED', actor, { oldStatus: 'DRAFT', newStatus: 'PENDING_CHECKER' });
    return submitted;
  },

  /** Full audit trail for one command, oldest first — spec §14's Checker detail screen shows
   * this as a timeline. */
  auditTrail(commandId: string): AuditEvent[] {
    return auditEventsRepository
      .readAll()
      .filter((e) => e.commandId === commandId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  /** Cross-command activity feed for the "Lịch sử hoạt động" nav item (docs/ui-ux-audit.md #3) —
   * newest first, unlike auditTrail()'s oldest-first per-command timeline. A Maker only sees
   * events on commands they own (same ownership boundary as listForMaker/assertOwnedByMaker);
   * CHECKER/ADMIN already see every command via the unfiltered Checker queue, so they see every
   * event here too — this exposes no data those roles couldn't already reach one command at a
   * time via the Checker detail screen's own audit trail. */
  activityHistoryFor(actor: CommandActor): AuditEvent[] {
    const events = auditEventsRepository.readAll();
    const scoped =
      actor.role === 'CHECKER' || actor.role === 'ADMIN'
        ? events
        : events.filter((e) => {
            const command = bankingCommandsRepository.findById(e.commandId);
            return command?.makerUserId === actor.userId;
          });
    return scoped.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** Records that a Checker opened this command — spec §13's AuditEvent list includes
   * VIEWED_BY_CHECKER explicitly, so "the Checker looked at this before deciding" is provable. */
  recordCheckerView(command: BankingCommand, actor: CommandActor): void {
    if (actor.role !== 'CHECKER') return;
    appendAuditEvent(command.id, 'VIEWED_BY_CHECKER', actor);
  },

  /**
   * spec §8.6/§16 — the full approve checklist: status must be PENDING_CHECKER, the caller must
   * not be the same person who created it (§16.3/scenario 8), the idempotency key must match
   * (§16.6/scenario 7 — a double-click never runs the mock execution twice), and the command is
   * revalidated against its CURRENT formData one more time (§16.4) before anything executes.
   */
  approve(command: BankingCommand, actor: CommandActor, idempotencyKey: string): BankingCommand {
    assertTransition(command.status, 'APPROVED');
    if (command.makerUserId === actor.userId) throw new SameMakerCheckerError();
    if (command.idempotencyKey !== idempotencyKey) throw new IdempotencyMismatchError();

    const revalidated = this.revalidate(command);
    if (!revalidated.validationResult.valid) throw new CommandValidationBlockedError();

    const now = new Date().toISOString();
    let executionResult: unknown;
    let finalStatus: CommandStatus = 'APPROVED';
    try {
      executionResult = executeApprovedCommand(revalidated);
    } catch (err) {
      finalStatus = 'FAILED';
      const failed: BankingCommand = { ...revalidated, status: 'FAILED', updatedAt: now };
      saveCommand(failed);
      appendAuditEvent(failed.id, 'FAILED', actor, { oldStatus: 'PENDING_CHECKER', newStatus: 'FAILED', metadata: { error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }

    const approved: BankingCommand = {
      ...revalidated,
      status: finalStatus,
      checkerUserId: actor.userId,
      checkerName: actor.displayName,
      approvedAt: now,
      updatedAt: now,
      executionResult,
    };
    saveCommand(approved);
    appendAuditEvent(approved.id, 'APPROVED', actor, { oldStatus: 'PENDING_CHECKER', newStatus: 'APPROVED' });
    appendAuditEvent(approved.id, 'EXECUTED', actor, { metadata: { commandType: approved.commandType } });
    return approved;
  },

  /** spec §8.7/§16.9 — reject always requires a reason; also refuses the same-person case for
   * symmetry with approve (spec §16.3's wording isn't qualified to approve only). */
  reject(command: BankingCommand, actor: CommandActor, reason: string): BankingCommand {
    assertTransition(command.status, 'REJECTED');
    if (command.makerUserId === actor.userId) throw new SameMakerCheckerError();
    if (!reason || !reason.trim()) throw new Error('Reject reason is required.');

    const now = new Date().toISOString();
    const rejected: BankingCommand = { ...command, status: 'REJECTED', checkerUserId: actor.userId, checkerName: actor.displayName, rejectedAt: now, rejectReason: reason.trim(), updatedAt: now };
    saveCommand(rejected);
    appendAuditEvent(rejected.id, 'REJECTED', actor, { oldStatus: 'PENDING_CHECKER', newStatus: 'REJECTED', metadata: { reason: reason.trim() } });
    return rejected;
  },
};

/** Mock execution (spec §8.6 "Execute mock operation") — only TRANSFER is wired; LC/GUARANTEE/
 * COLLECTION execution is added in Slice 6 alongside their validation rules. Writes a real,
 * COMPLETED Transaction (so it shows up in existing dashboard/account-history features exactly
 * like any other real transaction) and deducts the mock account balance — BankingCommand's own
 * PENDING_CHECKER phase already represents "not yet executed", so unlike the old Transaction
 * model there is no separate PENDING_APPROVAL ledger entry to reconcile afterward. */
function executeApprovedCommand(command: BankingCommand): unknown {
  switch (command.commandType) {
    case 'TRANSFER':
      return executeTransfer(command);
    case 'LC':
      return executeLc(command);
    case 'GUARANTEE':
      return executeGuarantee(command);
    case 'COLLECTION':
      return executeCollection(command);
  }
}

function executeTransfer(command: BankingCommand): unknown {
  const form = command.formData as { sourceAccount: string; amount: number; currency: string; beneficiaryName: string; transferDescription?: string; transferPurpose: string };
  const accounts = accountsRepository.readAll();
  const account = accounts.find((a) => a.id === form.sourceAccount || a.accountNumber === form.sourceAccount);
  if (!account) throw new Error('Source account no longer exists.');
  if (form.amount > account.availableBalance) throw new Error('Insufficient balance at execution time.');

  const updatedAccounts = accounts.map((a) => (a.id === account.id ? { ...a, balance: a.balance - form.amount, availableBalance: a.availableBalance - form.amount } : a));
  accountsRepository.writeAll(updatedAccounts);

  const transaction: Transaction = {
    id: `txn-cmd-${randomUUID()}`,
    accountId: account.id,
    date: getAnchorDates().today,
    type: 'DEBIT',
    category: 'Chuyển khoản',
    amount: form.amount,
    currency: form.currency,
    counterparty: form.beneficiaryName,
    description: form.transferDescription?.trim() || form.transferPurpose,
    status: 'COMPLETED',
  };
  transactionsRepository.writeAll([...transactionsRepository.readAll(), transaction]);

  return { transactionId: transaction.id, referenceNo: command.referenceNo };
}

/** LC/Guarantee/Collection execution all reuse the EXISTING trade-finance.service.ts creation
 * functions (unchanged since Phase 7) — Checker approval is the new gate in front of them, not a
 * reimplementation of what they already do. */
function executeLc(command: BankingCommand): unknown {
  const form = command.formData as {
    type: 'IMPORT' | 'EXPORT';
    subType: 'SIGHT' | 'USANCE' | 'DEFERRED_PAYMENT' | 'TRANSFERABLE' | 'STANDBY';
    beneficiary: string;
    applicant?: string;
    issuingBank?: string;
    advisingBank?: string;
    currency: string;
    amount: number;
    latestShipmentDate: string;
    expiryDate: string;
    requiredDocuments?: string[];
  };
  const lc = tradeFinanceService.createLc(form);
  return { lcNumber: lc.lcNumber, referenceNo: command.referenceNo };
}

function executeGuarantee(command: BankingCommand): unknown {
  const form = command.formData as {
    type: 'BID_BOND' | 'PERFORMANCE_BOND' | 'ADVANCE_PAYMENT' | 'PAYMENT_GUARANTEE' | 'WARRANTY' | 'CUSTOMS' | 'TAX' | 'OTHER';
    beneficiary: string;
    applicant?: string;
    currency: string;
    amount: number;
    expiryDate: string;
  };
  const bg = tradeFinanceService.createGuarantee(form);
  return { bgNumber: bg.bgNumber, referenceNo: command.referenceNo };
}

function executeCollection(command: BankingCommand): unknown {
  const form = command.formData as {
    type: 'IMPORT' | 'EXPORT';
    subType: 'DP' | 'DA';
    direction: 'INWARD' | 'OUTWARD';
    drawer: string;
    drawee: string;
    currency: string;
    amount: number;
    dueDate: string;
  };
  const col = tradeFinanceService.createCollection(form);
  return { collectionNumber: col.collectionNumber, referenceNo: command.referenceNo };
}
