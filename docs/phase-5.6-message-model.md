# Phase 5.6 — Rich Message Model

## Backward-compatible API (spec DoD)

`POST /api/virtual-rm/query` is unchanged — same request shape, same `SemanticAnswer` response
(`title, summary, metrics[], insights[], recommendation, action, actions[], suggestedQuestions[]`,
still defined and returned by `server/src/semantic/*` and `server/src/ai/reasoning-engine.ts`
exactly as before). `RmDataService.askRm()` still exists and still returns the old flattened
`RmAnswer` (`{intent, message, ctas, data}`) for any caller that still wants it.

What's new is `askRmRaw()` (`rm-data.service.ts`), which returns the *unflattened*
`SemanticQueryApiResult` — the same HTTP response, just not joined into one string — and
`rm-message-builder.ts::buildRmMessages()`, a pure function that turns that `SemanticAnswer` into
an `RMMessage[]`. No backend file changed to make this possible.

## `RMMessage`

```ts
interface RMMessage {
  id: string;
  from: 'USER' | 'RM';
  type: RMMessageType;             // TEXT | TYPING | METRIC | INSIGHT | ALERT | ENTITY |
                                    // CHECKLIST | TIMELINE | RECOMMENDATION | ACTION |
                                    // QUICK_REPLY | CONFIRMATION | NAVIGATION | HANDOFF
  content?: string;
  title?: string;
  metrics?: RMMetricItem[];        // { label, value }
  entity?: RMEntitySummary;        // { entityType, entityId, title, fields[] }
  severity?: RMSeverity;           // INFO | LOW | MEDIUM | HIGH | CRITICAL
  actions?: RMAction[];
  quickReplies?: string[];
  timestamp: number;
}
```

One RM turn is no longer one bubble — it's a short sequence of typed bubbles, each carrying one
concern, revealed in order by `RmStreamService` (see `phase-5.6-conversational-ux.md`).

## `buildRmMessages(answer: SemanticAnswer): RMMessage[]`

| `SemanticAnswer` field | Becomes |
|---|---|
| `summary` | one `TEXT` bubble |
| `metrics[]` (capped at 5) | one `METRIC` bubble, titled `answer.title` |
| each `insights[]` entry | its own `INSIGHT` bubble |
| `recommendation` | one `RECOMMENDATION` bubble (`title` + `description`) |
| `actions[]` (or `action` alone) | one `ACTION` bubble, each entry a `RMAction` with `type: 'NAVIGATE'`, `route` built via `rm-data.service.ts`'s `buildLink()` (now exported) |
| `suggestedQuestions[]` (capped at 3) | one `QUICK_REPLY` bubble |
| nothing set at all | a single fallback `TEXT` bubble (`answer.title` or a generic line) — the customer never sees a silent, empty response |

Order is fixed: `TEXT → METRIC → INSIGHT → RECOMMENDATION → ACTION → QUICK_REPLY` — mirrors the
order fields already appeared in the old flattened string, just as separate bubbles now.

## `buildProactiveGreeting(dashboard: DailyDashboard): RMMessage[]`

Used only for the Proactive RM opener (see `phase-5.6-proactive-rm.md`); same builder file, same
`RMMessage` output type, different (real) input — the Phase 5.5 `DailyDashboard` shape instead of
`SemanticAnswer`.

## `RMAction`

```ts
interface RMAction {
  label: string;
  type: 'NAVIGATE' | 'QUERY' | 'CONFIRM' | 'UPLOAD' | 'DOWNLOAD' | 'HANDOFF';
  route?: string;
  entityType?: string;
  entityId?: string;
  payload?: unknown;
}
```

Only `NAVIGATE` is produced anywhere today (both builders only ever emit navigation CTAs, same as
the old `ctas[]`). The other five variants are defined because the spec's message model requires
them, and `rm-message.component.ts`'s action-rendering is generic over the whole `RMAction[]`
array regardless of `type` — a future flow (e.g. confirm-before-transfer, PO upload) adds a new
producer of that `type`, not new rendering code.

## Types not produced by either builder

`TYPING`, `CHECKLIST`, `TIMELINE`, `CONFIRMATION`, `NAVIGATION`, `HANDOFF` are declared (spec §7
requires the full type list) but nothing constructs them yet:
- `TYPING` is handled by the separate `rm-typing` component, not a message in the list.
- `CHECKLIST`/`TIMELINE` would need dedicated fields (ordered steps, dated milestones) the current
  `SemanticAnswer`/`DailyDashboard` shapes don't carry — no LC document-checklist or approval
  timeline endpoint exists yet to source them from (see `phase-5.5-brd-alignment.md`'s tracker).
- `CONFIRMATION`/`NAVIGATION`/`HANDOFF` are covered structurally by `ACTION` today (a
  navigation CTA is a `NAVIGATE`-typed `RMAction` inside an `ACTION` bubble); `rm-message.component.ts`
  still renders all three type names as an action row so wiring a dedicated producer later needs
  no new rendering code, only a new call site.

## Test coverage

`interaction/__tests__/message-builder.test.ts` (18 tests) covers every branch of both builders:
per-field bubble construction, the 5/3-item caps, bubble ordering, severity mapping
(`LOW/MEDIUM/HIGH/URGENT → LOW/MEDIUM/HIGH/CRITICAL`), the urgent-items 3-item cap vs. the true
count shown in the intro line, and the with/without-navigation branches.
