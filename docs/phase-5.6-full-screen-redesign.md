# Phase 5.6 addendum — Full-screen chat redesign

Follow-up to `phase-5.6-interaction-architecture.md` after user feedback with a reference
mockup: the popup/panel/bottom-sheet widget is retired entirely in favor of a dedicated
full-screen chat screen, on both desktop and mobile.

## What changed

- **Removed**: `rm-widget.component.ts` (desktop `<aside>` panel + mobile floating icon/bottom
  sheet + teaser card), `chat-ui.service.ts` (`mobileSheetOpen`/`chatMode` — no longer meaningful
  once there's no popup to collapse/expand), and the old `rm-chat.component.ts` (superseded by
  the full-screen page below). `<app-rm-widget />` is gone from `app.component.html`.
- **Added**: `pages/virtual-rm-chat/virtual-rm-chat.page.ts`, routed at `/virtual-rm/chat`
  (`authGuard`). Every former `chatUi.openChat()` call site (`header.component.ts`'s "Trung tâm
  hỗ trợ", `virtual-rm-dashboard.page.ts`'s "Hỏi Virtual RM" button, `demo.page.ts`'s demo
  script steps) now navigates there instead.
- **Kept unchanged**: `RmChatSessionService` (conversation state singleton — still the right
  home for it, since it needs to start building the proactive greeting from Daily Dashboard data
  before the customer ever opens the chat page, not only once a view exists to hold it),
  `RmStateService`/`RmTimingService`/`RmStreamService`/`RmContextService`, and the backward-
  compatible `SemanticAnswer` → `RMMessage[]` transform pipeline.

## New message type — `RECORD_LIST`

The reference mockup groups a list of clickable records (LC/Guarantee/Collection rows, the
proactive greeting's urgent items) into one card instead of one bubble per record. Added to
`rm-interaction.types.ts`:

- `RMMessage.type` gains `'RECORD_LIST'`, plus `records: RMRecordListItem[]`, `badgeCount`
  (a small count pill, e.g. "1 LC"), and `insight` (a highlighted takeaway line inside the card).
- `RMAction` gains an optional `icon` — when present, `rm-message.component.ts` renders that
  action as an icon+label pill chip instead of a text button (used for the proactive greeting's
  LC/Bảo lãnh/Thanh toán/Dòng tiền category shortcuts).

`rm-message-builder.ts::buildRmMessages()` now attempts a `RECORD_LIST` card first
(`buildRecordListMessage()`), recognizing the common LC/Guarantee/Collection record shape
(`lcNumber`/`guaranteeNumber`/`collectionNumber` + `type`/`subType` + `amount`/`currency` +
`expiryDate`/`dueDate` — confirmed live against the real `LC_EXPIRY` and
`LC_RISK_PRIORITIZATION` intent responses) and falls back to the older per-field bubble layout
(`TEXT`/`METRIC`/`INSIGHT`/`RECOMMENDATION`/`ACTION`/`QUICK_REPLY`, unchanged) when
`answer.records` isn't shaped that way — most intents (a plain numeric answer, a briefing) don't
carry a record list at all, so this is a strict addition, not a replacement of the general case.
`buildProactiveGreeting()`'s urgent items now render as one `⚠️ Việc cần lưu ý` `RECORD_LIST`
card (rows capped at 5) instead of one `ALERT` bubble per item, followed by a category-shortcuts
`ACTION` message.

This is an honest, not universal, mapping: `SemanticAnswer.records` is `unknown[]` with no single
typed shape across the ~94 intents (`server/src/semantic/response-generator.ts` returns whatever
each handler built). The heuristic only fires when every record in the array matches; a mixed or
unrecognized shape falls straight back to the existing, already-tested per-field layout — see
`toRecordListItem()`'s doc comment in `rm-message-builder.ts`.

## Visual language

- Header: `brand-700`→`brand-900` gradient (same MSB brand palette used everywhere else in the
  app, just its darkest steps) instead of the standard white top bar, matching the mockup's
  dedicated chat header. Hamburger re-opens the existing `app-sidebar` component locally (own
  open/close state) so the rest of the app stays one tap away.
- `RECORD_LIST` card: `bg-rose-50/70` container, white row buttons with a colored icon circle
  (color keyed off `badgeTone`/severity — red/orange/amber/blue), amount + date-badge pills,
  an embedded insight strip, and filled (first)/outlined (rest) action buttons below.
- Every bubble now shows a timestamp; `USER` bubbles also show a static "✓✓" read-receipt (there
  is no real delivery tracking in this demo — it's decorative, always "sent").
- `rm-typing.component.ts`'s dots are now three small colored circles (rose→brand-400→brand-600)
  instead of plain "●●●" text.

## Layout gotcha worth recording

`app-sidebar`'s `<aside>` is `fixed lg:static` — a normal permanent column at desktop widths, an
overlay drawer below that. The first version of `virtual-rm-chat.page.ts` put `<app-sidebar>` as
a `flex-col` sibling of the header, which broke desktop entirely (the sidebar's own tall static
content pushed the chat header/messages out of the viewport, leaving a blank page — caught via
live Playwright verification, not by the build). Fixed by mirroring `app.component.html`'s own
structure: an outer `flex` **row** with the sidebar and a `flex-1 flex-col` content column as
siblings, not a `flex-col` with the sidebar as its first item.

## Test coverage

`message-builder.test.ts` updated (39 tests now, up from 36): the 4 tests that asserted the old
per-item `ALERT` bubbles for urgent items now assert the grouped `RECORD_LIST` card instead, plus
3 new tests for `buildRecordListMessage()` (recognized shape → one card, unrecognized shape →
fallback, `QUICK_REPLY` still trails a `RECORD_LIST` card when `suggestedQuestions` is present)
and 1 new test asserting the category-shortcuts message. No component/TestBed tests exist for
`virtual-rm-chat.page.ts` itself, same honest gap already recorded in
`phase-5.6-evaluation.md` for `rm-chat.component.ts`'s predecessor — verified live via Playwright
instead (both mobile 390px and desktop 1440px, screenshots sent to the user).
