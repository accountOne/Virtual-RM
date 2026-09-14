# Phase 5.5 — BRD Alignment: Status Tracker

Living document tracking progress against `docs/phase-5.5-brd-gap-analysis.md`'s 20-item gap
table, across the BRD's four capability areas. Updated as each area lands — this is not a
one-shot final report (see `docs/phase-5.5-evaluation.md` from the *previous* Phase 5.5 pass for
that pattern; this doc plays the equivalent role for the BRD alignment work specifically, kept
current rather than written once at the end, since this pass is explicitly scoped to land
incrementally — see the audit's own §6 "Recommended sequencing").

**14/09/2026 update** — the three remaining capability areas (Footprint, LC Issuance Assistant,
BRD task categories/urgent-item wiring) all landed this session as three separate vertical
slices (Slice A/B/C, one commit each). What's below reflects the code as of that pass; anything
still marked "Not started"/"Partial" is a real, intentional remaining gap, not an oversight.

## Status by capability area

| Capability area | Status | Evidence |
|---|---|---|
| **Daily Dashboard** | ✅ Done | `docs/phase-5.5-daily-dashboard.md`; `GET /api/virtual-rm/daily-dashboard`; `server/test/daily-dashboard.test.ts`; live screenshot via Playwright |
| **Personal/Business Footprint** | ✅ **Done (14/09/2026)** | `docs/phase-5.5-footprint.md`; `server/src/services/footprint.service.ts`; `GET /api/virtual-rm/footprint`; Canvas-rendered infographic at `/footprint` (`src/app/features/footprint/footprint.page.ts`) with working Download/Share; `server/test/footprint.test.ts` (11 tests) |
| Q&A contextual suggestions | Not started (existing Q&A/reasoning stack unaffected and fully functional; "Dấu ấn" was added as a static quick-nav/shortcut entry point instead — see Footprint doc — rather than teaching the Semantic Engine a new intent) | — |
| **Transaction Assistance — LC Issuance Assistant** (conversation, PO upload/analysis, prefill, draft message) | ✅ **Done (14/09/2026), mock PO extraction by design** | `docs/phase-5.5-lc-assistant.md`; `server/src/services/po-analysis.service.ts`; `POST /api/virtual-rm/lc/analyze-po`, `.../lc/draft-message`; in-chat flow in `rm-chat-session.service.ts`; `lc-create.page.ts` prefill; `server/test/lc-assist.test.ts` |
| LC Checker-flow enforcement (§14/§26) | ✅ Done | `canCreateLc()` in `server/src/services/trade-finance.service.ts`; `trade-finance.controller.ts::createLc` returns 403 for a Checker; same rule now also enforced client-side (before any request) at the start of the LC-assist chat flow, and server-side on the two new `analyze-po`/`draft-message` routes via `requireRole('MAKER', 'ADMIN')` |
| New ReasoningTypes (PRIORITIZATION/TRANSACTION_ASSISTANCE/DOCUMENT_ANALYSIS) | Partial — unchanged this session. All 3 declared in the type; only PRIORITIZATION has a use case wired to it (`DAILY_PRIORITY`). The LC assistant above delivers the BRD's actual Transaction-Assistance *behavior* (PO upload → prefill → draft) through a dedicated REST+chat flow rather than through this `ReasoningType`/`reasoning-engine.ts` mechanism — a deliberate, simpler path (see `docs/phase-5.5-lc-assistant.md`'s design-decision note), not a partial implementation of the original mechanism | `server/src/reasoning/reasoning-types.ts` |
| **Speech-to-Text** | ✅ Done | OpenAI Whisper via `POST /api/voice/transcribe`, `server/src/voice/openai-voice-client.ts`, `server/src/controllers/voice.controller.ts` |
| *(beyond BRD scope)* Voice **output** (TTS), natural-sounding | ✅ Done, bonus | OpenAI TTS (`gpt-4o-mini-tts`) via `POST /api/voice/speak` |

