# Premium mobile redesign — design & implementation

A visual/UX upgrade requested via a 29-section spec + a 10-screen mobile mockup: make Virtual RM
feel like a premium MSB Business Banking mobile app (proper mobile-first login, a more human RM
persona, a dedicated voice-capture screen, a mobile bottom-nav pattern), add a "Demo FIDO2"
authentication/approval step, and lay 3D-avatar infrastructure — while preserving every existing
business flow untouched. See `docs/fido2-demo-design.md` and `docs/3d-avatar-guide.md` for those
two pieces in depth; this document covers the rest.

## Audit findings that shaped the plan

Before any code changed, two Explore agents and a WebFetch established:

- **Login's hero was invisible on mobile.** `login.page.ts` had `hidden md:flex` on its dark brand
  hero panel — below 768px, a customer saw a bare white form with zero branding. This was the
  single biggest gap vs. the mockup, and it also used `md:` (768px) instead of the rest of the
  app's single `lg:` (1024px) breakpoint (`docs/design-system.md` §3).
- **Zero 3D or FIDO2 infrastructure existed** — both from-scratch additions (see their own docs).
- **No DOM-level tests exist in this repo.** `server/test/*` is backend/semantic logic only; the
  frontend `__tests__/*` suite tests services as plain TS modules with no Angular TestBed/
  Playwright config in the repo. This meant the visual/presentational parts of this round carried
  low risk to the existing automated test suites — verification instead leaned on `tsc`/`ng build`
  staying green plus live Playwright walkthroughs against the running dev app.

## Scope

Bounded to the screens shown in the mockup + described in the spec text: Login, FIDO2-login,
Dashboard/Home, Virtual RM chat + voice overlay, Transfer + Review, Maker workspace, Checker queue,
Checker detail/approval. Everything else (accounts detail, LC/BG/Collection create/detail beyond
transfer, reports, admin, settings, notifications page, footprint, loans, FX, products) was left
functionally intact and visually as-is — not part of the reference mockup, and the spec itself says
more screenshots for "other screens" will come later.

## New shared components

| Component | Purpose |
|---|---|
| `rm-avatar/` | RM persona avatar — see `docs/3d-avatar-guide.md`. |
| `fido2-modal/` | The "Demo FIDO2" overlay — see `docs/fido2-demo-design.md`. |
| `bottom-tab-bar/` | Mobile primary nav (below). |
| `quick-action-grid/` | Reusable "Thao tác nhanh" icon grid, extracted from Dashboard. |
| `stepper/` | Horizontal step indicator, first used by the Transfer flow. |
| `voice-overlay/` | Full-screen voice-capture visualization (below). |

## Login

`login.page.ts` now has two local phases (`'welcome' | 'credentials'`, a plain component signal —
deliberately **not** a separate route, so `returnUrl` deep-link semantics from a guard redirect
stay exactly as they were):

- **`welcome`** — the new dark full-bleed hero entry screen (mockup screen 1: "Xin chào! / Đăng
  nhập để tiếp tục"), present on every breakpoint including mobile. Two buttons ("Đăng nhập" /
  "Tài khoản demo") both lead to `credentials` — the existing password form + demo-account
  quick-fill list is the single real destination either way; a second button that led somewhere
  functionally different would have been UI for its own sake.
- **`credentials`** — the existing form, with its hero copy now visible on every breakpoint (fixing
  the mobile bug above) and its breakpoint switched from `md:` to `lg:` to match the rest of the
  app. The form itself, validation, and demo quick-fill are unchanged.

FIDO2 is not a third local phase — see `docs/fido2-demo-design.md`; the shared
`Fido2ModalComponent` handles that screen.

## Bottom tab bar

`BottomTabBarComponent` (`lg:hidden`), 5 items: Tổng quan (`/dashboard`), Tài khoản (`/accounts`),
Giao dịch (`/payments`), Thông báo (`/notifications`, badge from the same `RmDataService.alerts()`
count the header bell already uses), and Thêm — which does **not** navigate anywhere; it toggles
the exact same `AppComponent.mobileMenuOpen` signal the header hamburger already uses, opening the
existing `<app-sidebar>` drawer as an overflow menu. No destination was removed from the app —
everything not directly tabbed (Trade Finance, Loans, FX, Products, Reports, Settings, Activity
history, Admin) stays reachable exactly as before, just one tap further via "Thêm."

Two follow-on fixes this required:
- `<main>`'s wrapper in `app.component.html` gained `pb-16 lg:pb-0` so page content isn't hidden
  behind the new fixed-position bar on mobile.
- `RmChatLauncherComponent`'s default (undragged) mobile position moved from `bottom-5` to
  `bottom-20 lg:bottom-5` so the floating launcher button doesn't collide with the tab bar. Verified
  this doesn't affect a customer who has already dragged the button — the change only touches the
  *default*, undragged position class, never the saved-position logic.

Verified live: the bar renders and highlights the active route correctly, the badge count matches
the header's, and "Thêm" opens the full, unmodified sidebar drawer.

