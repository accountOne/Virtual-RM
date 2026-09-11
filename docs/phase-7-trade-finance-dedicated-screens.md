# Phase 7 — Trade Finance Dedicated Business Screens: Architecture

Written after the code, describing what actually shipped (companion to
`docs/phase-6-trade-finance-architecture.md`, which this phase builds on).

## 1. The gap Phase 7 closes

Phase 6 gave Trade Finance real reasoning (risk prioritization, exposure,
document/discrepancy/amendment/claim intents) but every `OPEN_LC` /
`OPEN_GUARANTEE` / `OPEN_COLLECTION` navigation action still routed to the
generic `/products` page — Virtual RM chat was the *only* Trade Finance
surface. A live demo run showed every LC-related question collapsing to the
same "5 LC — Xem Trade Finance →" answer whose CTA led nowhere specific.

Phase 7's mandate: Trade Finance gets real Business Banking screens — a
dashboard, list/detail/create for LC, Guarantee, and Collection — and
Virtual RM becomes a *navigator* into them (deep-linking to the exact record
asked about), not a replacement for them. The existing Semantic /
Reasoning / Tool / Calculation Engine stack is unchanged; this phase adds a
REST + UI layer on top of it.

## 2. Backend: a second read/write surface over the same data

`server/src/services/trade-finance.service.ts` is a thin service — `listLc /
getLc / createLc`, the equivalent trio for guarantees and collections, and
`summary()` (aggregates active/outstanding/expiring/pending-documents/
discrepancy/pending-approval/claims/awaiting-payment/awaiting-acceptance/
overdue counts, exposure by currency, and the `TRADE_FINANCE` credit limit).
It reads/writes the *same* `letterOfCreditsRepository` /
`bankGuaranteesRepository` / `collectionsRepository` JSON-file repositories
the chat query API already uses — there is one system of record, not two.

`server/src/controllers/trade-finance.controller.ts` wraps it in Express
handlers, registered in `server/src/routes/index.ts`:

```
GET  /api/trade-finance/summary
GET  /api/trade-finance/lc            POST /api/trade-finance/lc
GET  /api/trade-finance/lc/:id
GET  /api/trade-finance/guarantees    POST /api/trade-finance/guarantees
GET  /api/trade-finance/guarantees/:id
GET  /api/trade-finance/collections   POST /api/trade-finance/collections
GET  /api/trade-finance/collections/:id
```

`createLc/createGuarantee/createCollection` always create records with
status `PENDING_APPROVAL` (LC/Guarantee) or `PROCESSING` (Collection) —
Virtual RM and these screens can *submit a draft request*, never issue or
approve one; that stays a human/back-office action outside this app's scope.

## 3. Entity-aware navigation: `actions[]` instead of one generic `action`

Before Phase 7, `SemanticAnswer` carried a single `action: {label, target}`
with no record identity — "5 LC sắp hết hạn" and "Xem LC-2026-001" both
resolved to the same `/products` link. Two additive fields fixed this
(`server/src/semantic/types.ts`):

```ts
interface AnswerAction { label: string; target: string; entityId?: string; entityType?: string; }
interface SemanticAnswer { action?: AnswerAction; actions?: AnswerAction[]; /* ...unchanged... */ }
```

`response-generator.ts`'s handlers (`LC_EXPIRY`, `GUARANTEE_EXPIRY`,
`COLLECTION_OVERDUE`, ...) and `reasoning-engine.ts`'s risk/attention use
cases now return `actions[]`: one action per highlighted record plus a
trailing "Xem tất cả" (view all). `LC_STATUS`/`LC_DETAIL`/etc. that already
resolve to one record populate `entityId` on the single `action`. Both
fields are optional and additive — every handler that doesn't need per-
record links is untouched.

`business-semantics/navigation-actions.json` maps action ids to real routes
(`OPEN_LC` → `/trade-finance/lc`, plus new `OPEN_LC_DETAIL` /
`OPEN_GUARANTEE_DETAIL` / `OPEN_COLLECTION_DETAIL` / `OPEN_LC_CREATE` /
`OPEN_GUARANTEE_CREATE` ids) instead of every Trade Finance id pointing at
`/products`.

## 4. Frontend: turning an action + entityId into a real link

`src/app/core/services/rm-data.service.ts`'s `toRmAnswer()` builds one CTA
per action:

```ts
const source = answer.actions?.length ? answer.actions : answer.action ? [answer.action] : [];
const ctas = source.map((a) => ({ label: a.label, link: buildLink(a.target, a.entityId) }));
```

