# Security Gap Analysis — Login & Session Security Upgrade

Written before any code changed, per this task's own rule (§37/§38): audit first, then implement
a real fix — not "just add a login page" on top of what's already there.

## 1. Current state (as found)

### 1.1 Authentication
- `src/app/core/services/auth.service.ts`: `DEMO_USERS` is a hardcoded `{password, role,
  displayName}` map compiled straight into the Angular bundle. `login()` compares plaintext
  password strings client-side, in the browser, with no server round-trip at all.
- On success, the "session" — `{username, role, displayName}` — is written to
  `localStorage['vrm_auth_user']` and read back by `AuthService`'s `signal(restore())` on every
  page load. There is no expiry, no signature, no server-issued token of any kind — anyone can
  open devtools and write `localStorage.setItem('vrm_auth_user', '{"username":"x","role":"ADMIN",...}')`
  to become an authenticated admin.

### 1.2 Session
- **There is no server-side session.** `server/src/app.ts` has no `cookie-parser`, no session
  store, no auth middleware of any kind — `app.use(cors())` (wide open, credentials-less) and
  `app.use(express.json())` are the entire middleware stack before every controller.
- `server/src/routes/index.ts` mounts every route — including `PUT /api/admin/*`,
  `POST /api/transactions/:id/approve|reject`, `POST /api/trade-finance/lc|guarantees|collections`
  — with **zero** authentication or authorization check. Any client that can reach the API can
  call any of them directly, regardless of what the Angular route guards show or hide.

### 1.3 "Who is the caller" today
- `server/src/controllers/semantic.controller.ts::query()` reads `userId` and `role` **straight
  out of the request body** (`const { message, userId, role } = req.body`) and hands them to
  `buildSecurityContext(userId, role)` (`server/src/semantic/semantic-engine.ts:282`) with no
  validation that this `userId`/`role` pair corresponds to any real, currently-authenticated
  user. The frontend (`RmDataService.askRm()`) sends whatever `AuthService.currentUser()` has in
  memory — which, per §1.1, the browser itself fully controls. `role` can be forged from
  devtools; the server would accept it as-is.
- `companyId`, to its credit, is **never** taken from the client anywhere in the codebase (grep
  confirms no controller/route reads a `companyId` query/body param) — `buildSecurityContext`
  always resolves it from `customerRepository.read().customerId` server-side. This one piece is
  already correct; it just needs to stay that way once real sessions exist.

### 1.4 Data model — single tenant
- Every repository (`server/src/repositories/*.repository.ts`) wraps exactly **one** JSON file
  per entity (`JsonSingletonRepository`/simple array files) — there is one `customer.json`, one
  `accounts.json`, etc. Nothing in the data layer has a `companyId` column to filter by. This
  demo has always modeled a single company (`CIF00012345` / "ABC Manufacturing JSC"); "COM001 vs
  COM002" is not a real, populated scenario today. `server/src/tools/index.ts`'s own header
  comment already says as much: *"this demo's dataset is single-tenant... so there is no per-row
  companyId column to filter by today; the boundary exists so that swapping in a real
  multi-tenant backend later only means adding a `.filter(...)` inside each tool body."*

### 1.5 AI / Virtual RM tool layer
- `server/src/tools/index.ts` — every one of the ~30 exported tools is a `get_*` read. There is
  **no mutating tool** anywhere in the AI/Reasoning layer today — `approve_payment`,
  `submit_lc`, `issue_lc` etc. from the task's example tool list don't exist as AI tools; they
  don't need to be *disabled* for Virtual RM because Virtual RM was never given them. The actual
  mutating endpoints (`transactions.controller.ts::approve/reject`, `admin.controller.ts::*`,
  `trade-finance.controller.ts::createLc/createGuarantee/createCollection`) are called directly
  by human-clicked Angular UI buttons, never by the reasoning engine.
- Every tool already takes `UserContext` (never request input) as its first argument — the
  wiring for "security context, not client input" is already right at this layer; it's the
  *session* that's missing upstream of it.

### 1.6 Other
- No CSRF protection (no cookies exist to need it against yet).
- No CORS allowlist (`cors()` with no options = `*`, though credential-less so not exploitable
  as a credentialed cross-origin read today — becomes a real gap the moment cookies exist).
