// Phase 5.5 Evidence Engine (spec §13). Turns the tool results a reasoning use case already
// fetched into a flat, traceable fact list — not a new data source, a re-shaping of records
// the Tool Layer already returned. The Verification Engine (verification-engine.ts) checks
// answer metrics/actions against this list; SEMANTIC_DEBUG=true surfaces a trimmed
// `evidenceSummary` (never the model's reasoning, just which fields backed the answer — spec
// §13's own "Không expose raw internal implementation details unless debug mode").

import { ReasoningEvidence } from './reasoning-types';

/** Builds one ReasoningEvidence row per (item, field) pair. `source` names the underlying
 * mock-data file (or tool) a reviewer could go check by hand, matching spec §13's worked
 * example (`"source": "letter-of-credits.json"`). */
export function pluckEvidence<T extends object>(
  source: string,
  entityType: string,
  idField: keyof T,
  items: T[],
  fields: (keyof T)[],
): ReasoningEvidence[] {
  return items.flatMap((item) =>
    fields.map((field) => ({
      source,
      entityType,
      entityId: String(item[idField] ?? ''),
      field: String(field),
      value: item[field],
    })),
  );
}

/** For a single computed fact that isn't a raw record field (e.g. a Calculation Engine
 * result) — still traceable, just to the calculation's own name instead of a mock-data file. */
export function calculatedEvidence(calculationName: string, entityType: string, entityId: string, field: string, value: unknown): ReasoningEvidence {
  return { source: `calculation:${calculationName}`, entityType, entityId, field, value };
}

/** Debug-mode summary — every evidence row's entityId/field, never the raw `value` payload by
 * default (keeps SEMANTIC_DEBUG output bounded for cross-domain answers with many records; the
 * Verification Engine itself still gets the full list with values). */
export interface EvidenceSummaryRow {
  entityType: string;
  entityId: string;
  field: string;
}

export function summarizeEvidence(evidence: ReasoningEvidence[], limit = 20): EvidenceSummaryRow[] {
  return evidence.slice(0, limit).map((e) => ({ entityType: e.entityType, entityId: e.entityId, field: e.field }));
}
