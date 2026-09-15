# Tool Registry — Danh sách công cụ Agent được phép gọi

Xem `docs/AI_AGENT_ARCHITECTURE.md` §2 cho vai trò của tầng Tool trong kiến trúc tổng, `docs/
SECURITY.md` §3 cho lý do whitelist này là một lớp phòng thủ bắt buộc, không phải tùy chọn.

## 1. `AgentTool` interface (`server/src/agent/agent-tool-registry.ts`)

```ts
interface AgentTool<Params, Result> {
  name: string;
  description: string;
  riskLevel: RiskLevel;         // tái dùng nguyên union từ tools/tool-security.ts, không tạo union thứ 2
  requiresApproval: boolean;    // true = Approval Gate bắt buộc, không có ngoại lệ
  allowedRoles: Role[];
  execute: (ctx: UserContext, params: Params) => Promise<Result> | Result;
}
```

**Khác biệt có chủ đích so với spec gốc**: spec mô tả `execute(input)` nhận 1 tham số duy nhất.
Codebase này (xem `server/src/tools/index.ts`'s comment đầu file, quy ước đã có từ trước Agent)
không bao giờ trộn danh tính người gọi (`UserContext` — role, userId) chung với tham số do người
dùng/model cung cấp, để tránh một class lỗi bảo mật kinh điển: model "gợi ý" luôn cả role trong
`params`. `execute` ở đây luôn nhận `ctx` (lấy từ session thật phía server) làm tham số **đầu tiên
và tách biệt**, không thể ghi đè bởi Gemini hay bởi payload từ client.

## 2. Whitelist fail-closed (`assertAgentToolAllowed`)

```ts
function assertAgentToolAllowed(toolName: string, role: Role | undefined): AgentTool {
  const tool = registry.get(toolName);
  if (!tool) throw new AgentToolNotAuthorizedError(...);            // tool không tồn tại → từ chối
  if (!role || !tool.allowedRoles.includes(role)) throw ...;        // role không đủ quyền → từ chối
  return tool;
}
```

Không có nhánh "cho qua mặc định" nào — một tool chưa đăng ký, hoặc role không nằm trong
`allowedRoles`, luôn bị từ chối. Đây là cùng triết lý `assertToolAllowed()` của
`tools/tool-security.ts` đã áp dụng cho 34 tool đọc-only có từ trước, không phát minh cơ chế mới.

`dispatchIntent()`/`planWrite()` trong `agent-orchestrator.ts` chỉ map intent (giá trị Zod-enum cố
định, xem `docs/SEMANTIC_MODEL.md` §2) sang MỘT toolName cứng viết sẵn trong code
(`WRITE_TOOL_MAP`/`READ_TOOL_MAP`) — Gemini không bao giờ được hỏi "muốn gọi tool nào" và không có
đường nào để tên tool đến từ văn bản người dùng nhập.

## 3. Toàn bộ 15 tool (`server/src/agent/agent-mock-tools.ts`)

### Đọc (READ, không cần duyệt, mọi role)

| Tool | Bọc quanh | Mô tả |
|---|---|---|
| `get_balance` | `tools/index.ts::getAccountBalance` | Số dư 1 tài khoản |
| `search_transaction` | `tools/index.ts::getTransactions` | Tra cứu giao dịch theo mã hoặc liệt kê gần đây |
| `check_lc_status` | `tools/index.ts::getLetterOfCredits` | Trạng thái LC |
| `check_guarantee_status` | `tools/index.ts::getBankGuarantees` | Trạng thái bảo lãnh |
| `check_collection_status` | `tools/index.ts::getCollections` | Trạng thái nhờ thu |
| `search_product_information` | `tools/index.ts::getProducts` + `getRecommendations` | Thông tin/gợi ý sản phẩm |
| `contact_rm` | (không gọi tool cũ) | Human handoff — chỉ trả câu xác nhận đã ghi nhận |

Tất cả 7 tool đọc: `riskLevel: 'READ'`, `requiresApproval: false`, `allowedRoles: MAKER/CHECKER/ADMIN`
— không thay đổi dữ liệu nên không cần cổng duyệt.

### Chuẩn bị nháp (PREPARE, không cần duyệt riêng — nhưng dẫn tới bước cần duyệt)

| Tool | Vai trò |
|---|---|
| `create_transfer_draft` | Dựng preview lệnh chuyển tiền (số tiền, người nhận, tài khoản nguồn, phí) từ entities đã đủ |
| `create_lc_draft` | Dựng preview yêu cầu mở LC |
| `create_guarantee_draft` | Dựng preview yêu cầu phát hành bảo lãnh |
| `create_collection_draft` | Dựng preview yêu cầu tạo bộ nhờ thu |

4 tool này chỉ **đọc** entities đã có và **tính toán** preview — không ghi file nào, không tự lấy
giá trị mặc định bừa bãi cho field bắt buộc (thiếu `amount`/`beneficiaryName`/... thì `throw`, và
lời gọi này chỉ xảy ra sau khi `planWrite()` đã tự xác nhận `missingFields` rỗng — xem `docs/
WORKFLOW_MODEL.md` §5). `riskLevel: 'PREPARE'`, `requiresApproval: false`, chỉ `MAKER`/`ADMIN` (
Checker không được tạo lệnh — đúng quy tắc Maker→Checker đã có từ trước, xem
`trade-finance.controller.ts::createLc`).

### Ghi thật (EXECUTE, **bắt buộc** qua Approval Gate)

| Tool | Tái dùng | Ghi vào |
|---|---|---|
| `execute_transfer` | **Mới hoàn toàn** — app này trước đây không có backend "chuyển tiền" nào (xem `docs/GEMINI_AGENT_AUDIT.md` §4) | `transactions.json` (DEBIT, `PENDING_APPROVAL`) + `payment-orders.json` (`PENDING_APPROVAL`) + `approvals.json` (bản ghi `PENDING`, chờ Checker thật duyệt) |
| `submit_lc_mock` | `trade-finance.service.ts::createLc` (đã có sẵn) | `letter-of-credits.json`, trạng thái `PENDING_APPROVAL` |
| `submit_guarantee_mock` | `trade-finance.service.ts::createGuarantee` (đã có sẵn) | `bank-guarantees.json`, trạng thái `PENDING_APPROVAL` |
| `submit_collection_mock` | `trade-finance.service.ts::createCollection` (đã có sẵn) | `collections.json`, trạng thái `PENDING_APPROVAL` |

Cả 4 tool: `riskLevel: 'EXECUTE'`, **`requiresApproval: true`**, chỉ `MAKER`/`ADMIN`. `approval-
gate.ts` là **nơi duy nhất** trong toàn bộ codebase gọi `execute()` của 4 tool này — không route,
controller, hay đoạn code nào khác được phép gọi trực tiếp (xem `docs/SECURITY.md` §4).

`execute_transfer` ghi thêm một `ApprovalRecord` (`decision: 'PENDING'`) để lệnh chuyển mới tạo
qua Agent xuất hiện đúng trong hàng chờ "chờ duyệt" của Checker thật — giống hệt một lệnh tạo qua
UI thông thường. Đây chính là **lớp duyệt thứ hai, độc lập**: cổng của Agent (khách tự xác nhận bản
nháp của chính mình) xảy ra TRƯỚC, cổng Maker→Checker của ngân hàng (một người khác duyệt) xảy ra
SAU — không cái nào thay thế cái nào (xem `docs/GEMINI_AGENT_AUDIT.md` §8 và `docs/SECURITY.md` §4).

## 4. Vì sao không có tool "tự do gọi hàm"/"tự viết code"

Spec §19 cấm rõ: không cho phép LLM tự thực thi function/code tùy ý, không cho sửa DB trực tiếp.
Thiết kế ở đây tuân thủ tự nhiên vì cấu trúc chính nó đã loại trừ khả năng đó — Gemini chỉ trả về
JSON theo `semanticUnderstandingSchema` (`docs/SEMANTIC_MODEL.md` §1), không có field nào cho phép
chỉ định tên hàm, tên tool, hay đoạn mã để chạy. Toàn bộ việc "chọn tool nào" là bảng tra cứu tĩnh
viết tay (`WRITE_TOOL_MAP`/`READ_TOOL_MAP`) — không có input nào của người dùng đi thẳng vào một
lệnh `eval`/dynamic-require/tool lookup theo tên tự do.
