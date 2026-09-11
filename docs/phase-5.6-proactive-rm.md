# Phase 5.6 — Proactive RM (Flow 6)

## What's wired

Out of the spec's larger proactive-trigger list (LOGIN, DASHBOARD_OPEN, HIGH_PRIORITY_ALERT,
DEADLINE_APPROACHING, etc.), this pass wires the one concrete, demonstrable trigger: **opening
the chat for the first time in a fresh session** now shows a lively, multi-bubble opener built
from real Daily Dashboard data, instead of one static greeting sentence.

## Data source — reused, not duplicated

`DailyDashboardService` (`core/services/daily-dashboard.service.ts`) already existed from Phase
5.5's BRD alignment work, backed by `GET /api/virtual-rm/daily-dashboard`
(`server/src/services/daily-dashboard.service.ts`), which already runs the Priority Engine
(`server/src/reasoning/priority-engine.ts`) to rank cross-domain urgent items. Phase 5.6 adds
**zero** new ranking or greeting logic — `buildProactiveGreeting()` (see
`phase-5.6-message-model.md`) is a pure presentation transform of data that already existed.

## Load-time wiring

`app.component.ts` already had an `effect()` that loads `RmDataService` once the user is
authenticated. Phase 5.6 adds a second, identical-shaped `effect()` that loads
`DailyDashboardService` the same way — so by the time a customer actually opens the chat widget,
the dashboard data is very likely already in memory and the greeting can render with no extra
wait.

## Bubble sequence

1. `dashboard.greeting.message` — the existing time-of-day-aware greeting (unchanged).
2. If cashflow data exists: a `METRIC` bubble (current balance / incoming / outgoing, VND
   formatted) — followed by an `INSIGHT` bubble only if `cashflow.insight` is non-empty.
3. If `urgentItems.length > 0`: a `TEXT` intro naming the *true* count, then up to 3 `ALERT`
   bubbles (one per item, capped so the greeting never floods the sheet), each carrying:
   - `severity`, mapped from the dashboard's `DashboardPriority` (`LOW/MEDIUM/HIGH/URGENT`) to
     `RMSeverity` (`LOW/MEDIUM/HIGH/CRITICAL`) — same colors `rm-message.component.ts` uses for
     any other `ALERT`, and the same visual language `alerts.component.ts` already used
     elsewhere in the app (`border-negative`/`border-warn`/etc.).
   - a `NAVIGATE` action when the item has a `navigation` target (most do — approvals, LC/BG/
     Collection deadlines), so tapping the bubble's CTA jumps straight to the relevant screen.
4. If `urgentItems.length === 0`: one reassuring `TEXT` bubble instead — "Mọi việc hôm nay đều ổn,
   không có gì cần anh/chị xử lý gấp ạ." (spec §24's restraint: no manufactured urgency when
   there genuinely isn't any).

Bubbles are revealed one at a time via `RmStreamService`/`RmTimingService` (see
`phase-5.6-conversational-ux.md`), so the greeting visibly "arrives" rather than appearing as one
wall of text.

## Once per fresh session, never overriding history

`RmChatComponent`'s constructor only builds a proactive greeting when there is **no** restored
chat history in `localStorage` (`vrm_chat_messages_v2`). If the dashboard hasn't loaded yet at
construction time, it shows the old single-line fallback greeting immediately, then upgrades to
the full proactive greeting exactly once — via a guarded `effect()` (`awaitingProactiveUpgrade`)
that only fires while the customer hasn't already started typing. Once the customer has asked
anything, or reloaded into a restored session, the proactive opener never re-fires and never
clobbers what's already on screen. "Bắt đầu cuộc trò chuyện mới" (reset) re-triggers it
intentionally, same as the old reset behavior did for the single greeting.

## What's deliberately not wired

- `HIGH_PRIORITY_ALERT`/`DEADLINE_APPROACHING` as *push*-style triggers (a bubble appearing while
  the chat is already open, without the customer asking) — everything here still requires the
  customer to open chat; nothing interrupts them mid-task on another screen. Adding that would
  mean a background poll and a decision about interrupting focus, out of scope for this pass.
- `DASHBOARD_OPEN` as a separate trigger from `LOGIN` — the Daily Dashboard page
  (`virtual-rm-dashboard.page.ts`) already shows this same data as cards; duplicating it as an
  unsolicited chat popup when the customer is already looking at the dashboard page would be
  redundant rather than helpful.
