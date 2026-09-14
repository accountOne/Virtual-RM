# Issues and Bugs — m-friday.vercel.app

**Not populated with app-level bugs** — see `README.md` — `BROWSER_ACCESS = NOT_AVAILABLE` for
this target, so no in-app bug could be observed.

The one real issue in this audit is environmental, logged here for completeness:

| ID | Severity | Description | Evidence | Status |
|---|---|---|---|---|
| ENV-001 | Blocker (audit-level, not app-level) | This Cloud session cannot reach `https://m-friday.vercel.app` — outbound access is denied by the session's network egress policy | `curl` → `http_code:000`; proxy status log → `connect_rejected` (403 CONNECT denial); `WebFetch` → `EGRESS_BLOCKED`; Playwright `page.goto()` → `net::ERR_TUNNEL_CONNECTION_FAILED`. Same policy independently confirmed against two unrelated control domains earlier the same session. | Open — see `README.md` §3 for how to resolve |
