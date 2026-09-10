# Phase 5 Architecture — AI Reasoning & Proactive Virtual RM

What actually got built, file by file, and how it composes with everything from before
Phase 5 (the Business Banking Semantic Pack — see `docs/semantic-engine.md`). Read
`docs/phase-5-analysis.md` first for *why* each piece exists and what it reuses.

## Request flow

```
POST /api/virtual-rm/query { message, userId, role }
  │
  ▼
semantic.controller.ts
  │  buildSecurityContext(userId, role) — companyId always server-derived, never from
  │  request body or message text (unchanged from before Phase 5)
  │
  ├─▶ isBriefingRequest(message)? ──▶ businessBriefing(security)            [return]
  │
  ├─▶ resolveCurrencyFollowUp(message, userId)?
  │     (conversation-context.ts: previous turn was an account-balance intent
  │      + this message is a short currency-only follow-up)
  │     ──▶ buildQuery(previousIntent) + generateAnswer() with a currency filter [return]
  │
  ├─▶ answerQuery(message, security)          — existing 50-intent Semantic Engine,
  │     (semantic-engine.ts, unchanged)          untouched from before Phase 5
  │
  ▼
routeQuery(message, resolvedIntent, aiConfig)   — model-router.ts
  │
  ├─▶ reasoningRequired: false ──▶ return the Semantic Engine's answer as-is   [return]
  │
  ▼  reasoningRequired: true, useCase: ReasoningUseCase
runReasoning({ useCase, security, anchorToday, navigationActions, config })
  │                                                — reasoning-engine.ts
  ├─▶ Tool Layer (server/src/tools) — security-scoped repository reads
  ├─▶ Calculation Engine (server/src/calculation) — NET_CASHFLOW/LIQUIDITY_GAP/
  │     CASH_BUFFER/rankByUrgency, over the tool results
  └─▶ AIProvider.reason({ useCase, goal, facts }) — ai-client.ts's getAiProvider()
        (MockReasoningProvider today; phrases the facts, never computes new ones)
  │
  ▼
SemanticAnswer { title, summary, metrics, records, insights?, recommendation?, action }
  │
  ▼
setConversationContext(userId, { lastIntent: useCase })
  │
  ▼
res.json({ success, semantic: { intent, confidence, reasoningRequired, reasoning? }, answer })
```

Everything left of `routeQuery` is exactly what existed before Phase 5. A simple query
(the ~46 intents the router doesn't touch) never enters the reasoning path at all —
`reasoningRequired: false` is the overwhelming common case, matching spec §30's "don't
call the model for every question."

## Directory layout

```
server/src/
├── ai/
│   ├── types.ts                  AIProvider/UserContext/ReasoningRequest/-Response, AIConfig
│   ├── ai-client.ts               loadAiConfig() (env vars) + getAiProvider() factory
│   ├── mock-reasoning-provider.ts the deterministic fallback (see below)
│   ├── model-router.ts            routeQuery() — deterministic simple-vs-reasoning rules
│   ├── reasoning-engine.ts        runReasoning() — the 6 use cases, plan → tools → calc → phrase
│   └── conversation-context.ts    in-memory per-userId last-intent store + currency follow-up
│
├── tools/
│   └── index.ts                   22 named tools (Tool<Params,Result>), each a thin,
│                                   security-scoped wrapper over one repository
│
├── calculation/
│   └── financial-calculations.ts  NET_CASHFLOW, PROJECTED_CASH, LIQUIDITY_GAP, CASH_BUFFER,
│                                   OUTSTANDING, rankByUrgency — built on the pre-existing
│                                   semantic/aggregation-engine.ts primitives
│
├── semantic/                      unchanged except two additive spots:
│   ├── response-generator.ts        + insights on BUSINESS_BRIEFING (calls calculation engine)
│   │                                 + currency-filter support on ACCOUNT_HIGHEST/LOWEST_BALANCE
│   │                                   (for the multi-turn follow-up to have something to filter)
│   └── semantic-engine.ts           + getNavigationActions()/getIntentDef() accessors
│
└── controllers/
    └── semantic.controller.ts     wires all of the above into POST /api/virtual-rm/query
```

One file did NOT get the spec's literal per-domain split (`account-tool.ts`,
`transaction-tool.ts`, ... one calculation file per formula): the Tool Layer and
Calculation Engine are each one file. `response-generator.ts` — the closest existing
precedent in this codebase for "many small handlers of a similar shape" — is also one
big, section-commented file, so this matches the codebase's existing convention rather
than introducing a new file-per-thing pattern for no functional reason. Splitting further
is a pure refactor with no behavior change if a future pass wants the literal file layout.

