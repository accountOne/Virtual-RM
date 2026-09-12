// Session lifecycle — spec §5/§6/§7/§8/§24: fixation protection, idle/absolute timeout, logout
// invalidation, and the sessions list/revoke/revoke-all UI. This file deliberately runs LAST
// among the security test files (see run-all.ts's import order) because its revoke-all test
// necessarily revokes every *other* session for the user it targets — including the shared
// msb_mk role fixture other files read from.
import { assert, assertEqual, describe, test } from '../test-runner';
import {
  _debugSetAbsoluteExpiry,
  _debugSetLastActivity,
  toDisplayId,
} from '../../src/auth/session-store';
import { loginAs, TestClient } from './http-client';

interface MeBody {
  authenticated: boolean;
  user?: { id: string; role: string };
}

interface SessionSummary {
  id: string;
  isCurrent: boolean;
}

describe('session lifecycle', () => {
  test('logging in twice as the same user mints two different session ids (fixation protection)', async () => {
    const a = await loginAs('msb_mk', 'msb_mk@2026');
    const b = await loginAs('msb_mk', 'msb_mk@2026');
    assert(a.client.cookie('session_id') !== b.client.cookie('session_id'), 'every login must mint a brand-new session id');

    const meA = await a.client.get<MeBody>('/api/auth/me');
    const meB = await b.client.get<MeBody>('/api/auth/me');
    assertEqual(meA.status, 200);
    assertEqual(meB.status, 200);

    // GET /auth/sessions lists both, using non-reversible display ids, never the raw session id.
    // Note: the shared msb_mk role fixture (fixtures.ts) is also a live session for this same
    // user by this point, so the list has 3+ entries — this test must not assume exactly 2.
    const list = await a.client.get<SessionSummary[]>('/api/auth/sessions');
    assertEqual(list.status, 200);
    assert(list.body.length >= 2, 'expected at least the two sessions just created');
    for (const s of list.body) {
      assert(s.id !== a.client.cookie('session_id'), 'the sessions list must never expose a raw session id');
    }

    // Revoke b's session specifically (identified by its own display id, computed the same way
    // the server does) — not just "the first non-current session in the list", which could just
    // as easily be the unrelated shared fixture session also live for this user.
    const bDisplayId = toDisplayId(b.client.cookie('session_id')!);
    assert(list.body.some((s) => s.id === bDisplayId), "expected b's session to appear in a's sessions list");
    const revoke = await a.client.post(`/api/auth/sessions/${bDisplayId}/revoke`);
    assertEqual(revoke.status, 200);

    const meBAfterRevoke = await b.client.get<MeBody>('/api/auth/me');
    assertEqual(meBAfterRevoke.status, 401, "revoking a session must actually invalidate it server-side, not just remove it from a's list");

    // a's own session must still be perfectly valid.
    const meAStillValid = await a.client.get<MeBody>('/api/auth/me');
    assertEqual(meAStillValid.status, 200);

    // Logout invalidates a's session server-side too — not just a client-side cookie clear.
    const logout = await a.client.post('/api/auth/logout');
    assertEqual(logout.status, 200);
    const meAfterLogout = await a.client.get<MeBody>('/api/auth/me');
    assertEqual(meAfterLogout.status, 401, 'a session must be unusable immediately after logout');
  });

  test('an idle-expired session is rejected, and GET /api/auth/me itself never extends idle activity', async () => {
    const { client } = await loginAs('msb_ck', 'msb_ck@2026');
    const sessionId = client.cookie('session_id')!;

    const before = await client.get<MeBody>('/api/auth/me');
    assertEqual(before.status, 200);

    // Backdate lastActivityAt well past the default 15-minute idle window — no need to
    // actually sleep 15 real minutes to exercise this.
    _debugSetLastActivity(sessionId, Date.now() - 20 * 60_000);

    const afterIdle = await client.get<MeBody>('/api/auth/me');
    assertEqual(afterIdle.status, 401, 'an idle-expired session must be rejected');
  });

  test('an absolute-expired session is rejected even if it was just active', async () => {
    const { client } = await loginAs('msb_ck', 'msb_ck@2026');
    const sessionId = client.cookie('session_id')!;

    // Force the absolute expiry into the past — the session is otherwise perfectly "fresh"
    // (just created, zero idle time), proving absolute timeout is enforced independently of
    // idle timeout, not derived from it.
    _debugSetAbsoluteExpiry(sessionId, Date.now() - 1_000);

    const res = await client.get<MeBody>('/api/auth/me');
    assertEqual(res.status, 401, 'an absolute-expired session must be rejected regardless of recent activity');
  });

  test('GET /me is read-only (no idle extension); POST /keepalive extends idle but never the absolute timeout', async () => {
    const { client, body: first } = await loginAs('msb_mk', 'msb_mk@2026');

    // A page-load/warning-poll style GET /api/auth/me must never itself count as activity —
    // otherwise a session-timeout-warning poller would keep an idle session alive forever.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const polled = await client.get<{ session: { idleExpiresAt: string } }>('/api/auth/me');
    assertEqual(
      polled.body.session.idleExpiresAt,
      first.session.idleExpiresAt,
      'GET /api/auth/me must not extend the idle timeout',
    );

    // "Continue session" (POST /keepalive) DOES extend idle — but must never push out the
    // absolute expiry, which is a hard ceiling regardless of activity (spec §7).
    await new Promise((resolve) => setTimeout(resolve, 10));
    const keepalive = await client.post<{ session: { expiresAt: string; idleExpiresAt: string } }>('/api/auth/keepalive');
    assertEqual(keepalive.status, 200);
    assertEqual(keepalive.body.session.expiresAt, first.session.expiresAt, 'keepalive must never push out the absolute expiry');
    assert(
      new Date(keepalive.body.session.idleExpiresAt).getTime() > new Date(polled.body.session.idleExpiresAt).getTime(),
      'keepalive must extend the idle expiry',
    );
  });

  test('revoke-all kills every other session for a user, except the one that called it', async () => {
    const kept = await loginAs('msb_mk', 'msb_mk@2026');
    const toRevoke1 = await loginAs('msb_mk', 'msb_mk@2026');
    const toRevoke2 = await loginAs('msb_mk', 'msb_mk@2026');

    const res = await kept.client.post<{ success: boolean; revokedCount: number }>('/api/auth/sessions/revoke-all');
    assertEqual(res.status, 200);
    assert(res.body.revokedCount >= 2, 'expected at least the two other msb_mk sessions created in this test to be revoked');

    const meKept = await kept.client.get<MeBody>('/api/auth/me');
    assertEqual(meKept.status, 200, 'the calling session itself must survive revoke-all');

    const meRevoked1 = await toRevoke1.client.get<MeBody>('/api/auth/me');
    const meRevoked2 = await toRevoke2.client.get<MeBody>('/api/auth/me');
    assertEqual(meRevoked1.status, 401);
    assertEqual(meRevoked2.status, 401);
  });
});
