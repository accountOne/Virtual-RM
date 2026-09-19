# Demo FIDO2 — design

A client-side-simulated "Demo FIDO2" step-up, added at login and at the Checker's transaction
approval, per the premium-redesign spec's explicit request for "FIDO2 authentication/approval ở
mức DEMO." No `navigator.credentials` call exists anywhere in this codebase — this is a UI/timing
simulation, always visibly labeled "Demo FIDO2," never presented as production-grade security.

## Why client-side only

The spec's own priority order puts "existing functionality must continue working" above the FIDO2
feature itself. Building this as a pure frontend layer on top of the real, already-working
session-cookie login (`AuthService.login()`) and the real Maker/Checker approval API
(`CommandsService.approve()`) means:

- Zero backend changes — no new endpoint, no new credential storage, no change to
  `server/src/controllers/auth.controller.ts` or `commands.controller.ts`.
- Zero change to API contracts.
- The FIDO2 step can never itself grant unauthorized access: at login, the real password check
  (`auth.login()`) already succeeded before the FIDO2 modal even opens — FIDO2 here is a
  *confirmation* step, not the thing granting the session. At approval, the real
  `commands.approve()` call only fires after FIDO2 resolves successfully, exactly where the old
  plain confirm dialog used to gate it.

## Contract

```ts
// core/models/fido2.types.ts
export type Fido2Step = 'idle' | 'authenticating' | 'success' | 'failed';
export type Fido2Context = 'login' | 'transaction-approval';
export interface Fido2Result { ok: boolean; }

// core/services/fido2.service.ts
export abstract class Fido2Service {
  abstract readonly step: Signal<Fido2Step>;
  abstract readonly copy: Signal<{ title: string; subtitle: string }>;
  abstract authenticate(context: Fido2Context): Promise<Fido2Result>;
  abstract cancel(): void;
}
```

`Fido2Service` is an **abstract class token**, not a concrete service — every call site injects
`Fido2Service`, never `DemoFido2Service` directly. The concrete provider is registered once, in
`app.config.ts`:

```ts
{ provide: Fido2Service, useClass: DemoFido2Service }
```

Swapping in a real WebAuthn implementation later means writing a `WebAuthnFido2Service implements
Fido2Service` (backed by `navigator.credentials.get()`/`.create()` and a real backend challenge
endpoint) and changing that one line — no call site changes.

## `DemoFido2Service`

Simulates the authenticating→success timing of a real WebAuthn ceremony with a plain
`setTimeout` (`AUTHENTICATING_MIN_MS`/`MAX_MS` = 1400–1800ms, `SUCCESS_HOLD_MS` = 600ms — named
constants, matching `RmTimingService`'s own convention elsewhere in this codebase). Tracks a
`pendingResolve` callback (the same pattern `RmVoiceService.speak()` uses for its
`pendingSpeechResolve`) so `cancel()` can unblock an in-flight `authenticate()` call — a caller's
`await fido2.authenticate(...)` can never hang forever if the customer dismisses the modal.

`copy` varies by `Fido2Context` purely for the modal's title/subtitle text — no branching logic is
duplicated between the two call sites.

## Insertion points

**Login** (`login.page.ts`, `submit()`): after `AuthService.login()` returns `ok: true` and before
`router.navigateByUrl(...)`:

```ts
const result = await this.auth.login(this.username, this.password);
if (!result.ok) { this.error.set(result.message); return; }
const fido2Result = await this.fido2.authenticate('login');
if (!fido2Result.ok) return; // real session already exists; just don't navigate yet
this.router.navigateByUrl(returnUrl || '/virtual-rm/chat');
```

Kept as an in-component phase signal (`'welcome' | 'credentials'`), not a separate guarded route —
a route-based FIDO2 step would need to re-derive `returnUrl` after an extra navigation, which is
exactly the kind of subtle regression this design avoids.

**Transaction approval** (`command-detail.page.ts`, `approve()`) — the one true "approval" action
in the real Maker/Checker 4-eyes flow (spec §9 is literally titled "TRANSACTION APPROVAL – FIDO2
DEMO"). Replaces what used to be a generic `ConfirmDialogService.ask()` call; everything from the
existing `idempotencyKey` guard onward — the `busy()` state, the real `commands.approve()` call,
toast/error handling — is byte-for-byte unchanged:

```ts
async approve(cmd: BankingCommand): Promise<void> {
  const fido2Result = await this.fido2.authenticate('transaction-approval');
  if (!fido2Result.ok || !cmd.idempotencyKey) return;
  this.busy.set(true);
  try {
    const approved = await this.commands.approve(cmd.id, cmd.idempotencyKey);
    ...
```

**Deliberately not gated by FIDO2**: the Maker's own "Gửi duyệt" submit
(`single-transfer.page.ts`'s `submit()`), the Checker's "Từ chối" reject path, and the legacy
pending-transactions `approveLegacy`/`rejectLegacy` flow in `approval.page.ts` — a Maker *submitting*
a request for someone else to approve is not the same action as an *approval*, and widening the
demo beyond the one true approval action risks conflating the two in a live demo.

## `Fido2ModalComponent`

Presentational only, driven entirely by `Fido2Service.step()`/`.copy()`. Mounted once at
`AppComponent` level — in **both** the authenticated and guest template branches, since login
itself needs it before a session exists — the same pattern `<app-confirm-dialog>`/
`<app-toast-container>` already use. Shows: a "🔐 Demo FIDO2" badge (always, so it's never mistaken
for the real thing), a pulsing key icon during `authenticating`, an animated checkmark during
`success`, and a "Huỷ" cancel button (calls `fido2.cancel()`) while authenticating.

## Verified live (Playwright, headless Chromium, against the running dev app)

- Login: fill demo account → submit → FIDO2 modal opens with "Xác thực để đăng nhập" copy →
  resolves → lands on `/virtual-rm/chat`.
- Approval: Maker creates a real transfer → Checker opens it → clicks "Phê duyệt" → FIDO2 modal
  opens with "Xác thực để phê duyệt giao dịch" copy → resolves → the real `commands.approve()`
  call fires → command status becomes "Đã duyệt" (Approved), same as before this change.

## Known limitations

- No real biometric/security-key detection — the modal's copy ("Chạm vào khoá bảo mật hoặc hoàn
  tất sinh trắc học") describes a real WebAuthn ceremony's *feel*, not its mechanics.
- No `navigator.credentials` registration/storage — there is nothing to actually "register" a
  security key against.
- Deterministic success only (no simulated failure path shown to the end user) — chosen
  deliberately so a live customer-facing demo never randomly fails.
