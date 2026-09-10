# Phase 5 — Repository Analysis

Written before any Phase 5 code changes, per the phase's own rule ("Inspect repository
before changing code. Reuse code, don't build a parallel implementation"). Covers what
exists today, what's reusable as-is, and what Phase 5 actually needs to add.

## 1. Current architecture (as of this inspection)

```
Angular SPA (src/app)                         Node/Express API (server/src)
─────────────────────                         ──────────────────────────────
rm-chat.component.ts  ──POST /api/virtual-rm/query──>  semantic.controller.ts
  (plain-text chat bubbles,                             │
   1 "thinking" indicator,                               ▼
   suggested-question chips)                  semantic-engine.ts (answerQuery)
                                                │  normalize → date/amount/status
rm-data.service.ts.askRm()                     │  → entity-extractor → intent-detector
  flattens the rich answer                      │  → query-builder → response-generator
  {title,summary,metrics,records,action}        ▼
  into one text blob + one CTA link     response-generator.ts (50+1 intent handlers,
                                          each a pure fn over repositories + aggregation-engine)
```

Two REST surfaces exist for "ask a question": the legacy `/api/rm/query`
(`rm.controller.ts` → `rm.service.ts`, simple pre-semantic-pack keyword matching) and the
current `/api/virtual-rm/query` (`semantic.controller.ts` → `semantic-engine.ts`). The
frontend only calls the latter — the legacy path is dead code from the frontend's
perspective and Phase 5 does not touch it.

`GET /api/virtual-rm/briefing` calls `businessBriefing()` directly, bypassing intent
detection (there's no "ask a question" involved — it's a fixed daily summary), and
already aggregates 6 datasets (see `generateBriefing()` in `response-generator.ts`).

## 2. Current RM flow, one question end to end

1. `rm-chat.component.ts` posts `{ message, userId, role }` — `userId`/`role` come from
   `AuthService.currentUser()`, never parsed from the message text.
2. `semantic.controller.ts` calls `buildSecurityContext(userId, role)`
   (`semantic-engine.ts`), which reads `companyId` from the single seeded
   `customer.json` record — **never from the request**. This is the existing security
   boundary Phase 5 must preserve exactly, not reinvent.
3. `answerQuery()` runs the normalize → date/amount/status resolution →
   entity-extraction → intent-scoring (`intent-detector.ts`, with the `requiredSignals`
   gate added in the previous pass) → `buildQuery()` (injects `companyId`/`userId`
   server-side, never client-side) → `generateAnswer()` pipeline.
4. `generateAnswer()` looks up the resolved intent id in a big handler map in
   `response-generator.ts` and returns `{title, summary, metrics, records, action}`.
5. Back on the frontend, `toRmAnswer()` flattens that into `{message: string, cta?}` and
   `rm-chat.component.ts` renders it as one chat bubble with an optional CTA link.

## 3. Reusable components (Phase 5 must build *on top of*, not replace)

- **Security context**: `buildSecurityContext()` / `SecurityContext` — already exactly
  what the spec's §8 "server controls companyId/userId/role, never the client" asks for.
  Tools just need to accept this same object, not reinvent a `UserContext` from scratch.
- **Repositories**: every dataset the spec's Tool Layer (§7) lists already has a
  repository — `accountsRepository`, `transactionsRepository`, `paymentOrdersRepository`,
  `approvalsRepository`, `receivablesRepository`, `payablesRepository`,
  `payrollsRepository`, `fxDealsRepository`, `fxRatesRepository`,
  `letterOfCreditsRepository`, `bankGuaranteesRepository`, `collectionsRepository`,
  `loansRepository`, `creditLimitsRepository`, `productsRepository`,
  `recommendationsRepository`, `alertsRepository`, `tasksRepository` (`server/src/
  repositories/index.ts`). The Tool Layer is a thin, security-scoped wrapper over these,
  not a new data-access layer.
- **Calculation primitives**: `aggregation-engine.ts` already has `sum/count/avg/min/
  max/compare/groupBy`, used throughout `response-generator.ts`. The Calculation
  Engine (§10) extends this with the higher-level financial formulas
  (`NET_CASHFLOW`/`PROJECTED_CASH`/`LIQUIDITY_GAP`/...), it doesn't duplicate the base
  arithmetic.
- **Date/amount/status resolution**: `date-resolver.ts`/`amount-parser.ts`/
  `status-resolver.ts` are reused as-is by any new reasoning code that needs a date
  range or amount filter — no new parsing logic needed there.
- **Intent detection**: the 50-intent semantic engine already resolves a meaningful
  chunk of what the spec calls "complex" queries to a specific intent (e.g. "Tôi có
  khoản tiền nhàn rỗi nào không?" → `CASH_POSITION`, "Dòng tiền tháng này thế nào?" →
  `CASH_FLOW_SUMMARY`, "Tôi cần xử lý việc gì quan trọng nhất hôm nay?" → `TASK_DUE`).
  The Model Router (§6) classifies *after* intent detection, not instead of it — reusing
  the existing 50-intent classification rather than re-deriving it with new keyword
  rules.
- **Response shape**: `SemanticAnswer` (`{title, summary, metrics, records, action}`)
  already matches most of the spec's `RMResponse` (§20). Phase 5 only needs to add the
  two fields that don't exist yet — `insights?: string[]` and
  `recommendation?: {title, description}` — not a new response type.
