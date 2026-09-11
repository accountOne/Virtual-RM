# Phase 5.5 — BRD Gap Analysis

Source of truth: **DCTBE – Virtual RM – 11/09/2026**. Written before any Phase 5.5-BRD code
changes, per the phase's own rule ("Do not start implementation until this audit is completed").
This supersedes the *previous* Phase 5.5 prompt ("Advanced Business Reasoning & Verification",
already implemented and documented in `docs/phase-5.5-advanced-reasoning.md` etc.) as the
business requirement source — that work is kept (see §7) but is not what this document measures
against.

## 1. Method

Inspected: `package.json`, `src/app/**`, `server/src/**`, `server/data*/**`,
`business-semantics/**`, `server/test/**`, `docs/**`, `server/src/routes/index.ts`. Cross-checked
every route actually registered against every controller/service it calls, and which frontend
service each backend endpoint is actually consumed by (not just which endpoints *exist* — several
exist but are dead code, see §3.6).

## 2. Executive summary

Phases 1–7 (+ the prior Phase 5.5 pass) built a strong **Q&A and Trade Finance transaction**
foundation: a deterministic 59-intent Semantic Engine, a Reasoning Engine with 14 use cases, a
Risk/Priority/Evidence/Verification layer, and dedicated LC/Guarantee/Collection screens. This is
directly reusable for BRD's "Virtual RM Q&A" and part of "Transaction Assistance".

**Two of the BRD's four capability areas have zero implementation today**: Personal/Business
Footprint (ranking, engagement, infographic) and the LC Issuance Assistant's document pipeline
(PO upload/OCR/field-extraction/prefill/state-machine/checker-flow/draft-message). The third,
Daily Dashboard, has a real backend (`rm.service.ts`) but it predates the Semantic/Reasoning
Engine entirely and is **not** wired to Risk/Priority/Evidence/Verification — the BRD's "what
should I care about today" requirement is currently only answered inside chat (Reasoning Engine's
`DAILY_PRIORITY` use case), not on the actual Daily Dashboard screen. Q&A is the most mature area
and needs targeted extension (contextual suggestions, two new reasoning types), not a rebuild.

## 3. Existing implementation inventory

### 3.1 Existing BRD functionality (reusable as-is or near-as-is)

- **Semantic Engine** (`server/src/semantic/*`, 59 intents, deterministic, no LLM) — covers
  LOOKUP/AGGREGATION for accounts, transactions, payments, approvals, Trade Finance. Maps
  directly to BRD's "Q&A → Free Text" requirement.
