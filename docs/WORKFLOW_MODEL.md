# Workflow Model — Máy trạng thái Agent

Xem `docs/AI_AGENT_ARCHITECTURE.md` cho bức tranh tổng, `docs/SEMANTIC_MODEL.md` cho lớp hiểu ngôn
ngữ đứng trước máy trạng thái này.

## 1. Sơ đồ trạng thái (`server/src/agent/workflow-engine.ts`)

```
UNDERSTANDING ──► NEEDS_CLARIFICATION ──► PLANNING ──► WAITING_APPROVAL ──► EXECUTING ──► COMPLETED
     │                    │  ▲               │                │                │
     │                    └──┘ (tự lặp,       │                │                └──► FAILED
     │                     hỏi thêm lần nữa)  ▼                ▼
     └────────────────────────────────► CANCELLED         CANCELLED
                                    (từ mọi trạng thái không phải terminal)
```

`ALLOWED_TRANSITIONS` (`workflow-engine.ts` dòng 40-49) là **nơi duy nhất** liệt kê cạnh hợp lệ —
`transition()` là **hàm duy nhất** được phép đổi `status` của một workflow trong toàn bộ codebase;
gọi với một cạnh không có trong danh sách sẽ `throw InvalidWorkflowTransitionError` thay vì âm thầm
cho qua. Đây là lý do double-approve (bấm Xác nhận 2 lần) không thể thực thi 2 lần: lần gọi thứ 2
thấy `status` đã là `EXECUTING`/`COMPLETED`, không nằm trong `ALLOWED_TRANSITIONS['WAITING_APPROVAL']`
sau lần đầu, nên bị từ chối ở tầng state machine — **độc lập** với việc kiểm tra idempotency key
(2 lớp phòng thủ riêng biệt, xem `docs/SECURITY.md` §5).

Read-intent (7 loại) đi tắt `PLANNING → EXECUTING` ngay (không qua `WAITING_APPROVAL` — không cần
duyệt để *đọc* dữ liệu), xem `executeReadIntent()` trong `agent-orchestrator.ts` dòng 264-283.

## 2. `AgentWorkflow` — cấu trúc dữ liệu

| Field | Ý nghĩa |
|---|---|
| `workflowId` | `WF-<uuid>` |
| `userId` | Chủ workflow — mọi thao tác approve/cancel/tiếp tục hội thoại đều so khớp field này |
| `intent`, `entities` | Kết quả hiểu ngôn ngữ tại thời điểm tạo, cập nhật dần qua các lượt làm rõ |
| `status` | 1 trong 8 giá trị `WorkflowStatus` |
| `toolName` | Tool sẽ gọi khi `EXECUTING` (đặt cứng bởi `agent-orchestrator.ts`, Gemini không tự chọn — xem `docs/AI_AGENT_ARCHITECTURE.md` §2) |
| `preview` | Nội dung hiển thị trong card duyệt (spec §11) |
| `idempotencyKey` | `uuid` sinh mới khi tạo workflow, không đổi trong suốt vòng đời — spec §13 |
| `executionId`, `result`, `error` | Đặt khi `EXECUTING`/`COMPLETED`/`FAILED` |

## 3. Idempotency (spec §13)

`idempotencyKey` sinh 1 lần khi `createWorkflow()` chạy, trả về cho frontend trong `AgentResponse`
lúc `WAITING_APPROVAL` (`agent-orchestrator.ts::planWrite()` dòng 167). Frontend **bắt buộc** gửi
lại đúng key này khi gọi `POST /api/agent/workflow/:id/approve` — `approval-gate.ts::validateApproval()`
so khớp; sai key → `ApprovalValidationError('IDEMPOTENCY_MISMATCH')` → HTTP 409, không thực thi.
Không cần Redis/DB riêng cho demo — `workflowId` đã là khóa duy nhất trong Map in-memory, bản thân
key + trạng thái `WAITING_APPROVAL` cùng nhau đã đủ ngăn thực thi trùng.

## 4. Bộ nhớ hội thoại — `agent-conversation.ts`

`AgentConversationContext { sessionId, messages, currentIntent, entities, workflowId }` — đúng
hình dạng spec §14 yêu cầu, in-memory (`Map`), khóa theo `userId` thật (không phát minh khái niệm
session thứ hai chồng lên session HTTP đã có). Tách biệt hoàn toàn với
`server/src/ai/conversation-context.ts` đã có từ trước (chỉ nhớ `{lastIntent, lastCurrency}` cho bộ
máy cũ) — hai kho nhớ không đụng nhau, tránh xung đột hành vi.

`mergeEntities()` (dòng 59-63): **luôn merge, không bao giờ reset toàn bộ** — field mới ghi đè field
cũ cùng tên, field không nhắc lại ở lượt mới vẫn giữ nguyên giá trị đã biết. Đây là cách hiện thực
hóa spec §8 "hội thoại làm rõ phải cộng dồn ngữ cảnh, không hỏi lại từ đầu".

`clearWorkflowState()` (dòng 76-81) được gọi khi workflow chạm trạng thái terminal (COMPLETED/
FAILED/CANCELLED) hoặc khi phát hiện đổi chủ đề giữa chừng — xóa `workflowId`/`entities`/
`currentIntent` nhưng **giữ nguyên** `messages` (lịch sử hội thoại vẫn liền mạch cho các câu hỏi
sau, kể cả sau khi 1 giao dịch đã hoàn tất).

## 5. `planWrite()` — quyết định bước tiếp theo cho write-intent

Dùng chung cho cả lượt đầu (ngay sau khi Gemini hiểu xong) lẫn sau mỗi câu trả lời làm rõ — hợp lệ
gọi từ cả `UNDERSTANDING` lẫn `NEEDS_CLARIFICATION` theo đúng `ALLOWED_TRANSITIONS`.