## AI provider abstraction

```typescript
interface AIProvider {
  readonly name: string;
  chat(request: AIRequest): Promise<AIResponse>;
  reason(request: ReasoningRequest): Promise<ReasoningResponse>;
}
```

`getAiProvider()` (`ai-client.ts`) returns `MockReasoningProvider` whenever `AI_API_KEY`
is unset — which is always true in this environment, since no key is committed. The mock
provider **never calls a model**: `reason()` looks up a Vietnamese string template by
`useCase` and interpolates the `facts` object the Reasoning Engine already computed. This
is what makes the no-hallucination policy (spec §21) trivially true today — there is no
generative step in the path at all, only string formatting of numbers computed
deterministically by the Calculation Engine.

### Plugging in a real provider later

1. Implement `AIProvider` for the target service (e.g. `ClaudeProvider`,
   `OpenAiProvider`) — `reason()` still receives the exact same `{ useCase, goal, facts }`
   shape; the contract is "phrase these facts naturally," not "go find the facts
   yourself." A real provider is free to phrase more naturally than the mock's fixed
   templates, but must not introduce new numbers.
2. Add one `case` in `ai-client.ts`'s `getAiProvider()` matching `config.provider`,
   constructing the real client from `config.apiKey`/`config.baseUrl`/`config.model`.
3. Set `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` (and `AI_BASE_URL` if needed) — see
   `.env.example`. Nothing else changes: the Model Router, Tool Layer, Calculation
   Engine, and every call site are already written against the `AIProvider` interface.

