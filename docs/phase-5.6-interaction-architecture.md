# Phase 5.6 — Human-like Virtual RM Interaction UX: Audit & Architecture

## 1. Audit — what already renders RM/chat/alert/dashboard UI today

Inspected before writing any Phase 5.6 code, per the phase's own rule ("REUSE → REFACTOR →
EXTEND → CREATE ONLY IF NECESSARY. Không tạo hệ thống thứ hai").

| Existing surface | File | Renders | Reused/extended how |
|---|---|---|---|
| Chat message list | `rm-chat.component.ts` | One flattened text bubble per turn (`answer.summary` + metrics + insights + recommendation all joined with `\n`), `ctas[]` as link buttons, a single `● Đang phân tích...` typing bubble | **Rebuilt as the primary target** — becomes a real `RMMessage[]` list rendered through the new `rm-message` component instead of one joined string |
| Chat persistence | `rm-chat.component.ts`'s `localStorage`/`ChatMessage` | `{id, from, text, ctas, timestamp}` | Superseded by `RMMessage` (richer, superset-shaped); `ChatMessage` interface left in `core/models` untouched (nothing else references it) rather than deleted, avoiding a needless breaking rename |
| Chat popup shell (collapsed/expanded, mobile sheet, desktop panel) | `rm-widget.component.ts` + `chat-ui.service.ts` | Exactly spec §21's collapsed/expanded/mobile-bottom-sheet requirements already | **Reused as-is**, zero changes — it already does what §21 asks |
| Backend answer shape | `semantic/types.ts::SemanticAnswer` (`title, summary, metrics[], insights[], recommendation, action, actions[], suggestedQuestions[]`) | The exact data a rich message list needs | **Reused as-is** — the new `RMMessage[]` builder is a pure frontend transform of this existing shape; no backend change, satisfies "Backward compatible API" |
| Greeting | `rm-data.service.ts` (legacy) + Phase 5.5's `DailyDashboardService` (`greeting.message`, time-of-day-aware) | Static string | Phase 5.6 wires the *already-built* Phase 5.5 greeting into a proactive, multi-bubble chat opener instead of building a second greeting system |
| Daily Dashboard urgent items | `DailyDashboardService` (Phase 5.5) → `crossDomainPriorities()` (Phase 5.5 Priority Engine) | Cards on `/virtual-rm` | **Reused as the data source for Proactive RM** (§20/§35) — no new ranking logic, just a new consumer of data that already exists |
| Navigation actions | `SemanticAnswer.action`/`actions[]` → `RmDataService.toRmAnswer()`'s `buildLink()` | `{label, link}` | Reused; the new `RMAction` type is additive metadata (`type`, `entityType`, `entityId`) layered on top, not a replacement |
| Alerts | `alerts.component.ts` | Plain list, no RM voice | Left as a dedicated Business Banking card (unchanged) — Phase 5.6 does not duplicate it inside chat; a proactive RM message can reference the same data conversationally without needing to re-render the alert card itself |

## 2. What Phase 5.6 actually builds (and what it deliberately doesn't)

Given the spec's own scope (40 sections covering interaction UX across every existing feature),
this pass — consistent with every prior phase's own documented scoping decisions (see
`docs/phase-6-trade-finance-architecture.md` §4, `docs/phase-5.5-brd-alignment.md`'s tracker) —
builds one real, fully-working, tested vertical slice rather than a shallow pass over 20+
surfaces:

**Built for real, end-to-end, tested, verified live:**
- The RM Interaction Engine itself (state machine, rich message model, timing/typing, context
  awareness, progressive reveal) — this is the foundational architecture every other surface
  would need, so it's the correct thing to get right first.
- Applied fully to the chat popup (`rm-chat.component.ts`) — the one surface that is *the*
  conversational interface for Q&A, LC/Guarantee/Collection questions, and Trade Finance
  briefing (all of them are already chat questions routed through the same
  `POST /api/virtual-rm/query`, so upgrading the chat renderer upgrades all of their
  presentation simultaneously — this is exactly why "REUSE" beats building per-feature
  interaction code for LC vs. Guarantee vs. Collection separately).