- **Frontend chat shell**: the popup, message list, CTA button, "thinking" indicator,
  and suggested-question chips (`rm-chat.component.ts`) are reused as-is per the
  phase's own "don't redesign the UI" rule (§25) — the reasoning indicator and new
  sections render inside the *same* chat bubble, no new components.

## 4. Gaps Phase 5 actually needs to fill

Everything below is genuinely new — nothing in the current codebase overlaps it:

1. **AI provider abstraction** — no `AIProvider` interface, no model-agnostic chat/reason
   call anywhere. No API key is configured in this environment (no `.env`, `AI_*`
   variables) — so Phase 5 implements the spec's explicitly-allowed fallback: a
   deterministic **mock reasoning provider** that phrases the RM's answer from
   already-computed structured facts (never invents numbers), with the abstraction
   shaped so a real provider can be swapped in later via `AI_PROVIDER`.
2. **Model Router** — nothing today decides "this needs multiple tools + a financial
   calculation, not just one intent handler." A handful of the spec's own example
   "complex" questions (liquidity/obligations, idle cash *with* a 30-day projection,
   payment prioritization, approval prioritization) have no existing intent at all, since
   they need cross-domain math, not a single dataset lookup.
3. **Tool Layer** — repositories exist, but there's no security-scoped, named,
   schema'd "tool" boundary a reasoning step calls through. This is new, thin code.
4. **Calculation Engine (financial layer)** — `NET_CASHFLOW`, `PROJECTED_CASH`,
   `LIQUIDITY_GAP`, `CASH_BUFFER`, `OUTSTANDING` as named, reusable functions don't
   exist yet (the closest existing thing, `CASH_FLOW_COMPARE`'s inline math in
   `response-generator.ts`, is single-purpose and not reusable by a multi-tool plan).
5. **Reasoning Engine / query plan** — nothing today calls more than one dataset for one
   answer. This is the core new piece.
6. **Multi-turn context** — the API is stateless per request today (by design, no
   server session — see `buildSecurityContext`'s own comment). A minimal, demo-scoped,
   in-memory per-`userId` "last turn" store is new.
7. **New mock data relationships for reasoning to be meaningful** — checked in §9 below;
   mostly sufficient already, a couple of near-term due dates may need adding so
   "obligations in the next 30 days" has something to actually rank.

## 5. Implementation plan (what this pass actually builds)

Given the size of the full spec (AI provider abstraction, model router, ~20 tools,
6-function calculation engine, 7+ reasoning use cases, multi-turn context, business
briefing insight, frontend updates, ~90 tests across 8 categories, 4 docs), this pass
implements a **real, working, tested vertical slice** rather than claiming blanket
completion of every numbered section — consistent with how this repo's own docs
(`docs/semantic-engine.md`) already disclose scope honestly instead of overstating it.

Built in this pass:
- AI provider abstraction with a deterministic mock provider (§4, §21 no-hallucination
  policy) and the env-var configuration surface (§5), documented for swapping in a real
  model later.
- Model Router with deterministic rules (§6), reusing the existing semantic engine's
  intent resolution first.
- Tool Layer covering the datasets needed by the reasoning use cases below (§7, §8).
- Calculation Engine: `NET_CASHFLOW`, `PROJECTED_CASH`, `LIQUIDITY_GAP`, `CASH_BUFFER`,
  `OUTSTANDING`, plus reuse of existing `FX_EXPOSURE` math (§10).
- Reasoning use cases: **liquidity/upcoming-obligation analysis, idle cash analysis,
  cashflow analysis, payment prioritization, approval prioritization, product
  recommendation reasoning** (§11–14, §19) — the ones with a concrete worked example in
  the spec, each verified end-to-end against real seeded data, not just unit-tested in
  isolation.
- Multi-turn context for the specific example in §17 (currency follow-up on an account
  question).
- Business briefing gets one added "RM Insight" line computed via the Calculation
  Engine (§16), not a rewrite of the existing aggregation.
- `POST /api/virtual-rm/query` gains an opt-in reasoning branch; **all existing
  simple-query behavior and the current 243/243 passing tests are preserved exactly** —
  this is an additive branch, not a rewrite of `semantic-engine.ts`.
- Frontend: reasoning indicator text, insight/recommendation rendering inside the
  existing chat bubble, 4 new quick-action chips.
- Tests sized to what's actually built (not a padded-to-90 count) — see
  `docs/phase-5-evaluation.md` for the honest matrix.

Explicitly deferred (documented as such, not silently dropped):
- All 22 tools from the spec's ~20-tool list were built and tested (turned out to be
  cheap, thin repository wrappers) — but roughly 14 of them aren't independently
  exercised by any of the 6 built reasoning use cases yet (e.g. `get_bank_guarantees`,
  `get_collections`, `get_credit_limits`). They exist and pass their own tests, ready for
  a future reasoning use case to call them.
- A dedicated `TASK_PRIORITIZATION` reasoning use case — "Hôm nay tôi nên xử lý việc gì
  trước?" is answered by the existing deterministic `TASK_DUE` intent instead (see
  docs/phase-5-evaluation.md #Known-limitations).
- Real external AI provider wiring (OpenAI/Azure/etc. client code) — the interface and
  env-var contract are ready for it, but no API key exists in this environment to test
  against, and the spec explicitly permits deferring this.
- A dedicated Angular UI for structured metrics/insight *cards* — the spec explicitly
  says not to redesign the UI, so these render as extra lines within the existing plain
  chat bubble, not new components.
