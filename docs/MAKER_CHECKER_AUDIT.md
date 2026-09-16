# Audit — Nâng cấp Maker/Checker Backend Persistence + Banking Form

Audit này thực hiện theo đúng yêu cầu §2 của prompt "PHASE UPGRADE — Backend Persistence +
Maker/Checker + Banking Forms + Shared Warnings" — quét toàn bộ repo trước khi code, dựa trên đọc
code thật (file:line), không suy đoán. Không có dòng code sản phẩm nào bị sửa trong tài liệu này.

## 1. Kiến trúc hiện tại (Current architecture)

- **Frontend**: Angular 19 standalone components, signals, `src/app/features/*`.
- **Backend**: Node.js/Express, `server/src/{controllers,services,routes,repositories,models}`.
- **Storage**: **Không có database thật** — toàn bộ dữ liệu nghiệp vụ nằm ở file JSON
  (`server/data/*.json`), truy cập **duy nhất** qua 2 lớp abstraction đã có sẵn
  (`server/src/repositories/json-file.repository.ts`):
  - `JsonFileRepository<T>` — collection nhiều bản ghi (đọc/ghi/update/delete/reset-từ-seed).
  - `JsonSingletonRepository<T>` — 1 object duy nhất (vd `customer.json`).
  Controller/service **không bao giờ** đụng `fs` trực tiếp — **đây chính xác là kiến trúc
  "Repository interface → JsonFileRepository" mà prompt §4 yêu cầu, đã tồn tại sẵn**, không cần
  xây mới từ đầu.
- **Auth/Role**: Session cookie (không JWT), `server/src/auth/session-store.ts` +
  `session.middleware.ts`. 3 role cố định: `MAKER | CHECKER | ADMIN`
  (`server/src/auth/types.ts`). `requireRole(...roles)` middleware chặn ở tầng route
  (`session.middleware.ts:96`). `stripIdentityOverrides` xóa mọi field `companyId`/`userId`/`role`
  client tự gửi lên trước khi tới controller (`session.middleware.ts:131-145`) — client **không
  thể** tự nâng quyền qua request body, đúng yêu cầu §16.12. `hasPermission(role, permission)` +
  bảng `ROLE_PERMISSIONS` (`server/src/auth/rbac.ts`) đã là chỗ tập trung permission, không rải
  rác trong controller.
- **3 user demo có sẵn** (`server/src/auth/user-store.ts:17-19`): `msb_mk`/`msb_mk@2026` (MAKER),
  `msb_ck`/`msb_ck@2026` (CHECKER), `msb_ad`/`msb_ad@2026` (ADMIN) — đúng ý §9, không cần tạo
  `maker.demo`/`checker.demo` mới, chỉ cần tái dùng.
- **AI Agent (Gemini)** — xây trong phiên làm việc trước, nằm tách biệt ở
  `server/src/agent/*`: state machine riêng (`workflow-engine.ts`, `WorkflowStatus`:
  `UNDERSTANDING→...→WAITING_APPROVAL→EXECUTING→COMPLETED/FAILED/CANCELLED`), conversation
  in-memory (`agent-conversation.ts`), tool registry (`agent-tool-registry.ts`,
  `agent-mock-tools.ts`). **Đây là một khái niệm "duyệt" hoàn toàn khác** với Maker/Checker
  nghiệp vụ ngân hàng — nó là bước khách hàng tự xác nhận bản nháp AI vừa tạo (cùng 1 người),
  xảy ra **trước** khi tới hàng chờ Checker thật. Không được nhầm 2 khái niệm này (xem `docs/
  GEMINI_AGENT_AUDIT.md` §8, đã ghi rõ từ trước).

## 2. Tính năng hiện có (Existing features) — theo từng loại lệnh

### 2.1 Chuyển tiền (Transfer) — **2 đường đi tách rời, không đồng bộ (lỗ hổng #1)**

