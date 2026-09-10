# Phase 6 Evaluation Matrix

Honest pass/fail for the Trade Finance vertical slice actually built (see
`docs/phase-6-trade-finance-architecture.md` §4 for the scope line this was measured
against). "Pass" means demonstrated working against real seeded data, not "code exists
that should do this." Evidence points to a specific test file or a manual HTTP/browser
verification run — see `docs/phase-6-architecture.md` #Verification-performed.

| Capability | Status | Evidence |
|---|---|---|
| Richer LC/Guarantee/Collection data model | ✅ Pass | `models/index.ts` + seeded data covering every status this pass needed (ACTIVE clean, ACTIVE+discrepancy, ACTIVE+pending amendment, EXPIRING soon, a CLAIMED guarantee, D/P and D/A collections, one OVERDUE) |
| Document checklist / discrepancy / amendment lookup | ✅ Pass | `LC_DOCUMENT_STATUS`/`LC_DISCREPANCY`/`LC_AMENDMENT` — `test/query-execution.test.ts`'s Phase 6 suite, live-verified |
| Guarantee claim / extension-needed lookup | ✅ Pass | `GUARANTEE_CLAIM`/`GUARANTEE_EXTENSION` — same suite |
| Collection overdue / payment-status lookup | ✅ Pass | `COLLECTION_OVERDUE`/`COLLECTION_PAYMENT_STATUS` — same suite |
| LC/Guarantee request (human-in-the-loop) | ✅ Pass (by design) | `LC_REQUEST`/`GUARANTEE_REQUEST` only ever return a checklist + navigate — never create/amend/issue anything, matching spec §38/§39 |
| LC risk prioritization | ✅ Pass | `calculateLcRisk` — `test/calculation-engine.test.ts` (6 tests) + `LC_RISK_PRIORITIZATION` — `test/reasoning-engine.test.ts`, live-verified against real seeded risk (LC-2026-001 scores 100/HIGH: near shipment + open discrepancy + doc gaps) |
| Guarantee risk prioritization | ✅ Pass | `calculateGuaranteeRisk` (4 tests) + `GUARANTEE_RISK_PRIORITIZATION`, live-verified (BG-2026-013 scores 50/HIGH on its active claim) |
| Trade Finance exposure, per currency | ✅ Pass (never FX-converts) | `combineExposure` (1 test) + `TRADE_FINANCE_EXPOSURE`; every exposure/overview answer reports one line per currency, never guesses a rate — spec §31/§46 |
| Trade Finance limit reasoning | ✅ Pass | `TRADE_FINANCE_LIMIT_ANALYSIS`, reuses the pre-existing `TRADE_FINANCE` `credit-limits.json` record rather than duplicating it |
| Cross-domain Trade Finance overview | ✅ Pass | `TRADE_FINANCE_OVERVIEW` — 5-tool plan, under `AI_MAX_STEPS=6` |
| "What needs attention today" | ✅ Pass | `TRADE_FINANCE_ATTENTION` — merges LC risk + guarantee risk + overdue collections into one score-sorted list |
| Trade Finance Briefing | ✅ Pass | Dedicated `GET /api/virtual-rm/trade-finance-briefing` + chat trigger, same pattern as Business Briefing, live-verified |
| Multi-turn LC/BG-number follow-up | ✅ Pass (after a fix — see below) | `test/conversation-context.test.ts`'s Phase 6 suite (8 tests) + live HTTP verification of the exact "LC nào rủi ro cao nhất?" → "LC-2026-001" sequence |
| No hallucination | ✅ Pass (by construction) | Every risk score/exposure total/limit % traces to a repository read + a named Calculation Engine function — same mock-provider argument as Phase 5, unchanged |
| Navigation | ✅ Pass (after a fix — see below) | Every Phase 6 reasoning answer carries `NAVIGATE` → `OPEN_TRADE_FINANCE`; frontend `NAV_ACTION_ROUTES` now actually maps it (and the 4 sibling nav-action ids) to `/products` |
| Regression safety | ✅ Pass | 372/372 tests, `validate:semantic` clean, both builds clean — see below |

## What's explicitly out of scope for this pass

Unchanged from the pre-work plan (`docs/phase-6-trade-finance-architecture.md` §4's
"Explicitly deferred"), re-confirmed still true after building:

