# Mô hình Maker/Checker — BankingCommand

Tài liệu này mô tả kiến trúc thực tế đã triển khai (không phải kế hoạch) cho nâng cấp Backend
Persistence + Maker/Checker + Banking Form. Xem `docs/MAKER_CHECKER_AUDIT.md` cho bối cảnh audit
và các quyết định kiến trúc đã chốt trước khi code.

## 1. Vấn đề đã sửa

Trước nâng cấp này, hệ thống có 2 lỗ hổng thật (xác nhận bằng đọc code, không suy đoán):

1. **Form chuyển tiền thường** (`/payments/single-transfer`) hoàn toàn giả — `submit()` chỉ đặt 1
   signal và hiện toast, không gọi API nào. Checker **không bao giờ** thấy lệnh này.
2. **LC/Bảo lãnh/Nhờ thu** tạo xong ở trạng thái `PENDING_APPROVAL` (LC/Bảo lãnh) hoặc
   `PROCESSING` (Nhờ thu) nhưng **không có route duyệt nào tồn tại** — Checker không có cách nào
   tác động.

## 2. Kiến trúc — 1 nguồn sự thật duy nhất

```
Maker (form thật hoặc Virtual RM Agent)
   │
   ▼
POST /api/commands  →  BankingCommand { status: DRAFT }
   │
   ▼ (Kiểm tra & Xem trước)
POST /api/commands/:id/validate  →  validateCommand() (domain/rules/validation-engine.ts)
   │                                  ValidationResult { errors[], warnings[] }
   ▼ (Gửi duyệt — chỉ khi không còn cảnh báo BLOCKING)
POST /api/commands/:id/submit  →  status: PENDING_CHECKER, sinh idempotencyKey, lưu snapshot
   │
   ▼
Checker mở GET /api/checker/commands (hàng chờ) → GET /api/checker/commands/:id (chi tiết —
ĐÚNG bản ghi backend Maker đã gửi, không phải dữ liệu Checker tự suy luận lại)
   │
   ├─ POST .../reject { reason }  →  status: REJECTED
   │
   └─ POST .../approve { idempotencyKey }  →  revalidate lại → status: APPROVED
                                              → executeApprovedCommand() ghi bản ghi thật
                                              → status cuối: APPROVED (hoặc FAILED nếu lỗi)
```

`BankingCommand` (server/src/models/index.ts) là **model mới thay thế** `Transaction`/
`PaymentOrder`/`ApprovalRecord` cho **mọi lệnh tạo mới** (Transfer/LC/Guarantee/Collection) — 3
model cũ vẫn giữ nguyên trong code để không phá dữ liệu lịch sử/test cũ, nhưng không còn luồng tạo
mới nào đi qua chúng nữa.

## 3. Lưu trữ

Không thêm database mới — tái dùng `JsonFileRepository`/`JsonSingletonRepository`
(`server/src/repositories/json-file.repository.ts`) đã có sẵn từ trước, đúng như audit xác nhận
đây đã là "Repository interface → JsonFileRepository" mà thiết kế mong muốn. 3 file JSON mới:
`server/data/banking-commands.json`, `command-snapshots.json`, `audit-events.json` — cùng cơ chế
seed/reset (`server/data-seed/`) như mọi repository khác, tự động có trong "Reset Demo Data".

## 4. `CommandType` — 4 loại, cùng 1 pipeline

| Type | Rule file | Thực thi khi duyệt (tái dùng) |
|---|---|---|
| `TRANSFER` | `domain/rules/transfer.rules.ts` | Ghi `Transaction` thật + trừ số dư tài khoản |
| `LC` | `domain/rules/lc.rules.ts` | `tradeFinanceService.createLc()` (đã có từ Phase 7) |
| `GUARANTEE` | `domain/rules/guarantee.rules.ts` | `tradeFinanceService.createGuarantee()` |
| `COLLECTION` | `domain/rules/collection.rules.ts` | `tradeFinanceService.createCollection()` |

**Lưu ý về Nhờ thu**: trước nâng cấp, tạo Nhờ thu đi thẳng vào trạng thái `PROCESSING`, không có
bước duyệt nào. Đưa Nhờ thu vào cùng cổng Maker/Checker với 3 loại còn lại là **thay đổi hành vi có
chủ đích**, theo đúng phạm vi đã xác nhận ("1 nguồn sự thật duy nhất" cho mọi loại lệnh).

## 5. State machine (`server/src/domain/command-workflow.ts`)

```
DRAFT ──► PENDING_CHECKER ──► APPROVED
  │             │        └──► REJECTED
  └─► CANCELLED └──► CANCELLED
(FAILED chỉ đạt được nếu executeApprovedCommand() ném lỗi lúc duyệt)
```

Cùng kỷ luật `assertTransition()` một hàm duy nhất mà Agent's `workflow-engine.ts` (phiên trước)
đã thiết lập — không có cách nào đổi status ngoài hàm này, một lệnh double-approve luôn bị chặn vì
lần gọi thứ 2 thấy status đã là `APPROVED` (không còn cạnh hợp lệ nào tới `APPROVED` nữa).

