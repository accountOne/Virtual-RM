import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type CommandType = 'TRANSFER' | 'LC' | 'GUARANTEE' | 'COLLECTION';
export type CommandStatus = 'DRAFT' | 'PENDING_CHECKER' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'FAILED';
export type WarningSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'BLOCKING';

export interface CommandWarning {
  code: string;
  severity: WarningSeverity;
  title: string;
  message: string;
  field?: string;
  source: 'FRONTEND' | 'BACKEND' | 'BUSINESS_RULE';
  blocking: boolean;
}

export interface CommandValidationError {
  field: string;
  code: string;
  message: string;
}

export interface CommandValidationResult {
  valid: boolean;
  errors: CommandValidationError[];
  warnings: CommandWarning[];
  checkedAt: string;
}

export interface BankingCommand {
  id: string;
  commandType: CommandType;
  referenceNo: string;
  makerUserId: string;
  makerName: string;
  checkerUserId?: string;
  checkerName?: string;
  status: CommandStatus;
  formData: Record<string, unknown>;
  semanticData?: { originalMessage?: string; intent?: string; entities?: Record<string, unknown>; confidence?: number };
  validationResult: CommandValidationResult;
  warnings: CommandWarning[];
  version: number;
  idempotencyKey?: string;
  executionResult?: unknown;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectReason?: string;
}

export type AuditEventType =
  | 'DRAFT_CREATED'
  | 'FIELD_UPDATED'
  | 'VALIDATED'
  | 'SUBMITTED'
  | 'VIEWED_BY_CHECKER'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXECUTED'
  | 'FAILED';

export interface AuditEvent {
  id: string;
  commandId: string;
  eventType: AuditEventType;
  actorUserId: string;
  actorRole: 'MAKER' | 'CHECKER' | 'ADMIN' | 'SYSTEM';
  oldStatus?: string;
  newStatus?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Thin HTTP wrapper over the Maker/Checker BankingCommand API (server/src/controllers/
 * commands.controller.ts) — same shape as every other core/services/*.ts client (agent.service.ts
 * included). No business logic here; validation/warnings/state all come from the server. */
@Injectable({ providedIn: 'root' })
export class CommandsService {
  private readonly http = inject(HttpClient);

  // ---- Maker ---------------------------------------------------------------------------------

  async create(commandType: CommandType, formData: Record<string, unknown>, semanticData?: BankingCommand['semanticData']): Promise<BankingCommand> {
    return firstValueFrom(this.http.post<BankingCommand>('/api/commands', { commandType, formData, semanticData }));
  }

  async list(): Promise<BankingCommand[]> {
    return firstValueFrom(this.http.get<BankingCommand[]>('/api/commands'));
  }

  async get(id: string): Promise<BankingCommand> {
    return firstValueFrom(this.http.get<BankingCommand>(`/api/commands/${id}`));
  }

  async validate(id: string): Promise<BankingCommand> {
    return firstValueFrom(this.http.post<BankingCommand>(`/api/commands/${id}/validate`, {}));
  }

  async updateDraft(id: string, formData: Record<string, unknown>): Promise<BankingCommand> {
    return firstValueFrom(this.http.put<BankingCommand>(`/api/commands/${id}`, { formData }));
  }

  async submit(id: string): Promise<BankingCommand> {
    return firstValueFrom(this.http.post<BankingCommand>(`/api/commands/${id}/submit`, {}));
  }

  // ---- Checker --------------------------------------------------------------------------------

  async checkerQueue(status: CommandStatus = 'PENDING_CHECKER'): Promise<BankingCommand[]> {
    return firstValueFrom(this.http.get<BankingCommand[]>('/api/checker/commands', { params: { status } }));
  }

  async checkerDetail(id: string): Promise<BankingCommand> {
    return firstValueFrom(this.http.get<BankingCommand>(`/api/checker/commands/${id}`));
  }

  async auditTrail(id: string): Promise<AuditEvent[]> {
    return firstValueFrom(this.http.get<AuditEvent[]>(`/api/checker/commands/${id}/audit-events`));
  }

  async approve(id: string, idempotencyKey: string): Promise<BankingCommand> {
    return firstValueFrom(this.http.post<BankingCommand>(`/api/checker/commands/${id}/approve`, { idempotencyKey }));
  }

  async reject(id: string, reason: string): Promise<BankingCommand> {
    return firstValueFrom(this.http.post<BankingCommand>(`/api/checker/commands/${id}/reject`, { reason }));
  }
}
