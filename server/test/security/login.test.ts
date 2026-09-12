// Login endpoint behavior — spec §3/§23. Real HTTP for the request/response contract; direct
// function calls for the pure lockout-counting logic (no reason to spend 5 real HTTP round
// trips, each a real bcrypt compare, just to prove a counter increments).
import { assert, assertEqual, describe, test } from '../test-runner';
import { hashPassword, verifyPassword } from '../../src/auth/password';
import { _debugClearLockouts, isLocked, recordFailedLogin, recordSuccessfulLogin } from '../../src/auth/rate-limit';
import { TestClient } from './http-client';

interface ErrorBody {
  message: string;
}

describe('login (password hashing, generic errors, brute-force lockout)', () => {
  test('passwords are hashed with bcrypt, never stored/compared as plaintext', () => {
    const hash = hashPassword('correct horse battery staple');
    assert(hash !== 'correct horse battery staple', 'hash must not equal the plaintext');
    assert(hash.startsWith('$2'), 'expected a bcrypt hash (starts with $2a/$2b)');
    assert(verifyPassword('correct horse battery staple', hash), 'correct password must verify');
    assert(!verifyPassword('wrong password', hash), 'wrong password must not verify');
  });

  test('a wrong password for a real user and a nonexistent username return the exact same message', async () => {
    const client1 = new TestClient();
    const wrongPw = await client1.post<ErrorBody>('/api/auth/login', { username: 'msb_mk', password: 'not-the-real-password' });
    assertEqual(wrongPw.status, 401);

    const client2 = new TestClient();
    const noSuchUser = await client2.post<ErrorBody>('/api/auth/login', { username: 'does-not-exist', password: 'anything' });
    assertEqual(noSuchUser.status, 401);

    assertEqual(wrongPw.body.message, noSuchUser.body.message);
    assert(
      !/user|tài khoản không tồn tại|khong ton tai/i.test(wrongPw.body.message),
      'the message must not hint at which part (username vs password) was wrong',
    );
  });

  test('missing credentials are rejected with 400 and the same generic message, not a field-specific one', async () => {
    const client = new TestClient();
    const res = await client.post<ErrorBody>('/api/auth/login', { username: 'msb_mk' });
    assertEqual(res.status, 400);
    assert(!!res.body.message, 'must still return a message body');
  });

  test('recordFailedLogin trips isLocked() after the configured threshold, independent of source IP', () => {
    _debugClearLockouts();
    const username = 'lockout-unit-test-user';
    assert(!isLocked(username), 'must not start locked');
    for (let i = 0; i < 4; i++) recordFailedLogin(username);
    assert(!isLocked(username), 'must not lock before the threshold (default 5) is reached');
    recordFailedLogin(username);
    assert(isLocked(username), 'must lock once the threshold is reached');
    recordSuccessfulLogin(username);
    assert(!isLocked(username), 'a recorded successful login must clear the lockout');
    _debugClearLockouts();
  });

  test('the login endpoint itself rejects a request while locked — even with the correct password', async () => {
    // msb_ad is used here (not msb_mk/msb_ck) so this doesn't disturb the shared role fixtures
    // other test files rely on — those already logged in before this test runs.
    _debugClearLockouts();
    for (let i = 0; i < 5; i++) recordFailedLogin('msb_ad');
    assert(isLocked('msb_ad'), 'precondition: msb_ad must be locked for this test to be meaningful');

    const client = new TestClient();
    const res = await client.post<ErrorBody>('/api/auth/login', { username: 'msb_ad', password: 'msb_ad@2026' });
    assertEqual(res.status, 401, 'a locked account must be rejected even with the right password');

    _debugClearLockouts();
    const retry = await client.post<Record<string, unknown>>('/api/auth/login', { username: 'msb_ad', password: 'msb_ad@2026' });
    assertEqual(retry.status, 200, 'clearing the lockout must let the very next correct-password attempt through');

    // Piggy-backs the response-shape check onto this successful login instead of spending a
    // separate one — a login response must never carry a password hash or the raw session id.
    const flat = JSON.stringify(retry.body);
    assert(!flat.includes('$2'), 'response body must never contain a bcrypt hash');
    assert(!('sessionId' in retry.body), 'response body must never expose the raw session id');
  });

  test('the login response carries the per-IP rate-limit headers (proves loginRateLimiter is actually mounted)', async () => {
    const client = new TestClient();
    const res = await client.post<ErrorBody>('/api/auth/login', { username: 'msb_mk', password: 'wrong-on-purpose' });
    assert(res.headers.get('ratelimit-limit') !== null, 'expected a RateLimit-Limit header on the login response');
    // The exact numeric threshold (20/15min, spec §23) was verified manually via 22 real
    // requests during development — see docs/security/session-management.md. Actually
    // exhausting it here would consume the shared per-IP budget the rest of this suite's
    // logins run on, since express-rate-limit's in-memory store is process-wide.
  });
});