## Dashboard / Home

Restyled to match the mockup's hero-balance-card layout using only existing Tailwind tokens (no
new colors invented). Two additions:
- A new "Thông báo hôm nay" card (mockup-driven — didn't exist before), using the same
  `RmDataService.alerts()` data source the header bell and bottom-tab badge already read, so it's
  one more view over already-real data, not a new data source.
- The previously-inline quick-actions grid extracted into `<app-quick-action-grid>`, with the exact
  same 4 actions (including the existing role-gated "Phê duyệt" for Checker/Admin) — a pure
  refactor, no action added or removed.

## Virtual RM chat

- Header/launcher avatar swapped to `<app-rm-avatar>` (see 3D doc).
- `RM_STATE_LABEL` (`rm-interaction.types.ts`) expanded from 4 of 11 `RMState` values to all 11, so
  the typing indicator shows a distinct message for states that previously fell back to one generic
  "Em đang xử lý..." string (`IDLE` intentionally still has no label — nothing is shown while the
  RM isn't doing anything). Pure data addition; the existing fallback stays as the ultimate safety
  net, and this doesn't touch any of the voice/dedup/session logic built in the prior phase.
- New `VoiceOverlayComponent` — a full-screen visualization (pulsing mic icon, animated waveform
  bars, "Đang nghe.../Đang ghi âm..." status, close button) shown while `RmVoiceService.listening()`
  is true, replacing the previous small-inline-mic-only experience with the mockup's dedicated
  screen. The waveform bars are decorative CSS animation, not a real audio-level analyser — this
  app's STT path (MediaRecorder/cloud transcription) has no per-frame amplitude to visualize
  honestly, so the bars intentionally don't pretend to. The mic button and its existing
  `toggleVoiceInput()` handler are completely unchanged; the overlay is a pure presentation layer
  on top of the already-working STT flow.

## Transfer + Review

`single-transfer.page.ts` already had exactly the 3-stage flow (`editing → previewing →
submitted`) the mockup implies — no new state machine needed. Added:
- `<app-stepper>` above the form, mapped 1:1 to those 3 stages.
- Three form-field grids that had no responsive prefix (stayed 2-column even at 360–390px widths)
  changed to stack on mobile and grid on `sm:` and above — a real, if minor, cramped-layout gap the
  audit found. The amount+currency row (`grid-cols-3`, a 2-col numeric input + a 1-col currency
  select) was deliberately left as-is — that particular pairing reads fine as a single compact row
  even on a phone, unlike the label/value pairs elsewhere on the form.

No FIDO2 gate here — see `docs/fido2-demo-design.md` for why the Maker's own submit stays
ungated.

## Maker workspace / Checker queue / Checker approval

`my-commands.page.ts` and `approval.page.ts` were left functionally and visually as they already
were — filters, sorting, and the (already-existing) reference-number/status/amount table read
clearly on mobile and desktop alike, and the spec's own priority list ranks "FIDO2 demo
authentication/approval" above cosmetic list polish, so effort went to the FIDO2 gate itself (see
`docs/fido2-demo-design.md`) rather than a byte-for-byte visual match to the mockup's exact pill-tab
styling on these two read-heavy list pages.

## Verification

```bash
npx ng build --configuration production   # frontend type-check + template check + bundle size
cd server && npx tsc --noEmit && npm test  # 750/750 — no backend files touched by this round
npm run test:interaction                    # 60/60 — RM_STATE_LABEL change is additive-only
```

Live (Playwright, headless Chromium, both `msb_mk`/Maker and `msb_ck`/Checker accounts, 390px and
1440px viewports):
- Login: hero visible at 390px (previously invisible) → "Đăng nhập" → credentials form → FIDO2
  modal → lands on `/virtual-rm/chat`.
- Dashboard: bottom tab bar visible ≤1023px / hidden ≥1024px, "Thông báo hôm nay" card renders with
  real alert data, quick actions navigate correctly, "Thêm" opens the full sidebar drawer.
- RM chat: avatar renders (SVG fallback, no console errors from the unset `glbSrc` path).
- Transfer: stepper reflects each stage correctly (✓ on completed steps, highlighted current step),
  review screen shows real submitted data.
- Checker approval: FIDO2 modal opens with the correct "Xác thực để phê duyệt giao dịch" copy on
  clicking "Phê duyệt," resolves, and the real `commands.approve()` call fires — command status
  becomes "Đã duyệt," same end state as before this round.

## Known limitations / explicitly out of scope

- No real WebAuthn/production FIDO2 — see `docs/fido2-demo-design.md`.
- No real 3D avatar asset shipped — see `docs/3d-avatar-guide.md`.
- Accounts detail, trade-finance detail/create pages beyond Transfer, reports, admin, settings,
  notifications page, footprint, loans, FX, and products pages were not visually reworked this
  round — kept fully functional, unstyled to the new mockup language.
- Maker workspace / Checker queue list pages were left visually as-is (see above) rather than
  pixel-matched to the mockup's pill-tab filter styling.
