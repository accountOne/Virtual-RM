# Authorization

See `authentication.md` for the architecture diagram and `session-management.md` for how a
request gets an authenticated `req.session` in the first place — everything below assumes that
step already happened.

## The rule

> "Virtual RM can understand the customer, but authentication belongs to the security layer.
> Virtual RM can recommend an action, but authorization belongs to the bank's authorization
> workflow. Virtual RM can prepare a transaction, but execution belongs to the authenticated and
> authorized user."

Concretely: **frontend route guards are UX only.** The real enforcement is server-side, on every
route, independent of what the Angular UI happens to show or hide. `src/app/core/guards/
auth.guard.ts` (`authGuard`/`roleGuard`) still exist and still work — they make the app *feel*
right (no flash of a Checker-only screen for a Maker) — but a MAKER calling
`POST /api/transactions/:id/approve` directly with curl, bypassing the UI entirely, gets the same
`403` a CHECKER-only UI button would have prevented them from clicking. This is why the security
test suite (`server/test/security/rbac-tenant-isolation.test.ts`) tests the **routes**, never the
Angular guards.

## Role model

Kept the existing `MAKER | CHECKER | ADMIN` roles this app's UI, guards, and business copy already
depend on everywhere — not the spec's illustrative `CFO/FINANCE_MANAGER/ACCOUNTANT` example roles.
Replacing the role enum the whole app depends on would be exactly the "blind rewrite" this
upgrade's own ground rules warn against (see `security-gap-analysis.md` §4). What *is* new:
`server/src/auth/rbac.ts` is a **data-driven permission table**, not scattered `role === 'X'`
checks, so extending the policy later (a new role, a new permission) is a table edit:

```ts
type Permission = 'READ' | 'ANALYZE' | 'PREPARE' | 'CREATE_REQUEST' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'ADMIN';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  MAKER:   ['READ', 'ANALYZE', 'PREPARE', 'CREATE_REQUEST', 'SUBMIT'],
  CHECKER: ['READ', 'ANALYZE', 'APPROVE', 'REJECT'],
  ADMIN:   ['READ', 'ANALYZE', 'PREPARE', 'CREATE_REQUEST', 'SUBMIT', 'APPROVE', 'REJECT', 'ADMIN'],
};
```

`hasPermission(role, permission)` / `rolesWithPermission(permission)` are the two entry points;
`server/test/security/rbac-tenant-isolation.test.ts` asserts this table matches the actual
route-level guards below (not just that the table itself is internally consistent).

## Route-level enforcement

`requireRole(...roles)` (`server/src/auth/session.middleware.ts`) — mounted directly on the route,
runs after `requireSession`. Fails closed: 401 if somehow reached with no session, 403 (logged as
`AUTHORIZATION_DENIED`) if the session's role isn't in the allowed list.

| Route | Allowed roles | Why |
|---|---|---|
| `POST /api/transactions/:id/approve`, `/reject` | CHECKER, ADMIN | Approving a payment is an authorization action — a Maker's job is to create it, not approve their own (or anyone's) order. |
| `POST /api/trade-finance/lc`, `/guarantees`, `/collections` | MAKER, ADMIN | Creating an LC/BG/Collection *request* is a Maker-initiated SUBMIT action (spec's Level 4) — a Checker's role is to approve requests, not raise them. |
| `PUT /api/admin/*`, `POST /api/admin/reset` | ADMIN | The Admin Demo Data Editor — previously reachable by anyone at all (see `security-gap-analysis.md` §1.2). |
| Everything else under `/api/*` | any authenticated session | Read endpoints and the Virtual RM query/briefing endpoints — gated by `requireSession` alone; RBAC is about *mutating/sensitive* actions, not hiding read data between the three demo roles that all belong to the same one company. |

`POST /api/auth/login` is the sole route reachable without a session at all (there's nothing to
authenticate yet); `GET /api/auth/me` uses the read-only session check (`session-management.md`).

## Defense-in-depth: identity-override stripping

`stripIdentityOverrides` (`session.middleware.ts`), mounted globally on every `/api/*` route after
`requireSession`: deletes `companyId`/`userId`/`role` from `req.body`/`req.query` on every
authenticated request, unconditionally, before any controller sees them. If the deleted value
didn't match the session's real value, a `SUSPICIOUS_REQUEST` (`IDENTITY_OVERRIDE_ATTEMPT`) audit
event is logged (see `audit-logging.md`).

This exists even though every controller was already migrated to read identity from
`req.session` (never `req.body`) — it's the safety net for (a) old/cached frontend bundles still
sending the fields, (b) a future controller that's written carelessly and destructures `req.body`
without checking, and (c) a deliberately crafted request from someone probing the API directly.
`server/test/security/rbac-tenant-isolation.test.ts` proves the override has literally no effect
in both directions — a MAKER sending `role: 'ADMIN'` doesn't escalate, and a CHECKER sending
`role: 'MAKER'` doesn't let them past the LC-creation gate either. See `multi-tenant-security.md`
for the `companyId` half of this same mechanism.

### A real regression this caught during development

`trade-finance.controller.ts::createLc` originally read `role` from `req.body` to gate LC
creation (an older Checker-flow-enforcement pass, before sessions existed). Once
`stripIdentityOverrides` started deleting the body's `role` field, that old check would have
silently evaluated `canCreateLc(undefined)` → always `true` — a *false sense of security* that
looked like a working gate but had quietly become a no-op, with the real gate only being the new
`requireRole('MAKER', 'ADMIN')` route middleware. Fixed by reading `req.session!.role` instead,
kept intentionally as defense-in-depth alongside the route middleware (not because either one
alone would be insufficient today, but because two independent checks catch a mistake in either
one).

## Transaction-level authorization (the 5-level model)

See `transaction-security.md` for how READ/ANALYZE/PREPARE/SUBMIT/AUTHORIZE-EXECUTE map onto this
app's actual routes and UI, and why Virtual RM never reaches the last two levels itself.
