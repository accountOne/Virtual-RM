# Phase 6 Architecture — Trade Finance

What actually got built, file by file, and how it composes with Phase 5's AI layer. Read
`docs/phase-6-trade-finance-architecture.md` first for *why* each piece exists (the
pre-work inspection/plan, written before any code changed) — this doc is the as-built
record, same relationship phase-5-architecture.md has to phase-5-analysis.md.

## What changed, by layer

Phase 6 adds one new domain's worth of depth to every layer Phase 5 already built —
no new layer, no new request-flow shape. The `POST /api/virtual-rm/query` flow diagram
in `docs/phase-5-architecture.md` is unchanged; Phase 6 only adds new branches inside
it (two more chat-trigger checks, six more `ReasoningUseCase` values, one more
follow-up resolver) and one new GET endpoint mirroring the existing briefing one.

```
server/src/
├── models/index.ts        + TradeDocument/LcDiscrepancy/TradeAmendment/GuaranteeClaim +
│                             richer LetterOfCredit/BankGuarantee/Collection (nested, not
│                             new top-level files — see the architecture-decision doc §3)
├── tools/index.ts          + 14 tools: get_lc_deadlines/_documents/_discrepancies/
│                             _amendments/_exposure, get_guarantee_documents/_claims/
│                             _deadlines/_exposure, get_collection_documents/_deadlines/
│                             _exposure, get_trade_finance_exposure/_limits
├── calculation/
│   └── financial-calculations.ts  + daysUntil, calculateLcRisk, calculateGuaranteeRisk,
│                                     combineExposure
├── ai/
│   ├── model-router.ts     + 6 keyword-trigger rules (Rule 1b), all require an explicit
│   │                         "lc"/"bảo lãnh"/"trade finance" term so none shadow the
│   │                         existing Phase 5 rules or the plain LC_EXPIRY/GUARANTEE_EXPIRY
│   │                         intents
│   ├── reasoning-engine.ts + 6 use cases in the same PLANS-map → switch-case shape
│   │                         Phase 5 established
│   ├── mock-reasoning-provider.ts  + 6 Vietnamese templates, same "phrase facts, never
│   │                                 compute" contract
│   └── conversation-context.ts     + resolveDocumentFollowUp() — a second follow-up
│                                     resolver alongside resolveCurrencyFollowUp()
├── semantic/
│   ├── response-generator.ts  + 9 new intent handlers (LC_DOCUMENT_STATUS,
│   │                             LC_DISCREPANCY, LC_AMENDMENT, LC_REQUEST,
│   │                             GUARANTEE_CLAIM, GUARANTEE_EXTENSION, GUARANTEE_REQUEST,
│   │                             COLLECTION_OVERDUE, COLLECTION_PAYMENT_STATUS) +
│   │                             generateTradeFinanceBriefing() + GUARANTEE_LIST gained
│   │                             an optional documentId narrow-to-detail branch
│   └── semantic-engine.ts     + tradeFinanceBriefing(), same extension-intent pattern
│                                 as businessBriefing()
└── controllers/
    └── semantic.controller.ts + isTradeFinanceBriefingRequest() chat trigger (checked
                                  before the generic isBriefingRequest, which would
                                  otherwise also match "trade finance briefing hôm nay")
                                + resolveDocumentFollowUp() wired in before the currency
                                  follow-up check
                                + tradeFinanceBriefing GET handler

business-semantics/   9 new intents (LC_DOCUMENT_STATUS, LC_DISCREPANCY, LC_AMENDMENT,
                       LC_REQUEST, GUARANTEE_CLAIM, GUARANTEE_EXTENSION, GUARANTEE_REQUEST,
                       COLLECTION_OVERDUE, COLLECTION_PAYMENT_STATUS) + their synonym
                       concepts/response templates + 5 new navigation actions
                       (OPEN_LC_DOCUMENTS/_DISCREPANCY/_AMENDMENT, OPEN_GUARANTEE_CLAIM,
                       OPEN_TRADE_FINANCE)

src/app/  rm-chat.component.ts: 4 new quick-action chips
          rm-data.service.ts: NAV_ACTION_ROUTES gained the 5 new nav-action ids above —
            every one of them previously fell back to /dashboard (a real dead-CTA bug,
            found and fixed during this pass, not by inspection — see Verification below)
```

