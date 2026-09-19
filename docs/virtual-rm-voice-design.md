# Virtual RM Voice Experience — design & implementation

Voice UX upgrade (this document's own task): RM reads only what genuinely needs reading, never
icons/button labels/metadata, never replays old conversation history, speaks a short daily
briefing exactly once per login session, and stays silent when the customer starts a fresh
conversation. This is a **targeted upgrade**, not a rewrite: the low-level "how do we actually
call cloud/browser TTS/STT" layer (`rm-voice.service.ts`) — built and already working in an
earlier phase of this project — is unchanged in its cloud-Gemini-TTS-then-browser-fallback
mechanics; everything below sits on top of it.

## 1. Root cause of the bugs this replaces

Read in full before writing any code (`rm-chat-session.service.ts`, `virtual-rm-chat.page.ts`,
`rm-message-builder.ts`, `rm-voice.service.ts`, `login.page.ts`, `auth.service.ts`,
`rm-message.component.ts`) — no DOM-scraping (`innerText`/`textContent`) existed anywhere, and
the old code already only ever spoke `RMMessage.content`, never a button `label`. So "icon being
read" was not a live defect in this codebase; the two real, confirmed bugs were both in
`virtual-rm-chat.page.ts`'s old `effect()`:

```ts
// OLD CODE — removed
private spokenCount = 0;
constructor() {
  effect(() => {
    const list = this.messages();
    if (list.length < this.spokenCount) this.spokenCount = 0;
    for (let i = this.spokenCount; i < list.length; i++) {
      const msg = list[i];
      if (msg.from === 'RM' && msg.content) void this.voice.speak(msg.content);
    }
    this.spokenCount = list.length;
  });
}
```

- **History replay on navigation.** `spokenCount` is a *component-instance* field, but
  `VirtualRmChatPageComponent` is recreated on every route navigation to `/virtual-rm/chat`
  (no custom `RouteReuseStrategy`), while `RmChatSessionService.messages` is a *root-singleton*
  signal holding the full conversation. Every revisit reset `spokenCount` to 0 while `messages()`
  still had the whole history — the loop re-spoke it from message 1.
- **"Hội thoại mới" auto-speaking.** `resetChat()` rebuilds a shorter message list; the effect's
  own `if (list.length < this.spokenCount) this.spokenCount = 0` guard (meant to detect a reset)
  fired and re-spoke the entire new greeting.
- **No login → auto-navigate, no daily briefing.** `login.page.ts` always sent the customer to
  `/dashboard`; nothing ever built a short spoken summary distinct from the rich greeting.

## 2. Architecture

```
RMMessage.voice? { enabled, priority?, spokenText? }     — semantic TTS metadata (rm-interaction.types.ts)
        │
        ▼
resolveSpokenText(message) / resolvePriority(message)     — the ONLY "what may be spoken" decision
        │                                                    point (rm-voice-queue.service.ts)
        ▼
RmVoiceQueueService                                        — priority queue, per-session dedup,
  .enqueueAssistantMessage()  .speakManually()                daily-briefing dedup, IDLE/QUEUED/
  .pause()/.resume()/.stop()  .setEnabled()/.isEnabled()       SPEAKING/PAUSED/STOPPED state
        │
        ▼
RmVoiceService.speak(text): Promise<void>                  — unchanged low-level TTS/STT engine
  (cloud Gemini TTS → browser speechSynthesis fallback)       (this phase only fixed it to await
                                                                real playback completion — see §4)
```

No component calls `speechSynthesis`/`RmVoiceService.speak()` directly for a chat message — every
caller goes through `RmVoiceQueueService`. `rm-message.component.ts`'s own eligibility check
(`canReadAloud`) reuses the exact same `resolveSpokenText()` function the automatic path uses, so
there is exactly one rulebook for "does this message have anything to say", not two.

**Conversation model note.** This app has one ongoing conversation per user (no
`ConversationList`/`selectConversation` UI exists — confirmed by grep), reset via "Hội thoại mới".
The spec's `conversationId`/"conversation switching" pseudocode is interpreted against this real
model: "reopening the chat" = revisiting `/virtual-rm/chat`, "switching conversations" = the reset
button. `voice-session.model.ts`'s `VoiceSession` interface keeps the spec's own field names for
documentation purposes; `RmVoiceQueueService` tracks the equivalent state as separate signals/a
`Set`/a `sessionStorage` key instead of materializing one literal object, since nothing needs to
read a `VoiceSession` snapshot as a whole.

## 3. Voice state machine

`RmVoiceQueueService.state: signal<'IDLE' | 'QUEUED' | 'SPEAKING' | 'PAUSED' | 'STOPPED'>`

```
IDLE ──enqueue (non-empty queue)──▶ QUEUED ──processQueue starts──▶ SPEAKING
 ▲                                                                    │  │
 │                                                     queue drains   │  pause()
 └────────────────────── all done ───────────────────────────────────┘  ▼
                                                                      PAUSED ──resume()──▶ SPEAKING
SPEAKING/QUEUED/PAUSED ──stop()──▶ STOPPED ──(next microtask)──▶ IDLE
```

`stop()` clears the queue, calls `RmVoiceService.stopSpeaking()` (which now also resolves any
pending `speak()` promise — see §4), and self-resets to `IDLE` on the next microtask so the state
never gets stuck at `STOPPED`.

## 4. `RmVoiceService.speak()` now awaits real completion

Prerequisite fix, made before the queue could be written correctly: `speak()` used to resolve the
instant playback *started*, not when it *finished* — a sequential queue built on that would let
replies overlap. `speak()`/`stopSpeaking()`/the new `pauseSpeaking()`/`resumeSpeaking()` now track
a `pendingSpeechResolve` callback, resolved by `<audio>.onended`/`SpeechSynthesisUtterance.onend`
on natural completion, or immediately by `stopSpeaking()` so an interrupted message can never hang
the queue.

## 5. TTS trigger rule (spec §5) — one explicit event, never a lifecycle hook

`RmChatSessionService.pushMessage()` is the single choke point through which every **genuinely
new** message enters the conversation (as opposed to restored/historical messages, set directly
via `messages.set(restored)` in the constructor and never touching `pushMessage()`):

```ts
private pushMessage(msg: RMMessage): void {
  this.messages.update((list) => [...list, msg]);
  persistMessages(this.messages());
  if (msg.from === 'RM') this.voiceQueue.enqueueAssistantMessage(msg);
}
```

This single hook is what fixes both original bugs at once: restored history never reaches it (no
replay on navigation/refresh), and it runs exactly once per message regardless of how many times a
component re-renders (no `effect()`/`ngAfterViewInit()` involved at all).

## 6. Why "Hội thoại mới" doesn't need a separate suppress flag

`buildProactiveGreeting()` (the rich, multi-bubble UI greeting — cashflow card, urgent-items
RECORD_LIST, category-shortcut chips) now tags every bubble `voice: { enabled: false }`. Since
`resetChat()` rebuilds this exact greeting, and each of its messages is voice-disabled,
`enqueueAssistantMessage()` naturally has nothing to say for any of them — no dedicated
"suppress auto-speak on reset" flag was needed. The thing actually meant to be heard after login
(the daily briefing, §8) is a separate, short, spoken-only summary triggered independently.

## 7. Deduplication strategy — two layers, deliberately ordered

**Per-message** (`RmVoiceQueueService.spokenMessageIds: Set<string>`, in-memory, lives for the
JS session): `enqueueAssistantMessage()` checks the Set, then `voice.speechEnabled()`, **then**
resolves spoken text and adds to the Set — in that order. The enabled-check must run *before* the
Set is touched: this call happens exactly once per message (from `pushMessage()`, never retried),
so a message that arrives while voice output is off must not be permanently marked "already
spoken" — it never got a chance to speak. (Found live, via Playwright: a customer who logs in with
voice off, then turns it on a moment later, never heard that session's daily briefing until this
ordering was fixed — see §8.)