- **Reasoning Engine + reasoning/ layer** (`server/src/ai/reasoning-engine.ts`,
  `server/src/reasoning/*`) — 14 use cases, Complexity Classifier, Query Planner, Risk Engine
  (config-driven, `server/src/config/risk-rules.json`), Priority Engine (cross-domain, built for
  exactly the BRD's "what should I care about today" question), Evidence Engine, Verification
  Engine. This *is* almost the BRD's "Query Planner → Tool Layer → Calculation Engine →
  Risk/Validation → Verifier" target architecture (§4 of the spec) already, minus the
  Conversation Gateway framing and the new ReasoningTypes (§5).
- **Tool Layer** (`server/src/tools/index.ts`) — 27 named, security-scoped tools; covers every
  Banking/Analytics data need the BRD's Daily Dashboard and Q&A require. No "Document Tools"
  category exists yet (§3.3).
- **Role model** — `SecurityContext.role: 'MAKER' | 'CHECKER' | 'ADMIN'`, always server-derived
  from `buildSecurityContext`, never from client input (see `security-isolation.test.ts`). Ready
  to gate the BRD's Checker-flow requirement (§26) — no maker/checker enforcement exists on any
  *transaction-creation* path yet (today's `POST /api/trade-finance/lc` has no role check at
  all).
- **Trade Finance dedicated screens** (Phase 7) — `/trade-finance/lc/create` is a real 6-step
  wizard (`src/app/features/trade-finance/pages/lc-create.page.ts`: Basic Info → Parties →
  Amount/Currency → Shipment → Documents → Review) that already POSTs to
  `tradeFinanceService.createLc()`. This is the BRD's "dedicated LC Business Banking screen"
  (§25) target almost verbatim — it needs a **prefill-from-query-params** capability added, not
  a rebuild.
- **LC limit data** — `server/data/credit-limits.json` already has a `TRADE_FINANCE` limitType
  record (`totalLimit`/`usedAmount`/`availableAmount`) and `getTradeFinanceLimits` tool. Directly
  reusable for the BRD's LC-limit-check step (§20) — no new data needed, only a new reasoning
  branch that reads it before offering to create an LC.
- **Multi-turn conversation context** (`server/src/ai/conversation-context.ts`) — in-memory,
  per-`userId`, already resolves short follow-ups. The BRD's LC conversation flow (§19, "LC
  thường / LC UPAS / LC khác" → "nháp hay chính thức") needs a *longer-lived, richer* state
  machine than this (see §3.4/§3.5) but the precedent and the per-user store are reusable.
- **Navigation actions** — `AnswerAction { label, type: 'NAVIGATE', target, entityId?,
  entityType? }` (`server/src/semantic/types.ts`) is structurally identical to the BRD's
  `NavigationAction` interface (§37) modulo field names (`target`→`route`). No redesign needed,
  a thin rename/alias is enough.

### 3.2 Existing Phase 5/5.5 reasoning (reusable)

`ReasoningType` today: `LOOKUP | AGGREGATION | COMPARISON | DIAGNOSTIC | ADVISORY` (from the
*previous* Phase 5.5 pass, `server/src/reasoning/reasoning-types.ts`). BRD (§5) additionally
needs `PRIORITIZATION | TRANSACTION_ASSISTANCE | DOCUMENT_ANALYSIS`. `PRIORITIZATION` overlaps
almost entirely with the existing `DAILY_PRIORITY` use case's behavior (already ranks
Task+Approval+Payable+LC+Guarantee+Collection by urgency×impact×risk×deadline) — it's a
**relabeling + dashboard-surface exposure**, not new logic. `TRANSACTION_ASSISTANCE` and
`DOCUMENT_ANALYSIS` are genuinely new reasoning types with no precedent in this codebase.

### 3.3 Existing Phase 6/7 Trade Finance (reusable, LC only needs extension)

LC/Guarantee/Collection each have a rich record shape (`documents[]`, `discrepancies[]`,
`amendments[]`, `claims[]`) and full CRUD (list/detail/create) REST + UI. **What's missing is
everything upstream of the create form**: no PO upload endpoint, no document parsing, no field
extraction, no confidence scoring, no state machine beyond the flat `status` enum already used
for the record's *post-creation* lifecycle (`PENDING_APPROVAL → ACTIVE → ...`). The BRD's 12-step
LC state machine (§28, `DRAFT` through `COMPLETED`) describes the *pre-creation* assistance flow,
which has no analog today at all.

### 3.4 Missing BRD functionality (zero implementation)

| Area | Status |
|---|---|
| Personal/Business Footprint (ranking, engagement, infographic) | **Nothing exists.** No data files, no service, no route, no UI. Confirmed via repo-wide search for "footprint"/"ranking"/"engagement"/"infographic" — only unrelated matches (risk *ranking*, priority *ranking*). |
| PO upload / document analysis | **Nothing exists.** No file-upload middleware anywhere in `server/src` (checked for `multer` and any `upload` route — the only "upload" in the codebase is a demo button on the batch-transfer page that does nothing with a real file). |
| Speech-to-Text | **Nothing exists.** No `SpeechRecognition`/`webkitSpeechRecognition` reference anywhere in `src/app`. |
| LC pre-creation state machine | **Nothing exists.** `LetterOfCredit.status` only models the record's life *after* creation. |
| Checker-flow enforcement on transaction *creation* | **Nothing exists.** `POST /api/trade-finance/lc` has no role check — any role can call it today. |
| Draft LC SWIFT-style message generation | **Nothing exists.** |
| Greeting time-of-day variation (sáng/chiều/tối) | **Nothing exists.** `buildGreeting()` (rm.service.ts) is time-of-day-agnostic. |
| Approval expiry/age-based risk ("chờ 28 ngày, sắp hết hạn") | **Nothing exists.** `getPendingApprovals` returns raw records; no age/expiry-risk calculation anywhere. |
| BRD-specific urgent task categories (biometric, identity doc expiry, password expiry, credit limit expiry, bank offering review) | **Nothing exists.** `server/data-seed/tasks.json` has 5 generic business tasks; none match these categories. |

