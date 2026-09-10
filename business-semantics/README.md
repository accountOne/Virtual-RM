# Business Banking Semantic Pack

Deterministic, local semantic data pack that powers Virtual RM's natural-language
understanding for Vietnamese corporate/business banking questions. No LLM, no external
service — every file here is static JSON, loaded once at server startup by
`server/src/semantic/semantic-engine.ts`.

## Files

| File | Purpose | Count |
|---|---|---|
| `domains.json` | 13 business domains grouping intents | 13 |
| `entities.json` | 30 business entities (nouns the engine reasons about) | 30 |
| `intents.json` | 50 intents — the core of the pack | 50 |
| `synonyms.json` | 50 concepts → 432 Vietnamese synonym terms | ≥300 |
| `business-terms.json` | Glossary of business-banking terminology (availableBalance, outstanding, maturityDate...) | — |
| `status-definitions.json` | Canonical status codes + Vietnamese phrase → status map | — |
| `transaction-types.json` | Transaction categories (PAYROLL, TAX, FX, ...) | — |
| `payment-types.json` | Payment order types (single/batch/internal/interbank/FX) | — |
| `trade-finance.json` | LC / Bank Guarantee / Collection instrument definitions | — |
| `product-categories.json` | Maps product category → existing `products.json` record | — |
| `user-roles.json` | Maker/Checker/Admin role definitions | — |
| `date-periods.json` | 14 date periods covering the 15 example phrases from the spec (YTD and "từ đầu năm" share one period) | 14 |
| `amount-operators.json` | Amount comparison operators, magnitude units, currencies | — |
| `semantic-rules.json` | Intent-scoring weights, confidence threshold, normalization rules | — |
| `intent-entity-map.json` | Generated reverse index: extractable field → intents that use it | — |
| `sample-queries.json` | 100 Vietnamese sample questions with expected intent, used by the test suite | 100 |
| `response-templates.json` | Title/summary copy per intent, filled in by `response-generator.ts` | 50 (+2 extra: BUSINESS_BRIEFING, UNKNOWN) |
| `navigation-actions.json` | 16 navigation actions → Angular routes | 16 |

Run `npm run validate:semantic` (from the repo root) to check all counts, duplicate IDs,
and cross-file references — see `/scripts/validate-semantic-pack.ts`.

## Design notes / deliberate simplifications

- **50 intents vs. the 48 explicitly IDed in the original spec.** The spec text said
  "exactly 50" but only listed 48 intent IDs, and the `CUSTOMER_SERVICE` domain had no
  intents at all. `GREETING` and `HELP` were added to fill both gaps — every chat needs
  a greeting/help path, and they naturally belong to `CUSTOMER_SERVICE`.
- **`BUSINESS_BRIEFING`** is intentionally *not* one of the 50 core intents — per the
  original spec, it's implemented as an extension on top of them (see
  `docs/semantic-engine.md`).
- **`responseTemplate` is 1:1 with intent ID** for all 50 intents, keeping the
  reference simple and trivially validatable, rather than introducing a separate
  many-to-few template taxonomy.
- **`OPEN_LC` / `OPEN_GUARANTEE` / `OPEN_COLLECTION` / `OPEN_PAYROLL`** navigate to the
  closest existing screen (`/products`, `/payments`) because this demo doesn't have
  dedicated LC/Guarantee/Collection/Payroll pages yet — see the `note` field on those
  entries in `navigation-actions.json`.
- **Receivable/Payable** have small dedicated mock datasets
  (`server/data/receivables.json`, `payables.json`) even though the original spec's
  §24 extension list didn't name them explicitly — they're needed for the
  cross-domain cash-flow questions in §22/§23 to return real numbers instead of
  placeholders.

## Adding a new intent

1. Add an entry to `intents.json` (unique `id`, valid `domain`/`entity` refs, a
   `responseTemplate` id).
2. Add a matching entry to `response-templates.json` with that same id.
3. Add a case to `server/src/semantic/query-builder.ts` (how the intent turns into a
   dataset query) and `server/src/semantic/response-generator.ts` (how the result
   turns into a title/summary/metrics).
4. Add a few example questions to `sample-queries.json`.
5. Run `npm run validate:semantic` and the server test suite.

## Adding synonyms

Add terms to the relevant concept array in `synonyms.json` (or a new concept key), then
reference that concept id from any intent's `synonymConcepts`. Run
`npm run validate:semantic` to confirm there are no duplicate terms.
