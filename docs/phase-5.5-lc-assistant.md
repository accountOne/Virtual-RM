# Phase 5.5 BRD alignment — LC PO-upload Virtual RM assistant

Closes gap-table item #3 (`docs/phase-5.5-brd-gap-analysis.md`) — the BRD's flow where a customer
tells Virtual RM they want to issue an LC, uploads their Purchase Order, and Virtual RM
pre-fills the LC application form from it.

## What was built

- **In-chat guided flow**, entirely client-side state (`RmChatSessionService`): a Maker/Admin can
  either type a trigger phrase ("tôi muốn mở LC", "phát hành LC mới", ...) or tap the "🧾 Tạo LC
  từ đơn hàng (PO)" chip on the Virtual RM chat page. The flow then asks Import/Export, prompts
  for a file upload, "analyzes" it, and hands the extracted fields to the LC creation form.
  - The Import/Export choice and file-upload trigger reuse the previously-declared-but-dead
    `RMAction.type: 'CONFIRM' | 'UPLOAD'` — see `rm-message.component.ts` (a hidden
    `<input type="file">` behind the UPLOAD button) and `virtual-rm-chat.page.ts::handleAction`.
  - No new server-side conversation-state module: each backend call (`analyze-po`,
    `draft-message`) is a plain stateless request, matching this demo's existing "no server
    session for business state" convention (see `server/src/ai/conversation-context.ts`'s own doc
    comment) — simpler than the originally-planned dedicated `lc-assist-conversation.ts`, since
    the only state that needs to survive between steps (the chosen LC type) lives in the browser
    tab already holding the conversation.
  - A Checker is blocked immediately (client-side check on `AuthService.currentUser().role`,
    before any request is made) with the same wording
    `trade-finance.controller.ts::createLc` uses server-side for defense-in-depth — verified live
    with the `msb_ck` demo account.
- **`server/src/services/po-analysis.service.ts`** — deterministic mock "PO extraction": hashes
  the uploaded file's name+size to pick one of 3 canned PO templates (different
  beneficiary/amount/currency/required-documents), always the same result for the same file. One
  or two date fields are deliberately left blank per template so the customer still has to fill
  something in themselves, per the BRD's own step 6.
- **`POST /api/virtual-rm/lc/analyze-po`** / **`POST /api/virtual-rm/lc/draft-message`**
  (`server/src/controllers/lc-assist.controller.ts`, `server/src/routes/index.ts`) — both
  `requireRole('MAKER', 'ADMIN')` like the real LC-creation endpoint, rate-limited the same as
  the rest of the Virtual RM API. `analyze-po` fills the `applicant` field from the real
  `customer.json` record (not the template) — the buyer's own name is already known from the
  session, not something a PO "extracts". `draft-message` builds a plain template string (no AI
  call) always labeled **"BẢN NHÁP — CHỈ MANG TÍNH MINH HỌA, KHÔNG PHẢI ĐIỆN SWIFT CHÍNH THỨC"**.
- **`lc-create.page.ts`** — reads a prefill payload from `history.state` (set by the chat page's
  `handleAction` via `router.navigateByUrl(link, { state: payload })`) and pre-populates `form`
  with whatever fields arrived, showing a "✨ Đã điền sẵn..." banner. When no prefill is present,
  shows a "✨ Tạo đề nghị dễ dàng với Virtual RM" banner linking back to the chat instead. The
  review step (step 6) also gained a "👁️ Xem bản nháp điện LC" toggle that calls
  `draft-message` and renders the result inline.

## Design decision: mock/simulated PO reading, confirmed with the user

Decided explicitly before building this: the file is never actually read. No OCR, no document
AI, no LLM call. The backend only ever looks at the file's **name and size** (never its bytes —
the frontend doesn't even upload the file content, only `fileName`/`fileSizeBytes`/`mimeType`) to
deterministically pick one of a few pre-written PO templates. This is the same "deterministic
mock, not real ML" convention `MockReasoningProvider` already uses elsewhere in this codebase,
and it costs nothing per demo run. Every RM message in the flow says so explicitly
("bản demo — số liệu mô phỏng nhất quán theo file, không đọc nội dung file thật") so nobody
watching the demo mistakes it for real document understanding.

## Verified live (Playwright)

Full Maker happy path: chat → "🧾 Tạo LC từ đơn hàng (PO)" chip → Import/Export question →
"Chọn file PO" → upload a file → extraction summary + missing-fields note + "📝 Điền vào đơn mở
LC" CTA → lands on `/trade-finance/lc/create` with `beneficiary`/`applicant`/`amount`/`currency`
already filled from the mock template → review step → "👁️ Xem bản nháp điện LC" shows the
labeled draft text. Also verified: a typed trigger phrase ("Tôi muốn mở LC mới") starts the same
flow without using the chip; a Checker (`msb_ck`) sees the block message instead of the
Import/Export question.

## Known limitations (explicit, not hidden)

- The uploaded file's content is never read — confirmed design, not a shortcut. A different file
  with the same name+size would still resolve to the same template (a non-issue for a demo,
  called out here for honesty).
- Only 3 PO templates exist; the LC type (Import/Export) the customer picks earlier in the
  conversation overrides the template's own `type`, since the template set doesn't model
  Export-specific business content differently from Import.
- The draft LC message is a plain string template, not a real SWIFT MT700 — always carries the
  "BẢN NHÁP" label for exactly this reason.