Diff sizes (real, from `git diff --stat`): `response-generator.ts` +209/−(few),
`reasoning-engine.ts` +263, `tools/index.ts` +182, `models/index.ts` +93,
`financial-calculations.ts` +109, `response-templates.json` +372, `intents.json` +134,
`synonyms.json` +74 — 16 files, ~1640 insertions total.

## Data model: embed, don't multiply files

Documents/discrepancies/amendments/claims/risk flags are nested arrays on the LC/BG/
Collection record itself, not separate top-level JSON files joined by id. Rationale,
scope decision, and the spec §7-vs-§41 tension it resolves are written up in
`docs/phase-6-trade-finance-architecture.md` §3 — unchanged from that plan, this is
just confirming it's what actually shipped.

## Risk scoring — Calculation Engine, not the model

```typescript
calculateLcRisk(lc, anchorToday): { score, level, reasons, daysUntilShipment,
  daysUntilExpiry, openDiscrepancies, documentGaps }
```
Every point traces to a real field: shipment deadline ≤3 days (+40), expiry ≤7 days
(+25), each open discrepancy up to 2 (+20 each), each document gap up to 2 (+15 each),
amount ≥1.5 tỷ (+10). `calculateGuaranteeRisk` mirrors this for guarantees (active claim
+40, extension requested +30, expiry ≤14 days +25, amount ≥5 tỷ +10). `deriveRiskLevel`
is the same three-tier scale reasoning-engine.ts already uses elsewhere: HIGH ≥50,
MEDIUM ≥25, LOW otherwise. This is an *operational attention-priority* signal, never a
legal/compliance conclusion (spec §13/§40's own "Không tự kết luận pháp lý") — it never
appears anywhere as "compliant"/"non-compliant," only as a sort order and a reasons list.

## The 6 new reasoning use cases

| Use case | Plan (tools called) | Calculation |
|---|---|---|
| `LC_RISK_PRIORITIZATION` | `get_lc_deadlines` | `LC_RISK_SCORE` (per LC), sorted desc |
| `GUARANTEE_RISK_PRIORITIZATION` | `get_guarantee_deadlines` | `GUARANTEE_RISK_SCORE` (per guarantee), sorted desc |
| `TRADE_FINANCE_EXPOSURE` | `get_trade_finance_exposure` | `COMBINE_EXPOSURE` — per-currency totals across LC+guarantee+collection, **never FX-converted** (spec §31/§46) |
| `TRADE_FINANCE_LIMIT_ANALYSIS` | `get_trade_finance_limits` | `LIMIT_UTILIZATION` — used/total as a %, ≥80% triggers a recommendation to review |
| `TRADE_FINANCE_OVERVIEW` | `get_letter_of_credits` + `get_bank_guarantees` + `get_collections` + `get_trade_finance_exposure` + `get_trade_finance_limits` (5 tools — under `AI_MAX_STEPS=6`) | `COMBINE_EXPOSURE` |
| `TRADE_FINANCE_ATTENTION` | `get_lc_deadlines` + `get_guarantee_deadlines` + `get_collections` | `LC_RISK_SCORE` + `GUARANTEE_RISK_SCORE`, merged with overdue collections into one score-sorted list |

All 6 follow the exact `PLANS` map → `switch` → `AIProvider.reason(facts)` shape
Phase 5 established; none introduce a new pattern. Every answer carries a
`NAVIGATE` → `OPEN_TRADE_FINANCE` action (proven by a test — see Verification).

## Multi-turn: document-number follow-up

`resolveDocumentFollowUp(rawMessage, userId)` — same shape as Phase 5's
`resolveCurrencyFollowUp` (≤6-word gate, previous-intent allowlist, resolved
before intent detection runs at all):

- A bare `LC-\d{4}-\d{3,}` after an LC-list-family intent (`LC_LIST`, `LC_STATUS`,
  `LC_EXPIRY`, `LC_DETAIL`, `LC_DOCUMENT_STATUS`, `LC_DISCREPANCY`, `LC_AMENDMENT`, and —
  found necessary while running the demo, see Verification — `LC_RISK_PRIORITIZATION`/
  `TRADE_FINANCE_OVERVIEW`/`TRADE_FINANCE_ATTENTION` too) resolves to `LC_DETAIL`.
- A bare `BG-\d{4}-\d{3,}` after a guarantee-list-family intent resolves to
  `GUARANTEE_LIST` with `documentId` set. There is no separate `GUARANTEE_DETAIL` intent
  (out of this pass's scope per the pre-work plan) — `GUARANTEE_LIST` itself narrows to
  one record's detail view when `documentId` is present, the same "narrow when a doc id
  is given, else list" shape `LC_DISCREPANCY`/`GUARANTEE_CLAIM`/`COLLECTION_PAYMENT_STATUS`
  already use.

## Trade Finance Briefing

`tradeFinanceBriefing(security)` (`semantic-engine.ts`) — a fixed daily-summary card,
same pattern as `businessBriefing()`: not routed through the Reasoning Engine's tool-plan
machinery (that overhead is for chat questions; a briefing is a standing summary, same
distinction the existing Business Briefing already makes), reads repositories directly,
reuses `calculateLcRisk`/`calculateGuaranteeRisk` for its one risk-flag insight line.
Reachable two ways, matching Business Briefing exactly:
- `GET /api/virtual-rm/trade-finance-briefing`
- Typed in chat: `isTradeFinanceBriefingRequest()` in `semantic.controller.ts`, checked
  *before* the generic `isBriefingRequest()` since "trade finance briefing hôm nay" would
  otherwise also match that one's "briefing hom nay" substring.

## Verification performed

- `npm run test:semantic` — 372/372 passing (326 pre-Phase-6 + 46 new: Trade Finance
  deterministic intents ×6, calculation engine ×10, tool layer ×7, model router ×8,
  reasoning engine ×7, multi-turn context ×8).
- `npm run validate:semantic` — still passes (0 errors, same 5 pre-existing warnings).
- `npm run build:server` / `npm run build` (frontend) — both clean.
- All 6 reasoning use cases, the 4 new deterministic intents, both follow-up patterns,
  and the dedicated briefing endpoint were run against the **real running server** over
  real HTTP — see `docs/phase-6-demo-script.md` for verbatim output. Two real bugs were
  caught this way, not by inspection:
  1. `getGuaranteeDeadlines` originally filtered to `ACTIVE` only, silently excluding a
     `CLAIMED` guarantee (BG-2026-013, the one with the active claim) from every risk/
     attention/briefing calculation that used it — the single most demo-relevant record.
  2. The document-number follow-up didn't fire after `LC_RISK_PRIORITIZATION` (a message
     like "LC-2026-001" right after "LC nào rủi ro cao nhất?" fell through to
     `CLARIFICATION_NEEDED`) — the follow-up's previous-intent allowlist only had the
     deterministic list intents, not the new reasoning use cases that also list LC/BG
     numbers. Fixed by adding them to the allowlist (`conversation-context.ts`).
- A live browser check (Playwright against `ng serve`) confirmed a quick-action chip
  click renders a real reasoning answer and its CTA navigates to `/products` — this also
  caught a second real bug: `NAV_ACTION_ROUTES` in `rm-data.service.ts` had no entry for
  `OPEN_TRADE_FINANCE` (or the 4 other new Phase 6 nav-action ids), so every Phase 6 CTA
  silently fell back to `/dashboard` instead of `/products`.
