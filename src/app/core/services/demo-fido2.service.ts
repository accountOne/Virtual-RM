import { signal } from '@angular/core';
import { Fido2Context, Fido2Result, Fido2Step } from '../models/fido2.types';
import { Fido2Service } from './fido2.service';

/** How long the "scanning/waiting for authentication" state stays up before resolving —
 * deliberately not instant, so the demo reads as a real challenge/response rather than a fake
 * loading spinner. Named consts, not magic numbers, matching RmTimingService's convention. */
const AUTHENTICATING_MIN_MS = 1400;
const AUTHENTICATING_MAX_MS = 1800;
/** How long the checkmark/"Xác thực thành công" state stays visible before the modal closes
 * itself — long enough to read, short enough not to feel like it's stalling a live demo. */
const SUCCESS_HOLD_MS = 600;

const COPY: Record<Fido2Context, { title: string; subtitle: string }> = {
  login: { title: 'Xác thực để đăng nhập', subtitle: 'Sử dụng khoá bảo mật hoặc sinh trắc học để đăng nhập' },
  'transaction-approval': { title: 'Xác thực để phê duyệt giao dịch', subtitle: 'Sử dụng khoá bảo mật hoặc sinh trắc học để phê duyệt' },
};

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Demo-only `Fido2Service` implementation (docs/fido2-demo-design.md) — simulates the
 * authenticating→success timing of a real WebAuthn ceremony with a plain `setTimeout`, never
 * calling `navigator.credentials`. The UI clearly labels this "Demo FIDO2" everywhere it appears
 * (see Fido2ModalComponent) so it's never mistaken for a production security feature.
 *
 * `pendingReject`-style resolver tracking (same pattern as RmVoiceService.speak()'s
 * `pendingSpeechResolve`) so `cancel()` can unblock an in-flight `authenticate()` call instead of
 * leaving its caller's `await` hanging forever if the customer dismisses the modal mid-scan.
 *
 * Not self-`@Injectable({providedIn:'root'})` — registered instead as the concrete provider for
 * the `Fido2Service` token in `app.config.ts` (`{ provide: Fido2Service, useClass:
 * DemoFido2Service }`), so every call site injects the abstract `Fido2Service` and a later real
 * WebAuthn implementation only needs that one line changed.
 */
export class DemoFido2Service extends Fido2Service {
  readonly step = signal<Fido2Step>('idle');
  readonly copy = signal(COPY.login);

  private pendingResolve: ((result: Fido2Result) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  authenticate(context: Fido2Context): Promise<Fido2Result> {
    this.clearTimer();
    this.copy.set(COPY[context]);
    this.step.set('authenticating');
    return new Promise<Fido2Result>((resolve) => {
      this.pendingResolve = resolve;
      this.timer = setTimeout(() => this.succeed(), randomBetween(AUTHENTICATING_MIN_MS, AUTHENTICATING_MAX_MS));
    });
  }

  cancel(): void {
    this.clearTimer();
    this.resolvePending({ ok: false });
    this.step.set('idle');
  }

  private succeed(): void {
    this.step.set('success');
    this.timer = setTimeout(() => {
      this.resolvePending({ ok: true });
      this.step.set('idle');
    }, SUCCESS_HOLD_MS);
  }

  private resolvePending(result: Fido2Result): void {
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    resolve?.(result);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