| Đường đi | File | Có backend? | Có vào hàng chờ Checker? |
|---|---|---|---|
| Form thường (`/payments/single-transfer`) | `src/app/features/payments/pages/single-transfer/single-transfer.page.ts` | **Không** — `submit()` chỉ `signal.set(true)` + toast (dòng 71-74), không gọi HTTP nào | **Không bao giờ** |
| AI Agent (`🤖 Agent` trong chat) | `server/src/agent/agent-mock-tools.ts::executeTransferTool` | Có — ghi thật `Transaction`+`PaymentOrder`+`ApprovalRecord` (`PENDING_APPROVAL`) | **Có**, qua `/transactions/:id/approve` |

→ Đúng vấn đề prompt nêu ở §3.3 "Maker lưu dữ liệu chỉ ở browser memory" và "Checker nhìn dữ liệu
khác với Maker" — **form chuyển tiền thường hiện tại hoàn toàn giả**, một Maker dùng form này nghĩ
lệnh đã được gửi nhưng Checker **không bao giờ thấy nó**.

`batch-transfer.page.ts` (không đọc chi tiết trong audit này, cùng thư mục
`payments/pages/batch-transfer/`) nhiều khả năng cùng pattern — cần xác nhận khi vào code.

### 2.2 LC / Bảo lãnh / Nhờ thu — **có backend tạo, nhưng KHÔNG có route duyệt nào (lỗ hổng #2)**

- Tạo: `trade-finance.controller.ts` → `trade-finance.service.ts::createLc/createGuarantee/
  createCollection` — ghi thật vào `letter-of-credits.json`/`bank-guarantees.json`/
  `collections.json`, trạng thái khởi tạo `PENDING_APPROVAL`, chỉ `MAKER`/`ADMIN` được gọi
  (`canCreateLc()` check role từ session, `trade-finance.controller.ts:25-26`).
- **Duyệt**: `grep` toàn bộ `routes/index.ts` cho `trade-finance.*approve` → **0 kết quả**. Không
  có `POST /trade-finance/lc/:id/approve` hay tương đương nào tồn tại. `approval.page.ts` (màn
  hình Checker hiện có) chỉ đọc `rmData.pendingTransactions()` — lọc trên `Transaction[]`
  (`rm-data.service.ts:124`), **không hề bao gồm LC/BG/Collection**.
- **Kết luận**: một LC/BG/Collection do Maker tạo sẽ **mãi mãi kẹt ở `PENDING_APPROVAL`** — không
  ai, kể cả Checker, có cách nào duyệt hay từ chối nó qua UI hay API hiện có.

### 2.3 Hàng chờ duyệt hiện tại (Checker)

`approval.page.ts` + `rm-data.service.ts:124,175,180` — chỉ phục vụ `Transaction` (không phải
`PaymentOrder`, dù `PaymentOrder` mới là bản ghi Agent thực sự tạo khi chuyển tiền — may là
`Transaction` được tạo cặp đôi cùng lúc nên vẫn hiển thị đúng). Gọi `POST /transactions/:id/
approve` / `/reject` (`transactions.controller.ts:13-23`), chỉ `CHECKER`/`ADMIN`
(`routes/index.ts:41-42`). Logic approve/reject thật ở `transactions.service.ts` — có
`applyBalanceChange()` (giữ/thả số dư tạm giữ khi duyệt/từ chối, dòng 10-14) — **không có kiểm
tra Maker ≠ Checker** ở tầng service này (chỉ có role check `CHECKER`/`ADMIN` ở route, chưa chặn
trường hợp 1 tài khoản Checker duyệt lệnh do chính họ khởi tạo qua Agent, dù thực tế demo chỉ có
3 user cố định nên khó xảy ra tự nhiên).

### 2.4 Warning/Validation hiện có — mang tính **phân tích rủi ro dashboard**, không phải **validate
form theo field**

- `server/src/reasoning/risk-engine.ts` — chấm điểm rủi ro LC/BG/Collection (hết hạn, tài liệu
  thiếu...) cho mục đích hiển thị cảnh báo tổng quan/dashboard.
