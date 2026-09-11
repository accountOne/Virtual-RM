# Phase 5.5 — Verification Engine

`server/src/reasoning/verification-engine.ts`. Mandatory for every MODERATE/COMPLEX reasoning
answer — since every use case reaching the Reasoning Engine is MODERATE or COMPLEX by
construction (`complexity-classifier.ts`), this means every single `runReasoning()` call, with
no opt-out. Wired through `reasoning-engine.ts::finalize()`, the one choke point every `case`'s
return path goes through.

```
Reasoner (per-use-case switch + AI Provider phrasing)
   │
   ▼
Candidate SemanticAnswer + ReasoningEvidence[]
   │
   ▼
verifyReasoning({ answer, evidence, hasData })
   │
   ├─ valid=true  → answer returned as-is (warnings, if any, are informational — see below)
   └─ valid=false → safeFallbackAnswer(errors) returned instead; the invalid answer never
                     reaches the frontend
```

## Spec §14's ten checks — what's actually (re-)implemented here vs. already guaranteed

| # | Check | Where it's actually enforced |
|---|---|---|
| 1 | Data exists | `verifyReasoning`: `hasData` (did the plan's tool calls run at all) |
| 2 | Entity exists | `pluckEvidence`/`calculatedEvidence` only ever run over real repository reads — there is no code path that fabricates an entityId |
| 3 | Company access is valid | Structurally, not here — `buildSecurityContext` (semantic-engine.ts) derives `companyId` server-side only; no tool or reasoning step ever accepts a client-supplied companyId. Covered by `security-isolation.test.ts`, not re-checked per-answer |
| 4 | Dates are valid | `semantic/date-resolver.ts` already parses dates against a closed vocabulary before a tool call happens; an unparseable date never reaches a tool |
| 5 | Currency is valid | `semantic/amount-parser.ts`, same reasoning as #4 |
| 6 | Calculations are correct | Guaranteed deterministic by construction — same inputs to `financial-calculations.ts`/`risk-engine.ts`/`priority-engine.ts` always produce the same outputs (no randomness, no external I/O mid-calculation); pinned by the priority-engine "scores are deterministic" test rather than re-verified per-call (re-running the same pure function a second time to "check" it would just be running it twice) |
| 7 | Evidence supports conclusion | `verifyReasoning`: every metric value must be a real, finite representation (no `NaN`/`undefined` substring) |
| 8 | Recommendation is supported by evidence | `verifyReasoning`: a `recommendation` with zero metrics *and* zero evidence rows → warning |
| 9 | No fabricated field | `verifyReasoning`: every navigation `entityId` (in `action`/`actions`) must appear either in the evidence list or in a returned record — never a string the AI Provider's template interpolated from nowhere |
| 10 | Navigation entity exists | Same check as #9 |

Checks #3–#6 are load-bearing architectural guarantees from earlier phases, not re-implemented
here on purpose — duplicating them inside the Verification Engine would either be redundant (a
pure function checking itself) or would need to re-derive server-side security state the
Verification Engine has no business touching. What #1/#7/#8/#9/#10 actually check is new in this
phase.

## Errors vs. warnings

- **Errors** (→ `valid: false` → answer replaced with `safeFallbackAnswer()`): no source data, an
  empty/whitespace-only summary, a `NaN`/`undefined`/`null` metric value. These only happen on a
  genuine bug (an upstream calculation producing garbage) — never on legitimate business data,
  confirmed by a regression test that runs every one of the 14 use cases against real seeded data
  and asserts `verificationStatus !== 'FAILED'`.
- **Warnings** (→ `valid: true`, answer returned as-is, `verificationStatus: 'WARNING'`): a
  navigation `entityId` with no traceable evidence/record, or a recommendation with no backing
  metrics/evidence. These are legitimate-but-unideal shapes (e.g. a `PRODUCT_RECOMMENDATION`
  whose "idle cash" case genuinely has few numeric metrics) — flagged for debug visibility, not
  hard-blocked.

## `safeFallbackAnswer`

```ts
{
  title: 'Chưa thể trả lời chính xác',
  summary: `Hệ thống chưa đủ dữ liệu đã được xác minh để trả lời câu hỏi này (${reason}). ...`,
  metrics: [],
  records: [],
}
```

Never carries `metrics`/`records`/`action` — nothing left for a caller to accidentally treat as
real data. `reason` is the joined `errors` list, which only ever contains the check-name-level
strings above (e.g. "Không truy vấn được dữ liệu nguồn cho câu hỏi này."), never a chain-of-thought
trace.

## What verification does *not* do

It does not re-run the Calculation/Risk/Priority Engines to double-check their arithmetic (see
check #6's rationale above), and it does not call out to the AI Provider a second time to
"critique" the first answer — there is deliberately no second model call anywhere in this
pipeline, keeping the "don't call the reasoning model for every query" principle intact even
inside verification itself.
