// Demo FIDO2 authentication/approval step-up (docs/fido2-demo-design.md). Client-side simulation
// only — no WebAuthn/`navigator.credentials` call anywhere in this codebase. Kept as its own
// small type module (not inlined in fido2.service.ts) so `Fido2ModalComponent` and both call
// sites (login, transaction approval) can import just the shapes without pulling in DI tokens.

export type Fido2Step = 'idle' | 'authenticating' | 'success' | 'failed';

/** Only changes the modal's copy — see DemoFido2Service.authenticate(). Never gates different
 * business logic; both contexts resolve the same Fido2Result shape. */
export type Fido2Context = 'login' | 'transaction-approval';

export interface Fido2Result {
  ok: boolean;
}
