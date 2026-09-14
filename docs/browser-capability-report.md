# Browser Capability Report — Cloud Environment

Verified live on 14/09/2026 by actually running each check below (no assumptions). Reference
site used for the network tests: `https://digibank.msb.com.vn/business/vi`.

## A. Repository

| Item | Value |
|---|---|
| GitHub repository | `accountOne/Virtual-RM` (`origin` remote: `https://github.com/accountOne/Virtual-RM`) |
| Current branch | `claude/virtual-rm-demo-platform-k36qiq` (up to date with `origin`, tracking set) |
| Latest commit | `e26ca9914d3d201dd22d19011d6e5ff7a76179e8` — 2026-09-14 |
| Working tree before changes | Clean — `git status` reported "nothing to commit, working tree clean" before this task started |
| Angular version | `19.2.25` (CLI `19.2.27`), from `npx ng version`; `package.json` pins `@angular/core: ^19.2.0`, `@angular/cli: ^19.2.27`, `typescript: ~5.7.2` |
| Node.js version | `v22.22.2` (`node --version`), npm `10.9.7` |
| Backend runtime | Node.js + Express (`server/package.json`: `express ^4.21.2`, TypeScript `^5.7.2`, run via `ts-node`/`nodemon` in dev, compiled with `tsc` for prod) |

### How frontend and backend are run

- **Dev, two processes (recommended for iteration)**:
  - Backend: `npm run start:server` → `nodemon --watch src --ext ts --exec ts-node src/server.ts`, serves the API on `http://localhost:3000`.
  - Frontend: `npm run start:client` → `ng serve --proxy-config proxy.conf.json`, serves the Angular app on `http://localhost:4200` and proxies `/api/*` to `:3000` (see `proxy.conf.json`).
  - Both at once: `npm run dev` (root) → `concurrently` runs both of the above.
- **Prod-style, single process**: `npm run build` (Angular → `dist/client`) + `npm run build:server` (TypeScript → `server/dist`), then `node server/dist/server.js` — Express serves the built Angular app and the API from one origin (`:3000`), no proxy needed.
- Confirmed live this session: started both dev processes, backend responded `401` on `GET /api/auth/me` (expected — no session yet) and frontend responded `200` on `GET /`, then torn down after verification (no servers left running).

## B. Browser capability

Each item below was actually executed, not inferred.

| # | Question | Result |
|---|---|---|
| 1 | Browser automation tool available? | **Yes, but not exposed as a first-class Claude tool.** No dedicated "Browser"/Playwright MCP tool exists in this session's tool list (checked via tool search — only `WebFetch`/`WebSearch` exist as network tools, neither is a real browser). However, **Playwright `1.56.1` is pre-installed globally** (`/opt/node22/lib/node_modules/playwright`) with a **Chromium binary at `/opt/pw-browsers/chromium`** (env `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`), usable via `NODE_PATH=/opt/node22/lib/node_modules node <script>.js` through the Bash tool. |
| 2 | Can open a public URL by browser? | **No.** Three independent tests all confirm outbound access to the public internet is blocked by this session's egress/network policy — this is a session-level restriction, not specific to the reference domain: <br>1. `curl` (with the session's CA bundle) to the reference URL → `http_code:000`. <br>2. `curl` to a *control* site (`https://example.com`, unrelated to MSB) → also `http_code:000`. The proxy status endpoint (`/__agentproxy/status`) logged both as `connect_rejected` — "gateway answered 403 to CONNECT (policy denial)". <br>3. `WebFetch` tool on the reference URL → `EGRESS_BLOCKED` error. <br>4. Playwright/Chromium `page.goto()` on the reference URL → `net::ERR_TUNNEL_CONNECTION_FAILED`. <br>All four independent paths (raw curl, a different domain, Anthropic's own WebFetch tool, and a real browser engine) agree: **no public URL is reachable from this environment**, confirmed rather than assumed. |
| 3 | Can screenshot a website? | **Only a local one.** Screenshotting the *reference* (public) site is impossible per #2. Screenshotting is otherwise fully functional: Playwright rendered inline HTML and produced a valid PNG (`local-render-test.png`, sanity check with no network involved), and separately rendered and screenshotted the **local Angular app** end-to-end (see #6). |
| 4 | Can get DOM and computed styles? | **Yes, for local content.** Verified against the local app's `/login` page: `page.title()`, `page.locator(...).count()`, and `getComputedStyle(document.body).backgroundColor` (via `page.evaluate`) all returned correct real values (see #6's output). Cannot be exercised against the reference site since it can't be reached at all (#2). |
| 5 | Can run the local Angular app and open a preview? | **Yes.** Started both dev servers this session (`npm run start:server` on `:3000`, `npm run start:client` on `:4200`) and polled until both responded (backend `401` on an auth-required endpoint = healthy; frontend `200` on `/`). |
| 6 | Can screenshot the local app? | **Yes, confirmed with a real render.** Playwright navigated to `http://localhost:4200/login`, took a full-page screenshot, and read back: title `"Đăng nhập — MSB Business Banking"`, 1 `h1`/`h2`, 4 `<button>` elements, body computed `background-color: rgb(248, 250, 252)`. The screenshot itself rendered the real MSB Business Banking login page correctly (brand gradient panel, Vietnamese copy, demo-account hints) — not a blank or error page. |
| 7 | Can compare reference screenshot vs. local screenshot? | **No — blocked upstream, not a tooling gap.** A local screenshot can be produced any time (#6). A reference screenshot cannot be produced at all, for any reference URL, because outbound access to the public internet is denied at the network-policy layer (#2) — confirmed with four different tools, not just the reference domain. Without a reference image, no pixel/DOM comparison is possible in this environment as currently configured. |

### Bottom line

```
BROWSER_ACCESS = LOCAL_ONLY
```

More precisely: a real, working Playwright + Chromium browser **is** available in this
environment and **can** render, screenshot, and inspect DOM/computed styles — but **only for
content this session can reach**, which is `localhost`/local dev servers. Public internet access
(the reference site included) is blocked by the session's own egress/network policy, confirmed
via curl, WebFetch, and Playwright independently, not assumed. If the task strictly requires
`BROWSER_ACCESS = NOT_AVAILABLE` semantics because *no* browser tool exists at all, that would be
inaccurate here — the tool exists and works; only the public-network leg does not.

## Limitations

- **No public-internet screenshots or DOM inspection of the reference site** (`digibank.msb.com.vn`
  or any other public host) from this environment — this is an organization-level network policy
  decision (`connect_rejected` from the egress gateway), not something fixable by installing a
  different tool, retrying, or reconfiguring proxy settings. Per this session's own proxy
  documentation, 403/407 CONNECT denials must be reported, not routed around.
- **No dedicated "Browser" tool** is wired into Claude's own tool list for this session (unlike,
  e.g., a `WebFetch`-style first-class tool) — the Playwright capability is a general-purpose
  Node.js library invoked via the Bash tool, not a purpose-built visual-diff or screenshot tool.
  It works, but every check is a hand-written script, not a one-call tool.
