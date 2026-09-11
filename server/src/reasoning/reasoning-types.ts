// Phase 5.5 — Advanced Business Reasoning & Verification. Shared types for the new
// reasoning/ layer that sits between the existing Model Router (server/src/ai/model-router.ts)
// and the existing Reasoning Engine (server/src/ai/reasoning-engine.ts). Nothing here replaces
// Phase 5/6 — it's the additive classification/plan/evidence/verification/priority vocabulary
// those two files now also speak, per docs/phase-5.5-reasoning-architecture.md.

/** How a question is answered, independent of how complex it is to execute (spec §5). */
export type ReasoningType = 'LOOKUP' | 'AGGREGATION' | 'COMPARISON' | 'DIAGNOSTIC' | 'ADVISORY';

/** How much work answering a question takes — decides whether the Reasoning Engine (and its
 * verification layer) runs at all, or the existing fast deterministic path is enough (spec §6).
 * SIMPLE: the 50-intent Semantic Engine alone (single entity/tool, response-generator.ts).
 * MODERATE: one Reasoning Engine use case, a handful of tool calls, one calculation.
 * COMPLEX: cross-domain — several tools/domains, ranking, or a recommendation. */
export type QueryComplexity = 'SIMPLE' | 'MODERATE' | 'COMPLEX';

export interface ReasoningPlan {
  reasoningType: ReasoningType;
  complexity: QueryComplexity;
  objective: string;
  /** Tool names, in call order — matches reasoning-engine.ts's existing `toolsUsed` reporting
   * convention (tool.name strings), not a generic step-description string. */
  steps: string[];
  constraints: {
    maxSteps: number;
    requiresCalculation: boolean;
    requiresVerification: boolean;
  };
}

/** One fact the reasoning traces back to a real record field — never a model assertion.
 * "no fabricated field" (spec §14's verification checklist) means every number/date/status in
 * an answer's metrics/summary should be reconstructable from this list. */
export interface ReasoningEvidence {
  source: string;
  entityType: string;
  entityId: string;
  field: string;
  value: unknown;
}

export interface VerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export type VerificationStatus = 'VERIFIED' | 'WARNING' | 'FAILED';

export function statusFromVerification(result: VerificationResult): VerificationStatus {
  if (!result.valid) return 'FAILED';
  if (result.warnings.length > 0) return 'WARNING';
  return 'VERIFIED';
}

export type RiskLevel4 = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Cross-domain "what needs attention" ranking (spec §11) — distinct from
 * calculation/financial-calculations.ts's existing `PriorityItem` (a single-domain
 * amount/due-date ranking already used by PAYMENT_PRIORITIZATION/APPROVAL_PRIORITIZATION).
 * This one ranks *across* entity types with an explainable reason list. */
export interface CrossDomainPriorityItem {
  entityType: string;
  entityId: string;
  label: string;
  priorityScore: number;
  priority: RiskLevel4;
  reasons: string[];
  recommendedAction?: string;
}
