# CSRF & CORS

## CSRF — double-submit token tied to the session

`server/src/auth/csrf.ts` + `requireCsrf` (`session.middleware.ts`). Not a bare stateless
double-submit ("some cookie named `csrf_token` matches some header") — the token is generated
once per session (`session.csrfToken`, minted in `createSession()`) and the check
(`validateCsrf`) compares the header against **that specific session's** value:

```ts
function validateCsrf(session: SessionRecord, headerToken: unknown): boolean {
  return typeof headerToken === 'string' && headerToken.length > 0 && headerToken === session.csrfToken;
}
```

- Cookie: `csrf_token`, **not** `HttpOnly` (deliberately — the frontend must be able to read it to
  echo it back), `SameSite=Lax`.
- Header: `X-CSRF-Token`.
- Enforced on every state-changing verb (`POST`/`PUT`/etc.) on every `/api/*` route except
  `/api/auth/login` (no session/token exists yet to hold one). `GET`/`HEAD`/`OPTIONS` are exempt
  by construction — this API is deliberately never used to mutate via `GET`.
- A missing header, an empty header, or a mismatched value all fail with `403` and log
  `SUSPICIOUS_REQUEST` (`CSRF_TOKEN_MISMATCH`). Verified by
  `server/test/security/csrf.test.ts`, including the unit-level edge cases (`undefined`, `''`, a
  near-miss string, a non-string header value).

**Why not rely on `SameSite` alone:** `SameSite=Lax` already blocks most cross-site POST forgery
in modern browsers, but it's one setting on one cookie — a misconfigured proxy, an older browser,
or a same-site subdomain someone doesn't fully trust can all narrow that protection. The CSRF
token is a second, independent layer that doesn't depend on the browser's cookie-partitioning
behavior at all.

### Frontend wiring

`src/app/app.config.ts` uses Angular's built-in
`withXsrfConfiguration({ cookieName: 'csrf_token', headerName: 'x-csrf-token' })` — Angular reads
the cookie and attaches the header automatically on every `HttpClient` request; nothing
hand-written duplicates this logic. `src/app/core/interceptors/auth.interceptor.ts` additionally
sets `withCredentials: true` on every `/api/*` request, so cookies (and therefore CSRF) work both
in same-origin dev (ng serve's proxy) and the documented cross-origin split-deployment case
(Angular served separately from the API).

## CORS — explicit allowlist, never a wildcard with credentials

`server/src/app.ts`:

```ts
app.use(cors({ origin: allowedOrigins(), credentials: true }));
```

`allowedOrigins()` reads `ALLOWED_ORIGINS` (comma-separated) from the environment; if unset, it
falls back to the two local dev origins this repo's own `ng serve` setup actually uses
(`http://localhost:4200`, `http://127.0.0.1:4200`) — **never** falls back to `*`, which would be
an active vulnerability the moment `credentials: true` is also set (a wildcard origin + credentials
lets any site read an authenticated response). Verified by
`server/test/security/security-headers.test.ts`: a request from an arbitrary disallowed Origin
never gets `Access-Control-Allow-Origin` echoed back for that origin.

A production deployment must set `ALLOWED_ORIGINS` explicitly to its real frontend origin(s).

## Security headers (helmet)

`server/src/app.ts` — `helmet()` with an explicit CSP:

```
default-src 'self'; script-src 'self' 'sha256-<hash of the one static inline script>';
style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';
frame-ancestors 'self'; object-src 'none'; base-uri 'self';
```

Notes on two deliberate deviations from helmet's defaults, both found and fixed via live
Playwright verification during this pass (not just reasoned about):

- **`scriptSrc` includes one SHA-256 hash, not `'unsafe-inline'`.** `src/index.html` has exactly
  one pre-existing inline `<script>` (a GitHub-Pages-redirect shim, unrelated to this security
  work) — allow-listed by the exact hash of its built content, which only that specific,
  developer-authored byte sequence can ever match. An attacker-injected inline script would have
  a different hash and still be blocked; `'unsafe-inline'` would have defeated CSP's actual
  XSS-mitigation value for the sake of one static, harmless script.
- **`upgradeInsecureRequests` is off.** Helmet defaults it on, which makes the browser silently
  rewrite every same-origin fetch/XHR from `http:` to `https:` — fine behind real HTTPS, but this
  demo's default deployment is plain HTTP (see `authentication.md`'s transport section), and a
  server with no TLS listener then resets every rewritten request. Confirmed live: every API call
  failed with `net::ERR_CONNECTION_RESET` until this was turned off.
- Also turned off the beasties/critical-CSS build optimization
  (`angular.json`'s `optimization.styles.inlineCritical: false`) rather than adding
  `'unsafe-inline'` to `scriptSrcAttr` for the inline `onload=` attribute that optimization
  generates — CSS just loads render-blocking instead, a negligible cost for a demo, in exchange
  for keeping `scriptSrcAttr` at helmet's strict default (`'none'`).

`server/test/security/security-headers.test.ts` asserts CSP/`X-Content-Type-Options`/
`X-Frame-Options`/HSTS are present, that `script-src` never contains `unsafe-eval` or a wildcard,
and that `.env` is never served as literal file content (the Angular SPA catch-all route returns
`index.html` for any unmatched path, `.env` included — confirmed to never leak the real file).
