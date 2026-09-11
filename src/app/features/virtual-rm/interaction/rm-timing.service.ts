import { Injectable } from '@angular/core';

/** Phase 5.6 natural response timing (spec §5). Shapes how long the typing indicator shows
 * before a response reveals — never an instant flash, never an artificially long wait once the
 * backend was already slow. Respects `prefers-reduced-motion` (spec §25: animation must never
 * be required to use the product). */
@Injectable({ providedIn: 'root' })
export class RmTimingService {
  private readonly MIN_TYPING_MS = 400;
  private readonly NORMAL_MIN_MS = 700;
  private readonly NORMAL_MAX_MS = 1200;
  private readonly MAX_ARTIFICIAL_MS = 1500;

  prefersReducedMotion(): boolean {
    try {
      return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
      return false;
    }
  }

  /** Given how long the real backend call already took (`elapsedMs`), waits just long enough
   * that the typing indicator never feels instant or jarring — but adds zero extra delay once
   * the backend was already slower than the minimum, and adds nothing at all when the user has
   * reduced motion enabled. */
  async settle(elapsedMs: number): Promise<void> {
    if (this.prefersReducedMotion()) return;
    if (elapsedMs >= this.MIN_TYPING_MS) return;
    const target = this.NORMAL_MIN_MS + Math.random() * (this.NORMAL_MAX_MS - this.NORMAL_MIN_MS);
    const capped = Math.min(target, this.MAX_ARTIFICIAL_MS);
    const remaining = Math.max(0, capped - elapsedMs);
    if (remaining > 0) await sleep(remaining);
  }

  /** A short, fixed pause between two messages revealed in sequence (spec §6's progressive
   * reveal) — small enough to read as "the next part arriving", never a re-run of the full
   * typing wait per bubble. Skipped entirely under reduced motion. */
  async betweenMessages(): Promise<void> {
    if (this.prefersReducedMotion()) return;
    await sleep(250);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