### 3.5 Duplicate / conflicting functionality found

**The Daily Dashboard's actual data source is disconnected from the Reasoning/Risk/Priority
Engine.** Two parallel "briefing" implementations exist side by side:

| | `GET /api/rm/briefing` (legacy) | `GET /api/virtual-rm/briefing` (Phase 5+ semantic engine) |
|---|---|---|
| Backend | `rm.controller.ts` → `rm.service.ts` → `rules/intent-engine.ts` (pre-Semantic-Engine keyword rules) | `semantic.controller.ts` → `semantic-engine.ts::businessBriefing()` |
| Fields | `greeting, companyName, rmName, balance, incomingYesterday, outgoingYesterday, pendingApprovalCount, tasksOpenCount, alertsCount, insight` | `SemanticAnswer` shape: `title, summary, metrics[], insights[]` (business-briefing template) |
| Frontend consumer | **`RmDataService.loadAll()`** (`src/app/core/services/rm-data.service.ts`) — this is what the actual Dashboard page and `rm-widget.component.ts`'s greeting/insight card render | Only reachable by typing "business briefing" into chat (`isBriefingRequest()` in `semantic.controller.ts`) |
| Uses Risk/Priority/Evidence/Verification Engine | **No** | No (a briefing is a fixed template, not a `runReasoning()` use case, by original Phase 5 design) |
| Uses `getPendingApprovals`/risk-scored ranking | No — raw count only | N/A |

**Consequence:** neither existing briefing endpoint satisfies the BRD's Daily Dashboard
requirement (greeting + cashflow + ranked pending approvals with expiry risk + ranked tasks +
top-3 urgent items, all backed by the Reasoning/Risk/Priority/Verification stack). The BRD's
Daily Dashboard needs a **new** endpoint that the Dashboard page switches to, built on the
existing Reasoning Engine primitives (reusing `crossDomainPriorities`, `scoreLcRisk` etc.) rather
than on either existing briefing path. The legacy `rm.service.ts`/`rules/intent-engine.ts` path
predates the Semantic Engine and duplicates functionality the 59-intent pack now covers more
completely (e.g. its own hand-rolled `BALANCE`/`TASK`/`ALERT` intent handling) — flagged as a
migration candidate, not touched in this audit.

### 3.6 Components that need refactoring vs. adding

- **Refactor**: `RmDataService.loadAll()` to call the new `/api/virtual-rm/daily-dashboard`
  endpoint instead of `/api/rm/briefing`; `rm-widget.component.ts`'s teaser view to render the
  richer `DailyDashboard` shape (cashflow/pendingApprovals/tasks/urgentItems cards) instead of
  the current flat greeting/balance/insight fields.
- **Refactor**: `AnswerAction`/`NavigationActionDef` — add a `route` alias (or rename) so BRD's
  `NavigationAction.route` field name doesn't require two parallel navigation-action shapes.
