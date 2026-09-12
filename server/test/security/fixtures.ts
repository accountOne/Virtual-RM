// Shared login fixtures for the whole security suite — logging in three times total (once per
// role) instead of once per test file keeps the suite's total `/api/auth/login` call count
// comfortably under the real, production `loginRateLimiter`'s 20-requests-per-15-minutes cap
// (spec §23) without ever having to disable it for the test run. This file's own test MUST run
// before any other security test, which the runner guarantees as long as this file is the
// first `./security/*` import in run-all.ts (test-runner.ts executes tests in registration
// order, and `describe`/`test` register synchronously at import time).
import { assert, assertEqual, describe, test } from '../test-runner';
import { loginAs, TestClient } from './http-client';
import { startServer } from './test-server';

let maker: TestClient | undefined;
let checker: TestClient | undefined;
let admin: TestClient | undefined;

export function getMakerClient(): TestClient {
  if (!maker) throw new Error('fixtures have not run yet — is ./security/fixtures imported first in run-all.ts?');
  return maker;
}
export function getCheckerClient(): TestClient {
  if (!checker) throw new Error('fixtures have not run yet');
  return checker;
}
export function getAdminClient(): TestClient {
  if (!admin) throw new Error('fixtures have not run yet');
  return admin;
}

describe('security suite fixtures', () => {
  test('starts the real Express app and logs in one session per demo role', async () => {
    await startServer();

    const mk = await loginAs('msb_mk', 'msb_mk@2026');
    assertEqual(mk.body.user.id, 'msb_mk');
    assertEqual(mk.body.user.role, 'MAKER');
    assert(!!mk.body.company.id, 'login response must carry a companyId');
    assert(!('passwordHash' in mk.body.user), 'login response must never carry a password hash');
    assert(!('sessionId' in (mk.body as unknown as Record<string, unknown>)), 'login response must never carry the raw session id');
    maker = mk.client;

    const ck = await loginAs('msb_ck', 'msb_ck@2026');
    assertEqual(ck.body.user.role, 'CHECKER');
    checker = ck.client;

    const ad = await loginAs('msb_ad', 'msb_ad@2026');
    assertEqual(ad.body.user.role, 'ADMIN');
    admin = ad.client;

    // All three demo users share the one seeded company (this is a deliberately single-tenant
    // demo — see docs/security/security-gap-analysis.md §1.4/§3).
    assertEqual(mk.body.company.id, ck.body.company.id);
    assertEqual(mk.body.company.id, ad.body.company.id);
  });
});