**Daily briefing** (`RmVoiceQueueService.hasSpokenDailyBriefing()`/`markDailyBriefingSpoken()`,
`sessionStorage`, survives page reloads): key is
`voice:daily-briefing:{userId}:{businessDate}:{loginSessionId}`. `loginSessionId`
(`auth.service.ts`) is reused across a page refresh (`ensureLoginSessionId()`, called from
`restoreSession()`) and regenerated unconditionally on every explicit `login()` call — so a
refresh/navigate/close-reopen never re-arms the briefing, while a genuine new login (even
logout→login in the same tab) does.

Message IDs are stable — generated once per `RMMessage` at build time (`nextId()`/`localId()`),
never regenerated on re-render, satisfying spec §6's "IDs must be stable across Angular renders".

## 8. Login → auto-open RM chat → daily briefing

`login.page.ts`'s `submit()` now navigates to `/virtual-rm/chat` by default (an explicit
`returnUrl`, e.g. a guard-redirected deep link, still wins). `RmChatSessionService`'s constructor
registers, **before** anything else (including before its own restored-history early return, since
that would otherwise skip this entirely on a browser that already has chat history):

```ts
effect(() => {
  const dashboard = this.dailyDashboard.dashboard();
  if (dashboard && this.auth.loginSessionId()) this.speakDailyBriefingOnce(dashboard);
});
```

`speakDailyBriefingOnce()` returns early if already spoken this session, **or if voice output is
currently off** — without marking the sessionStorage flag in the off case (§7). Because this
effect's call chain reads `voice.speechEnabled()` as part of deciding that, Angular's signal
tracking means the effect *automatically re-fires* the moment the customer flips the voice toggle
on, with no extra plumbing — verified live (§11).

`buildDailyBriefingSpokenText(dashboard)` (`rm-message-builder.ts`) builds a short, spoken-only
sentence from real `DailyDashboard` numbers — never the rich greeting bubbles verbatim:

