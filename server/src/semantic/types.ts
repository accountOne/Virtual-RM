// Core types for the Business Banking Semantic Engine. Deterministic, local, no LLM —
// see /business-semantics/README.md and docs/semantic-engine.md for the full picture.

export type AmountOperatorId = 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ' | 'BETWEEN';

export interface AmountFilter {
  operator: AmountOperatorId;
  value?: number;
  min?: number;
  max?: number;
  currency: string;
}

/** The structured result of understanding one natural-language question. */
export interface SemanticQuery {
  intent: string;
  confidence: number;
  entities: {
    accountId?: string;
    accountNo?: string;
    beneficiary?: string;
    customer?: string;
    supplier?: string;
    documentId?: string;
  };
  filters: {
    /** Always injected server-side — see security-context.ts. Never taken from chat input. */
    companyId?: string;
    userId?: string;
    approverUserId?: string;
    datePeriod?: string;
    status?: string;
    transactionType?: string;
    paymentType?: string;
    currency?: string;
    amount?: AmountFilter;
  };
  sort?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  action?: string;
  /** Debug-only — populated when SEMANTIC_DEBUG=true, stripped otherwise. */
  matchedTerms?: string[];
}

export interface MetricItem {
  label: string;
  value: string;
}

export interface AnswerAction {
  label: string;
  type: 'NAVIGATE';
  target: string;
}

export interface SemanticAnswer {
  title: string;
  summary: string;
  metrics: MetricItem[];
  records: unknown[];
  action?: AnswerAction;
  /** Phase 5 (AI Reasoning) additions — populated only when a Reasoning Engine use case
   * produced this answer; absent for the plain deterministic path. See
   * server/src/ai/reasoning-engine.ts and docs/phase-5-architecture.md. */
  insights?: string[];
  recommendation?: { title: string; description: string };
}

export interface SemanticQueryResult {
  success: true;
  semantic: {
    intent: string;
    confidence: number;
    matchedTerms?: string[];
    entities?: SemanticQuery['entities'];
    filters?: SemanticQuery['filters'];
    /** Phase 5: true when this answer went through the Reasoning Engine rather than the
     * plain deterministic intent handler. */
    reasoningRequired?: boolean;
    /** Debug-only (SEMANTIC_DEBUG=true) — structured reasoning metadata per spec §23.
     * Never the model's chain-of-thought, only which tools/calculations ran. */
    reasoning?: { useCase: string; plan: string[]; toolsUsed: string[]; calculationsUsed: string[] };
  };
  answer: SemanticAnswer;
}

export interface ClarificationResult {
  success: true;
  semantic: { intent: 'CLARIFICATION_NEEDED'; confidence: number };
  answer: {
    title: string;
    summary: string;
    metrics: [];
    records: [];
    suggestedQuestions: string[];
  };
}

// ---- Business Banking Semantic Pack shapes (loaded from /business-semantics/*.json) ----

export interface DomainDef {
  id: string;
  name: string;
  description: string;
}

export interface EntityDef {
  id: string;
  domain: string;
  nameVi: string;
  description: string;
  aliases: string[];
}

export interface IntentDef {
  id: string;
  domain: string;
  entity: string;
  description: string;
  priority: number;
  synonymConcepts: string[];
  supportedEntities: string[];
  /** Optional gate (OR semantics): if set, this intent scores 0 unless at least one listed
   * signal is actually present — either a synonymConcepts id that produced a real match, or one
   * of 'datePeriod'/'status'/'amount'/'accountNo'/'accountId'/'documentId'/'beneficiary'/
   * 'supplier'/'customer'. Without this, a narrower intent that merely shares a concept with a
   * broader sibling (e.g. TRANSACTION_DETAIL sharing "transaction" with TRANSACTION_LIST) wins
   * ties on priority alone even when its own distinguishing signal never appeared — see
   * docs/semantic-engine.md #Known limitations ("Structural lesson"). */
  requiredSignals?: string[];
  defaultSort?: { field: string; direction: 'asc' | 'desc' };
  responseTemplate: string;
  navigationAction: string;
}

export type SynonymDict = Record<string, string[]>;

export interface ResponseTemplateDef {
  id: string;
  title: string;
  summary: string;
}

export interface NavigationActionDef {
  id: string;
  route: string;
  labelVi: string;
  note?: string;
}

export interface DatePeriodDef {
  id: string;
  nameVi: string;
  phrases: string[];
  rule: 'DAY_OFFSET' | 'WEEK_OFFSET' | 'MONTH_OFFSET' | 'QUARTER_OFFSET' | 'YTD' | 'DAY_WINDOW' | 'MONTH_WINDOW';
  offset?: number;
  days?: number;
  months?: number;
  direction?: 'PAST' | 'FUTURE';
}

export interface AmountOperatorsPack {
  operators: { id: AmountOperatorId; nameVi: string; phrases: string[] }[];
  units: { id: string; nameVi: string; phrases: string[]; multiplier: number }[];
  currencies: { id: string; phrases: string[]; default?: boolean }[];
}

export interface StatusDefinitionsPack {
  statuses: { id: string; nameVi: string; description: string }[];
  vietnameseMap: Record<string, string>;
}

export interface SemanticRulesPack {
  confidenceThreshold: number;
  scoring: Record<string, number>;
  normalization: { steps: string[]; abbreviations: Record<string, string> };
  maxScorePerConcept: number;
  clarificationPolicy: { belowThreshold: string; noMatch: string; neverHallucinate: boolean };
}

export interface DateRange {
  from: string;
  to: string;
}

export interface SecurityContext {
  companyId: string;
  userId: string;
  role?: 'MAKER' | 'CHECKER' | 'ADMIN';
}