- `server/src/reasoning/approval-risk.ts` — tính "sắp hết hạn duyệt" (`APPROVAL_EXPIRY_WINDOW_DAYS
  = 30`, cảnh báo trước 5 ngày) cho danh sách "việc cần làm".
- **Không có** cơ chế nào giống `Warning{code, severity, field, blocking}` gắn với **1 bản ghi
  lệnh cụ thể tại thời điểm submit**, không có warning catalog, không có validation engine dùng
  chung Maker/Checker như prompt §10/§11 yêu cầu. Đây là phần hoàn toàn mới cần xây.
- Form LC hiện tại (`lc-create.page.ts`) chỉ có validate HTML tối thiểu (`required` ngầm qua
  `[disabled]` nút submit ở nơi khác, chưa kiểm tra kỹ) — không có warning UI, không blocking rule
  rõ ràng.

### 2.5 Gemini/AI Agent write path (đã xây trong phiên trước, liên quan trực tiếp)

`agent-mock-tools.ts` có sẵn 4 tool EXECUTE (`execute_transfer`, `submit_lc_mock`,
`submit_guarantee_mock`, `submit_collection_mock`) — 3 tool sau **tái dùng** đúng
`tradeFinanceService.createLc/createGuarantee/createCollection` đã nêu ở §2.2, nghĩa là **LC/BG/
Collection tạo qua Agent cũng bị kẹt ở PENDING_APPROVAL giống hệt tạo qua form thường** — cùng lỗ
hổng #2, không phân biệt nguồn gốc.

## 3. Storage hiện tại (chi tiết cho quyết định §4 của prompt)

- **Không có SQLite/Postgres/MySQL nào được cài** (`server/package.json` không có driver DB nào).
- File JSON hiện có liên quan trực tiếp: `payment-orders.json`, `approvals.json`,
  `transactions.json`, `letter-of-credits.json`, `bank-guarantees.json`, `collections.json`.
- `JsonFileRepository`/`JsonSingletonRepository` đã có `reset()` (khôi phục từ
  `server/data-seed/*.json`) — cơ chế seed/reset mà prompt §18 yêu cầu ("npm run seed") **đã tồn
  tại ở tầng repository**, chỉ cần data file mới cho `BankingCommand`/`AuditEvent`/... đi theo
  đúng pattern, không cần viết seed script riêng từ đầu.
- Agent subsystem (phiên trước) dùng **in-memory Map** cho `AgentWorkflow`/
  `AgentConversationContext` — đây là quyết định **有意** riêng cho luồng chat AI (không cần bền
  vững qua restart), **khác hẳn** với toàn bộ phần còn lại của app vốn luôn ghi JSON file. Phần
  `BankingCommand` mới **phải đi theo pattern JSON file** (persistent), không theo pattern
  in-memory của Agent.

## 4. Workflow hiện tại — tổng hợp trạng thái

```
Transaction/PaymentOrder:  (tạo) → PENDING_APPROVAL → [approve]COMPLETED / [reject]REJECTED
LC/BG/Collection:          (tạo) → PENDING_APPROVAL → (kẹt vĩnh viễn — không có bước tiếp theo)
Agent's own workflow:      UNDERSTANDING → NEEDS_CLARIFICATION → PLANNING → WAITING_APPROVAL
                             → EXECUTING → COMPLETED/FAILED/CANCELLED
                           (đây là gate của AI, không phải gate Maker/Checker — xảy ra TRƯỚC
                            khi bản ghi PENDING_APPROVAL/business ở trên được tạo)
```

## 5. Files cần thay đổi