- **No visual regression / pixel-diff library** (e.g. `pixelmatch`, `odiff`) is currently
  installed in this project or globally — only Playwright itself. Comparing two screenshots
  numerically (not just eyeballing them) would need one of these added, and even then there is no
  reference screenshot to diff against (see #7).
- Backend and frontend dev servers had to be started/stopped manually for this check; nothing is
  running now (verified via `ps aux` after cleanup) — a later session/agent would need to start
  them again before taking a local screenshot.
- This report reflects a point-in-time check of the *current* Cloud session's network policy.
  Policy is set per-environment at session creation and is not something this session can change
  from inside itself.

## Recommended implementation workflow

Given the above, UI work in this environment should follow a **local-only visual verification**
loop rather than a live reference-vs-local comparison:

1. **Get the reference design out-of-band, once, outside this session.** Since this session
   cannot fetch `digibank.msb.com.vn` itself, a human (or a session with broader network access)
   should capture reference screenshots/specs (colors, spacing, copy, layout at a few breakpoints)
   and commit them into the repo (e.g. `docs/reference/*.png` or a short written spec) so future
   sessions have something concrete to build against without needing live public-internet access.
2. **Implement the UI change** against that committed reference material.
3. **Verify locally, every time, using the confirmed-working Playwright setup**:
   - Start `npm run dev` (or the two-process dev flow), poll until both `:3000` and `:4200`
     respond healthy — as done in this check.
   - Use a Playwright script (`NODE_PATH=/opt/node22/lib/node_modules node <script>.js`,
     `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is already set) to navigate the real flow
     (login → the changed screen), screenshot at the relevant viewport(s), and assert on
     DOM/computed-style values for anything that must be pixel/CSS-correct.
   - Eyeball the screenshot directly (via the `Read` tool on the PNG) against the committed
     reference material from step 1, since no automated pixel-diff tool is installed yet.
4. **If numeric visual-regression diffing becomes a real requirement**, add a small devDependency
   (e.g. `pixelmatch` + `pngjs`) to the project — a local, offline comparison between two already-
   captured PNGs, which does not depend on any network access this session lacks.
5. **Always tear down dev servers after verification** (as done here) so no stray process is left
   running between tasks, and always re-check `git status`/working tree before and after UI
   changes, matching this project's existing verification discipline (see other
   `docs/phase-5.5-*.md` write-ups in this repo for the pattern).
6. **Never attempt to work around the egress block** (no proxy bypass, no alternate DNS, no
   retrying 403s) — per this session's own proxy documentation, that is an organization policy
   decision to report, not route around.
