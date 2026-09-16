import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SemanticAnswerAction } from './rm-data.service';

export type AgentWorkflowStatus = 'UNDERSTANDING' | 'NEEDS_CLARIFICATION' | 'PLANNING' | 'WAITING_APPROVAL' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface AgentResponse {
  status: 'ANSWERED' | AgentWorkflowStatus;
  /** Which agent intent produced this response — for observability; the UI never branches on it. */
  intent?: string;
  message: string;
  workflowId?: string;
  /** Only present on WAITING_APPROVAL — must be echoed back to approve() (spec §13). */
  idempotencyKey?: string;
  preview?: Record<string, unknown>;
  missingFields?: string[];
  result?: unknown;
  /** Set when the Agent hands a write intent off to a real BankingCommand draft (Maker/Checker
   * upgrade, Slice 5) instead of running its own approval flow — the UI opens the matching
   * banking form pre-filled with this draft rather than showing a WAITING_APPROVAL card. */
  commandId?: string;
  /** Navigation CTA(s) for an ANSWERED/COMPLETED read response — same `target` vocabulary
   * (OPEN_ACCOUNT, OPEN_LC_DETAIL, ...) the deterministic chat's SemanticAnswer already uses.
   * Previously the Agent never returned these, so every Agent answer rendered as plain text with
   * no CTA even when the underlying data (e.g. general_question reusing the same Semantic Engine)
   * had one ready. See rm-message-builder.ts's buildAgentMessages(). */
  action?: SemanticAnswerAction;
  actions?: SemanticAnswerAction[];
  records?: unknown[];
  answerTitle?: string;
}

export interface AgentWorkflowRecord {
  workflowId: string;
  intent: string;
  status: AgentWorkflowStatus;
  result?: unknown;
  error?: string;
}

/** Phase 5.5 — Gemini AI Agent (docs/AI_AGENT_ARCHITECTURE.md). Thin HTTP wrapper, same shape
 * as every other core/services/*.ts client in this app — no business logic here, that all lives
 * server-side (server/src/agent/agent-orchestrator.ts). */
@Injectable({ providedIn: 'root' })
export class AgentService {
  private readonly http = inject(HttpClient);

  async sendMessage(message: string): Promise<AgentResponse> {
    return firstValueFrom(this.http.post<AgentResponse>('/api/agent/message', { message }));
  }

  /** spec §11/§13: an explicit user action, never inferred from chat text — this is the only
   * call that can turn a WAITING_APPROVAL draft into a real executed action. */
  async approve(workflowId: string, idempotencyKey: string): Promise<AgentWorkflowRecord> {
    return firstValueFrom(this.http.post<AgentWorkflowRecord>(`/api/agent/workflow/${workflowId}/approve`, { idempotencyKey }));
  }

  async cancel(workflowId: string): Promise<AgentWorkflowRecord> {
    return firstValueFrom(this.http.post<AgentWorkflowRecord>(`/api/agent/workflow/${workflowId}/cancel`, {}));
  }
}
