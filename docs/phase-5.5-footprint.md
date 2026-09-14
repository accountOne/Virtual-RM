# Phase 5.5 BRD alignment — Dấu ấn (Personal/Business Footprint)

Closes gap-table item #5/#6 (`docs/phase-5.5-brd-gap-analysis.md`) — the BRD's "Dấu ấn cá
nhân/doanh nghiệp": an auto-generated, downloadable/shareable image summarizing a
customer's/user's engagement with IBMB, with a 3-tier "fun label" ranking.

## What was built

- **`server/src/services/footprint.service.ts`** — aggregates real numbers from existing
  repositories (`transactionsRepository`, `paymentOrdersRepository`, `approvalsRepository`,
  `fxDealsRepository`, `letterOfCreditsRepository`, `bankGuaranteesRepository`,
  `collectionsRepository`) into a `Footprint` shape. Every stat traces to real seeded data except
  two explicitly-called-out mocks: `usageHours` (no real session-duration tracking exists) and
  `loyalty.json`'s M-Point/voucher numbers (no real loyalty system exists).
- **`GET /api/virtual-rm/footprint?scope=personal|business&period=year|quarter|month`** —
  `server/src/controllers/footprint.controller.ts`, rate-limited the same as the rest of the
  Virtual RM API.
- **Ranking** — `server/src/config/footprint-ranking.json`, a deterministic point-accumulation
  score (real observed numbers only, capped per factor so one outlier can't dominate) mapped
  through 3 configurable tiers per scope, following the same config-driven convention as
  `risk-rules.json`.
- **New mock data**: `customer.json` gained `registeredAt`; new `user-profiles.json`
  (per-demo-user `registeredAt`/`usageHours`) and `loyalty.json` (company M-Point/vouchers).
- **Frontend** — `src/app/features/footprint/footprint.page.ts`: scope/period toggles, and an
  HTML5 Canvas-rendered infographic (title, rank, stat grid, top partners/interactions, a
  well-wish line) with a working Download button (`canvas.toDataURL()`) and Share button
  (Web Share API where supported). Reached from a new card on the Virtual RM dashboard and a
  "🎖️ Dấu ấn" quick-nav chip in the chat (both the always-visible row and the proactive
  greeting's category-shortcuts message) — per the BRD's "Virtual RM gợi ý các câu hỏi liên quan
  đến Daily Dashboard hoặc dấu ấn cá nhân".

## Design decision: Canvas rendering, not AI image generation

The BRD's top-level feature list names "Gen ảnh" (image generation) as one of Virtual RM's three
capabilities. Decided with the user: render the infographic with the HTML5 Canvas 2D API from the
real computed numbers, rather than calling an AI image-generation model. A generative image model
cannot reliably render exact figures or company names into an image (a real risk for a banking
demo — a wrong number in a "dấu ấn" would misinform, not delight), and this needs no paid API call
per view. Trade-off: the result reads as a clean, branded infographic card, not "generated art" —
accepted explicitly for correctness over novelty.

## Bug found and fixed during implementation

The canvas element was originally gated behind `*ngIf="!loading()"`. The draw code ran in a
`queueMicrotask` right after `loading.set(false)`, racing Angular's own re-render: on first load,
`@ViewChild('canvas')` sometimes still pointed at nothing (or the DOM element hadn't been
(re-)inserted yet) when the microtask fired, so the canvas rendered fully blank — confirmed live
via `ctx.getImageData()` returning `[0,0,0,0]` at every sampled pixel despite `toDataURL()`
reporting non-trivial output (a red herring: a differently-sized blank canvas still produces a
non-empty PNG). Fixed by keeping the canvas unconditionally mounted (a loading overlay sits on
top of it instead of replacing it), so `@ViewChild` resolves once, before the first draw, and
never races a later re-render.

## Verified live (Playwright)

- Canvas pixel sampling confirms real paint (`getImageData` at the top-left matches the brand-700
  gradient color; center matches the white stats-card background) for both scopes.
- Download button triggers a real file download (`dau-an-business-year.png` observed).
- Dashboard's "Dấu ấn cá nhân/doanh nghiệp" card navigates to `/footprint`.
- Screenshots taken for both personal and business scope, 1-year period, showing the real seeded
  numbers (e.g. business: 43 transactions, 3.4 tỷ in / 9.2 tỷ out, "Đối tác Vàng"; personal
  msb_mk: 6 lệnh đã tạo, "Người dùng Vàng").

## Known limitations (explicit, not hidden)

- `usageHours` and M-Point/voucher figures are mock — no real session-duration or loyalty-points
  system exists in this demo. Called out in code comments and this doc rather than presented as
  equally "real" as the transaction-derived numbers.
- Collections have no issue/created-date field, so the business footprint's "giao dịch tín dụng"
  count always includes all 4 seeded collections regardless of the selected period — a minor
  approximation noted in `footprint.service.ts`.
- Ranking thresholds are calibrated against this demo's small mock dataset (tens of transactions,
  single-digit payment-order counts) — they are not meant to generalize to a real customer base
  without recalibrating `footprint-ranking.json`.
