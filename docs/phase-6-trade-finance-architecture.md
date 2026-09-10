# Phase 6 — Trade Finance: Repository Inspection & Plan

Written before Phase 6 code changes, per the phase's own rule (§56: inspect, read Phase 5,
don't rebuild, reuse). Companion to `docs/phase-5-analysis.md`/`architecture.md`, which
this assumes as read.

## 1. What Phase 5 already has for Trade Finance

The Business Banking Semantic Pack (predates Phase 5, untouched by it) already has a
`TRADE_FINANCE` domain with **7 intents**: `LC_LIST`, `LC_STATUS`, `LC_EXPIRY`,
`LC_DETAIL`, `GUARANTEE_LIST`, `GUARANTEE_EXPIRY`, `COLLECTION_LIST` — each with a
`response-generator.ts` handler and real (if thin) mock data
(`letter-of-credits.json`/`bank-guarantees.json`/`collections.json`). Phase 5 added
`getLetterOfCredits`/`getBankGuarantees`/`getCollections` tools (unused by any Phase 5
reasoning use case) and a `TRADE_FINANCE` credit-limit record already exists in
`credit-limits.json` (`limitType: "TRADE_FINANCE"`, 5B total / 1.6B available).

**What's missing for everything Phase 6 asks for:** the existing LC/BG/Collection
records are flat status snapshots (`{id, number, type, beneficiary, amount, currency,
issueDate/dueDate, expiryDate, status}`) — no documents, no discrepancies, no
amendments, no claims, no applicant/issuing-bank/advising-bank detail, no
shipment/presentation deadlines, no risk flags. None of §3–§28's document
checklist/discrepancy/amendment/claim/deadline reasoning has anything to read from
today. This is the real gap Phase 6 fills — not new intents for their own sake, but
data rich enough for the reasoning to mean something.

