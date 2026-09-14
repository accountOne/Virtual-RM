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
| **Daily Dashboard** | ✅ Done | `docs/phase-5.5-daily-dashboard.md`; `GET /api/virtual-rm/daily-dashboard`; `server/test/daily-dashboard.test.ts` (36 tests as of 12/09/2026, up from 30 — see the timezone/role-CTA bugfixes noted in the capability-area rows below); live screenshot via Playwright |
| Personal/Business Footprint | Not started | — |
| Q&A contextual suggestions | Not started (existing Q&A/reasoning stack unaffected and fully functional) | — |
| Transaction Assistance — LC Issuance Assistant (conversation, PO upload/analysis, prefill, state machine, draft message) | Not started | — |
| LC Checker-flow enforcement (§14/§26) | ✅ Done (pulled forward as an independent, small P0 security item ahead of the full LC Assistant) | `canCreateLc()` in `server/src/services/trade-finance.service.ts`; `trade-finance.controller.ts::createLc` returns 403 for a Checker; `trade-finance-service.test.ts` (4 new tests); frontend `TradeFinanceService.createLc()` sends the real logged-in role, `lc-create.page.ts` surfaces the 403 message |
| New ReasoningTypes (PRIORITIZATION/TRANSACTION_ASSISTANCE/DOCUMENT_ANALYSIS) | Partial — all 3 declared in the type; only PRIORITIZATION has a use case wired to it (`DAILY_PRIORITY`) | `server/src/reasoning/reasoning-types.ts` |
| **Speech-to-Text** | ✅ **Done (12/09/2026, post-BRD-alignment pass)** — this row was "Not started (P2)" as of the original audit below; corrected here rather than silently left stale | OpenAI Whisper via `POST /api/voice/transcribe`, `server/src/voice/openai-voice-client.ts`, `server/src/controllers/voice.controller.ts`; frontend records with `MediaRecorder` (not the old `SpeechRecognition`, which Safari/iOS never implemented — the actual bug reported and fixed live) in `rm-voice.service.ts`; falls back to a clear error toast, never silently to nothing, if the cloud call fails or `OPENAI_API_KEY` isn't configured |
| *(beyond BRD scope)* Voice **output** (TTS), natural-sounding | ✅ Done, bonus — BRD only asked for Speech-to-Text; this session also added realistic text-to-speech since the browser's native `speechSynthesis` sounded robotic | OpenAI TTS (`gpt-4o-mini-tts`) via `POST /api/voice/speak`; falls back silently to the browser's own `speechSynthesis` if the cloud call fails |

## Gap table item status (cross-reference to `phase-5.5-brd-gap-analysis.md` §4)

| # | Item | Status |
|---|---|---|
| 1 | Daily Dashboard endpoint | ✅ Done |
| 2 | Greeting time-of-day | ✅ Done (as part of item 1) |
| 3 | Pending approval age/expiry risk | ✅ Done (as part of item 1) |
| 4 | BRD-specific task categories | **Refined 12/09/2026 — not one uniform gap, see breakdown below** |
| 4a | ↳ Biometric info reminder (legal representative) | Not started — no matches anywhere for "sinh trắc học"/"biometric"/"đại diện theo pháp luật" |
| 4b | ↳ ID document expiry reminder | Not started — no matches anywhere for "giấy tờ tùy thân"/"CCCD"/"CMND" |
| 4c | ↳ Password expiry reminder | Not started — no `passwordExpiresAt`-style field anywhere in `server/src/auth/` |
| 4d | ↳ Loan due/near-due as an urgent item | **Partial** — `Loan` model + `server/data/loans.json` + `getLoans`/`getLoanObligations` tools already exist and are wired into the chat cash-flow-forecast path, but `crossDomainPriorities()` (`server/src/reasoning/priority-engine.ts`) only ranks 6 entity types (Task/Approval/Payable/LetterOfCredit/BankGuarantee/Collection) — **no `Loan`**, so a due loan never appears in the Daily Dashboard's urgent-items list. `src/app/features/loans/loans.page.ts` also shows hardcoded mock due-date/renewal text, not real data from `loans.json` |
| 4e | ↳ 6 specific approval-expiry sub-rules (non-credit day-29, credit day-6, TTR 1-day supplement, hoàn chứng từ, hạn mức tín dụng renewal, bank offering review) | **Partial** — only one generic, non-credit-aware rule exists: `APPROVAL_EXPIRY_WINDOW_DAYS = 30` / warn inside 5 days (`server/src/reasoning/approval-risk.ts`), whose own code comment admits this is "inferred to match a BRD worked example," not the BRD's real day-29/day-6 split. "TTR", "hoàn chứng từ" (as a due-task concept), "hạn mức tín dụng" renewal, and "review offering" have zero matches anywhere in `server/src` |
| 5 | Footprint — all of it | Not started |
| 6 | Ranking Engine | Not started |
| 7 | Q&A contextual suggestions | Not started |
| 8 | Speech-to-Text | ✅ **Done (12/09/2026)** — see capability-area table above |
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

**Updated 12/09/2026** — Speech-to-Text (previously last on this list) is now done, so it's
removed from here; everything else below is unchanged from the original recommendation.

1. **Personal/Business Footprint** — the BRD's next-largest self-contained capability area
   (ranking engine, engagement stats, infographic generation, download/share). No dependency on
   the LC Issuance Assistant or vice versa; either could go next. Genuinely zero implementation
   today (confirmed again 12/09/2026 via a repo-wide search: no data files, no service/route/UI,
   no image/chart library in `package.json`, no account-creation-date field to even measure "since
   when" from).
2. **LC Issuance Assistant (Transaction Assistance)** — the largest, highest-risk item (PO
   upload/analysis is entirely new infrastructure with no precedent in this codebase — no file
   upload middleware exists yet). The Checker-flow enforcement (item 14) and the LC limit data/
   tool it will need (already exists, see gap analysis §3.1) are both ready for it. Confirmed
   12/09/2026: the only existing hook is `RMAction.type: 'UPLOAD'`
   (`src/app/features/virtual-rm/interaction/rm-interaction.types.ts`) — declared but never
   constructed or handled anywhere, i.e. dead code to build on, not a working stub.
3. **BRD-specific task categories (item 4a–4e above)** — smaller and more self-contained than
   Footprint or the LC Assistant; 4d (wiring existing `Loan` data into `crossDomainPriorities()`)
   is a small, low-risk extension of code that already exists. 4a–4c (biometric/ID/password
   reminders) need new mock data fields before they can rank at all. 4e (the 6 approval sub-rules)
   needs `ApprovalRecord`/`PaymentOrder` to carry a credit-vs-non-credit distinction that doesn't
   exist yet.
4. **Q&A contextual suggestions** — small, low-risk, best done once Footprint exists (so the
   suggestion list actually has a footprint-related question to offer, per BRD §16's own
   examples).

Each of these should get its own `docs/phase-5.5-<capability>.md` when built, following the
pattern `docs/phase-5.5-daily-dashboard.md` establishes, and this tracker updated in the same
commit.
