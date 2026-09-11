import { RmTimingService } from '../rm-timing.service';
import { assert, describe, test } from './test-runner';

function elapsedSince(start: number): number {
  return Date.now() - start;
}

describe('rm-timing.service — RmTimingService', () => {
  test('prefersReducedMotion() never throws even with no `window` (Node test environment)', () => {
    const timing = new RmTimingService();
    // No assertion on the boolean itself — there's no real browser matchMedia here — only that
    // the try/catch fallback (spec §25) makes this safe to call unconditionally.
    timing.prefersReducedMotion();
  });

  test('settle() adds no delay once the real call already took >= the minimum typing time', async () => {
    const timing = new RmTimingService();
    const start = Date.now();
    await timing.settle(500);
    assert(elapsedSince(start) < 100, 'settle() must return immediately once elapsedMs >= 400ms');
  });

  test('settle() pads a too-fast response up to somewhere in the natural typing window, capped at 1500ms', async () => {
    const timing = new RmTimingService();
    const start = Date.now();
    await timing.settle(0);
    const waited = elapsedSince(start);
    assert(waited >= 600, `expected settle(0) to wait at least ~700ms, waited ${waited}ms`);
    assert(waited <= 1600, `expected settle(0) to never exceed the 1500ms cap (+ margin), waited ${waited}ms`);
  });

  test('betweenMessages() waits a short, fixed pause for progressive reveal pacing', async () => {
    const timing = new RmTimingService();
    const start = Date.now();
    await timing.betweenMessages();
    const waited = elapsedSince(start);
    assert(waited >= 200, `expected betweenMessages() to wait ~250ms, waited ${waited}ms`);
    assert(waited <= 500, `expected betweenMessages() to stay a short pause, waited ${waited}ms`);
  });
});
