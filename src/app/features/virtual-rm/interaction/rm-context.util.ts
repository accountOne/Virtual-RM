// Phase 5.6 context-awareness (spec §15) — the pure, DI-free half of `RmContextService`'s logic
// (route parsing + question enrichment), pulled out so it's testable without an Angular Router
// instance/TestBed. `RmContextService` is the only caller; this file has no Angular imports.

export interface EntityRoutePattern {
  entityType: string;
  re: RegExp;
}

export const ENTITY_ROUTE_PATTERNS: EntityRoutePattern[] = [
  { entityType: 'LetterOfCredit', re: /\/trade-finance\/lc\/([A-Za-z0-9-]+)(?:$|[/#?])/ },
  { entityType: 'BankGuarantee', re: /\/trade-finance\/guarantees\/([A-Za-z0-9-]+)(?:$|[/#?])/ },
  { entityType: 'Collection', re: /\/trade-finance\/collections\/([A-Za-z0-9-]+)(?:$|[/#?])/ },
];

export interface ParsedEntity {
  entityType: string;
  entityId: string;
}

export function parseEntityFromUrl(url: string): ParsedEntity | undefined {
  for (const { entityType, re } of ENTITY_ROUTE_PATTERNS) {
    const match = url.match(re);
    if (match) return { entityType, entityId: match[1] };
  }
  return undefined;
}

export function mentionsDocumentNumber(question: string): boolean {
  return /\b(LC|BG|COL)-?\d{2,}/i.test(question);
}

/** Enriches a short, entity-ambiguous question with the current screen's entity id so the
 * backend resolves it correctly, e.g. "Còn thiếu gì?" while viewing LC-2026-001 becomes
 * "Còn thiếu gì? LC-2026-001" — the same trailing-bare-number shape
 * `conversation-context.ts::resolveDocumentFollowUp` already knows how to resolve from a
 * previous chat turn, now also reachable from page context. Never touches a question that
 * already names its own entity, and does nothing when there is no current entity. */
export function enrichQuestion(question: string, entityId: string | undefined): string {
  if (!entityId || mentionsDocumentNumber(question)) return question;
  return `${question} ${entityId}`;
}