## Gap table item status (cross-reference to `phase-5.5-brd-gap-analysis.md` §4)

| # | Item | Status |
|---|---|---|
| 1 | Daily Dashboard endpoint | ✅ Done |
| 2 | Greeting time-of-day | ✅ Done (as part of item 1) |
| 3 | Pending approval age/expiry risk | ✅ Done (as part of item 1) — see item 4e note below for the scope of what "risk" covers |
| 4 | BRD-specific task categories | **Refined — see 4a–4e below, mostly landed 14/09/2026** |
| 4a | ↳ Biometric info reminder (legal representative) | ✅ **Done (14/09/2026)** — `task-006` in `server/data/tasks.json` ("Thu thập thông tin sinh trắc học người đại diện pháp luật"), ranked by the existing generic `Task` branch of `crossDomainPriorities()` (no new ranking code needed — it already handles any task by priority/dueDate) |
| 4b | ↳ ID document expiry reminder | ✅ Done — turned out to already exist pre-session as `task-005` ("Cập nhật thông tin người đại diện pháp luật" / "giấy tờ tuỳ thân") in `server/data/tasks.json`; a prior audit pass missed it due to a Vietnamese diacritic-ordering mismatch ("tùy" vs "tuỳ") in its own grep, corrected 14/09/2026 by reading the data file directly |
| 4c | ↳ Password expiry reminder | ✅ **Done (14/09/2026)** — `task-007` ("Đổi mật khẩu đăng nhập"), same generic `Task` ranking as 4a. No real password-expiry *tracking* was added to `server/src/auth/` (this is a seeded demo task, not a computed one — same honesty note as the rest of this table) |
| 4d | ↳ Loan due/near-due as an urgent item | ✅ **Done (14/09/2026)** — `crossDomainPriorities()` (`server/src/reasoning/priority-engine.ts`) now has a `Loan` branch (`status === 'ACTIVE'`, urgency from `daysUntil(maturityDate)`), routed to `/loans`; `GET /api/loans` (new `loans.controller.ts`); `src/app/features/loans/loans.page.ts` now reads real data from `RmDataService.loans()` instead of hardcoded mock text; `server/test/daily-dashboard.test.ts` covers a maturing loan appearing as an urgent item |
| 4e | ↳ 6 specific approval-expiry sub-rules (non-credit day-29, credit day-6, TTR 1-day supplement, hoàn chứng từ, hạn mức tín dụng renewal, bank offering review) | **Partial, improved 14/09/2026 — 3 of 6 sub-concepts now ranked, 3 remain the original generic rule.** Landed: credit-limit renewal (`CreditLimit` branch in `crossDomainPriorities()`, using the real `reviewDate` field already in `credit-limits.json`); bank-offering review (new `Recommendation` branch, using the existing `recommendations.json`/`priority` field); TTR 1-day supplement (`task-008`, same generic `Task` ranking as 4a/4c). **Still not done**: the non-credit-day-29/credit-day-6 split and a dedicated "hoàn chứng từ" (missing-documents) urgent-item rule — `server/src/reasoning/approval-risk.ts` is unchanged from before this session, still one generic `APPROVAL_EXPIRY_WINDOW_DAYS = 30` / warn-inside-5-days rule with no credit/non-credit distinction; the existing `risk-engine.ts` `missingDocuments`/`expiryProximity` factors compute LC/Guarantee/Collection *risk scores* (used elsewhere, e.g. Trade Finance risk questions) but were not this session wired into the Daily Dashboard's *urgent items* list specifically |
| 5 | Footprint — all of it | ✅ **Done (14/09/2026)** — see capability-area table above |
| 6 | Ranking Engine (Footprint's 3-tier "fun label") | ✅ **Done (14/09/2026)** — `server/src/config/footprint-ranking.json`, config-driven like `risk-rules.json` |
| 7 | Q&A contextual suggestions | Not started |
| 8 | Speech-to-Text | ✅ Done — see capability-area table above |
| 9 | LC Issuance Assistant conversation | ✅ **Done (14/09/2026), client-side chat flow** — see capability-area table above |
| 10 | LC limit check before issuance | Not wired into the new flow as a distinct step — `getTradeFinanceLimits` (the tool this would reuse) already existed and is unchanged; the assistant flow goes straight from Import/Export choice to upload rather than showing an intermediate limit-check message. A real limit check still happens implicitly: the review step lets the customer see the filled form before the same `POST /api/trade-finance/lc` submission (unchanged, pre-existing) runs |
| 11 | PO upload | ✅ **Done (14/09/2026), mock by design** — file name/size only, content never read (confirmed design decision, not a shortcut — see `docs/phase-5.5-lc-assistant.md`) |
| 12 | PO document analysis/extraction | ✅ **Done (14/09/2026), mock by design** — `po-analysis.service.ts`, deterministic template selection, same "mock, not real ML" convention as `MockReasoningProvider` |
| 13 | LC prefill from extraction | ✅ **Done (14/09/2026)** — `lc-create.page.ts` reads prefill fields from router state |
| 14 | Checker cannot create Maker transaction | ✅ Done |
| 15 | Draft LC message generation | ✅ **Done (14/09/2026), plain template** — `buildLcDraftMessage()`, always labeled "BẢN NHÁP — CHỈ MANG TÍNH MINH HỌA", not a real SWIFT MT700 |
| 16 | LC state machine | Not started as a distinct state machine — the assistant flow itself is a small explicit sequence (type → upload → extract → prefill) but there's no reusable state-machine abstraction, and the created LC's own lifecycle is still just the pre-existing `PENDING_APPROVAL` status, unchanged |
| 17 | New ReasoningTypes | Partial (unchanged) — see capability-area table above for why this specific mechanism stayed as-is |
| 18 | `transaction{}`/`documentAnalysis{}` response fields | Not started — the new `analyze-po`/`draft-message` endpoints return their own plain JSON shapes (`PoAnalysisResult`, `{ message }`), not shaped into the BRD's named response-field convention used elsewhere in the reasoning layer |
| 19 | Verification extended for document confidence | Not started — there is no confidence score anywhere in the mock extraction (it's deterministic, not probabilistic, so a "confidence" figure would be fabricated) |
| 20 | Role-aware dashboard filtering | Not started (Daily Dashboard doesn't yet vary by CFO/Finance Manager/Accountant — only Maker/Checker/Admin distinction exists anywhere in the app) |

## What's left (real, intentional gaps — not oversights)

1. **Q&A contextual suggestions (item 7)** — the suggested-question list is still static; nothing
   currently changes it based on which screen the customer is on.
2. **4e's remaining 3 sub-rules** — non-credit-day-29/credit-day-6 split, and a dedicated
   "hoàn chứng từ" urgent-item rule (distinct from the existing Trade-Finance risk-score use of
   the same underlying data).
3. **LC limit check as its own explicit assistant step** (item 10) and **document-confidence
   scoring** (item 19) — the latter isn't meaningful for a deterministic mock extraction; the
   former is a small, well-scoped addition if wanted later (`getTradeFinanceLimits` is already
   there to call).
4. **Role-aware dashboard filtering by business role** (item 20) — CFO/Finance
   Manager/Accountant vs. this app's Maker/Checker/Admin technical roles.
5. **New ReasoningTypes mechanism (item 17)** — `TRANSACTION_ASSISTANCE`/`DOCUMENT_ANALYSIS` stay
   declared-but-unused as a `reasoning-engine.ts` use case; the LC assistant satisfies the BRD's
   actual behavior through a separate, dedicated flow instead (see the capability-area table's
   note on this).

Each landed capability has its own `docs/phase-5.5-<capability>.md` — `phase-5.5-daily-dashboard.md`,
`phase-5.5-footprint.md`, `phase-5.5-lc-assistant.md` — each documenting its own design decisions,
known limitations, and live verification evidence in more detail than this summary table.
