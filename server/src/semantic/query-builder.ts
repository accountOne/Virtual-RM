import { DateResolution } from './date-resolver';
import { IntentDef, SecurityContext, SemanticQuery } from './types';

export interface BuildQueryInput {
  intent: IntentDef;
  confidence: number;
  entities: SemanticQuery['entities'];
  dateResolution?: DateResolution;
  status?: string;
  amount?: SemanticQuery['filters']['amount'];
  security: SecurityContext;
  matchedTerms: string[];
}

/**
 * Assembles the final SemanticQuery AST. `companyId`/`userId` are always taken from the
 * SecurityContext the caller computed server-side (see semantic-engine.ts) — never from the
 * parsed question — so chat input can never override tenant/user scoping.
 */
export function buildQuery(input: BuildQueryInput): SemanticQuery {
  const { intent, confidence, entities, dateResolution, status, amount, security, matchedTerms } = input;

  const filters: SemanticQuery['filters'] = {
    companyId: security.companyId,
    userId: security.userId,
  };
  if (intent.id === 'APPROVAL_PENDING' || intent.id === 'APPROVAL_APPROVE' || intent.id === 'APPROVAL_REJECT') {
    filters.approverUserId = security.userId;
  }
  if (dateResolution) filters.datePeriod = dateResolution.periodId;
  if (status) filters.status = status;
  if (amount) filters.amount = amount;

  const query: SemanticQuery = {
    intent: intent.id,
    confidence,
    entities,
    filters,
    action: intent.navigationAction,
    matchedTerms,
  };

  if (intent.defaultSort) query.sort = intent.defaultSort;

  return query;
}
