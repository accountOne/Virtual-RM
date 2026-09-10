// AI provider abstraction — Phase 5 (AI Reasoning & Proactive Virtual RM). Model-agnostic so
// business logic never hard-codes a specific provider (Claude/OpenAI/Azure/local); see
// docs/phase-5-architecture.md for how to plug in a real provider.

import { SecurityContext } from '../semantic/types';

/** Server-derived user/tenant context. Always built from SecurityContext (see
 * semantic-engine.ts::buildSecurityContext) — a tool or reasoning step never accepts
 * companyId/userId from request input, only from this object. */
export interface UserContext {
  companyId: string;
  userId: string;
  role?: 'MAKER' | 'CHECKER' | 'ADMIN';
}

export function toUserContext(security: SecurityContext): UserContext {
  return { companyId: security.companyId, userId: security.userId, role: security.role };
}

export interface AIRequest {
  prompt: string;
  context?: Record<string, unknown>;
}

export interface AIResponse {
  text: string;
}

/** One step of a reasoning plan: which tool to call and with what params. */
export interface ToolCallPlanStep {
  tool: string;
  params?: Record<string, unknown>;
}

export interface ReasoningPlan {
  goal: string;
  steps: ToolCallPlanStep[];
}

/** What the reasoning step hands the provider to phrase into an answer: the facts already
 * computed by the Calculation Engine, never raw instructions to "figure out numbers" — the
 * no-hallucination policy (spec §21) requires the provider to phrase, not calculate. */
export interface ReasoningRequest {
  useCase: string;
  goal: string;
  facts: Record<string, unknown>;
  /** Vietnamese company name / persona context, used for tone only. */
  companyName?: string;
}

export interface ReasoningResponse {
  title: string;
  summary: string;
  insights: string[];
  recommendation?: { title: string; description: string };
}

/** Provider-agnostic AI interface. `chat` is for free-form text (not used by the
 * deterministic reasoning use cases below, but part of the contract for a future real
 * provider); `reason` is what the Reasoning Engine actually calls — it must phrase from
 * `facts` only, never invent banking data. */
export interface AIProvider {
  readonly name: string;
  chat(request: AIRequest): Promise<AIResponse>;
  reason(request: ReasoningRequest): Promise<ReasoningResponse>;
}

export interface AIConfig {
  provider: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  reasoningEnabled: boolean;
  maxSteps: number;
  confidenceThreshold: number;
}
