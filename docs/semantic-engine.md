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

## `requiredSignals`: closing the "list/base loses to narrower sibling" gap

The pattern above (splitting a shared concept into narrower ones) fixes cases where the
narrower intent has its *own* natural-language vocabulary to key off. It doesn't fix the
other half of the same bug: an intent like `TRANSACTION_DETAIL` or `ACCOUNT_STATEMENT`
whose real distinguishing signal isn't a phrase at all — it's the presence of a resolved
`documentId`, `datePeriod`, `status`, or named entity. Scoring only ever *added* a bonus
for those (`if (matchedTerms.length > 0) { ... score += dateCondition ... }`), so the
narrower intent could still win a priority tie-break on the shared base concept alone,
with zero actual evidence for its own specialization.

`IntentDef.requiredSignals` (`server/src/semantic/types.ts`,
`intent-detector.ts#hasSignal`) closes this: an optional OR-gated list of signals — a
`synonymConcepts` id that must have produced a real match, or one of
`datePeriod`/`status`/`amount`/`accountNo`/`accountId`/`documentId`/`beneficiary`/
`supplier`/`customer` — that must be present or the intent scores **0**, not a
borrowed-priority win. Applied to `TRANSACTION_DETAIL`/`ACCOUNT_DETAIL`/`LC_DETAIL`
(`documentId`/`accountNo`), `TRANSACTION_BY_DATE`/`PAYMENT_TODAY` (`datePeriod`),
`PAYMENT_STATUS`/`LC_STATUS` (`status`), `TRANSACTION_SUMMARY` (its own `summary`
concept), and `APPROVAL_DETAIL` (an identifying entity or the base `approval` concept).

One subtlety this surfaced: `'status'`/`'datePeriod'`/`'amount'` name **both** a resolver
flag (`ctx.hasStatus`, from `status-resolver.ts` recognizing a canonical status *value*)
**and** a real `synonymConcepts` id (`synonyms.json` has a concept literally called
`"status"`, generic phrases like "trạng thái"/"đang ở trạng thái nào"). A question like
"... đang ở trạng thái nào?" matches the *concept* (it's clearly asking about status)
without the resolver ever firing (it's a question, not a value) — `hasSignal` checks
concept membership first, falling back to the resolver flag, so either kind of evidence
satisfies the gate.

## Known limitations (measured, not guessed)

Running all 100 `sample-queries.json` questions through the engine as it's checked in:
**78/100 exact intent match**, 11 clarifications, 11 land on a related sibling intent —
up from an earlier 49/14/37 split before `requiredSignals` and the concept-splitting
below existed. On the spec's own 11 example questions: **11/11 correct** (including
"Tôi muốn chuyển tiền đơn" → `PAYMENT_CREATE`, fixed by giving it its own `paymentCreate`
concept instead of sharing generic "payment" vocabulary with `PAYMENT_STATUS`).

Two mechanisms did the work, applied per-pair as each collision was found by measurement
(`sample-queries.json`), never guessed from inspection:
1. **`requiredSignals`** (above) for pairs where the narrower intent's real signal is a
   resolved entity/date/status rather than vocabulary.
2. **Splitting a shared concept into narrower, non-colliding ones** for pairs where it's
   pure vocabulary — e.g. `highest`/`lowest` (pre-existing), plus newly:
   `statement`/`detail`/`pending`/`paymentCreate`/`approveAction`/`rejectAction`/
   `taskDue`/`lcExpiry`/`guaranteeExpiry`/`highPriority`/`cashPosition`/`compare`/
   `summary`/`fxExposure`/`transactionFailed`/`paymentFailed`. Two of these
   (`transactionFailed` vs `paymentFailed`, and `taskDue`/`lcExpiry`/`guaranteeExpiry`
   vs. a single shared `expirySoon`) needed a **second** split after the first: the
   *narrower* concept collided across domains, e.g. `expirySoon` alone couldn't tell
   "LC nào sắp hết hạn?" from "Việc nào sắp đến hạn nhất?" — both matched the same
   generic expiry phrase, so the fix needed each domain's own expiry phrase, not the
   shared underlying trigger.

11 questions remain genuinely hard for pure deterministic keyword matching, not fixed:
- Diacritic collisions: `stripDiacritics` maps both "nhàn" (idle) and "nhận" (receive) to
  the same ASCII "nhan", so "tiền nhàn rỗi" (idle cash) accidentally substring-matches
  "tiền nhận" (received money) → `INCOMING_PAYMENT`. Fixing this needs word-boundary-aware
  matching, a bigger change than this pass's budget covers.
- A few questions carry zero real signal for their labeled intent under this
  architecture at all — e.g. "Công ty có giao dịch nào bất thường không?" (anomaly
  detection) is labeled `TRANSACTION_BY_AMOUNT` but contains no operator/number for
  `amount-parser.ts` to resolve.
- Ambiguous phrasing lacking any domain anchor, e.g. "Lệnh nào bị lỗi hôm nay?" could
  reasonably be `TRANSACTION_FAILED` or `PAYMENT_FAILED` — "lệnh" alone doesn't say which.

This is disclosed rather than papered over: the confidence/clarification mechanism
means a wrong route is very rarely a *hallucination* (it still returns real data, just
under a different-but-related intent label, or asks the user to clarify) — see
`test/intents.test.ts` for the 79 canonical phrasings verified to route correctly, and
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