- **No LC/BG lifecycle state machine.** Statuses (`ACTIVE`, `DOCUMENT_PENDING`,
  `DISCREPANCY`, `CLAIMED`, ...) exist and are queryable, but nothing enforces valid
  transitions between them — this is mock data, not a workflow engine.
- **No dedicated LC/Guarantee/Collection frontend page.** `OPEN_LC`/`OPEN_GUARANTEE`/
  `OPEN_COLLECTION`/`OPEN_TRADE_FINANCE` all route to `/products`, each carrying an
  explicit "chưa có màn hình riêng" note in `navigation-actions.json` — the chat's rich
  answer *is* the Trade Finance surface, same as every Phase 5 reasoning answer.
- **No REST endpoints beyond the query API + the one new briefing endpoint.** Every LC/
  Guarantee/Collection read in this pass goes through `POST /api/virtual-rm/query` or
  `GET /api/virtual-rm/trade-finance-briefing` — spec §43's own "reuse existing API if
  equivalent" applied literally.
- **No compliance/legal-conclusion engine.** Risk scores are operational
  attention-priority signals only (see architecture doc) — spec §13/§40 explicitly forbid
  the alternative anyway.
- **No FX conversion for exposure.** Reported per currency, never converted, per spec
  §31/§46 — this is the one item promoted from "deferred" to "actively tested for" in
  this pass (`combineExposure`'s own test asserts currencies stay separate).
- **No `GUARANTEE_DETAIL` intent.** A bare BG-number follow-up resolves through
  `GUARANTEE_LIST`'s own documentId-narrowing branch instead — see architecture doc's
  multi-turn section for why this was judged sufficient rather than adding a 10th new
  intent for one lookup shape `GUARANTEE_LIST` can already serve.

## Two real bugs, found by actually running the thing

Both are disclosed here rather than only in a commit message, because they're the kind
of gap "code exists that should do this" review would have missed and only running the
demo caught:

1. **`getGuaranteeDeadlines` excluded `CLAIMED` guarantees.** Filtered to `ACTIVE` only
   at first pass — meaning the one guarantee with an active claim (BG-2026-013, the most
   interesting record in the seeded set) was invisible to every risk-ranking, attention,
   and briefing calculation that used this tool. Caught by cross-checking the tool's
   output against `bank-guarantees.json` directly, not by a failing test (the original
   tests, written before the fix, only asserted "returns real guarantees" — not "returns
   *all* the guarantees a risk feature needs"). Fixed, and now asserted directly:
   `test/tools.test.ts`'s "includes CLAIMED guarantees, not just ACTIVE" test.
2. **Two navigation dead-ends**, both caught during live verification, not by any unit
   test (unit tests exercise the Reasoning Engine and response-generator directly; they
   never touch the frontend's `NAV_ACTION_ROUTES` map or the conversation-context
   follow-up allowlist together in one flow):
   - `resolveDocumentFollowUp`'s previous-intent allowlist didn't include the new
     reasoning use cases (`LC_RISK_PRIORITIZATION` etc.), so the natural demo sequence
     "LC nào rủi ro cao nhất?" → "LC-2026-001" fell through to `CLARIFICATION_NEEDED`
     instead of showing that LC's detail.
   - The frontend's `NAV_ACTION_ROUTES` map had no entry for `OPEN_TRADE_FINANCE` (or
     4 sibling Phase 6 nav-action ids), so clicking "Xem Trade Finance" on any Phase 6
     answer silently went to `/dashboard` instead of `/products`.

Both are fixed and now covered by a regression test or an explicit Playwright check
(see `docs/phase-6-architecture.md` #Verification-performed for exactly which).

## Regression safety

372/372 tests pass (326 pre-Phase-6 + 46 new), `npm run validate:semantic` passes with
the same 5 pre-existing warnings (none new), both `npm run build:server` and
`npm run build` are clean. No Phase 5 test needed to change for Phase 6 (the two
adaptations in `navigation.test.ts`/`query-execution.test.ts` were pre-existing fixups
for the richer seeded data, not new-behavior changes) except where Phase 6 data made an
exact-count assertion stale (navigation-actions count, guarantee count) — both updated to
assert the new real count rather than loosened to "at least."
