# Audit Logging

`server/src/auth/audit-log.ts`.

## Storage

Appends one JSON object per line to `server/data/audit-log.jsonl` (gitignored — it's runtime
output, not seed data, unlike the other `server/data/*.json` files) and keeps a bounded
(5,000-entry) in-memory tail for the same-process test suite to inspect
(`_debugReadMemoryLog`/`_debugClearMemoryLog`, test-only). Logging is best-effort: a filesystem
failure is caught and swallowed so it can never break the request it's auditing —
`logSecurityEvent()` always runs to completion from the caller's point of view.

Toggle: `AUDIT_ENABLED` (`.env.example`, default `true`). Never disable in a shared/demo-hosted
environment.

## Event taxonomy

```ts
type AuditEventType =
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT'
  | 'SESSION_EXPIRED' | 'SESSION_REVOKED'
  | 'PASSWORD_FAILED' | 'AUTHORIZATION_DENIED' | 'ACCESS_DENIED'
  | 'SUSPICIOUS_REQUEST'
  | 'TRANSACTION_CONFIRMATION' | 'TRANSACTION_SUBMIT' | 'TRANSACTION_REJECT'
  | 'LC_REQUEST_CREATED' | 'GUARANTEE_REQUEST_CREATED' | 'COLLECTION_REQUEST_CREATED';
```

Currently wired call sites (each with its real trigger):

| Event | Fired from | Details logged |
|---|---|---|
| `LOGIN_SUCCESS` | `auth.controller.ts::login` | `userId`, `role` |
| `LOGIN_FAILED` | `login` (bad password, unknown user, locked, inactive) | `username`, `reason` |
| `LOGOUT` | `logout` | `userId` |
| `SESSION_EXPIRED` | `requireSession`/`requireSessionReadOnly` (idle or absolute) | `reason`, `path` |
| `SESSION_REVOKED` | `revoke`/`revokeAll` | `userId`, `self` or `count`/`scope` |
| `AUTHORIZATION_DENIED` | `requireRole` (403) | `userId`, `role`, `path`, `requiredRoles` |
| `SUSPICIOUS_REQUEST` | `requireCsrf` (token mismatch), `stripIdentityOverrides` (identity override attempt) | `userId`, `path`, `reason`, and for an override attempt: `field`, `attempted` |

`TRANSACTION_*`/`*_REQUEST_CREATED` are defined in the type union for a future pass that adds
explicit confirmation-summary audit events at the point of SUBMIT (`transaction-security.md`) —
today those actions are already gated by session+role+CSRF (which *are* audited, via
`AUTHORIZATION_DENIED`/`SUSPICIOUS_REQUEST` on the failure path), but a dedicated
"this specific LC request was created by this user" success-path event is scoped out of this pass
rather than added half-finished; recorded here as a known gap, not silently skipped.

## Masking — never log secrets or full PII

```ts
const SENSITIVE_KEY_PATTERN = /password|passwordhash|otp|pin|cvv|token|sessionid|secret/i;
```

Any object key matching this pattern (case-insensitive, anywhere in the details payload) is
replaced with `'***MASKED***'` before the entry is written or kept in memory — matched against
the *key name*, not the value, so it catches a mistake regardless of what got passed in. A key
matching `/account(no|number)/i` is masked to its last 4 characters only (`***3456`), not fully
redacted — useful for correlating log entries without exposing the full number.
`server/test/security/audit-log.test.ts` proves this with a direct call carrying
`password`/`otp`/`pin`/`sessionId`/`token` fields and confirms every one comes back masked while
an unrelated field (`username`) passes through untouched.

## Sample entries (real shape, not illustrative pseudocode)

```json
{"ts":"2026-09-11T23:00:31.319Z","type":"LOGIN_SUCCESS","userId":"msb_mk","role":"MAKER"}
{"ts":"2026-09-11T23:02:05.066Z","type":"LOGIN_FAILED","username":"msb_mk","reason":"BAD_PASSWORD"}
{"ts":"2026-09-11T23:05:12.001Z","type":"AUTHORIZATION_DENIED","userId":"msb_mk","role":"MAKER","path":"/transactions/txn-001/approve","requiredRoles":["CHECKER","ADMIN"]}
{"ts":"2026-09-11T23:06:40.220Z","type":"SUSPICIOUS_REQUEST","userId":"msb_mk","path":"/virtual-rm/query","reason":"IDENTITY_OVERRIDE_ATTEMPT","field":"companyId","attempted":"COM999-INJECTED"}
```

No password, OTP, PIN, CVV, raw session id, or CSRF secret ever appears in any of these — even a
deliberate attempt to log one (as in the masking test above) comes out redacted.