- Proactive RM greeting (§9/§20/§35 Flow 6) — wired to the real, already-shipped Phase 5.5
  `DailyDashboardService`/Priority Engine data, not a mock.
- Context-awareness (§15) for the Trade Finance detail screens (`/trade-finance/lc/:id`,
  `/trade-finance/guarantees/:id`, `/trade-finance/collections/:id`) — a short follow-up
  question on one of these screens resolves to that screen's entity without the user repeating
  the LC/BG/collection number.
- Accessibility (`prefers-reduced-motion`), quick replies, rich message types (TEXT, METRIC,
  ALERT, ENTITY, INSIGHT, RECOMMENDATION, ACTION, QUICK_REPLY, NAVIGATION).

**Explicitly not built in this pass** (see `docs/phase-5.6-evaluation.md` "Known limitations"
for the full reasoning):
- Per-feature ambient RM commentary widgets embedded directly into the LC/Guarantee/Collection
  detail pages themselves (§17/§18/§19's "RM contextual message on page load" — the *chat*
  already becomes context-aware on those pages via §15's mechanism; a separate always-visible
  inline card on every detail page is a materially larger UI surface, deferred).
- Backend SSE streaming (`POST /api/virtual-rm/query/stream`) — no token-level backend
  streaming exists to stream from; per the spec's own explicit fallback allowance ("Nếu backend
  chưa hỗ trợ streaming: implement frontend-compatible abstraction, fallback sang progressive
  rendering"), a frontend-only progressive reveal (`rm-stream.service.ts`) is built instead,
  revealing the already-fetched `RMMessage[]` one at a time with natural pacing — visually
  equivalent to streaming for a demo, without inventing a backend contract nothing implements.
- Footprint storytelling (§13) and LC PO-upload conversational flow (§16) — both require
  capabilities Phase 5.5's BRD alignment pass explicitly tracked as **not started**
  (`docs/phase-5.5-brd-alignment.md`): Footprint has zero backend implementation, and PO
  upload/analysis has no file-upload infrastructure at all. Applying rich interaction UX to
  features that don't exist yet isn't possible — those land together with their own features in
  a future pass.
- Speech-to-Text — the BRD's own Phase 5.5 spec already marked this P2/lowest-priority-to-defer;
  unchanged here.

## 3. Architecture

```
src/app/features/virtual-rm/
├── interaction/
│   ├── rm-interaction.types.ts   — RMState, RMMessage, RMAction, RMMessageType
│   ├── rm-state.service.ts       — the state machine (signal-based)
│   ├── rm-context.service.ts     — currentRoute/currentEntityType/currentEntityId (Router-driven)
│   ├── rm-timing.service.ts      — natural typing-duration shaping
│   ├── rm-stream.service.ts      — progressive reveal of an already-fetched RMMessage[]
│   └── rm-message-builder.ts     — pure SemanticAnswer -> RMMessage[] transform
│
└── components/
    ├── rm-message/                — renders ONE RMMessage, switched by `type`
    └── rm-typing/                 — the typing/thinking indicator
```

Two rendering components, not the spec's illustrative 14-folder list (the spec itself says
"Tên thư mục có thể điều chỉnh theo architecture hiện tại") — one `rm-message` component with an
internal type switch covers TEXT/METRIC/ALERT/ENTITY/INSIGHT/RECOMMENDATION/ACTION/QUICK_REPLY/
NAVIGATION consistently (shared card chrome, shared severity coloring) rather than 8+ near-empty
wrapper files that would each need to stay visually consistent by hand. `rm-typing` is split out
because it's genuinely reused in more than one place (mid-conversation "thinking" state and the
proactive-greeting reveal) and has its own `prefers-reduced-motion` logic worth isolating.

See `docs/phase-5.6-rm-state-machine.md`, `docs/phase-5.6-message-model.md`,
`docs/phase-5.6-conversational-ux.md`, `docs/phase-5.6-proactive-rm.md` for each piece's design
in detail.
