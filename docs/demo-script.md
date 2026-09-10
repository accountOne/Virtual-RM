# Demo Script — Presenter Walkthrough

A coherent, presenter-facing story for demonstrating the Virtual RM platform end to
end. The in-app **Demo Mode** (`/demo`) covers steps 2–10 as one-click actions; this
script wraps it with the pre-login entry point and the admin data feedback loop, and
gives a presenter talking points for each beat.

**Customer used throughout:** ABC Manufacturing JSC · persona: CFO.

| # | Step | Screen | Talking point |
|---|---|---|---|
| 1 | Open the pre-login landing page | `/` | "This is MSB Business Banking — a Virtual Relationship Manager is embedded natively, not bolted on as a separate chatbot." |
| 2 | Log in as Checker | `/login` → `msb_ck` / `msb_ck@2026` | Checker role is used so approvals (step 6) are available. |
| 3 | Land on Business Home | `/dashboard` | Balance, quick actions, recent transactions — standard business banking home. |
| 4 | Open Virtual RM | `/virtual-rm` | RM proactively greets the customer with today's briefing — not a blank chat box. |
| 5 | Show Daily Business Briefing | `/virtual-rm` | Balance, cash in/out yesterday, pending approvals, open tasks, and a computed **RM Insight** — all from live mock data. |
| 6 | RM highlights pending approvals | `/virtual-rm` (alerts) | "3 giao dịch đang chờ phê duyệt — 850 triệu VNĐ." Click through. |
| 7 | Approve a transaction | `/payments/approval` | Approve one pending transaction. |
| 8 | Return to Virtual RM | `/virtual-rm` | Pending count has already dropped from 3 → 2 — no refresh needed, `RmDataService` signals propagate immediately. |
| 9 | Ask a question | RM chat widget | *"Hôm qua công ty tôi chi bao nhiêu?"* → RM answers from the same live transaction data, with a **"Xem giao dịch"** deep link. |
| 10 | Ask another | RM chat widget | *"Tôi còn việc gì cần xử lý?"* → RM lists open Business Tasks. |
| 11 | Show Business Tasks | `/virtual-rm` (tasks) | Priority-colored list, each with a **"Thực hiện"** action that deep-links into a real journey (e.g. company profile, contract signing). |
| 12 | Show Product Recommendation | `/virtual-rm` (recommendations) | e.g. **FX Business** — "Doanh nghiệp đã thực hiện 18 giao dịch ngoại tệ trong 30 ngày qua." Rule-based, not ML. |
| 13 | Open the recommended journey | `/fx` | Shows the flow feels native, not an external redirect. |
| 14 | Open Admin Demo Data | `/admin/demo-data` (Admin role required — log in as `msb_ad` / `msb_ad@2026`, or switch role) | Presenter-only screen for live-editing the demo scenario. |
| 15 | Change a transaction or account balance | Admin → Transactions/Accounts tab → edit → Lưu | Demonstrates the data is genuinely live, not hardcoded per-screen. |
| 16 | Return to Virtual RM | `/virtual-rm` | Briefing, insight, and recommendations recompute from the edited data — closing the loop: **"This is MSB Business Banking with an embedded Virtual Relationship Manager, not a static prototype."** |

## Mobile variant

Repeat steps 3–13 at a mobile viewport (≈390px):
- Sidebar becomes a hamburger drawer.
- The Virtual RM panel becomes a floating draggable button (bottom-right by default)
  that opens a bottom sheet — briefing teaser first, full chat one tap away.
- Long lists (tasks, transactions) remain scrollable; forms remain single-column.

## Resetting between demo runs

`/admin/demo-data` → **"↺ Reset Demo Data"** restores the original seeded scenario
(`server/data-seed/*.json` → `server/data/*.json`) so the next run starts clean.

## Guardrails to mention if asked

- No real MSB systems, logo, or trademarked assets are used — this is a UX prototype,
  not a production integration.
- No database, message queue, or external banking API — everything is static JSON,
  read/written through a repository layer designed to be swapped for a real backend
  later without touching controllers or UI (see `architecture.md`).
- The Ask Your Bank chat is a deterministic keyword-matched intent engine, not an LLM.