| File | Thay đổi |
|---|---|
| `src/app/features/payments/pages/single-transfer/single-transfer.page.ts` | Thay `submit()` giả bằng gọi API `BankingCommand` thật, mở rộng field theo §6 |
| `src/app/features/payments/pages/approval/approval.page.ts` | Mở rộng để hiển thị `BankingCommand` (mọi loại: TRANSFER/LC/GUARANTEE/COLLECTION), không chỉ `Transaction` |
| `src/app/core/services/rm-data.service.ts` | Thêm method gọi `/api/commands/*` |
| `server/src/routes/index.ts` | Thêm route `/api/commands/*`, `/api/checker/commands/*` |
| `server/src/agent/agent-mock-tools.ts` | **Cần quyết định** (xem §9) — có route qua `BankingCommand` mới hay giữ nguyên ghi thẳng `PaymentOrder`/`tradeFinanceService` như hiện tại |
| `src/app/features/trade-finance/pages/lc-create.page.ts`, `guarantee-create.page.ts`, `collection-create.page.ts` | Thêm warning panel dùng chung, nối vào `BankingCommand` nếu quyết định hợp nhất luồng LC/BG/Collection |
| `src/app/app.routes.ts` | Thêm route `/maker/commands/*`, `/checker/queue`, `/checker/commands/:id` (hoặc tái dùng `/payments/approval` đã có — cần quyết định) |

## 6. Files cần tạo mới (theo đúng cấu trúc §14/§10 của prompt)

```
server/src/models/index.ts            + BankingCommand, ValidationResult, Warning, AuditEvent, CommandSnapshot
server/src/repositories/
  commands.repository.ts              (JsonFileRepository<BankingCommand>)
  command-snapshots.repository.ts
  audit-events.repository.ts
server/src/domain/rules/
  transfer.rules.ts
  lc.rules.ts
  guarantee.rules.ts
  collection.rules.ts
  warning-catalog.ts
  validation-engine.ts
server/src/services/commands.service.ts
server/src/controllers/commands.controller.ts
server/src/auth/demo-role.middleware.ts   (nếu cần header giả lập riêng — thực tế đã có session thật, có thể không cần)
src/app/core/services/commands.service.ts (frontend)
src/app/features/payments/pages/... hoặc /maker/**, /checker/**  (tùy quyết định routing)
docs/MAKER_CHECKER_MODEL.md, docs/MAKER_CHECKER_TEST_SCENARIOS.md (theo đúng convention tiếng Việt đã dùng cho docs/GEMINI_*)
server/test/commands.test.ts, server/test/commands-http.test.ts
```

## 7. Migration plan (đề xuất)

Additive, không phá vỡ 687 test hiện có:

1. **Slice 1 — Domain + Storage**: `BankingCommand`/`ValidationResult`/`Warning`/`AuditEvent`
   models, repository, validation-engine + rule files cho `TRANSFER` trước (đơn giản nhất), test
   đơn vị đầy đủ.
2. **Slice 2 — API**: `/api/commands` (create/validate/submit), `/api/checker/commands`
   (list/detail/approve/reject) — theo đúng §8, test HTTP qua fixture Maker/Checker có sẵn
   (`server/test/security/fixtures.ts`).
3. **Slice 3 — Frontend Maker**: nâng cấp `single-transfer.page.ts` thành banking form thật theo
   §6, gọi API Slice 2.
4. **Slice 4 — Frontend Checker**: nâng cấp `approval.page.ts` (hoặc trang mới) hiển thị
   `BankingCommand`, warning panel, audit timeline, approve/reject có lý do.
5. **Slice 5 — Virtual RM tích hợp**: Agent mở form thay vì tự thực thi thẳng cho `create_transfer`
   (theo đúng §7 — "form-driven agent"), pre-fill từ entity Gemini đã trích xuất.
6. **Slice 6 — Mở rộng LC/BG/Collection**: áp dụng cùng `BankingCommand` cho 3 loại còn lại, vá lỗ
   hổng #2 (hiện không có route duyệt nào).
7. **Slice 7 — Dọn dẹp/Migration note**: quyết định số phận `Transaction`/`PaymentOrder`/
   `ApprovalRecord` cũ (xem §9).

## 8. Risks

