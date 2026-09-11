# Phase 5.5 — Query Planner

`server/src/reasoning/query-planner.ts`. Formalizes what Phase 5 already did informally (an
inline `PLANS: Record<ReasoningUseCase, string[]>` map inside `reasoning-engine.ts`) into a
declarative `ReasoningPlan` per use case, with the two pieces of metadata Phase 5 never
attached: an `objective` and `constraints`.

## Shape

```ts
interface ReasoningPlan {
  reasoningType: ReasoningType;
  complexity: QueryComplexity;
  objective: string;
  steps: string[];              // tool names, in call order
  constraints: {
    maxSteps: number;
    requiresCalculation: boolean;
    requiresVerification: boolean;  // always true — see docs/phase-5.5-verification.md
  };
}
```

`buildReasoningPlan(useCase, maxSteps)` returns this; `planSteps(useCase)` returns just the
`steps` array, which is what `reasoning-engine.ts::planFor()` actually calls on every
`runReasoning()` invocation (the same check Phase 5 already had: `plan.length > config.maxSteps`
refuses before any tool executes).

## Every use case's plan (14 total — 12 from Phase 5/6, 2 new)

| Use case | Steps | Length |
|---|---|---|
| CASHFLOW_ANALYSIS | get_transactions | 1 |
| LC_RISK_PRIORITIZATION | get_lc_deadlines | 1 |
| GUARANTEE_RISK_PRIORITIZATION | get_guarantee_deadlines | 1 |
| PAYMENT_PRIORITIZATION | get_payables | 1 |
| APPROVAL_PRIORITIZATION | get_pending_approvals | 1 |
| TRADE_FINANCE_EXPOSURE | get_trade_finance_exposure | 1 |
| TRADE_FINANCE_LIMIT_ANALYSIS | get_trade_finance_limits | 1 |
| LIQUIDITY_ANALYSIS | get_cash_position, get_payables, get_loan_obligations | 3 |
| IDLE_CASH_ANALYSIS | get_cash_position, get_receivables, get_payables | 3 |
| TRADE_FINANCE_ATTENTION | get_lc_deadlines, get_guarantee_deadlines, get_collections | 3 |
| **CASHFLOW_DIAGNOSTIC** (new) | get_transactions ×2 (current + previous period) | 2 |
| PRODUCT_RECOMMENDATION_REASONING | get_cash_position, get_receivables, get_payables, get_recommendations, get_products | 5 |
| TRADE_FINANCE_OVERVIEW | get_letter_of_credits, get_bank_guarantees, get_collections, get_trade_finance_exposure, get_trade_finance_limits | 5 |
| **DAILY_PRIORITY** (new) | get_tasks, get_pending_approvals, get_payables, get_lc_deadlines, get_guarantee_deadlines, get_collection_deadlines | 6 |

Every plan is ≤ `AI_MAX_STEPS` (default 6) — verified by a dedicated test
(`planSteps never exceeds AI_MAX_STEPS=6 for any use case`).

## DAILY_PRIORITY — the AI_MAX_STEPS trade-off

Spec §17's own worked example lists nine domains for "what should I work on today": Tasks +
Approvals + Payments + LC + Guarantee + Collection + Cashflow + Loans + Alerts. Naively calling
one tool per domain is 9 tool calls — already over the default `AI_MAX_STEPS=6` before any
ranking logic runs.

This pass chose **not** to widen `AI_MAX_STEPS` globally (a config value other use cases and any
future ones also inherit) just to fit one use case. Instead `DAILY_PRIORITY`'s plan covers the
six domains with the clearest per-item actionability and existing risk/urgency scoring — Tasks,
Approvals, Payables, LC, Guarantee, Collection — and leaves Cashflow/Loans/Alerts out of the
*tool-call plan*. This is a scope decision, not a silent gap: it's recorded here, in the audit,
and in the evaluation doc's "Known limitations", and the golden test for this question (spec
§28 test #5) still passes because it only requires "top 3 priorities + why + impact + CTA", all
of which the 6-domain ranking already delivers.

If a real deployment needs the other three domains, the fix is either (a) widen `AI_MAX_STEPS`
for this one use case specifically (the constraint is already per-plan, `maxSteps` is a
parameter to `buildReasoningPlan`, not a hard-coded 6 inside it), or (b) fold Cashflow/Loans/
Alerts into one of the existing six calls (e.g. `get_alerts` data is largely a subset of what
`get_tasks` already surfaces in this demo's seed data).

## Why `CASHFLOW_DIAGNOSTIC` calls the same tool twice

`get_transactions` takes a `{ range }` parameter; DIAGNOSTIC reasoning (spec §5) needs the
*current* period and the *previous* period as two independent tool calls with different ranges,
not one call over a wider window (that would blur exactly the period boundary the diagnosis is
about). The plan's `steps` array reflects this honestly as two entries rather than
de-duplicating them into one, so `AI_MAX_STEPS` accounting stays accurate.
