# Transaction Security

How the 5-level transaction-risk model maps onto this app's actual routes/UI, and how "this is a
demo, not a real bank" is kept visible at every step that could otherwise read as a completed
real-world banking action.

## The 5 levels, mapped to real code

| Level | Meaning | Who/what can reach it here |
|---|---|---|
| **READ** | Look at data | Any authenticated session — `GET` routes, Virtual RM answering a question. Auto-OK, no confirmation needed. |
| **ANALYZE** | Compute/summarize over data | Semantic/Reasoning Engine (insights, recommendations, risk flags). Auto-OK — still just information, nothing changes. |
| **PREPARE** | Draft something, not yet sent | The LC/BG/Collection **create forms** (`lc-create.page.ts` etc.) as the customer fills them in, before clicking submit. Virtual RM can navigate the customer *to* these forms and prefill fields it already knows, but never submits on their behalf. |
| **SUBMIT** | Send a request into the bank's real workflow | Clicking "Gửi yêu cầu" on an LC/BG/Collection create form, or a single/batch transfer form. Requires the human's own explicit click — `requireRole('MAKER', 'ADMIN')` server-side (`authorization.md`), never triggered by Virtual RM itself (no mutating AI tool exists — see `virtual-rm-security.md`). |
| **AUTHORIZE / EXECUTE** | Actually move money / issue the instrument | `POST /api/transactions/:id/approve|reject` — `requireRole('CHECKER', 'ADMIN')`. This is the real Business Banking authorization workflow (Maker creates, Checker approves — a segregation-of-duties model, not a rubber stamp); Virtual RM has no path into it at all. |

Virtual RM's own ceiling is **PREPARE**. It can read, analyze, explain, suggest, prefill a form,
and navigate — it cannot SUBMIT, AUTHORIZE, or EXECUTE anything, because there is no tool or API
call in its reach that does any of those (`virtual-rm-security.md` covers exactly why, at the
tool-registry level).

## Confirmation before SUBMIT

Every create-request form (LC/BG/Collection, single/batch transfer, loan payment, contract
signature) already required an explicit human click before this security upgrade and still does
— nothing about that UX changed. What changed is that the click is now actually gated
server-side (a MAKER/ADMIN session + CSRF token), not just displayed conditionally in the UI. The
approval flow additionally shows a confirm dialog naming the specific transaction before the
click does anything (`approval.page.ts::approve/reject`) — "Xác nhận phê duyệt/từ chối
'<description>'? Đây là thao tác mô phỏng trên dữ liệu demo," not a bare "OK."

## Demo Mode — never implying a real banking system executed anything

This is a **demo**. No real bank connection exists; every transaction is mock data written to a
local JSON file (`server/data/*.json`). The rule (spec §31): a mock action must never be phrased
as if it happened on a real banking system.

Existing, already-correct copy (unchanged by this pass):
- LC/BG create success: *"Đã gửi yêu cầu mở LC ... — chờ phê duyệt (mô phỏng)"* — a **request**
  was created, awaiting approval, explicitly marked simulated. Never "LC đã được phát hành."
- Login screen / pre-login page: *"Môi trường demo — không sử dụng dữ liệu khách hàng thật, không
  kết nối hệ thống ngân hàng thật."*
- Sidebar carries a permanent "🎬 Demo Mode" entry linking to a dedicated Demo Mode explainer page.

Two gaps found and fixed during this security pass's audit of every success-toast in the app
(the same audit that produced `security-gap-analysis.md`'s route inventory) — both read as a
completed real banking action with no demo qualifier at all:

| Location | Before | After |
|---|---|---|
| `approval.page.ts` (approve/reject a transaction) | "Đã phê duyệt giao dịch." / "Đã từ chối giao dịch." | "Đã phê duyệt giao dịch (mô phỏng trên dữ liệu demo)." / "...từ chối..." |
| `contract-sign.page.ts` | "Đã ký hợp đồng thành công." | "Đã ký hợp đồng (mô phỏng trên dữ liệu demo)." |
| `loans.page.ts` (activate credit limit) | "Đã kích hoạt hạn mức tín dụng mới." | "...(mô phỏng trên dữ liệu demo)." |

The confirm-dialog copy shown *before* these same actions already said "mô phỏng" — only the
after-the-fact success toast was missing it. `DEMO_MODE=true` (`.env.example`) documents this as
a standing environment flag for a future real-backend integration to check against.