- **Add, reusing existing patterns**: Footprint service/routes (new — follows the exact same
  `service → controller → route` pattern as `trade-finance.service.ts`), Task Priority Engine
  extension (reuses `reasoning/priority-engine.ts`'s `Task` branch, extended with BRD's specific
  categories), PO analysis service (new — no precedent, needs a document-tools category the Tool
  Layer doesn't have yet), LC transaction state machine (new — a `server/src/services/
  lc-assist.service.ts`-style state store, following `conversation-context.ts`'s existing
  in-memory-per-user precedent since this demo has no real session/DB layer).

## 4. Gap table

| # | BRD Requirement | Current Implementation | Gap | Required Change | Priority | Affected Components |
|---|---|---|---|---|---|---|
| 1 | Daily Dashboard: greeting, cashflow, pending approvals, tasks, urgent items, navigation, single endpoint | Two disconnected briefing endpoints, neither BRD-complete (§3.5) | No single `DailyDashboard`-shaped endpoint; not built on Risk/Priority Engine | New `GET /api/virtual-rm/daily-dashboard`, built from existing Reasoning primitives | **P0** | `server/src/services/rm.service.ts` (new sibling), `routes/index.ts`, `RmDataService`, `rm-widget.component.ts`, `dashboard.page.ts` |
| 2 | Greeting varies by morning/afternoon/evening + summarizes business context | `buildGreeting()` is time-agnostic, already summarizes counts | Missing time-of-day branch | Extend `buildGreeting()`/its replacement with an hour check | **P1** | new Daily Dashboard service |
| 3 | Pending approval: age, expiry risk, ranked, CTA | `getPendingApprovals` tool returns raw list; no age/expiry calc anywhere | No `calculate_age`/`calculate_expiry_risk` | New calculation functions + ranking, reusing `rankByUrgency`'s shape | **P0** | `calculation/financial-calculations.ts` or new `reasoning/` module |
| 4 | Task prioritization across BRD-specific categories (biometric, ID expiry, password expiry, loan maturity, doc completion, credit limit expiry, bank offering review) | Generic 5-task seed data; `crossDomainPriorities` already ranks *whatever* tasks exist | Task *categories* don't exist in mock data; scoring doesn't special-case them | Extend `tasks.json` seed + `Task` model with a `category` field; extend Priority Engine scoring | **P1** | `server/data-seed/tasks.json`, `models/index.ts`, `reasoning/priority-engine.ts` |
| 5 | Personal/Business Footprint — all of it (ranking, stats, infographic, download/share) | **Zero implementation** | Everything | New data files, service, 4 routes, 2 frontend pages, image generation | **P0** (BRD first-class capability, explicitly "NOT optional/decorative") | New: `data/footprint-*.json`, `services/footprint.service.ts`, `controllers/footprint.controller.ts`, `routes/index.ts`, `config/footprint-ranking.json`, new frontend feature module |
| 6 | Ranking Engine, 3 configurable levels | **Zero implementation** | Everything | New `config/footprint-ranking.json` + deterministic scoring function | **P0** | New `reasoning/ranking-engine.ts` (or `services/`) |
| 7 | Q&A contextual suggestions (changes based on Dashboard/Footprint context) | Static `suggestedQuestions` from `rm-messages.json`/`sample-queries.json`; no context-awareness | No dynamic suggestion logic | New function taking current screen/context → filtered question list | **P1** | `semantic.controller.ts`, `rm-chat.component.ts` |
| 8 | Speech-to-Text | **Zero implementation** | Everything | Frontend-only `SpeechInput` abstraction wrapping Web Speech API with graceful fallback | **P2** | New `src/app/core/services/speech.service.ts`, `rm-chat.component.ts` |
| 9 | LC Issuance Assistant conversation (type → draft/official) | No conversation-flow state beyond single-turn Semantic Engine intents | No multi-step transaction-assistance state machine | New `LC_REQUEST` conversation flow, server-side per-user state | **P0** | New `services/lc-assist.service.ts`, `ai/conversation-context.ts` extension |
| 10 | LC limit check before allowing issuance request | `TRADE_FINANCE` credit limit data + tool already exist; **never checked before offering to create an LC** | No gate in the conversation flow | New reasoning branch reading `getTradeFinanceLimits` before proceeding | **P0** | `reasoning-engine.ts` or new `lc-assist.service.ts` |
| 11 | PO upload (PDF/Image/Word/Excel) | **Zero implementation** | Everything (no upload middleware at all) | New `POST /api/virtual-rm/lc/analyze-po` with `multer` (or equivalent) | **P0** | New `server/src/controllers/lc-assist.controller.ts`, `package.json` dependency |
| 12 | PO document analysis / field extraction with confidence + source | **Zero implementation** | Everything; no OCR/parsing library in `package.json` | New extraction service — demo-scoped to a small set of curated sample POs with pre-computed extraction (mirrors this repo's existing "deterministic mock, not a real ML call" convention used everywhere else — see `MockReasoningProvider`) | **P0** | New `services/po-analysis.service.ts`, `data/po-samples/` |
| 13 | LC Prefill from extracted fields, missing fields stay blank | `lc-create.page.ts`'s 6-step wizard exists and takes a full field set already | No query-param/state-based prefill entry point | Add prefill support to `lc-create.page.ts` (read from router state or a short-lived server-side draft) | **P0** | `lc-create.page.ts`, `trade-finance.service.ts` (frontend) |
| 14 | Checker cannot create a Maker transaction | No role check on `POST /api/trade-finance/lc` at all today | Missing server-side enforcement | Add role check to `trade-finance.controller.ts`/`.service.ts` | **P0** (security) | `server/src/controllers/trade-finance.controller.ts`, `services/trade-finance.service.ts` |
| 15 | Draft LC message generation, clearly marked DRAFT/DEMO | **Zero implementation** | Everything | New `POST /api/virtual-rm/lc/draft-message`, template-based (no real SWIFT format claimed) | **P1** | New service function |
| 16 | LC state machine (DRAFT → ... → COMPLETED) | Only post-creation `status` enum exists | No pre-creation states modeled | New lightweight state store per LC-assist session (mirrors `conversation-context.ts`'s in-memory-per-user pattern) | **P1** | New `services/lc-assist.service.ts` |
| 17 | New ReasoningTypes: PRIORITIZATION, TRANSACTION_ASSISTANCE, DOCUMENT_ANALYSIS | 5 of 8 types already exist (previous Phase 5.5 pass) | 3 new types + their use cases | Extend `reasoning-types.ts`, `complexity-classifier.ts`, add new use cases | **P0** | `server/src/reasoning/*` |
| 18 | `VirtualRMResponse` gains `transaction{}`/`documentAnalysis{}` | Current `SemanticAnswer`/`SemanticQueryResult` has neither field | Additive type extension needed | Extend `semantic/types.ts` (additive, same pattern as the previous Phase 5.5 `reasoningMeta` addition) | **P0** | `semantic/types.ts`, `semantic.controller.ts` |
| 19 | Verification extended to cover document-extraction confidence (`REVIEW_REQUIRED`) | Verification Engine exists (previous Phase 5.5 pass) but has no document-confidence check | Missing check type | Extend `verification-engine.ts` | **P0** | `reasoning/verification-engine.ts` |
| 20 | Role-aware dashboard metrics/actions (CFO/Finance Manager/Accountant/Maker/Checker) | Role model exists (`MAKER/CHECKER/ADMIN`); BRD names 5 roles, only 3 exist today | Role enum narrower than BRD's list; no role-based dashboard filtering | Decide: widen role enum, or map BRD's 5 business roles onto the existing 3 technical roles (recommended — avoids a breaking auth model change) | **P1** | `semantic/types.ts::SecurityContext`, Daily Dashboard service |

## 5. Priority summary

**P0 (blocks the BRD golden demo flow, §41 of the spec):** Daily Dashboard endpoint, Pending
Approval age/expiry risk, Footprint (all of it — BRD explicitly says not optional), Ranking
Engine, LC Issuance Assistant conversation + limit check + PO upload + PO analysis + prefill,
Checker-flow enforcement, new ReasoningTypes, response contract extension, verification
extension.

**P1:** Greeting time-of-day, BRD-specific task categories, contextual Q&A suggestions, draft LC
message, LC state machine, role-aware dashboard filtering.

**P2:** Speech-to-Text (BRD requires it but explicitly allows graceful fallback — lowest risk to
defer without breaking the golden demo).

## 6. Recommended sequencing (not yet approved — see final report)

Given the four BRD capability areas are large and largely independent (dashboard reasoning,
gamification/infographics, document-AI pipeline, LC conversation flow), attempting all of §4's
20 gaps in one implementation pass would repeat the mistake this project has explicitly avoided
in every prior phase (see `docs/phase-6-trade-finance-architecture.md` §4's own "real, tested,
vertical slice" principle) — shallow, under-tested code across four unrelated subsystems instead
of working software in any of them. A sequencing recommendation is in the final report message
that accompanies this document; it is **not** assumed or started here.

## 7. What this audit deliberately does not re-litigate

The *previous* Phase 5.5 pass (Advanced Business Reasoning & Verification — complexity
classifier, query planner, risk engine, priority engine, evidence engine, verification engine,
`CASHFLOW_DIAGNOSTIC`/`DAILY_PRIORITY` use cases) is treated here as part of the reusable
baseline (§3.2), not re-audited line by line — it already has its own audit/architecture/
evaluation docs (`docs/phase-5.5-audit.md` through `evaluation.md`). This document's job is
strictly BRD-vs-current-state, per §3 of the BRD alignment spec.
