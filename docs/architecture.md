# Architecture — Virtual RM Demo Platform

## Layers

```
Angular 19 (standalone components, signals)
        ↓  HttpClient (/api/*)
Node.js + Express + TypeScript
        ↓
Controller → Service → Repository
        ↓
server/data/*.json   (only the Repository layer touches the filesystem)
```

- **Controllers** — thin HTTP request/response mapping only, no business logic.
- **Services** — business logic: briefing calculation, the Ask-Your-Bank intent
  engine, recommendation rules, admin read/write orchestration.
- **Repositories** — the *only* layer that touches `server/data/*.json`. Swapping
  mock data for a real banking API later means writing a new repository with the
  same method signatures (`list/get/update`) — no controller or service changes.

## Frontend structure

```
src/app/
├── core/
│   ├── models/          TypeScript interfaces mirrored from the backend
│   ├── services/        RmDataService (shared state), AuthService, AdminService,
│   │                     ToastService, ConfirmDialogService, ChatUiService
│   ├── guards/           authGuard, guestOnlyGuard, roleGuard
│   └── interceptors/     api-url.interceptor.ts (cross-origin API prefixing)
├── shared/
│   ├── components/       header, sidebar, badge, card/button/input utility classes
│   │                     (src/styles.scss), empty-state, loading-spinner, toast,
│   │                     confirm-dialog, field
│   └── pipes/            vnd / vndShort currency pipes
└── features/
    ├── pre-login/         Marketing landing page (unauthenticated root route)
    ├── auth/              Login page (demo credentials, role selection)
    ├── dashboard/         Business Home — accounts, quick actions, recent transactions
    ├── virtual-rm/         Briefing, Alerts, Tasks, Recommendations, Chat, floating Widget
    ├── payments/          Payments home, single/batch transfer, approval queue
    ├── accounts/ company/ contracts/ loans/ fx/ products/ reports/
    ├── admin/demo-data/   Admin Demo Data Editor (edit/save/reset mock data)
    └── demo/              Guided, clickable demo-mode walkthrough
```

State flows one way: `RmDataService` fetches once per session and exposes Angular
signals (`accounts()`, `transactions()`, `briefing()`, `alerts()`, `openTasks()`,
`recommendations()`, `pendingTransactions()`). Any mutation (approve a transaction,
complete a task, edit demo data in Admin) re-fetches the affected signals, so every
screen — including the Virtual RM panel — reflects the new state immediately.

## Why this shape

The repository seam is deliberate: this stays a **static-JSON demo** end-to-end (no
database, no real banking API, no LLM, no additional infrastructure), while still
being structured so that replacing `JsonFileRepository<T>` with e.g.
`AccountsBankingApiRepository` (same `list/get/update` shape) is the only change
needed to point the same UI at a real backend later — see README §12.

## Design system

Visual tokens (colors, typography, spacing, radius, shadows, breakpoints, component
patterns) are documented in [`msb-design-system.md`](./msb-design-system.md) and
defined in `tailwind.config.js` (utility classes, source of truth) and
`src/styles/design-tokens.scss` (plain SCSS mirror for non-utility-class usage).
