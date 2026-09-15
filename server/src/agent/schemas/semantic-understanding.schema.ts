// Zod schema for Gemini's structured semantic-understanding output (spec §5/§6/§7). Every
// caller of gemini-client.ts's generateStructuredResponse() for this purpose MUST validate the
// raw JSON through this schema before trusting a single field — a model response that doesn't
// parse against it is treated exactly like a network failure (see gemini-semantic-engine.ts's
// fallback chain), never partially trusted.

import { z } from 'zod';

/** Spec §6 — 5 core intents + 9 Business Banking intents, exactly as specified. Existing
 * equivalent deterministic intents are reused via `general_question` (routes to the existing
 * 61-intent Semantic Engine — see gemini-semantic-engine.ts) rather than re-implemented here;
 * this enum only needs to be fine-grained enough to decide which Agent workflow branch runs. */
export const AGENT_INTENTS = [
  'check_balance',
  'create_transfer',
  'track_transaction',
  'general_question',
  'unknown',
  'create_lc',
  'check_lc_status',
  'create_guarantee',
  'check_guarantee_status',
  'create_collection',
  'check_collection_status',
  'product_information',
  'transaction_search',
  'contact_rm',
] as const;
export type AgentIntent = (typeof AGENT_INTENTS)[number];

/** Intents with a real side effect — the only ones the Workflow Engine (Phase D) ever routes
 * through the Approval Gate. Everything else is a read/informational intent. */
export const WRITE_INTENTS: ReadonlySet<AgentIntent> = new Set(['create_transfer', 'create_lc', 'create_guarantee', 'create_collection']);

const entityValueSchema = z.object({
  value: z.union([z.string(), z.number()]),
  confidence: z.number().min(0).max(1),
  source: z.string(),
});
export type EntityValue = z.infer<typeof entityValueSchema>;

/** Spec §7 — core + Business Banking entities, every one optional (a given message rarely
 * carries all of them) and, when present, always `{ value, confidence, source }` — never a bare
 * value, so a caller can never mistake an unextracted field for a real one. */
const entitiesSchema = z
  .object({
    amount: entityValueSchema.optional(),
    currency: entityValueSchema.optional(),
    beneficiaryName: entityValueSchema.optional(),
    accountNumber: entityValueSchema.optional(),
    sourceAccount: entityValueSchema.optional(),
    transactionId: entityValueSchema.optional(),
    product: entityValueSchema.optional(),
    customerName: entityValueSchema.optional(),
    date: entityValueSchema.optional(),
    lcType: entityValueSchema.optional(),
    lcAmount: entityValueSchema.optional(),
    lcCurrency: entityValueSchema.optional(),
    beneficiary: entityValueSchema.optional(),
    applicant: entityValueSchema.optional(),
    expiryDate: entityValueSchema.optional(),
    guaranteeType: entityValueSchema.optional(),
    guaranteeAmount: entityValueSchema.optional(),
    collectionType: entityValueSchema.optional(),
  })
  .partial();
export type AgentEntities = z.infer<typeof entitiesSchema>;
export type EntityField = keyof AgentEntities;
export const ENTITY_FIELD_NAMES = Object.keys(entitiesSchema.shape) as EntityField[];

/** Required entity fields per write intent — the Workflow Engine (Phase D) checks this
 * deterministically rather than trusting Gemini's own `missingFields` list alone (a model can
 * miss one), same "never trust the LLM alone for a gating decision" posture as the rest of this
 * codebase's AI layer (spec §9's revalidation requirement). */
export const REQUIRED_FIELDS_BY_INTENT: Partial<Record<AgentIntent, EntityField[]>> = {
  create_transfer: ['amount', 'beneficiaryName'],
  create_lc: ['lcType', 'lcAmount', 'lcCurrency', 'beneficiary'],
  create_guarantee: ['guaranteeType', 'guaranteeAmount'],
  create_collection: ['collectionType', 'amount'],
};

export const semanticUnderstandingSchema = z.object({
  intent: z.enum(AGENT_INTENTS),
  confidence: z.number().min(0).max(1),
  entities: entitiesSchema.default({}),
  missingFields: z.array(z.string()).default([]),
  explanation: z.string().default(''),
});
export type SemanticUnderstanding = z.infer<typeof semanticUnderstandingSchema>;
