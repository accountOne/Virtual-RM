# Session Management

See `authentication.md` for the overall architecture diagram this fits into.

## Storage model

`server/src/auth/session-store.ts` — an in-memory `Map<sessionId, SessionRecord>`. Demo-appropriate:
a real deployment would back this with Redis/a database so sessions survive a process restart and
work across multiple server instances, but the shape (opaque id → record, idle/absolute timeout,
explicit create/touch/revoke) is exactly what that swap would keep — nothing about the API
contract below is memory-specific.

```ts
interface SessionRecord {
  sessionId: string;      // 32 random bytes, hex — never exposed to the client as anything but the cookie value
  userId: string;
  companyId: string;
  role: 'MAKER' | 'CHECKER' | 'ADMIN';
  displayName: string;
  csrfToken: string;      // see csrf-cors.md
  createdAt: number;
  lastActivityAt: number;
  absoluteExpiresAt: number; // frozen at creation — never extended
  userAgent?: string;
  ip?: string;
}
```

## Cookies

Two cookies are set on login (`res.cookie` in `auth.controller.ts::login`):

| Cookie | HttpOnly | SameSite | Purpose |
|---|---|---|---|
| `session_id` | **yes** | `Lax` (`COOKIE_SAME_SITE`) | The session key. Never readable by JS — this is what makes token theft via XSS meaningfully harder than a JS-readable token would be. |
| `csrf_token` | **no** (deliberately) | `Lax` | Double-submit CSRF value — the frontend must be able to read it to echo it back as a header. See `csrf-cors.md`. |

Both are cleared (`Expires` in the past) on logout and on session revocation.

## Session fixation protection

`createSession()` always mints a **brand-new** random session id — logging in never reuses or
"upgrades" a pre-existing session id from the client. There is no pre-auth "anonymous session" in
this app at all, which already avoids the classic fixation vector (an attacker priming a known
session id before the victim logs into it), but the guarantee holds unconditionally either way:
`server/test/security/session.test.ts`'s fixation test logs the same user in twice and asserts the
two session ids differ.

## Timeouts

Two independent limits, both enforced on **every** authenticated request
(`touchSession()`/`peekSession()` in `session-store.ts`):

- **Idle timeout** (`SESSION_IDLE_TIMEOUT_MINUTES`, default 15) — resets on genuine activity,
  expires the session after this many minutes of *no* requests.
- **Absolute timeout** (`SESSION_ABSOLUTE_TIMEOUT_HOURS`, default 8) — frozen at login, never
  extended by activity, "Continue session," or anything else. A hard ceiling.

An expired session (either kind) is deleted from the store immediately on the next request that
touches it, not just rejected — `requireSession` clears the cookie and returns the same generic
401 (`Phiên đăng nhập không hợp lệ hoặc đã hết hạn.`) either way, so a client cannot distinguish
"idle-expired" from "absolute-expired" from "revoked" from "never existed." `SESSION_EXPIRED` is
still recorded in the audit log server-side with the real reason.

### Why `GET /api/auth/me` doesn't extend the idle timeout

`requireSessionReadOnly` (`session.middleware.ts`) uses `peekSession()` instead of
`touchSession()` specifically for this one route. The reason: the frontend's session-timeout
warning polls `/api/auth/me` every 30 seconds to know whether to show "Phiên đăng nhập sắp hết
hạn" — if that poll itself counted as activity, the idle timeout could never fire while a tab was
merely open, silently defeating the whole feature. Every other authenticated route (including the
explicit `POST /api/auth/keepalive` the warning's "Continue" button calls) goes through the normal,
activity-touching `requireSession`. Verified live in
`server/test/security/session.test.ts` ("GET /me is read-only... POST /keepalive extends idle but
never the absolute timeout").

## Pre-expiry warning UX

`src/app/core/services/session-timeout.service.ts`: polls `GET /api/auth/me` every 30s while
authenticated; when the idle expiry is within 2 minutes, shows a dialog ("Phiên đăng nhập sắp hết
hạn... Anh/chị muốn tiếp tục phiên làm việc không?") via the app's existing generic
`ConfirmDialogService` — no new dialog component, matching the app's established confirm-prompt
pattern. **Continue** calls `POST /api/auth/keepalive` (extends idle, never absolute — the hard
cap still fires on schedule regardless). **Logout** calls the real logout flow and redirects to
`/login`.

## Logout

`POST /api/auth/logout` — deletes the `SessionRecord` from the store (`revokeSession`), not just
the cookie. A logged-out session's id is immediately useless even if somehow replayed
(`server/test/security/session.test.ts` proves this explicitly). The frontend also resets the
Virtual RM conversation (`RmChatSessionService.resetChat()`) on logout and on a 401 from any API
call, so a stale conversation from one login can never bleed into the next.

## Concurrent sessions — list / revoke / revoke-all

`GET /api/auth/sessions` lists every live session for the caller's own user — id, device
(`userAgent`), created/last-active timestamps, and whether it's the caller's current one. **Never
the raw `sessionId`** — `toDisplayId()` (`session-store.ts`) hashes it with SHA-256 and truncates,
a one-way, deterministic reference safe to show in a UI.

- `POST /api/auth/sessions/:id/revoke` — `:id` is a display id, resolved back to the real session
  via `findByDisplayId`. Revoking the caller's own current session also clears their cookie.
- `POST /api/auth/sessions/revoke-all` — revokes every *other* session for the caller's user
  (deliberately keeps the caller's own current session alive — "log out all other devices," not
  "log myself out too").

## Frontend: no token in browser storage

`src/app/core/services/auth.service.ts` holds `currentUser`/`companyId`/`sessionExpiresAt` as
Angular signals, populated only from server responses (`applySession()`), never persisted to
`localStorage`/`sessionStorage`. A hard refresh re-derives everything from the `session_id`
cookie via `restoreSession()` (wired as an app-bootstrap initializer in `app.config.ts`, so it
resolves before any route guard runs). Verified live via Playwright: `localStorage` after a real
login contains only the (non-sensitive) chat-message cache key, nothing auth-related.
