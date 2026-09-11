# Phase 5.5 — Advanced Business Reasoning & Verification

Virtual RM's upgrade from a query assistant to a Business Reasoning RM: same architecture
(Semantic → Reasoning → Tool → Calculation Engine, from Phase 5/6), now with an explicit
complexity/reasoning-type classification, a mandatory verification gate, a traceable evidence
list, a configurable Risk Engine, and a cross-domain Priority Engine layered on top.

## 1. What changed for the user

Before this phase, every reasoning answer was "phrase these facts" with no visible reliability
signal. Now every reasoning answer's API response carries:

```json
"semantic": {
  "intent": "LC_RISK_PRIORITIZATION",
  "reasoningRequired": true,
  "reasoningMeta": { "type": "COMPARISON", "complexity": "COMPLEX", "verificationStatus": "VERIFIED" }
}
```

`reasoningMeta` is always present (not `SEMANTIC_DEBUG`-gated) — it's reliability metadata about
*this specific answer*, not internal reasoning. `SEMANTIC_DEBUG=true` additionally exposes
`plan`/`toolsUsed`/`calculationsUsed`/`evidenceSummary` — never the model's chain-of-thought,
only which tools/calculations/facts went in (spec §24).

Two new questions now work end-to-end:

- **DIAGNOSTIC**: "Tại sao dòng tiền tháng này giảm?" — compares the current and previous
  calendar month, names the categories whose amount moved the most, and phrases the cause as
  "Nguyên nhân chính theo dữ liệu hiện có là..." (never an unsupported "Chắc chắn vì...").
- **ADVISORY / cross-domain**: "Tôi nên xử lý việc gì quan trọng nhất hôm nay?" — ranks Tasks,
  pending Approvals, Payables, LC, Guarantee, and Collection risk together and returns the top 3
  with reasons and navigation.

## 2. Architecture

```
Question
   │
   ▼
Semantic Engine (unchanged, Phase 1–5)  ──────────────► SIMPLE → response-generator.ts answer
   │  resolved intent / raw message
   ▼
Model Router (ai/model-router.ts)  — deterministic keyword rules, no LLM call to decide
   │  reasoningRequired? + useCase
   ▼
Query Planner (reasoning/query-planner.ts) — declarative plan per use case
   │  steps.length > AI_MAX_STEPS? → refuse before any tool call
   ▼
Reasoning Engine (ai/reasoning-engine.ts) — per-use-case switch, unchanged content
   │
   ├─► Tool Layer (tools/index.ts) — server-side UserContext only
   ├─► Calculation Engine (calculation/financial-calculations.ts)
   ├─► Risk Engine (reasoning/risk-engine.ts) — LC/Guarantee/Collection, config-driven
   ├─► Priority Engine (reasoning/priority-engine.ts) — cross-domain, built on Risk Engine
   ├─► Evidence Engine (reasoning/evidence-engine.ts) — flattens facts into ReasoningEvidence[]
   └─► AI Provider .reason() — phrases the facts only (mock, deterministic)
   │
   ▼
Verification Engine (reasoning/verification-engine.ts)
   │  valid? → real answer   /   invalid? → safeFallbackAnswer()
   ▼
finalize() — tags reasoningType/complexity/verificationStatus, returns { answer, debug }
   │
   ▼
Response (SemanticAnswer + reasoningMeta) → frontend renders ctas[] exactly as before
```

See `docs/phase-5.5-reasoning-architecture.md` for the full data-flow diagram and
`docs/phase-5.5-query-planner.md`/`risk-engine.md`/`verification.md` for each new engine's own
design notes.

## 3. Non-negotiable principles — how each is actually enforced

| Principle | Enforcement |
|---|---|
| No hallucination | `MockReasoningProvider.reason()` only ever interpolates strings/numbers already computed by the Calculation/Risk/Priority Engines into a fixed template — there is no generative step that could invent a fact |
| LLM does not calculate | Every number in a template's `facts` object is a `Calculation Engine`/`Risk Engine`/`Priority Engine` output; the provider receives already-computed values, never raw records to "figure out" |
| LLM does not override authorization | `UserContext`/`SecurityContext` are built once server-side (`buildSecurityContext`) from the request's `userId`/`role` only; `companyId` has no client-facing parameter anywhere in the call chain — enforced structurally, not by a runtime check that could be bypassed |
| No chain-of-thought exposure | `ReasoningDebugInfo`/`reasoningMeta` only ever carry `useCase`/`plan` (tool names)/`toolsUsed`/`calculationsUsed`/`evidenceSummary`/`reasoningType`/`complexity`/`verificationStatus` — string tags and tool names, never a natural-language reasoning trace |

## 4. Reasoning types in this codebase

| Type | Use cases | Flow |
|---|---|---|
| LOOKUP | Every SIMPLE deterministic intent (unchanged, Semantic Engine only) | Semantic → Tool → Response |
| AGGREGATION | `CASHFLOW_ANALYSIS`, `PAYMENT_PRIORITIZATION`, `APPROVAL_PRIORITIZATION`, `TRADE_FINANCE_EXPOSURE`, `TRADE_FINANCE_LIMIT_ANALYSIS`, `TRADE_FINANCE_OVERVIEW` | Get → Calculate → Respond |
| COMPARISON | `LC_RISK_PRIORITIZATION`, `GUARANTEE_RISK_PRIORITIZATION`, `TRADE_FINANCE_ATTENTION` | Get → Score/Rank → Respond |
| DIAGNOSTIC | `CASHFLOW_DIAGNOSTIC` (new) | Current period → Previous period → Variance → Largest drivers → Explain |
| ADVISORY | `LIQUIDITY_ANALYSIS`, `IDLE_CASH_ANALYSIS`, `PRODUCT_RECOMMENDATION_REASONING`, `DAILY_PRIORITY` (new) | Multi-factor → Position → Recommendation |

## 5. Complexity classification

`SIMPLE` (Semantic Engine alone) is everything that never reaches the Reasoning Engine — the
Model Router already decided reasoning wasn't required, unchanged from Phase 5. Everything that
does reach it is either `MODERATE` (one domain, one calculation) or `COMPLEX` (cross-domain,
ranking, diagnosis, or a recommendation) — see `complexity-classifier.ts`'s explicit
`COMPLEX_USE_CASES` set. The Reasoning Model (the AI Provider's `.reason()` call) is never
invoked for a `SIMPLE` question — the Model Router's deterministic rules run first, exactly as
in Phase 5, so "don't call the reasoning model for every query" (spec §6) still holds.

## 6. Verification is mandatory, not optional

Every use case that reaches the Reasoning Engine is `MODERATE` or `COMPLEX` by construction (see
§5) — `finalize()` in `reasoning-engine.ts` runs `verifyReasoning()` on every single return path,
with no opt-out. An answer that fails hard verification (no source data, empty summary, a
NaN/undefined metric) is replaced with `safeFallbackAnswer()` before it ever reaches the
frontend. See `docs/phase-5.5-verification.md` for the full check list and what's deliberately
not re-implemented because it's already guaranteed elsewhere.

## 7. What this phase deliberately did not do

See `docs/phase-5.5-evaluation.md` "Known limitations" for the full list; the two load-bearing
ones: `DAILY_PRIORITY`'s plan covers 6 of the 9 domains spec §17 names (not Cashflow/Loans/
Alerts, to stay within `AI_MAX_STEPS=6`), and a real LLM provider (Claude/OpenAI/...) is still
not wired in — no `AI_API_KEY` exists in this environment, so `MockReasoningProvider` remains
the only implementation, exactly as Phase 5 left it.
