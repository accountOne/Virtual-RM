# Phase 5.5 — BRD Alignment: Status Tracker

Living document tracking progress against `docs/phase-5.5-brd-gap-analysis.md`'s 20-item gap
table, across the BRD's four capability areas. Updated as each area lands — this is not a
one-shot final report (see `docs/phase-5.5-evaluation.md` from the *previous* Phase 5.5 pass for
that pattern; this doc plays the equivalent role for the BRD alignment work specifically, kept
current rather than written once at the end, since this pass is explicitly scoped to land
incrementally — see the audit's own §6 "Recommended sequencing").

## Status by capability area

| Capability area | Status | Evidence |
|---|---|---|
| **Daily Dashboard** | ✅ Done | `docs/phase-5.5-daily-dashboard.md`; `GET /api/virtual-rm/daily-dashboard`; `server/test/daily-dashboard.test.ts` (30 tests); live screenshot via Playwright |
| Personal/Business Footprint | Not started | — |
| Q&A contextual suggestions | Not started (existing Q&A/reasoning stack unaffected and fully functional) | — |
| Transaction Assistance — LC Issuance Assistant (conversation, PO upload/analysis, prefill, state machine, draft message) | Not started | — |
| LC Checker-flow enforcement (§14/§26) | ✅ Done (pulled forward as an independent, small P0 security item ahead of the full LC Assistant) | `canCreateLc()` in `server/src/services/trade-finance.service.ts`; `trade-finance.controller.ts::createLc` returns 403 for a Checker; `trade-finance-service.test.ts` (4 new tests); frontend `TradeFinanceService.createLc()` sends the real logged-in role, `lc-create.page.ts` surfaces the 403 message |
| New ReasoningTypes (PRIORITIZATION/TRANSACTION_ASSISTANCE/DOCUMENT_ANALYSIS) | Partial — all 3 declared in the type; only PRIORITIZATION has a use case wired to it (`DAILY_PRIORITY`) | `server/src/reasoning/reasoning-types.ts` |

## Gap table item status (cross-reference to `phase-5.5-brd-gap-analysis.md` §4)

| # | Item | Status |
|---|---|---|
| 1 | Daily Dashboard endpoint | ✅ Done |
| 2 | Greeting time-of-day | ✅ Done (as part of item 1) |
| 3 | Pending approval age/expiry risk | ✅ Done (as part of item 1) |
| 4 | BRD-specific task categories | Not started |
| 5 | Footprint — all of it | Not started |
| 6 | Ranking Engine | Not started |
| 7 | Q&A contextual suggestions | Not started |
| 8 | Speech-to-Text | Not started (P2 — lowest priority per the audit) |
| 9 | LC Issuance Assistant conversation | Not started |
| 10 | LC limit check before issuance | Not started |
| 11 | PO upload | Not started |
| 12 | PO document analysis/extraction | Not started |
| 13 | LC prefill from extraction | Not started |
| 14 | Checker cannot create Maker transaction | ✅ Done |
| 15 | Draft LC message generation | Not started |
| 16 | LC state machine | Not started |
| 17 | New ReasoningTypes | Partial (types declared; only PRIORITIZATION wired) |
| 18 | `transaction{}`/`documentAnalysis{}` response fields | Not started |
| 19 | Verification extended for document confidence | Not started |
| 20 | Role-aware dashboard filtering | Not started (Daily Dashboard doesn't yet vary by CFO/Finance Manager/Accountant — only Maker/Checker/Admin distinction exists anywhere in the app) |

## What's next (not started in this pass, in the audit's recommended order)

1. **Personal/Business Footprint** — the BRD's next-largest self-contained capability area
   (ranking engine, engagement stats, infographic generation, download/share). No dependency on
   the LC Issuance Assistant or vice versa; either could go next.
2. **LC Issuance Assistant (Transaction Assistance)** — the largest, highest-risk item (PO
   upload/analysis is entirely new infrastructure with no precedent in this codebase — no file
   upload middleware exists yet). The Checker-flow enforcement (item 14) and the LC limit data/
   tool it will need (already exists, see gap analysis §3.1) are both ready for it.
3. **Q&A contextual suggestions** — small, low-risk, best done once Footprint exists (so the
   suggestion list actually has a footprint-related question to offer, per BRD §16's own
   examples).
4. **Speech-to-Text** — explicitly the BRD's lowest-risk-to-defer item (graceful fallback is
   spec-sanctioned).

Each of these should get its own `docs/phase-5.5-<capability>.md` when built, following the
pattern `docs/phase-5.5-daily-dashboard.md` establishes, and this tracker updated in the same
commit.
