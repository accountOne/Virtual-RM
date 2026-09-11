# Phase 5.6 — Conversational UX: Timing, Tone, Streaming, Accessibility

## Natural typing timing (spec §5)

`RmTimingService` (`interaction/rm-timing.service.ts`) shapes how long the typing indicator shows
before a response reveals:

- **Never instant**: if the real backend call finished in under 400ms, `settle()` pads the wait to
  somewhere between 700–1200ms (randomized, so it doesn't feel mechanical), capped at 1500ms.
- **Never artificially slow**: once the backend already took ≥400ms, `settle()` adds nothing —
  a genuinely slower answer is never made to wait even longer.
- **`prefers-reduced-motion` (spec §25)**: `prefersReducedMotion()` checks
  `window.matchMedia('(prefers-reduced-motion: reduce)')`; when true, `settle()` and
  `betweenMessages()` both return immediately — no artificial delay is ever *required* to use the
  product.

## Progressive reveal (spec §6)

No backend token-streaming endpoint exists (`POST /api/virtual-rm/query` returns one JSON
response, not a stream) — per the spec's own explicit fallback allowance ("Nếu backend chưa hỗ
trợ streaming: implement frontend-compatible abstraction, fallback sang progressive rendering"),
`RmStreamService.reveal(messages, onMessage)` reveals an already-fetched `RMMessage[]` one bubble
at a time, pausing `betweenMessages()` (≈250ms, skipped under reduced motion) between each. Visually
equivalent to token streaming for a demo, without inventing a backend contract nothing implements.

`rm-chat.component.ts` uses this for both the multi-turn answer (`buildRmMessages()` output) and
the proactive greeting (`buildProactiveGreeting()` output) — the same mechanism serves both.

## Human-like Vietnamese phrasing (spec §12)

The RM speaks in first person, past-tense-of-having-just-checked, never system voice:

| Good (used) | Bad (avoided) |
|---|---|
| "Em đã kiểm tra và thấy dòng tiền hôm nay dương 300 triệu." | "System found: cashflow +300M" |
| "Em đã rà soát và thấy có 3 việc cần anh/chị lưu ý hôm nay:" | "3 urgent items found" |
| "Xin lỗi, hệ thống đang gặp sự cố. Anh/chị thử lại sau ít phút nhé." | "Error: request failed" |
| "Mọi việc hôm nay đều ổn, không có gì cần anh/chị xử lý gấp ạ." | "0 urgent items" |

This isn't a copy layer bolted on top — `buildRmMessages()`/`buildProactiveGreeting()` construct
these sentences directly as bubble `content`, and the backend's own `summary`/`insight`/
`recommendation` strings (already written in this voice since Phase 5) pass through unchanged.

## Quick replies

`suggestedQuestions[]` (already returned by the backend since Phase 5) renders as a `QUICK_REPLY`
bubble — a row of chips under the answer. Tapping one calls the same `ask()` path as typing it,
so no separate handling exists for "typed" vs. "tapped" questions.

## "Human-like, not human simulation" (spec §24 restraint)

What was deliberately **not** added: no fake "is typing..." beyond the one real typing indicator
tied to an actual in-flight request, no randomized personality quirks, no simulated reading delay
before the RM "sees" a message, no claim of feelings or opinions. The RM states what it checked
and what it found — confident and specific (spec's own "RM style: short, numeric, action — not
chatbot prose" carried over from Phase 5/7), not performing warmth it doesn't need to.

## Accessibility (spec §25)

- `prefers-reduced-motion` — see timing section above; also disables the CSS `animate-pulse` dot
  animation on `rm-typing.component.ts` (`[class.animate-pulse]="!reducedMotion"`).
- Keyboard: the chat input is a plain `<input>`/`<form>` (native Enter-to-submit, native Tab
  order); quick-reply/action/nav buttons are plain `<button>` elements — no custom
  keyboard-trap widgets were introduced.
- ARIA: bubbles render as plain text/paragraphs inside the existing scrollable message list,
  which already had no additional ARIA roles before this phase — Phase 5.6 doesn't regress that,
  but doesn't add live-region announcements for new bubbles either (see Known Limitations in
  `phase-5.6-evaluation.md`).

## Performance (spec §26)

No new API calls were introduced — `askRmRaw()` reuses the exact same single
`POST /api/virtual-rm/query` request `askRm()` always made (`query()` is now a shared private
method). The Daily Dashboard load added to `app.component.ts` is one extra `GET` at app start,
gated by the same `loaded()/loading()` guard `RmDataService.loadAll()` already uses, so it fires
once per session, not once per chat open. All new state (`RmStateService.state`,
`RmChatComponent.messages/busy`) is signal-based, matching the codebase's existing pattern.
