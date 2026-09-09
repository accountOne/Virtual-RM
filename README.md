# Virtual RM — Digital Business Banking Demo Platform

An interactive demo of a **Virtual Relationship Manager ("Mai")** embedded inside a
Digital Business Banking application, built for corporate/business banking customers
(CFO, Finance Manager, Accountant, Business Owner, Authorized Approver).

The platform demonstrates 5 Virtual RM capabilities end-to-end, on top of an
Angular frontend, a Node.js/Express backend, and **static JSON mock data only**
(no database, no external banking APIs, no LLM):

1. **Daily Business Briefing** — balance, cash in/out yesterday, pending approvals, tasks, and a dynamically computed RM Insight.
2. **Smart Alert & Action** — proactive alerts (pending approvals, loan due, low balance...) that deep-link into a real journey.
3. **Ask Your Bank** — a deterministic, keyword-based intent engine (no LLM) that answers natural-language questions from live mock data.
4. **Business Task Assistant** — a "to-do list" of business tasks that deep-link into mocked banking journeys.
5. **Product Recommendation RM** — product recommendations chosen by simple deterministic rules evaluated against live mock data.

---

## 1. Architecture

```
virtual-rm/
├── src/app/                     Angular 19 app (standalone components, signals)
│   ├── core/
│   │   ├── models/               TypeScript interfaces mirrored from the backend
│   │   ├── services/             RmDataService (shared state), AdminService, ToastService,
│   │   │                         ConfirmDialogService, ChatUiService — HttpClient wrappers
│   │   └── guards/
│   ├── shared/
│   │   ├── components/           badge, empty-state, loading-spinner, toast-container,
│   │   │                         confirm-dialog, header, sidebar, field
│   │   └── pipes/                vnd / vndShort currency pipes
│   └── features/
│       ├── dashboard/            Main banking landing page
│       ├── virtual-rm/           Briefing, Alerts, Tasks, Recommendations, Chat, Widget
│       ├── payments/             Approval, single/batch transfer, payments home
│       ├── accounts/ company/ contracts/ loans/ fx/ products/ reports/
│       ├── admin/demo-data/      Admin Demo Data Editor
│       └── demo/                 Guided Demo Mode walkthrough
│
├── server/                      Node.js + TypeScript + Express backend
│   ├── src/
│   │   ├── controllers/          Thin HTTP request/response mapping
│   │   ├── services/             Business logic (briefing calc, Ask-Your-Bank engine, admin ops)
│   │   ├── repositories/         ONLY layer that touches the filesystem (JSON read/write)
│   │   ├── rules/                Deterministic recommendation rules + intent engine
│   │   ├── models/                TypeScript interfaces
│   │   ├── utils/                 Currency/date helpers
│   │   ├── app.ts / server.ts
│   ├── data/                     Live mock data (read/written by the app)
│   └── data-seed/                Pristine copy used by "Reset Demo Data"
└── package.json                 Root scripts (`npm run dev` starts both client & server)
```

Data flow is strictly layered — **controllers never touch JSON files directly**:

```
Controller → Service → Repository → JSON file (server/data/*.json)
```