```ts
buildDailyBriefingSpokenText(dashboard)
// "Chào anh/chị. Hôm nay có 3 thông báo cần lưu ý: Một, 4 lệnh đang chờ kiểm soát.
//  Hai, 8 việc cần xử lý. Ba, 3 thông báo mới từ ngân hàng."
```

Returns `null` (stays silent, not an empty announcement) when there's nothing urgent — no pending
approvals, no open tasks, no insights.

## 9. Priority

`resolvePriority(message)`: explicit `message.voice.priority` wins; otherwise `ALERT` +
`severity: 'CRITICAL'` → `critical`, `ALERT` + `HIGH` → `important`, `ACTION`/`CONFIRMATION` →
`important`, else `normal`. The queue (`insertByPriority`) inserts ahead of any lower-priority item
already queued — `critical` items are never stuck behind a `normal` one.

## 10. Manual "🔊 Đọc" — the only way to re-hear an old message

`rm-message.component.ts` shows a `🔊 Đọc`/`⏹ Dừng` control on any RM message where
`resolveSpokenText(message) !== null` (so a button/metric-only bubble never gets one). Click →
`RmVoiceQueueService.speakManually(message)`, which bypasses the per-session dedup Set entirely
(spec §16: "the only case allowed to re-read an old message"), stops whatever's currently playing,
and jumps the clicked message to the front of the queue.

## 11. Accessibility

Icon-only UI (button `aria-label`s, tooltips, badges) is never a TTS input — `resolveSpokenText()`
only ever reads `message.voice.spokenText` or `message.content`, both of which are populated by
`rm-message-builder.ts`, never by anything rendered in the DOM. `sanitizeForSpeech()` additionally
strips any emoji/pictograph, markdown emphasis marker, or stray HTML tag that slips into `content`
as defense-in-depth (builders are expected to already hand back clean prose).

## 12. Test results

**Unit** (`npm run test:interaction`, 60/60 passing): `resolveSpokenText`
(USER never spoken · `voice.enabled: false` silences · explicit `spokenText` preferred ·
default-eligible types speak · presentational types don't unless opted in · button-only ACTION
never speaks · button labels never leak into spoken content · empty content → null · emoji/
markdown/HTML stripped), `resolvePriority` (explicit override · ALERT severity mapping ·
ACTION/CONFIRMATION → important · plain TEXT → normal), `buildDailyBriefingSpokenText` (silence
when nothing urgent · correct ordinal listing for 1 and 3 items · no markdown/HTML), and a new
assertion that every `buildProactiveGreeting()` bubble is `voice.enabled === false`.

**Backend** (`cd server && npm test`): 750/750 passing, no regressions (voice endpoints unchanged
by this upgrade — this was a frontend-only change).

**Live (Playwright, headless Chromium, `speechSynthesis`/`SpeechSynthesisUtterance` spied)**
against the running dev app, both as `msb_mk` (Maker) and `msb_ck` (Checker, has real pending
approvals/tasks/insights):
- Login → auto-navigated to `/virtual-rm/chat` — pass.
- Daily briefing spoken once, with the exact expected sentence and correct counts — pass.
- SPA in-app revisit (Dashboard → floating launcher back to chat) → no history replay — pass.
- New RM reply after asking a question → spoken — pass.
- "Hội thoại mới" after that → did not auto-speak — pass.
- Manual "🔊 Đọc" on a past message → re-spoke it on click — pass.
- Hard refresh → restored history not re-spoken, daily briefing not repeated within the same
  login session — pass.
- No button-label-only text (e.g. "Xác nhận", "Hủy") was ever spoken — pass.
- Voice off during login, enabled moments later (same session) → daily briefing still spoke once
  it was enabled — pass (this caught and led to fixing the dedup-ordering bug in §7).

## 13. Known limitations

- Cloud TTS quota: unchanged from the earlier phase of this project — Gemini TTS free-tier is
  capped; the existing browser-`speechSynthesis` fallback (and iOS `primeSpeechSynthesis()`
  unlock trick) carries voice output when the cloud call fails. Not part of this upgrade's scope.
- `VoiceSession` (the spec's literal interface, `voice-session.model.ts`) is a documentation type,
  not a live object `RmVoiceQueueService` constructs and exposes — its equivalent state is spread
  across a signal, a `Set`, and a `sessionStorage` key instead (§2). No functional gap; nothing in
  the app needs a single snapshot object today.
- The "conversation switching" spec language is mapped onto this app's real single-conversation
  model (§2) rather than a multi-conversation list, since no such feature exists elsewhere in the
  codebase and building one was out of scope for a voice-behavior upgrade.
- Local dev has no `GEMINI_API_KEY` configured, so all live verification exercised the
  browser-`speechSynthesis` fallback path, not the cloud-TTS path — the cloud path's own
  request/response mechanics were already covered by this project's pre-existing
  `server/test/security/voice.test.ts` suite and were not touched by this upgrade.