- No security headers (`helmet` not installed).
- No rate limiting anywhere (`/api/auth` doesn't exist yet; `/api/virtual-rm/query` is unlimited).
- No audit log of any kind.
- Frontend guards (`auth.guard.ts`, `roleGuard`) are real Angular `CanActivateFn`s, but since the
  backend enforces nothing, they are UX-only today — bypassable by calling the API directly.

## 2. Gap → Target → Implementation

| # | Current | Gap | Target | Implementation |
|---|---|---|---|---|
| 1 | Password check + role stored in browser | Client fully controls identity | Server validates credentials, issues opaque session | `server/src/auth/user-store.ts` (bcrypt), `POST /api/auth/login` |
| 2 | `localStorage['vrm_auth_user']` | Token/identity readable & writable by any script/devtools | No auth data in localStorage/sessionStorage; identity lives server-side | `HttpOnly; Secure; SameSite=Lax` `session_id` cookie; frontend re-asks `GET /api/auth/me` |
| 3 | No server session store | Nothing to invalidate, no timeout, no fixation protection | In-memory session store, opaque IDs, idle+absolute timeout, new ID every login | `server/src/auth/session-store.ts` |
| 4 | `userId`/`role` from request body | Client can forge role for any request, including `/virtual-rm/query` | `userId`/`role`/`companyId` only ever read from `req.securityContext` (session) | `session.middleware.ts` attaches `req.securityContext`; `semantic.controller.ts` stops reading `req.body.userId/role` |
| 5 | No route protection | Any client can call `/admin/*`, approve/reject, create LC/BG/Collection | `requireSession` on every `/api/*` route (except health/login); `requireRole` on the routes above | `session.middleware.ts` + `app.ts` wiring |
| 6 | No CSRF | Once cookies exist, cross-site forms could ride the session | Double-submit CSRF token on state-changing verbs | `server/src/auth/csrf.ts` |
| 7 | `cors()` wildcard | Wildcard + credentials is a real cross-origin risk once cookies exist | Explicit `ALLOWED_ORIGINS`, `credentials: true` | `app.ts` |
| 8 | No security headers | Missing baseline hardening | `helmet()` with an explicit CSP | `app.ts` |
| 9 | No rate limiting | Brute-force login, unlimited AI query cost | Login lockout after N failures; per-IP limits on login/virtual-rm/transaction routes | `server/src/auth/rate-limit.ts` |
| 10 | No audit log | No record of security-relevant events | Structured, masked JSONL audit log | `server/src/auth/audit-log.ts` |
| 11 | Single-tenant data layer | Cannot prove cross-company data isolation with a second real dataset | **Documented limitation, not silently ignored** — see §3 below | N/A this pass |
| 12 | No `SecureToolDefinition` metadata | Nothing stops a future PR from adding a mutating AI tool unreviewed | Explicit risk-level registry + a runtime assertion every tool call goes through | `server/src/tools/tool-security.ts` |
| 13 | No confirmation-summary UI change needed | LC/Guarantee/Collection "create" forms already require a submit click; they just weren't authenticated/authorized server-side | Keep the existing create-form UX; add server-side session+role enforcement so the click is actually gated, not just displayed | `trade-finance.controller.ts` routes gain `requireRole('MAKER','ADMIN')` |

## 3. Honest scope decision — multi-tenant isolation

The task asks to prove "COM001 cannot access COM002's data." This demo has exactly one company
in its dataset; building a second, fully-populated, isolated company dataset is a data-model
change (every repository would need a `companyId` column and a filter), not a security-hardening
change — and risks exactly what §37/§38 warn against ("do not blindly rewrite the existing
architecture," "preserve working features").

What this pass **does** deliver and test, honestly:
- `companyId` is (and remains) 100% server-derived from the session — never accepted from a
  request body/query param, anywhere.
- A request that attempts to smuggle a different `companyId` (or `userId`, or `role`) into the
  body/query of any endpoint is verified, by test, to have **zero effect** on the response — the
  session's own values are used regardless, and the attempt is written to the audit log as
  `SUSPICIOUS_REQUEST`.
- The plumbing (`session → req.securityContext → controller → tool layer → response`) is
  end-to-end correct today, so the moment the data layer grows a second tenant, the only
  remaining change is the `.filter(r => r.companyId === ctx.companyId)` `tools/index.ts` already
  called out as the future step — not a new security layer.

What it does **not** claim: that two different companies' *business data* is isolated today,
because only one company's business data exists. This is recorded here rather than papered over.

## 4. What this pass does not touch

- Business logic of the Semantic Engine, Reasoning Engine, Calculation Engine, Trade Finance
  services, or any Phase 5/5.5/5.6 UI — all of it keeps working exactly as before; only *who is
  allowed to call it, and how the caller's identity is established* changes.
- The existing `MAKER | CHECKER | ADMIN` role model — the task's own example roles
  (CFO/FINANCE_MANAGER/ACCOUNTANT) are noted as a possible future config, but replacing the
  role names the whole app's UI/guards/business copy already depends on is out of scope for a
  security-hardening pass, and would be the kind of "blind rewrite" §37 warns against. The RBAC
  permission matrix (`server/src/auth/rbac.ts`) is written data-driven precisely so adding more
  roles later is a table edit, not a rewrite.