| Rủi ro | Mức độ | Ghi chú |
|---|---|---|
| Trùng lặp khái niệm với `Transaction`/`PaymentOrder`/`ApprovalRecord` đã có | **Cao** | Cần quyết định rõ: `BankingCommand` THAY THẾ hay SONG SONG với model cũ — xem §9 |
| Trùng lặp/xung đột với Agent's `execute_transfer`/`submit_*_mock` tool đã xây | **Cao** | Nếu không hợp nhất, sẽ có 2 nguồn tạo giao dịch ghi vào 2 nơi khác nhau — lặp lại đúng lỗ hổng #1 đang muốn sửa |
| Phá vỡ 687 test hiện có nếu đổi model `Transaction`/`PaymentOrder` | Trung bình | Ưu tiên additive, không sửa field cũ |
| Trùng route `/payments/approval` cũ và `/checker/queue` mới | Thấp-Trung bình | Nên quyết định 1 đường dẫn duy nhất, tránh 2 UI cho cùng 1 việc |
| Khối lượng công việc rất lớn (tương đương cả pha Gemini Agent trước) | Cao (thời gian) | Chia slice, test sau mỗi slice, đúng kỷ luật đã áp dụng ở pha trước |

## 9. Quyết định cần chốt trước khi code (tương đương 3 câu hỏi đã hỏi ở pha Gemini Agent)

1. **Lưu trữ**: JSON file (tái dùng `JsonFileRepository` có sẵn) hay thêm SQLite?
2. **Quan hệ với `Transaction`/`PaymentOrder`/`ApprovalRecord` cũ**: `BankingCommand` THAY THẾ
   hoàn toàn (Transfer/LC/BG/Collection đều tạo qua `BankingCommand`, model cũ deprecated dần) hay
   SONG SONG (giữ nguyên toàn bộ, `BankingCommand` chỉ áp dụng cho form thường mới, Agent vẫn ghi
   thẳng như cũ)? — Khuyến nghị: **thay thế**, vì mục tiêu cốt lõi của prompt ("Maker và Checker
   phải nhìn cùng một bản ghi backend") chỉ đạt được triệt để nếu có 1 nguồn sự thật duy nhất; giữ
   song song sẽ tái tạo chính lỗ hổng #1 đang cần sửa.
3. **Agent (Gemini) có tạo `BankingCommand` thay vì gọi thẳng tool `execute_transfer`/
   `submit_*_mock` không?** — Khuyến nghị: **có**, đúng tinh thần §7 "form-driven agent": Agent chỉ
   pre-fill `BankingCommand` DRAFT từ entity đã hiểu, mở form cho Maker hoàn tất, không tự ý ghi
   thẳng backend như hiện tại.

## 10. Backward compatibility plan

- Không xóa `Transaction`/`PaymentOrder`/`ApprovalRecord` model hay file JSON — vẫn giữ để không
  phá dữ liệu lịch sử/test cũ đang phụ thuộc (`server/test/agent-semantic.test.ts`,
  `agent-http.test.ts`, `trade-finance-service.test.ts`, v.v.).
- `POST /transactions/:id/approve|reject` giữ nguyên hoạt động (không xóa route) — nhưng sau khi
  hợp nhất (nếu chọn phương án "thay thế" ở §9.2), **không có luồng tạo mới nào đi qua nó nữa**,
  chỉ còn phục vụ dữ liệu lịch sử/đã seed sẵn.
  Nếu 687 test cũ gọi trực tiếp `transactionsService.approve()`/route này cho dữ liệu seed sẵn
  (không phải dữ liệu mới), chúng vẫn pass nguyên vẹn.
- `execute_transfer`/`submit_lc_mock`/`submit_guarantee_mock`/`submit_collection_mock` (tool Agent
  hiện có) — nếu chọn phương án hợp nhất ở §9.3, các tool này đổi từ "ghi thẳng" sang "tạo
  `BankingCommand` PENDING_CHECKER" — cần cập nhật lại toàn bộ test liên quan
  (`agent-semantic.test.ts`, `agent-http.test.ts`) chứ không xóa, giữ đúng số lượng test case, chỉ
  đổi assertion cho khớp hành vi mới.
