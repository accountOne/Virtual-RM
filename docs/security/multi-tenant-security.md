# Multi-Tenant Security

This is the fullest write-up of the honest scope decision first recorded in
`security-gap-analysis.md` §3 — read that section for the original reasoning; this doc is the
implementation + test-evidence side of the same decision.

## What this demo's data model actually is

Every repository (`server/src/repositories/*.repository.ts`) wraps exactly one JSON file per
entity — one `customer.json`, one `accounts.json`, and so on. There is no `companyId` column
anywhere in the data layer. This app has always modeled exactly one company
(`CIF00012345` / "ABC Manufacturing JSC"); all three demo users (`msb_mk`/`msb_ck`/`msb_ad`)
belong to it. `server/src/tools/index.ts`'s own header comment predates this security pass and
already said as much: *"this demo's dataset is single-tenant... the boundary exists so that
swapping in a real multi-tenant backend later only means adding a `.filter(...)` inside each tool
body."*

## Why a second fake company wasn't built for this pass

Building a second, fully-populated, isolated company dataset would be a **data-model change**
(every repository gaining a `companyId` column and every read gaining a filter clause) — not a
security-hardening change, and it risks exactly what this task's own ground rules warn against:
"do not blindly rewrite the existing architecture," "preserve working features." A demo dataset
invented purely to make a test pass green, with no real product requirement behind it, would also
just be decoration — it wouldn't exercise anything the mechanism below doesn't already prove.

## What *is* proven, and how

The actual security property spec §10/§11 cares about is: **the server enforces
`companyId = session.companyId`, and a client-supplied value is ignored — never "the two
companies' data happens to be different."** That property holds regardless of how many companies
exist in the dataset, and is fully testable with just one:

1. **`companyId` is server-derived, unconditionally.** `companyIdForUser()`
   (`server/src/auth/user-store.ts`) resolves it from `customerRepository.read().customerId` at
   login time — it is never read from a request body, query string, header, or the AI's own
   output, anywhere in the codebase (this was already true before this security pass; it's the
   one piece of the old design that was already correct — see `security-gap-analysis.md` §1.3).
2. **A client-supplied `companyId` is actively stripped, not just ignored.**
   `stripIdentityOverrides` (`authorization.md`) deletes it from `req.body`/`req.query` on every
   authenticated request, and audits the attempt if the supplied value didn't match the session's
   real one (`SUSPICIOUS_REQUEST` / `IDENTITY_OVERRIDE_ATTEMPT` — see `audit-logging.md`).
3. **Both directions are tested, not just "override denied."**
   `server/test/security/rbac-tenant-isolation.test.ts`:
   - A `companyId`/`userId`/`role` triplet injected into a Virtual RM query body still returns
     `200` — the request isn't rejected, the fields are silently dropped and the real session
     identity is used regardless (proves it's stripped, not merely validated-and-rejected).
   - A MAKER sending `role: 'ADMIN'` in the body of an ADMIN-only route still gets `403` (no
     escalation).
   - A CHECKER sending `role: 'MAKER'` in the body of a MAKER-only route still gets `403` (the
     override can't help the *opposite* direction either — proves it's genuinely ignored, not
     "ignored only when it would grant more access").

## What this does not claim

That two different companies' *business data* is isolated today — because only one company's
business data exists in this demo. That is a data-model gap, recorded here rather than papered
over with a fabricated second dataset. The plumbing
(`session → req.session → controller → tool layer → response`) is end-to-end correct, so the
day the data layer grows a second tenant, the only remaining change is the
`.filter(r => r.companyId === ctx.companyId)` `tools/index.ts` already called out as the future
step — not a new security layer on top of what exists today.