`chat()` exists on the interface for a future free-form use (e.g. an open-ended
follow-up question the deterministic use cases don't cover) but nothing in this pass
calls it — every implemented use case goes through the structured `reason()` path so its
output stays auditable (title/summary/insights/recommendation, not arbitrary prose).

## Model Router rules

`routeQuery(rawMessage, resolvedIntent, config)` — see `model-router.ts`'s own doc
comment for the exact rule list. Two categories:

1. **Keyword triggers independent of the resolved intent** — for the handful of
   spec-example questions ("Có đủ tiền trả các khoản sắp tới không?", "nên ưu tiên thanh
   toán", "nên duyệt giao dịch nào trước", "tiền nhàn rỗi") that the original 50-intent
   pack has no dedicated intent for, or where a wrong 50-intent resolution (the
   diacritic-collision limitation documented in `docs/semantic-engine.md`) shouldn't be
   allowed to also suppress the reasoning trigger.
2. **A resolved intent, refined by keyword** — `CASH_FLOW_SUMMARY`/`CASH_FLOW_COMPARE`
   always mean "analyze," `CASH_POSITION` only means "analyze idle cash" when the message
   actually says so, `PRODUCT_RECOMMEND` only reasons when cashflow/liquidity wording is
   present (a plain "gợi ý sản phẩm gì" stays on the existing deterministic list).

`AI_REASONING_ENABLED=false` short-circuits every rule to `reasoningRequired: false` —
the kill switch specified in §5/§30.

## Tool Layer

22 tools (`server/src/tools/index.ts`), each `{ name, description, execute(ctx, params) }`.
`ctx: UserContext` is always the server-derived `{ companyId, userId, role }` — never
constructed from request/message input (see `ai/types.ts::toUserContext`, which maps
`SecurityContext` 1:1). This demo's data is single-tenant (one seeded customer — see
`semantic-engine.ts::buildSecurityContext`'s own comment), so no tool body actually
filters by `companyId` today; the boundary exists so a multi-tenant backend swap-in only
touches tool bodies, not every call site. `server/test/security-isolation.test.ts` proves
the isolation guarantees that do apply today (server-derived companyId/userId/
approverUserId, never overridable by request or message content).

Not a JSON-Schema-validated tool-calling protocol (no LLM here actually emits tool calls
to validate — the Reasoning Engine's plans are declared in code, not produced by a
model) — TypeScript's own `Tool<Params, Result>` generic is the schema. Adding a real
function-calling provider later would mean generating a JSON schema from these same
param/result types, not redesigning the tools themselves.

## Calculation Engine

`server/src/calculation/financial-calculations.ts`. Five formulas plus a ranking
function, all pure and unit-tested (`server/test/calculation-engine.test.ts`):

| Function | Formula |
|---|---|
| `calculateNetCashflow` | incoming − outgoing, with a tăng/giảm/cân bằng-style trend label |
| `calculateProjectedCash` | current + receivables − payables − loan obligations (spec §10's worked example, verbatim) |
| `calculateLiquidityGap` | available cash − (payables + loan obligations); `sufficient: gap >= 0` |
| `calculateCashBuffer` | current + incoming − outgoing − (15% safety buffer), floored at 0 |
| `calculateOutstanding` | sum of `outstanding` over ACTIVE loans only |
| `rankByUrgency` | HIGH (due ≤1 day or amount ≥5 tỷ) → MEDIUM (due ≤3 days) → LOW, then soonest-due, then largest-amount |

One data-modeling wrinkle both `LIQUIDITY_ANALYSIS` and the business briefing's insight
line handle explicitly: this demo's `payables.json` records a loan installment
("MSB - Phòng Tín dụng", `relatedInvoice: "LN-2025-007"`) that is the *same* real-world
obligation as `loans.json`'s `loan-001` (same `loanNumber`, same due date). Summing
payables and loan obligations independently would double-count it — both call sites
filter out a payable whose `relatedInvoice` matches an in-window loan's `loanNumber`
before summing. Found and fixed by actually running the numbers against seeded data
(§ "Verification" below), not by inspection.

## Multi-turn context

`server/src/ai/conversation-context.ts` — an in-memory `Map<userId, ConversationState>`
holding only `{ lastIntent, lastCurrency, updatedAt }`. This demo's API is otherwise
stateless per request by design (no server session — see
`semantic-engine.ts::buildSecurityContext`'s comment), so this is a narrow, explicit
exception: no message text is stored, nothing survives a server restart, and it's wiped
per-test via `_resetConversationContextForTests()`.

Two follow-up patterns are recognized:
1. **Currency follow-up** — a short (≤6-word) message naming a currency code right after
   one of the four account-balance intents replays that same intent with the new
   currency filter, entirely at the controller level (bypasses intent detection for that
   turn). `ACCOUNT_HIGHEST_BALANCE`/`ACCOUNT_LOWEST_BALANCE` gained real currency-filter
   support in `response-generator.ts` to make this meaningful (previously they ignored
   currency and just took the overall max/min).
2. **"Có nên chuyển bớt sang tiền gửi không?"** (spec §17's third example) — routed by
   the Model Router as a standalone keyword trigger rather than requiring stored context,
   since the phrase is self-descriptive on its own.

## Debug metadata (`SEMANTIC_DEBUG=true`)

```json
{
  "semantic": {
    "intent": "LIQUIDITY_ANALYSIS",
    "confidence": 1,
    "reasoningRequired": true,
    "reasoning": {
      "useCase": "LIQUIDITY_ANALYSIS",
      "plan": ["get_cash_position", "get_payables", "get_loan_obligations"],
      "toolsUsed": ["get_cash_position", "get_payables", "get_loan_obligations"],
      "calculationsUsed": ["LIQUIDITY_GAP"]
    }
  }
}
```

No chain-of-thought is ever exposed — there isn't one to expose, since the mock provider
does no generation, only template interpolation. When a real provider is added later,
`reasoning-engine.ts` is the single place that would need to make sure only this
structured summary (not the provider's raw output/reasoning trace) reaches the response.

## Verification performed

- `npm run test:semantic` (from repo root) — 326/326 passing, including 6 new suites
  (model router, tool layer, calculation engine, reasoning engine end-to-end, multi-turn
  context, security isolation — 83 new tests total).
- `npm run validate:semantic` — still passes (0 errors).
- `npm run build:server` / `npm run build` — both clean.
- All 6 reasoning use cases, the business briefing insight, and the multi-turn currency
  follow-up were run against the **real running server** over real HTTP (not just unit
  tests) — this is how the payable/loan double-counting bug above was actually caught: a
  unit test with hand-built fixtures wouldn't have had that specific data shape.
- 12 of the spec's 15 demo scenarios (§27) were run end-to-end during this verification
  pass; see `docs/phase-5-demo-script.md` for the full 15 with actual observed output and
  `docs/phase-5-evaluation.md` for what's measured vs. still a known gap.