## 6. Idempotency + Version (spec §12/§13)

- `idempotencyKey`: sinh mới khi `submit()` (DRAFT→PENDING_CHECKER), Checker phải gửi lại đúng key
  này khi `approve()` — sai key → `409 IDEMPOTENCY_MISMATCH`, độc lập với kiểm tra state machine.
- `version`: tăng mỗi lần Maker sửa DRAFT (`updateDraft()`). `approve()` luôn **revalidate lại
  formData hiện tại** (không tin `validationResult` cũ lưu sẵn) — đảm bảo Checker duyệt đúng phiên
  bản mới nhất, không phải dữ liệu đã lỗi thời.
- `CommandSnapshot`: chụp lại formData/validation/warnings đúng thời điểm `submit()` — nếu sau đó
  Maker sửa DRAFT khác đi (dù thực tế UI hiện tại không cho sửa sau khi đã submit), lịch sử vẫn có
  bằng chứng bản nào đã thực sự được gửi.

## 7. Bảo mật (spec §16, đối chiếu trực tiếp)

| Yêu cầu | Thực hiện |
|---|---|
| Backend kiểm tra role Checker | `requireRole('CHECKER', 'ADMIN')` ở route, độc lập với check trong service |
| Backend kiểm tra status | `assertTransition()` — chỉ `PENDING_CHECKER` mới approve/reject được |
| Maker ≠ Checker | `commandsService.approve()/reject()` so `command.makerUserId === actor.userId` → `403 SameMakerCheckerError` |
| Backend revalidate trước approve | `approve()` gọi `revalidate()` lại full, không tin cache |
| Version | Mỗi sửa DRAFT bump version, snapshot lưu đúng bản đã submit |
| Idempotency | Key sinh mới mỗi lần submit, so khớp bắt buộc khi approve |
| Double-click không tạo 2 lần | State machine + idempotency, 2 lớp độc lập (test Scenario 7) |
| Không cho frontend tự đổi status | Không route/handler nào nhận `status` từ request body |
| Reject bắt buộc có lý do | `reject()` throw nếu `reason` rỗng |
| Client không tự nâng quyền qua request | `stripIdentityOverrides` (đã có từ trước) xóa `role`/`userId`/`companyId` client tự gửi, trước khi tới controller |

## 8. Virtual RM Agent — form-driven (spec §7)

Từ Slice 5/6, **cả 4 write-intent** (`create_transfer`, `create_lc`, `create_guarantee`,
`create_collection`) của Agent (Gemini) đều hand-off sang tạo 1 `BankingCommand` DRAFT thật (dùng
đúng `commandsService.createDraft()`) thay vì tự chạy Approval Gate riêng của Agent
(`execute_transfer`/`submit_lc_mock`/...). Agent chỉ điền sẵn những field đã hiểu được từ câu nói
tự nhiên; Maker luôn phải mở form thật để bổ sung/xác nhận phần còn thiếu và tự bấm "Gửi duyệt" —
không có đường nào Agent tự động submit hộ. Xem `docs/AI_AGENT_ARCHITECTURE.md`/`SEMANTIC_MODEL.md`
cho phần Gemini/NLU, tài liệu này chỉ nói về phần BankingCommand nhận bàn giao.

## 9. Files chính

```
server/src/models/index.ts                       BankingCommand, CommandSnapshot, AuditEvent, Warning, ValidationResult
server/src/domain/command-workflow.ts             State machine (assertTransition)
server/src/domain/rules/
  validation-engine.ts                            Dispatcher chung — 1 nơi duy nhất gọi rule theo commandType
  warning-catalog.ts                               Bảng mã cảnh báo dùng chung Maker/Checker
  transfer.rules.ts / lc.rules.ts /
  guarantee.rules.ts / collection.rules.ts         Zod schema + business rule từng loại
server/src/reference-data/beneficiary-banks.ts     7 ngân hàng mock cho dropdown
server/src/repositories/commands.repository.ts     3 repository mới (JsonFileRepository)
server/src/services/commands.service.ts            Toàn bộ nghiệp vụ: createDraft/submit/approve/reject/execute
server/src/controllers/commands.controller.ts       REST surface
server/src/routes/index.ts                         /api/commands/*, /api/checker/commands/*

src/app/core/services/commands.service.ts           HTTP client (Angular)
src/app/shared/components/warning-panel/            Component dùng chung Maker + Checker
src/app/features/payments/pages/single-transfer/     Form chuyển tiền thật (Slice 3)
src/app/features/payments/pages/approval/            Hàng chờ duyệt hợp nhất 4 loại (Slice 4)
src/app/features/payments/pages/command-detail/      Chi tiết + duyệt/từ chối (Slice 4)
src/app/features/trade-finance/pages/
  lc-create.page.ts / guarantee-create.page.ts /
  collection-create.page.ts                          3 wizard đã nối vào Commands API (Slice 6)
server/src/agent/agent-orchestrator.ts               handOffWriteIntent() — Agent bàn giao (Slice 5/6)
```
