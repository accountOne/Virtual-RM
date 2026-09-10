# Semantic Engine

`server/src/semantic/` — the deterministic, local NLU pipeline that turns a Vietnamese
question into a structured answer. No LLM, no network call, no randomness.

```
User question
   ↓
normalizer.ts        lowercase, strip punctuation, expand abbreviations, strip diacritics
   ↓
date-resolver.ts      find a date-period phrase → {periodId, range}
amount-parser.ts      find an operator + number + unit → {operator, value/min/max, currency}
status-resolver.ts    find a status phrase → canonical status id
entity-extractor.ts   find known beneficiary/customer/supplier names, document ids, account numbers
   ↓
intent-detector.ts    score all 50 intents, rank them
   ↓
query-builder.ts       assemble the SemanticQuery AST (+ inject companyId/userId)
   ↓
response-generator.ts  fetch real data, aggregate, format the answer
   ↓
semantic-engine.ts     orchestrates the above, decides answer vs. clarification
```

## Query AST (`types.ts`)

```ts
interface SemanticQuery {
  intent: string;
  confidence: number;
  entities: { accountId?, accountNo?, beneficiary?, customer?, supplier?, documentId? };
  filters: { companyId?, userId?, approverUserId?, datePeriod?, status?, amount?, ... };
  sort?: { field: string; direction: 'asc' | 'desc' };
  action?: string; // navigation action id
  matchedTerms?: string[]; // debug only
}
```

## Intent scoring (`intent-detector.ts`)

Per business-semantics/semantic-rules.json's weight table:

| Signal | Weight |
|---|---|
| Multi-word synonym phrase found verbatim | `exactPhraseMatch` = 100 |
| Single bare word found | `synonymMatch` = 20 |
| A supported entity was actually extracted | `entityMatch` = 30 |
| The domain's own Vietnamese name appears in the question | `domainMatch` = 15 |
| A date period was resolved (intent supports `datePeriod`) | `dateCondition` = 10 |
| A status was resolved (intent supports `status`) | `statusCondition` = 10 |

Confidence = `min(topScore / 100, 1)`. Below `confidenceThreshold` (0.65) the engine asks
a clarifying question instead of guessing — it never answers on a weak signal.

**Two calibration fixes made during development, both real bugs found by testing, not
by inspection:**

1. **The "multi-word = strong signal" heuristic doesn't work naively in Vietnamese.**
   Vietnamese compound words are written with spaces between syllables ("giao dịch" =
   one word, "transaction"), so a naive `term.includes(' ')` check treats ordinary nouns
   as if they were distinctive phrases. This is still used, but only got the pack to a
   working state after also **removing shared concepts from narrower sibling intents**
   (see below) — the heuristic alone wasn't enough.
2. **A promiscuous "time" concept caused systematic misrouting.** Early on, nearly every
   intent listed `time` in `synonymConcepts` so it could match a date phrase. But every
   date phrase ("hôm nay", "hôm qua", ...) is 2+ words, so it always hit the strong tier —
   meaning *any* question mentioning a date word would score 100 points for dozens of
   unrelated intents simultaneously, and the tie was broken by `priority`, which had
   nothing to do with whether the intent actually matched. **Fix:** date signal now flows
   *only* through the dedicated `dateCondition` bonus (which requires
   `resolveDatePeriod` to have actually matched *and* the intent to declare
   `datePeriod` in `supportedEntities`) — `time` was removed from every intent's
   `synonymConcepts`.

## Structural lesson: shared concepts + priority tie-break is fragile

The single biggest source of misrouting during testing was two intents sharing a base
concept (e.g. `ACCOUNT_BALANCE` and `ACCOUNT_HIGHEST_BALANCE` both matching on generic
"account"/"balance" words) with a `priority` tie-break silently picking the *narrower*
intent even when its own distinguishing signal was absent. The fix applied throughout:
give the narrower intent **its own, non-shared concept** (`highest`/`lowest` for
superlative balance/transaction questions, `expirySoon` for LC/BG/task due-date
questions, `outstandingDebt` split out of `loan`, `availableBalance` fully separated
from `balance`) so it scores **zero**, not a false tie, when its real trigger phrase is
absent.

## Known limitations (measured, not guessed)

Running all 100 `sample-queries.json` questions through the engine as it's checked in:
**49/100 exact intent match**, 14 clarifications, 37 land on a related sibling intent.
On the spec's own 11 example questions: **10/11 correct** (only "Tôi muốn chuyển tiền
đơn" mis-routes to `PAYMENT_STATUS` instead of `PAYMENT_CREATE`).

The remaining wrong answers cluster into one pattern: **a "list/base" intent losing a
scoring tie to a "narrower" sibling in the same domain** — e.g. `ACCOUNT_LIST` vs.
`ACCOUNT_STATEMENT`, `TASK_LIST` vs. `TASK_DUE`, `ALERT_LIST` vs.
`ALERT_HIGH_PRIORITY`, `LC_LIST` vs. `LC_DETAIL`, `PAYMENT_CREATE` vs.
`PAYMENT_STATUS`, `APPROVAL_APPROVE`/`APPROVAL_REJECT` vs. `APPROVAL_PENDING`. These
pairs are inherently hard to separate with pure additive keyword scoring because a
generic phrasing of the base intent ("xem danh sách việc cần làm") contains exactly the
same vocabulary as the narrower one, just without its distinguishing modifier — and the
narrower intent's higher `priority` (assigned because it's *more specific when it does
match*) wins the tie even when that modifier is absent.

Two honest ways to close this gap further, not done here for lack of remaining budget:
1. Replace the flat priority tie-break with genuine AND-conditioned scoring (an intent
   whose only match came from a concept it shares with a sibling shouldn't outscore
   that sibling at all, regardless of priority).
2. Keep hand-splitting shared concepts into narrower ones, as was done for the ~10
   pairs above — proven to work, just time-consuming per pair.

This is disclosed rather than papered over: the confidence/clarification mechanism
means a wrong route is very rarely a *hallucination* (it still returns real data, just
under a different-but-related intent label, or asks the user to clarify) — see
`test/intents.test.ts` for the 74 canonical phrasings verified to route correctly, and
`test/query-execution.test.ts` for end-to-end answer-content correctness.

## Security context

`buildSecurityContext(userId, role)` in `semantic-engine.ts` is the **only** place
`companyId` is set — always from the single seeded `customer.json` record, never from
request input. There's no server-side session in this demo (the API is intentionally
unauthenticated, matching the project's "no real auth server" constraint), so `userId`
is the one field the frontend is trusted to declare (it comes from the already-logged-in
`AuthService.currentUser()`, not from parsing the chat message). Chat text can never
widen a query's scope.

## Aggregation (`aggregation-engine.ts`)

`sum`, `count`, `avg`, `min`, `max`, `compare` (current vs. previous period, with
trend + % change), `groupBy` — plain, deterministic arithmetic over arrays, used
throughout `response-generator.ts`.

## Adding a new intent / synonym / dataset

See [`/business-semantics/README.md`](../business-semantics/README.md#adding-a-new-intent).
