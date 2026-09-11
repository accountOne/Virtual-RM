# Phase 5.5 — Risk Engine

`server/src/reasoning/risk-engine.ts` + `server/src/config/risk-rules.json`. A configurable,
weighted, 0–100 risk score — additive to (not a replacement for) `calculation/
financial-calculations.ts::calculateLcRisk`/`calculateGuaranteeRisk`, which Phase 6's
`LC_RISK_PRIORITIZATION`/`GUARANTEE_RISK_PRIORITIZATION` use cases and 385 pre-existing tests
still use exactly as before (3-band `HIGH/MEDIUM/LOW`, ad-hoc point additions). The new engine is
what Phase 5.5's Priority Engine and verification path use, and is the config-driven model spec
§10 asks for.

## Why additive, not a rewrite

Rewriting `calculateLcRisk` in place to match the new weighted/4-band model would have changed
the risk *level* several existing LCs/guarantees are reported at (Phase 6's own seeded
DISCREPANCY/PENDING_APPROVAL fixtures were tuned against the old 3-band thresholds), silently
breaking the Phase 6 demo script and its tests. Two engines living side by side — one for Phase
6's existing chat answers, one for Phase 5.5's new Priority Engine — costs a little duplication
but zero regression risk, and both are visible and named, not hidden behind a flag.

## Weights and bands (`config/risk-rules.json`)

```json
{
  "weights": {
    "expiryProximity": 0.30,
    "missingDocuments": 0.25,
    "discrepancy": 0.20,
    "outstandingAmount": 0.15,
    "pendingApproval": 0.10
  },
  "bands": [
    { "level": "LOW", "min": 0, "max": 29 },
    { "level": "MEDIUM", "min": 30, "max": 59 },
    { "level": "HIGH", "min": 60, "max": 79 },
    { "level": "CRITICAL", "min": 80, "max": 100 }
  ]
}
```

Editing this file changes scoring for every LC/Guarantee/Collection/cross-domain-priority
calculation without touching code — a test (`risk weights sum to 1`) guards the one invariant
that actually matters for the score to stay bounded at 100.

## Factor normalization (0–1 each, before weighting)

- **expiryProximity** — 1 if overdue/expired, 0.8 within `expiryUrgentDays` (7), 0.4 within
  `expiryWarningDays` (30), else 0.
- **missingDocuments** — `documentGaps / totalDocuments` (capped at 1); 0 when there are no
  documents to check at all.
- **discrepancy** — LC: `min(1, openDiscrepancies / 2)`. Guarantee: `min(1, activeClaims)` — a
  guarantee has no discrepancy record, so an active claim (money may actually be called) is the
  equivalent urgent driver, explicitly commented in code as a deliberate substitution, not an
  oversight.
- **outstandingAmount** — `min(1, amount / largeAmountVnd)` where `largeAmountVnd` = 1.5 tỷ, the
  same threshold `rankByUrgency`/the old risk calculators already used — kept consistent rather
  than inventing a second "what counts as large" number. Like the existing calculators, this
  compares the raw amount regardless of currency (a documented simplification, not new to this
  pass).
- **pendingApproval** — 1 if `status === 'PENDING_APPROVAL'`, else 0.

## Score

```
score = round(100 × Σ(factor × weight))
level = band matching score
```

## Reasons

Every nonzero factor contributes a Vietnamese reason string (e.g. "Còn hạn 5 ngày", "2 sai biệt
đang mở", "Giá trị outstanding lớn") — this is what the Priority Engine and DIAGNOSTIC-adjacent
answers surface as the "why" behind a ranking, and what the Evidence Engine's
`entityId`/`reasons` fields ultimately trace back to.

**A bug found and fixed during this pass**: the outstanding-amount reason originally only fired
when `factors.outstandingAmount >= 1` (i.e. only at the amount cap), so an LC whose *entire*
nonzero score came from a mid-range outstanding amount (say 0.6) contributed real points to
`score` but produced an *empty* `reasons` array — caught by a regression test
(`every item has a non-empty reasons list`) rather than shipped silently. Fixed to fire on any
`factors.outstandingAmount > 0`, with wording that distinguishes "lớn" (at/above the cap) from
"đáng kể" (a partial contribution).

## Priority Engine's score formula (built on this Risk Engine)

`reasoning/priority-engine.ts` implements spec §11's `Priority Score = Urgency × Financial
Impact × Risk × Deadline` as a **weighted geometric mean**, not a literal product:

```
score = round(100 × (urgency × impact × risk × deadlineWeight)^(1/4))
```

A straight product of four independent fractions collapses almost every real item toward 0
(e.g. 0.5 × 0.4 × 0.3 × 0.5 = 0.03 → a "score" of 3), which would make every item look equally
low-priority and defeat the ranking's purpose. The fourth root undoes that compression while
keeping the property the multiplicative formula implies: any factor at exactly 0 still drives
the whole score toward 0 (an item with no urgency, no impact, no risk, and no deadline truly
isn't a priority) — each factor is floored at 0.01 rather than 0 specifically so one zero factor
doesn't erase real signal from the other three. This is a deliberate, documented deviation from
the literal "×" in the spec text, not a silent one — see the comment at the top of
`priority-engine.ts` and the "scores are deterministic" regression test that pins the formula's
output.

## `scoreCollectionRisk`

Collections have no discrepancy or pending-approval concept in this demo's data model, so those
two factors are always 0 for a collection — its score is driven entirely by due-date proximity
(`OVERDUE` status forces `expiryProximity = 1` directly, since an overdue collection's `dueDate`
being in the past would otherwise correctly also score 1 via the date-based factor — the explicit
status check just makes the reasoning legible rather than relying on date math alone) and
document gaps.
