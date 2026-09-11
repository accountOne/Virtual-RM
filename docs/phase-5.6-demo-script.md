# Phase 5.6 — Demo Script

A short, live-verifiable path through the RM Interaction Engine. ~5 minutes.

## 1. Login → Proactive greeting

1. Log in as any demo user (e.g. `msb_ad` / role Maker — see README for the full account list).
2. Open the Virtual RM chat widget (floating icon, bottom-right).
3. **Expect**: instead of one static sentence, several bubbles reveal in sequence with a brief
   typing pause between each — the time-of-day greeting, a cashflow METRIC card (balance/incoming/
   outgoing), and — if there are any — up to 3 ALERT bubbles for the day's most urgent
   cross-domain items (an expiring approval, an LC nearing its document deadline, etc.), each with
   a "Xem chi tiết →" CTA.

## 2. Ask a question → typing indicator → rich answer

1. Type (or tap a suggested chip): **"LC nào rủi ro cao nhất?"**
2. **Expect**: the USER bubble appears immediately; a typing indicator ("Em đang kiểm tra thông
   tin..." → "Em đang phân tích...") shows briefly (never instant, never longer than ~1.5s); then
   the answer reveals as separate bubbles — a TEXT summary, a METRIC card, and (if the reasoning
   engine produced one) an INSIGHT/RECOMMENDATION bubble — each with its own short pause, not one
   blob of text.

## 3. Context-aware follow-up on a Trade Finance detail screen

1. From an LC list, open a specific LC's detail page (`/trade-finance/lc/:id`).
2. Open chat and ask: **"Còn thiếu gì?"** — a short question that names no document number.
3. **Expect**: the answer is about *that exact LC* (its own missing-document/discrepancy status),
   not a clarification request and not a different LC — `RmContextService` silently appended the
   current screen's LC id to the question before it was sent.

## 4. CTA navigation

1. From any answer or greeting bubble with an action ("Xem chi tiết →" / "Về Dashboard →"/ etc.),
   click it.
2. **Expect**: the chat closes and the app navigates to the exact target screen (and, for
   documents/discrepancy/amendment/claim targets, the right in-page anchor) — same navigation
   behavior Phase 7 already established, now driven by structured `RMAction`s instead of a plain
   `{label, link}` pair.

## 5. Quick replies

1. After any answer that included suggested follow-ups, tap one of the quick-reply chips.
2. **Expect**: it behaves exactly like typing that question — same USER bubble, same
   typing-then-reveal flow.

## 6. Reduced motion

1. Enable "reduce motion" in the OS/browser (or `prefers-reduced-motion: reduce` via devtools
   rendering emulation).
2. Repeat step 2.
3. **Expect**: the answer still arrives as separate bubbles, but with no artificial pacing delay
   between them and no pulsing animation on the typing indicator dots.

## 7. Conversation persistence

1. Ask a question, then close and reopen the chat (or reload the page).
2. **Expect**: the full conversation (including the proactive greeting) is restored from
   `localStorage` exactly as left — no proactive greeting re-fires on top of it.
