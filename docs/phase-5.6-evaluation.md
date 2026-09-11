# Phase 5.6 — Evaluation

## Build & test results (actual, this run)

| Command | Result |
|---|---|
| `npm run build` (Angular) | ✅ clean, 0 errors, initial bundle 422.54 kB / 114.56 kB transfer — unchanged in shape from pre-Phase-5.6 |
| `npm run build:server` (`tsc`) | ✅ clean, 0 errors |
| `npm run test:semantic` (backend, pre-existing suite) | ✅ 551/551 passed — untouched by this phase, still green |
| `npm run test:interaction` (new, this phase) | ✅ 36/36 passed |
| Live Playwright walkthrough (login → proactive greeting → ask → context-aware follow-up → CTA nav) | ✅ all 4 flows verified against the running app, screenshots captured |

## Test count vs. spec's 170+/17-category ask

The spec's 40-section prompt asks for 170+ tests across 17 named categories. This pass ships
**36 tests**, all for the interaction layer's pure, DI-free logic:

- `message-builder.test.ts` (18) — every branch of `buildRmMessages()` and
  `buildProactiveGreeting()`: per-field bubble construction, the 5/3-item caps, bubble ordering,
  severity mapping, the urgent-items cap vs. true count, with/without-navigation branches.
- `timing.test.ts` (4) — no-delay-when-already-slow, padded-delay-when-fast (bounded correctly),
  the between-messages pause, and that `prefersReducedMotion()` never throws outside a browser.
- `state.test.ts` (3) — initial state, `set()`, `is()`.
- `context.test.ts` (11) — route-to-entity parsing for all three Trade Finance detail routes (plus
  two negative cases), document-number detection, and question enrichment (append / no-op when
  already named / no-op when no current entity).

Following the same precedent set in every earlier phase of this session (Phase 5.5 Advanced
Reasoning, Phase 5.5 BRD Alignment): this is an honest count for what was actually built and
tested, not padded to hit the spec's number. The gap is structural, not effort: this repo has
**zero** Angular unit-test infrastructure (`npm test`/`ng test` is wired to Karma, but no
`karma.conf.js` and no `*.spec.ts` file exists anywhere in `src/`, in any prior phase) — building
a `TestBed`-based suite good enough for 170+ cases covering rendering, DOM interaction, and
Router-driven navigation would be a project of its own, not a slice of this one. What's tested
here is everything reachable without that harness: `RmContextService`'s Router-dependent half
(constructor subscription, `parseEntity()`) was refactored so its logic is pure and testable
(`rm-context.util.ts`) rather than skipped. `rm-message.component.ts`, `rm-typing.component.ts`,
and the rewritten `rm-chat.component.ts` itself are verified **live** instead (Playwright
walkthrough, screenshots below) — real rendering in a real browser against the real backend, not
a lower-fidelity substitute for missing component tests, but not a replacement for them either.

## What was built for real (see `phase-5.6-interaction-architecture.md` §2 for the full scope
## decision)

- RM Interaction Engine: `RmStateService`, `RmTimingService`, `RmContextService` (+
  `rm-context.util.ts`), `RmStreamService`, `rm-message-builder.ts` — all new, all tested or
  live-verified.
- `rm-message.component.ts` / `rm-typing.component.ts` — new rendering components.
- `rm-chat.component.ts` — rewritten on `RMMessage[]` instead of flat `ChatMessage[]`.
- Proactive RM greeting (Flow 6), wired through `app.component.ts` + `DailyDashboardService`.
- Context-awareness on the three Trade Finance detail routes.
- `rm-data.service.ts`: exported `SemanticAnswer`/`SemanticAnswerAction`/`SemanticMetric`/
  `SemanticQueryApiResult`/`buildLink`; added `askRmRaw()` (shares the same HTTP call as
  `askRm()`, which is unchanged and still used by nothing else that needs to change).

## Live verification evidence

Screenshots (`/tmp/.../scratchpad/0{1,2,3,5}-*.png`, sent to the user):

1. **Proactive greeting** — cashflow METRIC card, an INSIGHT bubble ("🔍 Dòng tiền hôm nay đang
   âm 850 triệu."), 3 severity-colored ALERT bubbles with CTAs, quick-nav + suggested-question
   chips below.
2. **Typing indicator mid-request** — "Em đang phân tích... ● ● ●" bubble, matching
   `RM_STATE_LABEL['ANALYZING']`, shown between the USER bubble and the (not yet arrived) answer.
3. **Rich answer** — TEXT summary, METRIC card ("Ưu tiên xử lý LC"), an INSIGHT bubble, and an
   ACTION bubble with 3 individual "Xem LC-xxx →" CTAs plus "Xem tất cả LC →".
4. **Context-aware follow-up** — on `/trade-finance/lc/LC-2026-001`, asking "Còn thiếu gì?" (no
   document number typed) answers specifically about LC-2026-001 — `RmContextService` silently
   appended the id before the question was sent.

## Known limitations (deliberately out of scope this pass)

Carried over verbatim from `phase-5.6-interaction-architecture.md` §2, now confirmed still
accurate after implementation:

- **Per-page ambient RM widgets** on LC/Guarantee/Collection detail pages — the chat itself
  became context-aware on those pages instead; a separate always-visible inline card on every
  detail page is a materially larger UI surface than this pass's scope.
- **Backend SSE/token streaming** — no such endpoint exists; `RmStreamService`'s frontend-only
  progressive reveal is the spec's own sanctioned fallback.
- **Footprint storytelling** and **LC PO-upload conversational flow** — both need backend
  capabilities `phase-5.5-brd-alignment.md` already tracked as not started (no Footprint
  endpoint, no file-upload infrastructure). Nothing to apply interaction UX to yet.
- **Speech-to-Text** — already P2/deferred since the original Phase 5.5 BRD spec.
- **No Angular component/TestBed test suite** — see the test-count section above; this is the
  most significant honest gap in this pass, not a scope choice.
- **No live-region ARIA announcements** for new bubbles arriving — `prefers-reduced-motion` is
  respected, keyboard nav works via native form/button semantics, but a screen-reader user isn't
  proactively told a new RM bubble appeared; they'd need to notice the DOM change themselves.
- Proactive RM only fires on chat-open-in-a-fresh-session (spec's LOGIN-adjacent trigger). The
  spec's other push-style triggers (`HIGH_PRIORITY_ALERT`, `DEADLINE_APPROACHING` interrupting an
  already-open chat, or firing without the customer opening chat at all) are not built — see
  `phase-5.6-proactive-rm.md`'s "What's deliberately not wired".

## Recommended next phase

1. Stand up a minimal Angular `TestBed`/Karma config (currently entirely absent from the repo)
   and backfill component-level tests for `rm-chat.component.ts`, `rm-message.component.ts`, and
   the Router-dependent half of `RmContextService` — the single largest gap this phase leaves.
2. Once Footprint and LC PO-upload backends exist (tracked in `phase-5.5-brd-alignment.md`),
   extend `rm-message-builder.ts` with their own message-building functions, reusing the same
   `RMMessage`/`RmStreamService` pipeline built here rather than a new one.
3. A real push-style proactive trigger (e.g. a lightweight polling or WebSocket check for new
   high-priority alerts while chat is already open) — everything it would need
   (`RmStateService`, `RmStreamService`, `buildProactiveGreeting`-style construction) already
   exists; only the trigger itself is missing.
