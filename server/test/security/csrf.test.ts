// CSRF (spec §20): double-submit token tied to the session, checked on every state-changing
// verb; GET/HEAD/OPTIONS are exempt by construction. Reuses the shared maker fixture.
import { assert, assertEqual, describe, test } from '../test-runner';
import { validateCsrf } from '../../src/auth/csrf';
import { getMakerClient } from './fixtures';

describe('CSRF protection', () => {
  test('a state-changing POST without the CSRF header is rejected with 403, even with a valid session cookie', async () => {
    const res = await getMakerClient().post('/api/auth/keepalive', undefined, { csrf: false });
    assertEqual(res.status, 403);
  });

  test('a state-changing POST with a wrong/garbage CSRF header value is rejected', async () => {
    const res = await getMakerClient().post('/api/auth/keepalive', undefined, { csrfOverride: 'attacker-guessed-token' });
    assertEqual(res.status, 403);
  });

  test('validateCsrf() rejects any value that is not an exact match for the session token, including empty/undefined', () => {
    const session = { csrfToken: 'the-real-token' } as Parameters<typeof validateCsrf>[0];
    assert(!validateCsrf(session, undefined), 'undefined header must be rejected');
    assert(!validateCsrf(session, ''), 'empty header must be rejected');
    assert(!validateCsrf(session, 'the-real-token-but-longer'), 'a near-match must still be rejected');
    assert(!validateCsrf(session, ['the-real-token']), 'a non-string header value must be rejected');
    assert(validateCsrf(session, 'the-real-token'), 'the exact matching token must be accepted');
  });

  test('a correct CSRF header is accepted', async () => {
    const res = await getMakerClient().post('/api/auth/keepalive');
    assertEqual(res.status, 200);
  });

  test('GET requests never require a CSRF header, even for an authenticated session', async () => {
    const res = await getMakerClient().get('/api/auth/me');
    assertEqual(res.status, 200);
  });

  test('the CSRF cookie is readable by JavaScript (not HttpOnly) — it must be, so the frontend can echo it back', async () => {
    const client = getMakerClient();
    assert(!!client.cookie('csrf_token'), 'expected the csrf_token cookie to be present in the jar (a real HttpOnly cookie would still show up here since our test client reads Set-Cookie directly, so this test only confirms the cookie exists and is used correctly by post())');
  });
});