This isolation is deliberate: replacing static JSON with real banking APIs later only
means writing a new repository implementation with the same method signatures
(see [§12 Future Integration](#12-future-integration-boundary)).

---

## 2. Prerequisites

- Node.js 18+ (tested on Node 22)
- npm 9+

No database, Docker, Redis, Kafka, or any other infrastructure is required.

---

## 3. Installation

```bash
npm install
```

This installs the Angular app's dependencies and (via `postinstall`) the `server/`
backend's dependencies as well.

---

## 4 & 5. Running the app

**Recommended — one command, both client and server, with hot reload:**

```bash
npm run dev
```

- Backend API: http://localhost:3000 (auto-restarts on file changes via nodemon/ts-node)
- Frontend: http://localhost:4200 (Angular dev server, proxies `/api/*` to :3000 — see `proxy.conf.json`)

Open **http://localhost:4200** in your browser.

**Run them separately, if preferred:**

```bash
npm run start:server   # Express API on :3000
npm run start:client   # Angular dev server on :4200 (with proxy)
```

**Production-style single process** (Angular build served by Express):

```bash
npm run build           # builds Angular to dist/client
npm run build:server    # compiles the backend to server/dist
node server/dist/server.js
```

Then open **http://localhost:3000** — Express serves the built Angular app and the API
from the same origin (no proxy needed).

---

## 6. Mock data structure

All business data lives under `server/data/*.json` and is read/written **only** through
the backend's repository layer:

| File | Contents |
|---|---|
| `customer.json` | Single customer profile object (company, CIF, RM, segment...) |
| `accounts.json` | 2 accounts (VND payment account + USD account) |
| `transactions.json` | 43 realistic transactions across ~35 days (Payroll, FX, Supplier Payment, Trade Finance, Loan Repayment, Tax, Customer Collection, etc.), including 3 `PENDING_APPROVAL` and 1 `REJECTED` |
| `tasks.json` | 5 business tasks with priority, due date, and a deep link |
| `alerts.json` | 5 proactive alerts with severity and a deep link |
| `products.json` | 6 banking products (FX Business, Payroll, Term Deposit, Business Loan, Trade Finance, Cash Management) |
| `recommendations.json` | 5 recommendation records, each tagged with a `ruleKey` |
| `rm-messages.json` | Greeting variants, fallback replies, and suggested questions for the chat |

`server/data-seed/` holds a pristine copy of the same files, used exclusively by
**Reset Demo Data**.

### "Today" is always fresh

The daily briefing/insight never hardcodes a date. The backend anchors "yesterday" to
the latest **non-pending** transaction date in `transactions.json`, so the demo always
reads as current no matter when you actually run it (see `server/src/services/transactions.service.ts`).

### Recommendation rules (deterministic, no ML)

`server/src/rules/recommendation-rules.ts` evaluates simple boolean rules against live
account/transaction data, e.g.:

```
FX_HIGH_USAGE:            FX transactions in last 30 days >= 10
TERM_DEPOSIT_HIGH_BALANCE: average VND account balance >= 5,000,000,000
PAYROLL_HIGH_VOLUME:       Payroll transactions in last 30 days >= 3
TRADE_FINANCE_ACTIVITY:    Trade Finance transactions in last 60 days >= 2
MULTI_ACCOUNT_CASH_MGMT:   number of accounts >= 2
```

Only recommendations whose rule currently evaluates `true` are returned by
`GET /api/recommendations` — edit accounts/transactions in the Admin panel and watch
recommendations appear/disappear accordingly.

### Ask Your Bank intent engine (deterministic, no LLM)

`server/src/rules/intent-engine.ts` normalizes the question (lowercase, strips
Vietnamese diacritics) and matches it against keyword rules, in priority order, into one
of: `BALANCE`, `TRANSACTION_SUMMARY`, `LARGEST_TRANSACTION`, `PENDING_APPROVAL`,
`INCOMING_PAYMENT`, `OUTGOING_PAYMENT`, `ACCOUNT`, `TASK`, `PRODUCT`, or `UNKNOWN`.
`rm.service.ts` then computes a real answer from the current JSON data.

---

## 7. How to modify demo data

Two ways:

1. **Admin UI (recommended for presenters):** open **`/admin/demo-data`** in the app.
   Pick a tab (Customer, Accounts, Transactions, Tasks, Alerts, Products,
   Recommendations), edit the fields, and click **Lưu (Save)**. Changes are written
   straight to `server/data/*.json` and are reflected immediately across the whole app
   (briefing, alerts, recommendations, etc. are re-fetched after every save).

2. **Edit the JSON files directly** under `server/data/` while the backend is running —
   the next API call will pick up the change (there's no in-memory cache).

A warning banner is shown on the Admin page:

> Demo environment — data is stored in local JSON files and must not be used with
> production customer data.

---

## 8. How to reset demo data

Click **"↺ Reset Demo Data"** on `/admin/demo-data` (asks for confirmation) — or call:

```bash
curl -X POST http://localhost:3000/api/admin/reset
```

This copies every file from `server/data-seed/` back over `server/data/`, restoring the
original demo scenario exactly.

---

## 9. API list

**Read (mock data, computed where noted):**

```
GET  /api/customer
GET  /api/accounts
GET  /api/transactions            ?accountId=&status=
GET  /api/tasks
GET  /api/alerts
GET  /api/products
GET  /api/recommendations         (only rule-eligible ones)
GET  /api/rm/briefing             (computed daily briefing + insight)
POST /api/rm/query                { "question": "..." } → deterministic RM answer
```

**Mutating (mock state only):**

```
POST /api/transactions/:id/approve
POST /api/transactions/:id/reject
POST /api/tasks/:id/complete
```

**Admin:**

```
PUT  /api/admin/customer
PUT  /api/admin/accounts              (replace whole list)
PUT  /api/admin/accounts/:id
PUT  /api/admin/transactions/:id
PUT  /api/admin/tasks/:id
PUT  /api/admin/alerts/:id
PUT  /api/admin/products/:id
PUT  /api/admin/recommendations/:id
POST /api/admin/reset
```

---

## 10. Demo scenario

A guided, clickable walkthrough is built into the app at **`/demo`** — each step
navigates you to the real screen to perform it live. It follows this story
(customer: **ABC Manufacturing JSC**, persona: **CFO**):

1. Login (simulated) → Dashboard
2. Virtual RM "Mai" greets the customer → `/virtual-rm`
3. RM shows today's Business Briefing (balance, cash in/out, insight)
4. RM highlights 3 pending approvals (850,000,000 VNĐ)
5–6. Customer opens `/payments/approval`, approves a payment → pending count updates live
7. RM recommends **FX Business** based on recent FX activity
8–9. Customer asks the chat: *"Hôm qua công ty tôi chi bao nhiêu?"* → RM answers from live data
10–11. Customer asks: *"Tôi còn việc gì cần xử lý?"* → RM lists open tasks
12. Customer opens `/company/profile` to complete a task

No external services are required — the whole story runs against local JSON data.

---

## 11. Project structure

See [§1 Architecture](#1-architecture) above.

---

## 12. Future integration boundary

The repository layer is the seam designed for replacing mock data with real banking
services, without touching controllers or services:

```
Today:   Virtual RM Service → JSON Repository        → server/data/*.json
Future:  Virtual RM Service → Banking API Repository  → Kong / API Gateway → Backbase / Banking Services
```

To integrate a real backend later: implement a new repository (e.g.
`AccountsBankingApiRepository`) that satisfies the same shape as
`JsonFileRepository<Account>` (`list/get/update`), and swap the import in
`server/src/repositories/index.ts`. No controller or route changes are required.

---

## 13. Publishing to a public URL for testing (GitHub Pages + Render)

GitHub Pages only serves static files — it cannot run the Express backend. So the
frontend is published to GitHub Pages and the backend is deployed separately (Render's
free tier is the path wired up here); the frontend calls the backend cross-origin.

**One-time setup:**

1. **Deploy the backend.** On [render.com](https://dashboard.render.com), "New +" →
   "Blueprint" → connect this repo. Render reads `render.yaml` at the repo root and
   deploys `server/` automatically. Copy the resulting `https://<name>.onrender.com`
   URL. (Free plan sleeps after ~15 min idle; the first request after that takes
   30–60s to wake up — fine for testing, not for a live pitch.)
2. **Point the frontend at it.** In the GitHub repo: Settings → Secrets and variables →
   Actions → Variables → New repository variable → name `API_URL`, value the Render URL
   from step 1 (no trailing slash).
3. **Enable GitHub Pages.** Settings → Pages → Source → "GitHub Actions" (only needed
   once; `.github/workflows/deploy-pages.yml` handles the rest).

**Every push** to `main` (or `claude/virtual-rm-demo-platform-k36qiq`, or a manual run
from the Actions tab) rebuilds the Angular app with `--base-href /<repo-name>/` and the
`API_URL` baked in, then publishes it to
`https://<owner>.github.io/<repo-name>/`.

How it fits together:

- `src/environments/environment.prod.ts` holds a `%%API_URL%%` placeholder; the workflow
  substitutes it with the `API_URL` variable before building. Left unreplaced (e.g. a
  local `ng build --configuration production`), the app falls back to relative
  `/api/...` calls (same-origin only).
- `src/app/core/interceptors/api-url.interceptor.ts` prefixes every `/api/...` request
  with `environment.apiUrl` when it's configured — no call-site changes needed.
- The backend's CORS is open (`cors()` with no origin restriction in `server/src/app.ts`),
  so cross-origin calls from the `github.io` origin work out of the box.
- `public/404.html` + a small restore script in `src/index.html` implement the standard
  [spa-github-pages](https://github.com/rafgraph/spa-github-pages) trick, so deep links
  and page refreshes on client-side routes (e.g. `/virtual-rm`, `/payments/approval`)
  don't 404 on GitHub Pages.

Once merged/pushed with `API_URL` set, "Reset Demo Data" in `/admin/demo-data` on the
published site resets the Render-hosted `server/data/*.json`, exactly like local dev.

---

## Notes

- No real authentication — a single simulated logged-in customer (**ABC Manufacturing
  JSC**, CFO) is used throughout. `/admin` is reachable without a separate login, as a
  simple "demo switch."
- All amounts are illustrative VND figures for demo purposes only.
- UI is in Vietnamese, styled with Tailwind CSS and the Satoshi typeface, following a
  minimalist, modern banking design language.