`buildLink(target, entityId)` looks up the base route in `NAV_ACTION_ROUTES`
and, when an `entityId` is present, appends `/​<entityId>` plus a
`TARGET_ANCHOR` fragment for section-specific ids
(`OPEN_LC_DOCUMENTS` → `#documents`, `OPEN_LC_DISCREPANCY` → `#discrepancy`,
`OPEN_LC_AMENDMENT` → `#amendment`, `OPEN_GUARANTEE_CLAIM` → `#claims`), so
"Xem chứng từ LC-2026-003" from chat lands directly on that LC's Documents
section, not just the top of its detail page.

`RmAnswer.cta` (singular) became `RmAnswer.ctas: {label, link}[]`
(`src/app/core/models/index.ts`) so a chat message can render several
buttons — one per record plus "Xem tất cả" — instead of only ever the last
one computed.

## 5. Screens

`src/app/core/services/trade-finance.service.ts` is the frontend data hub —
signals for `lcs/guarantees/collections/summary`, a `loadAll()`, cache-then-
fetch `lcById/guaranteeById/collectionById` (serves from the already-loaded
list first, falls back to `GET .../:id` for a link opened directly), and
`createLc/createGuarantee/createCollection` that POST then reload.

Routes (`src/app/app.routes.ts`, all lazy `loadComponent`; static
`.../create` routes registered before the dynamic `.../:id` route so
Angular doesn't match `create` as an `:id`):

| Route | Page |
|---|---|
| `/trade-finance` | `TradeFinanceDashboardPageComponent` — risk/action summary, exposure + credit-limit utilization bar, one card per instrument type |
| `/trade-finance/lc` | `LcListPageComponent` — search + type/status/risk filters |
| `/trade-finance/lc/create` | `LcCreatePageComponent` — 6-step wizard (basic info → parties → amount/currency → shipment → documents → review) |
| `/trade-finance/lc/:id` | `LcDetailPageComponent` — overview, lifecycle timeline, documents, discrepancies, amendments |
| `/trade-finance/guarantees(/create\|/:id)` | same shape for Bank Guarantees (4-step wizard; claims section) |
| `/trade-finance/collections(/create\|/:id)` | same shape for Documentary Collections |

Every page reuses the existing MSB design system (`.card`, `.badge`,
`.btn-primary`/`.btn-secondary`, `VndPipe`, `BadgeComponent`,
`LoadingSpinnerComponent`) — no new visual language, no chatbot- or admin-
panel-style layout. `src/app/features/trade-finance/trade-finance-ui.util.ts`
centralizes status → label/badge-tone/icon mappings so list and detail pages
render statuses consistently.

The sidebar (`shared/components/sidebar/sidebar.component.ts`) gained a
"Trade Finance" nav group (Tổng quan, LC, Bảo lãnh, Nhờ thu) so the screens
are also reachable without going through chat at all.

## 6. Human-in-the-loop stays enforced in the UI, not just the API

Every mutating button in these screens is explicitly a *request*, never an
execution: LC/Guarantee create wizards submit to `PENDING_APPROVAL`;
`guarantee-detail.page.ts`'s "Yêu cầu gia hạn"/"Yêu cầu tu chỉnh" buttons
open a confirm dialog stating the action is simulated and recorded, not
executed; the claims section's caption reads "Claim chỉ được xử lý/settle
bởi ngân hàng — Virtual RM không tự động settle claim." No screen exposes an
approve/issue/waive-discrepancy/settle-claim/pay action.

## 7. A found-and-fixed bug: `<a href="#fragment">` under Angular's `<base href="/">`

`lc-detail.page.ts`'s "Xem chứng từ" button was originally a plain
`<a href="#documents">`. Because Angular's `<base href="/">` changes how a
bare-fragment `href` resolves, clicking it navigated the browser to
`/#documents` (dropping the current `/trade-finance/lc/LC-2026-001` path)
instead of scrolling within the page. Fixed by replacing the anchor with a
`(click)` handler calling `document.getElementById('documents')
?.scrollIntoView({ block: 'start' })`, and by resolving the same fragment
from the route on load for chat-driven deep links:

```ts
const fragment = this.route.snapshot.fragment;
if (fragment) queueMicrotask(() => document.getElementById(fragment)?.scrollIntoView({ block: 'start' }));
```

Applied identically in `guarantee-detail.page.ts`. Verified live with
Playwright: navigating to `.../LC-2026-001#discrepancy` scrolls straight to
the Discrepancies card.

## 8. What stayed exactly as-is

- The Semantic Engine's intent detection/scoring, the Reasoning Engine's
  plan→tools→calculate→phrase pipeline, the Model Router, and the mock AI
  provider — untouched.
- The chat query API (`POST /api/virtual-rm/query`) — still the only way
  Virtual RM answers a question; the new REST API is additive, read by the
  dedicated screens directly, not a replacement for the chat path.
- All 385 pre-Phase-7 tests keep passing unchanged in shape (only guarantee
  count assertions grew after two new seed records); 9 new tests cover the
  trade-finance service layer.
