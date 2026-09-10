# Phase 5 Evaluation Matrix

Honest pass/fail against spec §29, plus what each row is actually backed by (a specific
test file, or a manual HTTP verification run during this pass — see
`docs/phase-5-architecture.md` #Verification performed). "Pass" means demonstrated
working against real seeded data, not "code exists that should do this."

| Capability | Status | Evidence |
|---|---|---|
| Intent detection | ✅ Pass | Pre-existing (`test/intents.test.ts`, 88 tests); unchanged by Phase 5 |
| Simple query | ✅ Pass | `test/query-execution.test.ts` + all pre-Phase-5 suites; router leaves these untouched |
| Complex query | ✅ Pass | `test/model-router.test.ts` (20 tests) + `test/reasoning-engine.test.ts` (10 tests) |
| Tool calling | ✅ Pass | `test/tools.test.ts` (21 tests) — 22 tools, all backed by real repositories |
| Multi-step reasoning | ✅ Pass | `LIQUIDITY_ANALYSIS` (3 tools), `PRODUCT_RECOMMENDATION_REASONING` (5 tools) — see `reasoning-engine.ts`'s `PLANS` map |
| Financial calculation | ✅ Pass | `test/calculation-engine.test.ts` (11 tests) — NET_CASHFLOW/PROJECTED_CASH/LIQUIDITY_GAP/CASH_BUFFER/OUTSTANDING/rankByUrgency |
| Cross-domain reasoning | ✅ Pass | `LIQUIDITY_ANALYSIS` combines accounts+payables+loans; `PRODUCT_RECOMMENDATION_REASONING` combines accounts+receivables+payables+recommendations+products |
| Multi-turn context | ✅ Pass (narrow) | `test/conversation-context.test.ts` (10 tests) + live HTTP verification of spec §17's exact 3-turn example. Only the currency-follow-up and one keyword-triggered pattern are handled — see "Known limitations" |
| Recommendation | ✅ Pass | `IDLE_CASH_ANALYSIS` / `PRODUCT_RECOMMENDATION_REASONING` — only ever recommends products/recommendations that exist in `products.json`/`recommendations.json`, verified by `reasoning-engine.test.ts`'s "never invents a product name" test |
| Business briefing | ✅ Pass | Pre-existing endpoint + new RM Insight line (live-verified, double-counting bug caught and fixed during verification) |
| Security isolation | ✅ Pass | `test/security-isolation.test.ts` (11 tests) — companyId/userId/approverUserId always server-derived; a forged param a hostile caller could bypass TypeScript to pass is proven ignored |
| No hallucination | ✅ Pass (by construction) | The mock provider does no generation — every number in every answer traces to a repository read + a Calculation Engine function; see `docs/phase-5-architecture.md` #AI-provider-abstraction |
| Navigation | ✅ Pass | Every reasoning answer carries a `NAVIGATE` action (`reasoning-engine.test.ts`'s "never a dead end" test) |
| UX | ✅ Pass (scoped) | Reasoning indicator text, insight/recommendation lines, 4 quick-action chips — inside the existing chat bubble/component, no redesign (per spec §25's own instruction) |

## What "AI reasoning" means in this build, concretely

There is no LLM call anywhere in this pass — `AI_API_KEY` is unset in this environment
(no secret exists to test one against), so `getAiProvider()` always returns the
deterministic `MockReasoningProvider`. What "reasoning" means here is: **the Model
Router recognizes a question needs more than one dataset and a formula, assembles a
bounded tool-call plan, executes it, runs the Calculation Engine over the results, and
phrases the outcome** — all deterministic, all traceable, all tested against real seeded
data. The `AIProvider` abstraction is real and load-bearing (see architecture doc for how
a real model slots in later), but no external model traffic happened during this build.
This is stated plainly rather than implied otherwise.

## Known limitations (measured, not guessed)

- **Multi-turn context is narrow.** Only the currency-follow-up pattern (§17's first two
  turns) is stored/replayed via `conversation-context.ts`; the third turn ("Có nên
  chuyển bớt sang tiền gửi không?") works via a standalone keyword trigger in the Model
  Router, not by actually reading stored context. A generic "remember what we were
  talking about and let any follow-up reference it" capability was not built — this
  demo's stateless-by-design API (see `semantic-engine.ts`'s own comment) was extended
  just enough for the spec's own example, not further.
- **No dedicated TASK_PRIORITIZATION reasoning use case.** "Hôm nay tôi nên xử lý việc
  gì trước?" is answered by the existing deterministic `TASK_DUE` intent (already sorts
  by due date) with an expanded trigger-phrase list, not by a new Reasoning Engine use
  case with its own urgency ranking like payment/approval prioritization got. This was a
  deliberate scope decision (documented in `docs/phase-5-analysis.md` #5), not an
  oversight — `rankByUrgency` would apply to tasks the same way it does to payments if a
  future pass wants true task-priority reasoning.
- **~14 of the spec's full ~20-tool list weren't independently exercised.** All 22 tools
  in `tools/index.ts` are real and tested (`tools.test.ts`), but several
  (`get_bank_guarantees`, `get_collections`, `get_credit_limits`, ...) aren't called by
  any of the 6 built reasoning use cases yet — they exist and pass their own tests, but
  have no reasoning use case consuming them in this pass.
- **The diacritic-collision limitation from before Phase 5 still exists** ("tiền nhàn
  rỗi" vs. "tiền nhận" — see `docs/semantic-engine.md` #Known limitations). Phase 5
  worked around its effect on the idle-cash reasoning trigger specifically (the Model
  Router's keyword check no longer depends on the 50-intent engine having resolved
  correctly first), but the underlying Semantic Engine mis-resolution for that one phrase
  is unfixed — fixing it needs word-boundary-aware matching, out of this pass's scope.
- **A handful of natural phrasings still fall to CLARIFICATION_NEEDED** — e.g. "LC nào
  cần chú ý?" (too vague — LC_EXPIRY needs "sắp hết hạn"-style wording; correctly asking
  for clarification rather than guessing is the intended no-hallucination behavior here,
  not a bug, but it means that exact phrasing isn't demo-ready — "LC nào sắp hết hạn?"
  is).
- **No real AI provider was implemented or tested** (see above) — the interface and env
  contract are ready, but this is a genuine gap against the spec's "AI Reasoning" framing,
  disclosed rather than glossed over.

## Regression safety

326/326 tests pass (243 pre-existing + 83 new), `npm run validate:semantic` passes,
both `npm run build:server` and `npm run build` are clean. The pre-Phase-5 test count and
the 78/100 sample-query / 11/11 spec-example measurements from the previous pass were
re-verified unchanged after Phase 5's synonym additions (taskDue/cashPosition got a few
new trigger phrases for two demo scenarios — see `docs/phase-5-demo-script.md`).