**No dedicated frontend page exists for LC/BG/Collection** —
`business-semantics/navigation-actions.json`'s `OPEN_LC`/`OPEN_GUARANTEE`/
`OPEN_COLLECTION` all route to `/products` today, each with an explicit note ("Chưa có
màn hình ... riêng trong demo"). This matches spec §44's own instruction not to build a
large standalone UI — the chat's rich response *is* the Trade Finance surface, same as
Phase 5's reasoning answers.

## 2. Reusable components

- **Everything from Phase 5's AI layer** — `AIProvider`, `getAiProvider()`,
  `routeQuery()`, `runReasoning()`'s plan→tools→calc→phrase shape, the `Tool<Params,
  Result>` pattern, `financial-calculations.ts`'s primitives (especially `rankByUrgency`,
  directly reusable for LC/Guarantee risk ranking), `conversation-context.ts`'s
  per-userId store (extended, not replaced, for an LC-number follow-up). None of this is
  rebuilt — Phase 6's new reasoning use cases are new entries in the same `PLANS` map and
  `switch` in `reasoning-engine.ts`, using the same `ReasoningUseCase` union pattern
  `LIQUIDITY_ANALYSIS` etc. already established.
- **`server/src/repositories/semantic-data.repository.ts`** — the LC/BG/Collection
  repositories already exist and already support the admin "Reset Demo Data" flow
  (`resettableRepositories`); Phase 6 only needs to enrich the JSON shape they serve, not
  add new repository classes.
- **`response-generator.ts`'s existing LC_LIST/LC_STATUS/LC_EXPIRY/LC_DETAIL/
  GUARANTEE_LIST/GUARANTEE_EXPIRY/COLLECTION_LIST handlers** — kept exactly as-is
  (backward compatible with the richer data shape, since new fields are additive).
- **The `requiredSignals` intent-scoring gate** (added mid-Phase-5-work to fix sibling-
  intent collisions) — new LC/Guarantee/Collection intents that need a specific
  entity/signal (e.g. `LC_DISCREPANCY` needing a resolved LC) use this from day one
  rather than risk the same "narrow intent loses to broad sibling" bug class documented
  in `docs/semantic-engine.md`.
- **`docs/semantic-engine.md`'s own hard-won lessons** — concept-sharing causes
  collisions; new LC/Guarantee-specific concepts get their own vocabulary rather than
  layering onto the existing generic `letterOfCredit`/`bankGuarantee` concepts, exactly
  as the "Structural lesson" section describes.

## 3. Architectural decision: embed, don't multiply top-level files

Spec §41 lists 11 new top-level data files (`lc-documents.json`,
`lc-discrepancies.json`, `lc-amendments.json`, `guarantee-documents.json`,
`guarantee-claims.json`, `collection-documents.json`,
`trade-finance-limits.json`, `trade-finance-fees.json`, ...). Spec §7's own worked LC
schema example, though, embeds exactly this data as **nested fields on the LC record
itself** (`documentsRequired: []`, `discrepancies: []`, `amendments: []`, `fees: []`,
`collateral: {}`, `riskFlags: []`).

This pass follows §7's schema, not §41's file list: documents/discrepancies/
amendments/claims/fees live as nested arrays on each LC/BG/Collection record in the
*existing* `letter-of-credits.json`/`bank-guarantees.json`/`collections.json` files,
enriched in place. Reasons, matching this codebase's own established conventions:
- §42 explicitly worries about orphan data ("Không tạo dữ liệu orphan nếu có thể
  tránh") — nesting makes an orphan document/discrepancy structurally impossible, no
  foreign-key-by-string-id relationship to keep in sync across files.
- `trade-finance-limits.json` already effectively exists — `credit-limits.json`'s
  `TRADE_FINANCE` limitType record — reused rather than duplicated.
- Every existing Phase 1–5 dataset in this repo (`accounts.json`, `payment-orders.json`,
  ...) is one flat array of self-contained records; nesting continues that pattern
  instead of introducing a new one for Trade Finance alone.
- Tools like `get_lc_documents`/`get_lc_discrepancies`/`get_lc_amendments` still exist
  exactly as spec §36 names them — they just extract a nested field from the LC record
  rather than joining a separate file, which is an implementation detail their callers
  (the Reasoning Engine) never see.

## 4. Scope for this pass

Given the size of the full spec (56 sections; requesting ~170 tests, 11 new data files,
~35 new intents, 21 new tools, a full 3-instrument lifecycle model), this pass builds a
**real, tested, verified vertical slice** — every piece that ships is actually run
against real data and actually works end-to-end, rather than every numbered
subsection being nominally checked off. Specifically:

**Built:**
- Richer LC/Guarantee/Collection data model (documents, discrepancies, amendments,
  claims, risk flags, applicant/bank detail, shipment/presentation deadlines) with
  enough varied seeded records (ACTIVE clean, ACTIVE with a discrepancy, ACTIVE with a
  pending amendment, EXPIRING soon, EXPIRED, a guarantee with a claim, D/P and D/A
  collections, one overdue) to make every reasoning use case below produce a real,
  different answer per record — not one happy-path fixture.
- New core intents for the genuinely single-lookup capabilities: document checklist,
  discrepancy list, amendment list, guarantee claims, guarantee extension-needed list,
  collection overdue, collection payment/acceptance status, plus two human-in-the-loop
  "request" intents (LC/Guarantee) that only ever prepare a checklist and navigate —
  never execute anything.
- New Reasoning Engine use cases for the genuinely cross-domain/analytical ones: LC risk
  prioritization (deadline + documents + discrepancy + amount), guarantee
  prioritization, Trade Finance exposure (by currency, no FX guessing), Trade Finance
  limit reasoning (reuses the existing `TRADE_FINANCE` credit limit), a cross-domain
  Trade Finance overview, "what Trade Finance business needs attention today," and a
  Trade Finance Briefing (dedicated endpoint + chat trigger, same pattern as the
  existing Business Briefing).
- Multi-turn: a bare LC/BG number mentioned right after an LC/Guarantee-list-family
  answer resolves to that record's detail — the spec's own §45 example.
- A real, executed 10-minute demo (spec §49) against the live server, output captured
  verbatim in `docs/phase-6-demo-script.md`, not hand-written.

**Explicitly deferred** (see `docs/phase-6-evaluation.md` for the full list): a formal
Import/Export LC 12-step lifecycle state MACHINE (statuses exist and are queryable, but
nothing enforces valid transitions between them — this is a demo with mock data, not a
workflow engine); dedicated `GET /api/trade-finance/lc/:id`-style REST endpoints beyond
the chat query API and the one new briefing endpoint (the spec's own §43 already says
"Nếu project hiện tại đã có API tương đương thì reuse" — the chat query API already
serves every read this phase needs); a real compliance/legal-conclusion engine (spec
§13/§40 explicitly forbid this anyway); FX conversion for exposure (spec §31/§46
explicitly forbid guessing when a rate isn't available — exposure is reported per
currency instead).
