# Business Banking Semantic Model

The data model behind Virtual RM's natural-language understanding. All of it lives as
static JSON under [`/business-semantics`](../business-semantics) — no database, no LLM,
loaded once into memory by `server/src/semantic/semantic-engine.ts`.

See [`/business-semantics/README.md`](../business-semantics/README.md) for the file-by-file
index and exact counts. This document explains the *model*, not the file layout.

## 1. Domains (13)

A domain is a business area used to group intents and entities: `ACCOUNT`,
`TRANSACTION`, `PAYMENT`, `APPROVAL`, `CASH_MANAGEMENT`, `PAYROLL`, `FX`,
`TRADE_FINANCE`, `LENDING`, `PRODUCT`, `ALERT`, `TASK`, `CUSTOMER_SERVICE`.

## 2. Entities (30)

Nouns the engine reasons about — `Account`, `Transaction`, `PaymentOrder`, `Approval`,
`Loan`, `LetterOfCredit`, `FXDeal`, `Recommendation`, etc. (full list in
`entities.json`). Each entity belongs to one domain and carries Vietnamese aliases used
for documentation/cross-reference (actual matching is done through the synonym
dictionary, not entity aliases directly).

## 3. Intents (50)

The core of the pack. Each intent record has:

```json
{
  "id": "APPROVAL_PENDING",
  "domain": "APPROVAL",
  "entity": "Approval",
  "priority": 100,
  "synonymConcepts": ["approval"],
  "supportedEntities": ["amount", "datePeriod", "status", "paymentType"],
  "defaultSort": { "field": "amount", "direction": "desc" },
  "responseTemplate": "APPROVAL_PENDING",
  "navigationAction": "OPEN_APPROVAL"
}
```

- `synonymConcepts` — which concepts in `synonyms.json` contribute to this intent's score.
- `supportedEntities` — which extractable fields (date/amount/status/beneficiary/...)
  this intent cares about; also drives the small score bonus when one is present.
- `responseTemplate` / `navigationAction` — cross-references into
  `response-templates.json` / `navigation-actions.json`.

**48 of the 50 IDs come directly from the original spec.** The spec said "exactly 50"
but only enumerated 48, and left `CUSTOMER_SERVICE` with no intents at all — `GREETING`
and `HELP` were added to close both gaps.

`BUSINESS_BRIEFING` is deliberately **not** one of the 50 — per the spec it's an
extension capability layered on top (see §5 below).

## 4. Synonyms (432 terms / 50 concepts)

`synonyms.json` maps a concept id (`account`, `approval`, `fxDeal`, `taskDue`, ...) to
an array of Vietnamese (and a few English) terms a customer might actually type. The
spec's "~300 terms" was a floor, not a cap (`validate-semantic-pack.ts` enforces
`>= 300`, not `=== 300`): 50 concepts rather than "approximately 30" because narrow,
single-purpose concepts (`highest`, `lowest`, `outstandingDebt`, and later a larger batch
— `statement`, `detail`, `pending`, `paymentCreate`, `approveAction`, `rejectAction`,
`taskDue`/`lcExpiry`/`guaranteeExpiry`, `highPriority`, `cashPosition`, `compare`,
`summary`, `fxExposure`, `transactionFailed`/`paymentFailed`) were split out during
tuning to stop them tying with a sibling intent's shared base vocabulary — see
[`semantic-engine.md`](./semantic-engine.md#known-limitations) for why, including the
two cases that needed a *second* split after the first (a still-too-generic concept
colliding across unrelated domains, not just within one).

Concept design principle learned the hard way: **a concept shared by two intents makes
them indistinguishable whenever only that shared concept matches.** Narrower intents
(a superlative, an expiry filter, an "outstanding" query) get their *own* concept
instead of layering onto a broader one.

## 5. Business Briefing (extension, not a core intent)

`BUSINESS_BRIEFING` aggregates six independent datasets into one answer: account
balances (Account), today's incoming/outgoing (CashFlow via Transaction), the pending
approval queue (Approval), open alerts (Alert), and LCs expiring soon
(LetterOfCredit). It's callable directly via `GET /api/virtual-rm/briefing` or
`businessBriefing()` in `semantic-engine.ts`, bypassing intent detection entirely —
there's no ambiguity to resolve since the caller isn't asking a question, just
requesting the standard daily summary.

## 6. Supporting packs

| File | What it defines |
|---|---|
| `business-terms.json` | Glossary: availableBalance, outstanding, maturityDate, valueDate, ... |
| `status-definitions.json` | 11 canonical statuses + a Vietnamese phrase → status map |
| `transaction-types.json` | PAYROLL, TAX, FX, TRADE_FINANCE, ... transaction categories |
| `payment-types.json` | SINGLE_TRANSFER, BATCH_TRANSFER, INTERNAL, INTERBANK, FX_PAYMENT |
| `trade-finance.json` | LC / Bank Guarantee / Collection instrument definitions + guarantee sub-types |
| `product-categories.json` | Product category → existing `products.json` record id |
| `user-roles.json` | Maker/Checker/Admin definitions |
| `date-periods.json` | 14 periods covering all 15 example phrases from the spec (YTD and "từ đầu năm" are the same period) |
| `amount-operators.json` | GT/GTE/LT/LTE/EQ/BETWEEN + magnitude units (nghìn/triệu/tỷ) + currencies |
| `semantic-rules.json` | Scoring weights, confidence threshold, normalization steps/abbreviations |
| `navigation-actions.json` | 16 actions → real Angular routes in this app |

## 7. Mock data extensions (server/data)

The original app only had `customer/accounts/transactions/tasks/alerts/products/
recommendations`. This pack added, with matching TypeScript models
(`server/src/models/index.ts`) and repositories (`server/src/repositories/
semantic-data.repository.ts`):

`payment-orders.json`, `approvals.json`, `payrolls.json`, `fx-rates.json`,
`fx-deals.json`, `letter-of-credits.json`, `bank-guarantees.json`, `collections.json`,
`loans.json`, `credit-limits.json`, `receivables.json`, `payables.json`.

`receivables.json`/`payables.json` weren't explicitly named in the original spec's §24
extension list, but were added anyway — the cross-domain cash-flow questions in §22/§23
need real receivable/payable records to combine with Loan data, not placeholders.

All of it resets via the existing Admin "Reset Demo Data" action (every new repository
is registered in `resettableRepositories`, except `fx-rates.json`, which is static
reference data with no admin edit path).
