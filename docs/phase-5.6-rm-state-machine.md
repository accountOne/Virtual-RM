# Phase 5.6 — RM State Machine

`RmStateService` (`src/app/features/virtual-rm/interaction/rm-state.service.ts`) holds one
signal-based `RMState` shared by the whole chat surface — a single Virtual RM "presence" the
customer is interacting with, not per-message state.

## States

```
IDLE → GREETING → LISTENING → PROCESSING → ANALYZING → RESPONDING → RECOMMENDING
     → WAITING_FOR_USER → NAVIGATING → SUCCESS → HANDOFF
```

Only a subset is wired to a real transition in this pass — the rest exist in the type (and are
available to any future flow) but nothing currently drives them:

| State | Driven by | User-facing label |
|---|---|---|
| `IDLE` | Initial value; end of every `submit()`/greeting flow | — (no bubble) |
| `GREETING` | `showProactiveGreeting()` while the multi-bubble opener reveals | — |
| `PROCESSING` | `submit()`, immediately after the question is sent | "Em đang kiểm tra thông tin..." |
| `ANALYZING` | `submit()`, after the backend call returns, while `RmTimingService.settle()` pads the response | "Em đang phân tích..." |
| `RESPONDING` | `submit()`, right before the answer's bubbles start revealing | "Em đang chuẩn bị câu trả lời..." |

`LISTENING`, `RECOMMENDING`, `WAITING_FOR_USER`, `NAVIGATING`, `SUCCESS`, `HANDOFF` are defined
(spec §4 requires the full enum) but have no current trigger — there's no voice input
(`LISTENING`), no distinct "waiting for a yes/no" UX beyond quick replies
(`WAITING_FOR_USER`), and no live-agent handoff feature (`HANDOFF`) yet. Wiring a new state only
ever means one more `this.rmState_.set(...)` call at the right point in `rm-chat.component.ts`;
the type and the typing-indicator label table (`RM_STATE_LABEL`) already support them.

## No chain-of-thought (spec §4)

`RM_STATE_LABEL` (`rm-interaction.types.ts`) maps a state to one short, high-level phrase — never
the model's reasoning, tool calls, or intermediate data. `RmTypingComponent` renders exactly that
label and nothing else. There is no code path anywhere in the interaction layer that surfaces
`server/src/ai/reasoning-engine.ts`'s internal steps to the UI; the backend never sends them in
the first place (`SemanticAnswer` only carries the final `summary`/`insights`/`recommendation`).

## Where it's read

- `rm-typing.component.ts` — `[state]="rmState()"` picks the label to show while `busy()` is true.
- `rm-chat.component.ts` — the only writer, via `RmStateService.set(...)` in `submit()` and
  `showProactiveGreeting()`.

## Test coverage

`interaction/__tests__/state.test.ts` (3 tests): initial `IDLE`, `set()` transitions the signal,
`is()` matches one or more candidate states.