```
required = REQUIRED_FIELDS_BY_INTENT[intent]      // xem docs/SEMANTIC_MODEL.md §3 — kiểm tra LẠI
stillMissing = required.filter(f => !entities[f]) // ở server, không tin missingFields Gemini tự báo
```

- Còn thiếu → `transition(..., 'NEEDS_CLARIFICATION')` + câu hỏi làm rõ nhắm đúng 1 field còn thiếu
  (`buildClarificationQuestion()` — không hỏi dồn nhiều field một lúc).
- Đủ field → `transition(..., 'PLANNING')` → gọi tool `*_draft` (PREPARE, không cần duyệt, chỉ dựng
  preview) → `transition(..., 'WAITING_APPROVAL', {toolName: execute-tool, preview})`. Nếu tool
  draft ném lỗi (vd role không được phép) → `transition(..., 'FAILED')`, không rơi vào trạng thái
  lơ lửng nào khác.

## 6. Phát hiện đổi chủ đề khi đang `NEEDS_CLARIFICATION` (`continueClarification()`)

Bug thật đã gặp và sửa trong quá trình phát triển (Phase G, xác nhận trực tiếp bằng Playwright, xem
`docs/GEMINI_AGENT_AUDIT.md`/lịch sử commit): nếu không kiểm tra, MỌI tin nhắn tiếp theo — bất kể
nội dung — đều bị hiểu là câu trả lời cho câu hỏi làm rõ đang treo. Ví dụ lỗi thật: đang hỏi "Anh/
chị muốn chuyển cho ai?" thì khách gõ "Kiểm tra giao dịch txn-001" — hệ thống cũ vẫn cố hiểu câu này
như một cái tên người nhận.

Cách sửa (`agent-orchestrator.ts` dòng 186-208):

```ts
const isTopicChange =
  understanding.intent !== workflow.intent &&
  understanding.intent !== 'unknown' &&
  (understanding.intent === 'general_question' || understanding.confidence >= 0.5);
```

- `unknown` không bao giờ tính là đổi chủ đề — một câu trả lời ngắn mơ hồ như "5 triệu" hay một cái
  tên trần trụi hợp lệ bị phân loại `unknown` khi đứng một mình, vẫn phải được merge làm câu trả
  lời, không phải bị coi là chủ đề mới.
- `general_question` luôn được coi là đổi chủ đề **bất kể confidence** — vì nhánh `general_question`
  của `fallback-rule-engine.ts` tự nó đã yêu cầu câu hỏi đủ dài (>8 ký tự) mới gán intent này, nên
  tín hiệu đã đáng tin dù confidence mặc định chỉ 0.4. **Bug thứ 2** từng xảy ra ở đây: gate ban đầu
  yêu cầu `confidence >= 0.5` cho MỌI trường hợp kể cả `general_question`, khiến câu hỏi "Tỷ giá USD
  hôm nay?" hỏi giữa lúc đang làm rõ lệnh chuyển tiền bị nuốt mất, RM trả lời lại đúng câu hỏi
  chuyển tiền cũ thay vì tỷ giá — phát hiện qua kiểm thử Playwright trực tiếp (ảnh chụp màn hình),
  không phải qua test tự động (bài test HTTP ban đầu vô tình che mất lỗi này do thứ tự gọi). Sửa
  bằng cách miễn `general_question` khỏi ngưỡng confidence.
- Mọi intent hành động khác vẫn cần `confidence >= 0.5` mới được phép hủy workflow đang mở — tránh
  hủy nhầm một workflow thật đang tiến hành chỉ vì một câu trả lời mơ hồ bị phân loại nhầm.

Khi xác định là đổi chủ đề: `transition(..., 'CANCELLED')` workflow cũ, `clearWorkflowState()`, rồi
định tuyến tin nhắn mới qua đúng `dispatchIntent()` như một yêu cầu hoàn toàn mới.

## 7. `handleMessage()` — điểm vào duy nhất

Thứ tự kiểm tra (`agent-orchestrator.ts` dòng 296-339), luôn ưu tiên workflow đang mở của người
dùng trước khi coi tin nhắn là một yêu cầu mới:

1. Có workflow `WAITING_APPROVAL`? → chặn mọi văn bản thường (kể cả "OK", "đồng ý", "yes" — spec
   §11 "Không chấp nhận 'OK' từ LLM như một approval"), chỉ nhận hủy qua từ khóa hoặc chờ đúng nút
   bấm gọi `/approve`. Đây là điểm thực thi cứng nhất của toàn bộ nguyên tắc con người xác nhận.
2. Có workflow `NEEDS_CLARIFICATION`? → `continueClarification()` (§6 ở trên), trừ khi tin nhắn là
   một câu hủy rõ ràng.
3. Không có workflow mở → gọi `understand()` mới hoàn toàn → `dispatchIntent()`.

## 8. Quan sát được (spec §21)

Mỗi lần chuyển trạng thái quan trọng ghi 1 dòng JSON qua `logEvent()` — chỉ `workflowId`/`intent`/
`status`/`toolName`, **không bao giờ** `entities`/`preview`/`result` (có thể chứa tên người, số
tiền). Ví dụ thật trong code: `agent.workflow.created`, `agent.workflow.waiting_approval`,
`agent.workflow.cancelled` (kèm `reason: 'topic_change'` khi áp dụng), `agent.workflow.completed`,
`agent.workflow.failed` (kèm `stage: 'planning'|'executing'`). Chi tiết đầy đủ ở `docs/SECURITY.md`
§6.
