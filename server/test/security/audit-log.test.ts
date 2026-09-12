// Security audit log (spec §25) — masked, structured events. This file runs after login.test.ts
// and rbac-tenant-isolation.test.ts (see run-all.ts's import order) so it can assert on events
// those tests already generated, instead of spending its own extra logins.
import { assert, assertEqual, describe, test } from '../test-runner';
import { _debugClearMemoryLog, _debugReadMemoryLog, logSecurityEvent } from '../../src/auth/audit-log';

describe('security audit log', () => {
  test('a LOGIN_SUCCESS event was recorded for the shared fixture logins', () => {
    const log = _debugReadMemoryLog();
    const successes = log.filter((e) => e.type === 'LOGIN_SUCCESS' && e.userId === 'msb_mk');
    assert(successes.length >= 1, 'expected at least one LOGIN_SUCCESS event for msb_mk from the shared fixtures');
  });

  test('LOGIN_FAILED events were recorded for the wrong-password and unknown-user attempts', () => {
    const log = _debugReadMemoryLog();
    assert(log.some((e) => e.type === 'LOGIN_FAILED'), 'expected at least one LOGIN_FAILED event from login.test.ts');
  });

  test('AUTHORIZATION_DENIED events were recorded for the RBAC 403s', () => {
    const log = _debugReadMemoryLog();
    assert(log.some((e) => e.type === 'AUTHORIZATION_DENIED'), 'expected at least one AUTHORIZATION_DENIED event from the RBAC tests');
  });

  test('SUSPICIOUS_REQUEST events were recorded for the identity-override attempts', () => {
    const log = _debugReadMemoryLog();
    const suspicious = log.filter((e) => e.type === 'SUSPICIOUS_REQUEST' && e['reason'] === 'IDENTITY_OVERRIDE_ATTEMPT');
    assert(suspicious.length >= 1, 'expected at least one IDENTITY_OVERRIDE_ATTEMPT event from the tenant-isolation tests');
  });

  test('logSecurityEvent masks password/OTP/PIN/token/sessionId fields, never writes them verbatim', () => {
    _debugClearMemoryLog();
    logSecurityEvent('LOGIN_FAILED', {
      username: 'someone',
      password: 'super-secret-plaintext',
      otp: '123456',
      pin: '9999',
      sessionId: 'raw-session-id-value',
      token: 'raw-token-value',
    });
    const [entry] = _debugReadMemoryLog();
    assertEqual(entry.password, '***MASKED***');
    assertEqual(entry.otp, '***MASKED***');
    assertEqual(entry.pin, '***MASKED***');
    assertEqual(entry.sessionId, '***MASKED***');
    assertEqual(entry.token, '***MASKED***');
    assertEqual(entry.username, 'someone', 'non-sensitive fields must pass through unmasked');
  });

  test('logSecurityEvent masks all but the last 4 digits of an account number field', () => {
    _debugClearMemoryLog();
    logSecurityEvent('SUSPICIOUS_REQUEST', { accountNumber: '1234567890123456' });
    const [entry] = _debugReadMemoryLog();
    assertEqual(entry.accountNumber, '***3456');
  });

  test('every event has an ISO timestamp and a known event type', () => {
    const log = _debugReadMemoryLog();
    assert(log.length > 0, 'expected some events to have accumulated by now');
    for (const entry of log.slice(-10)) {
      assert(!Number.isNaN(new Date(entry.ts).getTime()), `event ts "${entry.ts}" must be a valid ISO timestamp`);
    }
  });
});
