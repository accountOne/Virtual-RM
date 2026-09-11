# Phase 5.5 — Repository Audit

Written per the phase's own instruction (§3: inspect before modifying, reuse rather than
duplicate). Companion to `docs/phase-5-analysis.md`/`phase-6-trade-finance-architecture.md`,
which this assumes as read — this file only covers what changed or newly matters for the
Advanced Business Reasoning upgrade.

## 1. Current architecture (before this pass)

```
POST /api/virtual-rm/query
  → semantic.controller.ts
      → answerQuery() (semantic-engine.ts): intent-detector → entity-extractor →
        query-builder → response-generator  [deterministic, 50+ intents]
      → routeQuery() (model-router.ts): keyword-trigger rules decide if this needs
        the Reasoning Engine instead
      → runReasoning() (reasoning-engine.ts): declarative plan → Tool Layer
        (tools/index.ts) → Calculation Engine (calculation/financial-calculations.ts) →
        MockReasoningProvider.reason() phrases the already-computed facts
```

Two parallel answer paths already existed and both stay exactly as they were: the
deterministic 50-intent path (SIMPLE questions) and the Reasoning Engine path (12 use cases,
all MODERATE/COMPLEX by this phase's own new classification). Nothing in this list changed
shape — this phase adds a layer *between* the Model Router and the Reasoning Engine's answer,
not a replacement for either.

## 2. Existing components (reused, not duplicated)

| Component | File | Reused as |
|---|---|---|
| AI provider abstraction | `server/src/ai/types.ts`, `ai-client.ts`, `mock-reasoning-provider.ts` | Unchanged interface; two new use case templates added to the mock provider |
| Model Router | `server/src/ai/model-router.ts` | Extended with 2 new use cases + their keyword rules, same `routeQuery()` shape |
| Reasoning Engine | `server/src/ai/reasoning-engine.ts` | Same `runReasoning()` entry point; every existing case's *content* unchanged |
| Tool Layer | `server/src/tools/index.ts` | Every tool this phase needs already existed (`get_tasks`, `get_pending_approvals`, `get_payables`, `get_lc_deadlines`, `get_guarantee_deadlines`, `get_collection_deadlines`, `get_transactions`) — zero new tools were needed |
| Calculation Engine | `server/src/calculation/financial-calculations.ts` | `calculateNetCashflow`, `calculateLcRisk`/`calculateGuaranteeRisk` (3-band) kept byte-for-byte — Phase 5.5's Risk Engine is additive, not a replacement |
| Conversation context | `server/src/ai/conversation-context.ts` | Unchanged; golden tests #8/#9 already covered by its existing document-follow-up resolver |
| Semantic Engine | `server/src/semantic/*` | Unchanged; still the sole SIMPLE-question path |
| Security context | `semantic-engine.ts::buildSecurityContext` | Unchanged; already structurally prevents a client-supplied companyId (single-tenant demo, no companyId parameter exists at all) |

## 3. What already worked

- The full plan→tools→calculate→phrase pipeline, for 12 use cases.
- A no-hallucination guarantee via `MockReasoningProvider`: it only ever interpolates numbers
  the Calculation Engine already computed.
- `AI_MAX_STEPS` bound (hard-coded default 6), checked before any tool call.
- `AI_CONFIDENCE_THRESHOLD` on the Semantic Engine side.
- `SEMANTIC_DEBUG` gating of `plan`/`toolsUsed`/`calculationsUsed` — no chain-of-thought ever
  exposed.
- Server-side-only companyId/userId/role, enforced structurally (no override surface exists).
- 385 passing tests across 17 suites.

## 4. What was missing (this phase's actual gap)

1. **No complexity/reasoning-type classification** — every reasoning use case was just "needs
   reasoning: yes/no", with no SIMPLE/MODERATE/COMPLEX or LOOKUP/AGGREGATION/COMPARISON/
   DIAGNOSTIC/ADVISORY label anywhere, so the debug output and any future UI had nothing to
   render a "how was this answered" indicator from.
2. **No formalized declarative plan object** — `PLANS: Record<UseCase, string[]>` existed
   inline inside `reasoning-engine.ts` with no `objective`/`constraints` metadata, and was the
   single source of truth with no separate planner module.
3. **No DIAGNOSTIC reasoning type at all** — nothing answered "why did X change" with a
   current-vs-previous-period comparison and named drivers. `CASHFLOW_ANALYSIS` only reports
   one period.
4. **No cross-domain "what's most important today" reasoning** — the closest existing use case
   (`TRADE_FINANCE_ATTENTION`) is scoped to Trade Finance only; nothing ranked Tasks +
   Approvals + Payables + LC + Guarantee + Collection together.
5. **No Evidence Engine** — an answer's metrics/records were never traced back to a flat,
   checkable `{source, entityType, entityId, field, value}` list.
6. **No Verification Engine** — nothing checked an answer for internal consistency before
   returning it; a bug in a calculation or a stale navigation `entityId` would have shipped
   silently.
7. **Only a 3-band risk model** — `calculateLcRisk`/`calculateGuaranteeRisk` used ad-hoc
   point-additions with a `HIGH/MEDIUM/LOW` (50/25 threshold) scale, not spec §10's configurable
   weighted 4-band (`LOW/MEDIUM/HIGH/CRITICAL`, 0-29/30-59/60-79/80-100) model, and had no
   externalized config file.
8. **No Priority Engine** — `rankByUrgency` (existing) only ranks one entity type at a time by
   amount/due-date; nothing combined urgency × impact × risk × deadline across entity types.

## 5. Files touched by this pass

**New:**
- `server/src/reasoning/reasoning-types.ts`
- `server/src/reasoning/complexity-classifier.ts`
- `server/src/reasoning/query-planner.ts`
- `server/src/reasoning/evidence-engine.ts`
- `server/src/reasoning/verification-engine.ts`
- `server/src/reasoning/risk-engine.ts`
- `server/src/reasoning/priority-engine.ts`
- `server/src/config/risk-rules.json`
- `server/test/reasoning-phase55.test.ts`
- `docs/phase-5.5-*.md` (this file + 6 more)

**Modified (all additive — see docs/phase-5.5-evaluation.md for the exact diff shape):**
- `server/src/ai/reasoning-engine.ts` — `PLANS` map replaced by `planFor()` (thin wrapper over
  `query-planner.ts`); every `case` now ends in a new `finalize()` helper that tags
  complexity/reasoningType and runs verification; two new cases (`CASHFLOW_DIAGNOSTIC`,
  `DAILY_PRIORITY`).
- `server/src/ai/model-router.ts` — 2 new `ReasoningUseCase` values + their keyword rules;
  existing LC/Guarantee risk-trigger phrase lists widened (see §7 below).
- `server/src/ai/mock-reasoning-provider.ts` — 2 new templates.
- `server/src/semantic/types.ts` — `SemanticQueryResult.semantic` gained an always-present
  `reasoningMeta` (type/complexity/verificationStatus) and the debug-only `reasoning` object
  gained `evidenceSummary`.
- `server/src/controllers/semantic.controller.ts` — populates the two additions above.
- `server/test/run-all.ts` — registers the new test file.

**Not touched at all:** every Phase 1–6 deterministic intent, every existing Trade Finance
dedicated screen (Phase 7), the frontend (`src/app/**`), every existing mock data file.

## 6. Risks identified and how this pass addressed them

| Risk | Mitigation |
|---|---|
| A new mandatory verification gate silently breaking one of the 12 existing use cases | `verifyReasoning()`'s hard-error checks (no data, empty summary, NaN/undefined metric) never fire on well-formed existing output; unbacked navigation entityIds and thin recommendations are `warnings`, not `errors` — confirmed by a dedicated regression test that runs every existing use case and asserts `verificationStatus !== 'FAILED'` |
| `DAILY_PRIORITY`'s genuinely cross-domain plan (spec names 9 domains) exceeding `AI_MAX_STEPS=6` | Scoped to 6 of the 9 named domains (Tasks/Approvals/Payables/LC/Guarantee/Collection) rather than widening the existing step ceiling — documented as a deliberate deviation, see §"Known limitations" in `docs/phase-5.5-evaluation.md` |
| A second, drifting copy of the plan step lists | `reasoning-engine.ts` now imports `planSteps()`/`buildReasoningPlan()` from `query-planner.ts` instead of keeping its own `PLANS` map |
| `priority` (LOW/MEDIUM/HIGH/CRITICAL) silently mismatching its own `priorityScore` | Found via a live smoke test during this pass (a Collection scored 63 but showed `MEDIUM` because `priority` was copied from a *different* number, the Risk Engine's raw `risk.score`, not the Priority Engine's own combined `priorityScore`) — fixed to always derive `priority` from `priorityScore` via the same `levelFromScore` boundaries, and pinned with a regression test (`every item.priority is consistent with its own priorityScore`) |
| Golden test #2's exact wording ("LC nào có rủi ro cao nhất?") not matching the Phase 6 keyword list (which required "lc nào rủi ro" with no "có" in between) | Widened the LC/Guarantee risk-trigger phrase lists in `model-router.ts` |

## 7. Implementation plan followed

1. Inspect (this document).
2. Add the `reasoning/` types + Risk Engine (config-driven, additive to the existing 3-band
   calculators).
3. Add Complexity Classifier + Query Planner (formalizes the existing `PLANS` map).
4. Add Evidence Engine + Verification Engine.
5. Add Priority Engine (built on the Risk Engine).
6. Wire two new reasoning use cases (`CASHFLOW_DIAGNOSTIC`, `DAILY_PRIORITY`) end-to-end:
   Model Router → Reasoning Engine → Mock Provider template.
7. Extend `SemanticAnswer`/`SemanticQueryResult` types and the controller, additively.
8. Write and run the Phase 5.5 test suite (126 new tests) until every one — including all
   10 golden test cases — passes against real seeded data.
9. `npm run build:server` + `npm run build` (Angular, unaffected) both clean.
10. Write the remaining `docs/phase-5.5-*.md` files and this final report.
