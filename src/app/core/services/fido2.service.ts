import { Signal } from '@angular/core';
import { Fido2Context, Fido2Result, Fido2Step } from '../models/fido2.types';

/**
 * Abstraction for the "Demo FIDO2" step-up flow (docs/fido2-demo-design.md) — login and
 * transaction-approval both authenticate through this contract, never through a concrete
 * implementation directly, so a later real WebAuthn implementation
 * (`navigator.credentials.get()`/`.create()`) is a drop-in provider swap in `app.config.ts`
 * (`{ provide: Fido2Service, useClass: WebAuthnFido2Service }`) with zero call-site changes.
 *
 * `DemoFido2Service` is the only implementation today — see its own doc comment for the simulated
 * state machine.
 */
export abstract class Fido2Service {
  /** Drives `Fido2ModalComponent` — 'idle' means no modal is showing. */
  abstract readonly step: Signal<Fido2Step>;

  /** Title/subtitle for whichever `Fido2Context` the current/last `authenticate()` call used —
   * read by `Fido2ModalComponent`, set by `authenticate()` before it flips `step` off 'idle'. */
  abstract readonly copy: Signal<{ title: string; subtitle: string }>;

  /** Opens the modal and resolves once the authentication attempt finishes, one way or another.
   * Never rejects — a cancelled/failed attempt resolves `{ ok: false }` so callers can use a
   * plain `if (!result.ok) return;` guard, the same shape `ConfirmDialogService.ask()` callers
   * already use for `if (!ok) return;`. */
  abstract authenticate(context: Fido2Context): Promise<Fido2Result>;

  /** User dismissed the modal (backdrop click / cancel button) before it resolved on its own. */
  abstract cancel(): void;
}
