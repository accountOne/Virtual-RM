# GEMINI_AGENT_AUDIT — Audit trước khi nâng cấp Virtual RM thành AI Agent

Ngày: 2026-09-15. Phạm vi: đọc code trực tiếp (`server/src/**`, `src/app/features/virtual-rm/**`,
`business-semantics/**`), không suy đoán từ tên file. Không sửa code trong tài liệu này.

---

## 1. Current Architecture

| | |
|---|---|
| Repository | `accountOne/Virtual-RM`, branch `claude/virtual-rm-demo-platform-k36qiq` |
| Frontend | Angular `19.2.25` (CLI `19.2.27`), standalone components, signals, không NgModule |
| Backend | Node.js `v22.22.2`, Express `^4.21.2`, TypeScript `^5.7.2`, chạy qua `ts-node`/`nodemon` (dev) hoặc biên dịch `tsc` (prod) |
| Data | JSON tĩnh dưới `server/data/*.json` (bản sống) + `server/data-seed/*.json` (bản gốc để reset), truy cập qua `JsonFileRepository`/`JsonSingletonRepository` — **không có database thật** |
| Chạy dev (2 tiến trình) | `npm run start:server` (nodemon, cổng 3000) + `npm run start:client` (`ng serve --proxy-config proxy.conf.json`, cổng 4200, proxy `/api` → 3000). Gộp lại: `npm run dev` (root, dùng `concurrently`) |
| Chạy kiểu prod | `npm run build` (Angular → `dist/client`) + `npm run build:server` (→ `server/dist`) rồi `node server/dist/server.js` — Express phục vụ cả app đã build lẫn API trên cùng origin |
| Test | Backend: `npm test --prefix server` (`ts-node -T test/run-all.ts`) — **640/640 pass** ở lần chạy audit này. Frontend (riêng RM Interaction Engine): `npm run test:interaction` — **39/39 pass** |
| Env vars | **Không dùng `dotenv`** (đã có comment tường minh trong `.env.example`: "None of these are read via dotenv today... export the var before `npm run dev`"). `.env.example` đã tồn tại ở root, `.env`/`.env.local` đã có trong `.gitignore` |
| Auth | Session-cookie thật (không phải mock): `server/src/auth/session.middleware.ts`, `session-store.ts`, CSRF double-submit, rate limit đăng nhập, khóa tài khoản sau N lần sai. Vai trò: `Role = 'MAKER' | 'CHECKER' | 'ADMIN'` (`server/src/auth/types.ts`) |

---

## 2. Current Virtual RM Architecture (frontend chat)

Thư mục `src/app/features/virtual-rm/interaction/`:

```
rm-interaction.types.ts   RMMessage / RMAction / RMMessageType — hợp đồng UI, KHÔNG đổi khi thêm Gemini
rm-message-builder.ts     Biến SemanticAnswer (JSON từ backend) → chuỗi RMMessage (bubble/card)
rm-chat-session.service.ts  State hội thoại (Angular signal), gọi RmDataService.askRmRaw(), stream reveal
rm-state.service.ts       RMState: IDLE/GREETING/PROCESSING/ANALYZING/RESPONDING/... (label UX, không lộ chain-of-thought)
rm-stream.service.ts      Hiệu ứng "gõ chữ" tuần tự khi hiện nhiều bubble — chỉ ở frontend, không phải SSE thật
rm-context.service.ts     Gắn thêm entityId màn hình hiện tại vào câu hỏi ngắn ("còn thiếu gì?")
rm-voice.service.ts       STT/TTS qua Gemini (POST /api/voice/transcribe, /api/voice/speak), fallback Web Speech API
```

`RMAction.type: 'NAVIGATE' | 'QUERY' | 'CONFIRM' | 'UPLOAD' | 'DOWNLOAD' | 'HANDOFF'` — chỉ
`NAVIGATE` (điều hướng) và `CONFIRM`/`UPLOAD` (dùng trong luồng LC PO-upload đã làm ở phiên trước,
xem `docs/phase-5.5-lc-assistant.md`) hiện có handler thật ở `virtual-rm-chat.page.ts::handleAction`.
`QUERY`/`DOWNLOAD`/`HANDOFF` **vẫn là type khai báo nhưng chưa từng được dựng ở đâu** (dead code).

`RmChatSessionService.submit(question)` hiện tại:
```
user gõ text → pushMessage(USER) → RmDataService.askRmRaw(text)
             → POST /api/virtual-rm/query { message }
             → buildRmMessages(answer) → stream.reveal(...) → pushMessage(RM)*
```
Đây là **con đường duy nhất** free-text hiện đi qua để tới bất kỳ hiểu-ngôn-ngữ-tự-nhiên nào. Không
có state machine nào ở giữa (không NEEDS_CLARIFICATION/WAITING_APPROVAL) — mỗi lượt độc lập, trừ
`ai/conversation-context.ts` ở backend nhớ *một* thứ hẹp (xem mục 6).

Ngoại lệ đã có sẵn (phiên trước, không dùng bộ máy trên): luồng LC PO-upload
(`rm-chat-session.service.ts::beginLcAssist/resolveLcAssistChoice/uploadPoFile`) — một state machine
**thủ công, hoàn toàn ở client**, dùng regex bắt cụm "mở LC"/"phát hành LC" để rẽ nhánh TRƯỚC khi
gọi `askRmRaw`, tự dựng câu hỏi Import/Export bằng `RMAction.type: 'CONFIRM'`, rồi gọi 2 API mới
(`POST /api/virtual-rm/lc/analyze-po`, `.../lc/draft-message`). Đây là **tiền lệ gần nhất** với
workflow/approval mà nhiệm vụ này yêu cầu, nhưng: không có `workflowId`/state machine chuẩn hoá, không
idempotency key, không "APPROVE" thật (chỉ điều hướng sang form có sẵn để người dùng tự bấm nút gửi).

---

## 3. Current AI/Semantic Architecture (backend)

### 3.1 Semantic Engine (deterministic, KHÔNG có LLM nào cả)

`server/src/semantic/semantic-engine.ts` (289 dòng) là điểm vào (`answerQuery`). Pipeline:

```
rawQuestion
  → normalize() (bỏ dấu, chuẩn hoá viết tắt — normalizer.ts)
  → resolveDatePeriod / parseAmountFilter / resolveStatus (parser tách biệt cho từng loại)
  → extractEntities()  ⚠️ xem giới hạn quan trọng bên dưới
  → scoreIntents()     chấm điểm từng intent theo synonym/domain/entity match (intent-detector.ts)
  → nếu confidence < ngưỡng (0.65) → CLARIFICATION_NEEDED
  → buildQuery() → generateAnswer() (response-generator.ts, 1018 dòng — 1 handler/intent, string template)
```

Toàn bộ pipeline này **không gọi model nào** — 100% rule-based, tra cứu JSON tĩnh dưới
`/business-semantics/*.json` (domains/entities/intents/synonyms/date-periods/amount-operators/
status-definitions/semantic-rules/navigation-actions).

**Giới hạn quan trọng nhất cho nhiệm vụ này**: `entity-extractor.ts::extractEntities()` chỉ nhận
diện tên bằng cách **substring-match với danh sách tên đã có sẵn trong dữ liệu mock** (đọc từ
`transactions.json`/`payment-orders.json`/`collections.json`/LC/BG/`receivables.json`/
`payables.json` — hàm `collectKnownNames()`). Nghĩa là: **không thể trích xuất một cái tên hoàn
toàn mới người dùng gõ tự do** (ví dụ "Nguyễn Văn A" trong yêu cầu của bạn) trừ khi cái tên đó đã
tồn tại sẵn trong data. Đây chính là khoảng trống mà Gemini (NLU thật) cần lấp — không phải một
giới hạn có thể "mở rộng thêm regex" được.

### 3.2 Model Router — `server/src/ai/model-router.ts` (158 dòng)

Quyết định câu hỏi có cần "Reasoning Engine" hay không, **bằng keyword tĩnh** (không gọi model để
quyết định — comment trong file tự nói rõ: "Router phải có deterministic rules trước khi gọi
model"). Có 14 `ReasoningUseCase` (CASHFLOW_ANALYSIS, LIQUIDITY_ANALYSIS, DAILY_PRIORITY,
LC_RISK_PRIORITIZATION, ...).

### 3.3 Reasoning Engine — `server/src/ai/reasoning-engine.ts` (860 dòng)

Với mỗi `ReasoningUseCase`: gọi một loạt **Tool** (mục 5) → Calculation Engine tính số liệu thật →
gọi `AIProvider.reason({ useCase, facts, goal })` để **diễn đạt lại** facts đã tính sẵn thành câu
văn tiếng Việt — **provider không được phép tự tính số, chỉ được phép "phrase" facts đã có** (chính
sách "no hallucination", spec cũ §21). Sau đó **Verification Engine** kiểm tra answer không bịa số
(mọi số trong summary phải truy được về evidence).

### 3.4 AI Provider abstraction — ĐÃ CÓ SẴN, đây là điểm cắm quan trọng nhất

`server/src/ai/types.ts` định nghĩa:
```ts
export interface AIProvider {
  readonly name: string;
  chat(request: AIRequest): Promise<AIResponse>;
  reason(request: ReasoningRequest): Promise<ReasoningResponse>;
}
```
`server/src/ai/ai-client.ts::getAiProvider()` là factory: đọc `AI_PROVIDER`/`AI_API_KEY` từ env,
**nếu không có `AI_API_KEY` → luôn fallback về `MockReasoningProvider`** (deterministic, template
tiếng Việt theo từng use case — `mock-reasoning-provider.ts`, 235 dòng). Comment trong code đã tự
viết sẵn: *"Swapping in a real provider means adding one more `case` here... claude/openai/
azure-openai/vng/local"* — **`gemini` chưa có trong danh sách case này, nhưng cơ chế đã sẵn sàng
để thêm.**

⚠️ **Quan trọng**: `AIProvider.reason()` hiện tại chỉ làm MỘT việc — diễn đạt facts đã tính sẵn
thành câu văn. Nó **không** làm nhiệm vụ hiểu ngôn ngữ tự nhiên → intent/entity/confidence mà yêu
cầu Gemini Agent cần. Đây là **năng lực hoàn toàn mới**, không phải mở rộng của `reason()`. Xem
mục 9 (Target Architecture) và mục 10 (Migration Plan) về cách không đụng vào `AIProvider` hiện có
mà vẫn tái dùng đúng quy ước (factory/fallback/no-log-key) của nó.

### 3.5 Conversation context hiện có — HẸP, không đủ cho Agent

`server/src/ai/conversation-context.ts` (113 dòng) — comment tự khai rõ: *"this demo's API is
intentionally stateless per request... this is a minimal, explicitly-scoped exception"*. Chỉ nhớ
theo `userId`: `{ lastIntent, lastCurrency, updatedAt }`, dùng cho 2 việc hẹp — theo sau bằng
currency ("Còn tài khoản USD?") và theo sau bằng số LC/BG. **Không có `messages[]`, không có
`entities` tích luỹ, không có `workflowId`** — hoàn toàn không phải là thứ mục 14 trong yêu cầu
(`ConversationContext { sessionId, messages, currentIntent, entities, workflowId }`) đang mô tả.
⚠️ **Trùng tên khái niệm** — cần đặt tên khác cho object mới (xem Risk List).

---

## 4. Current Features (đã xác nhận qua code, không suy đoán)

| Nhóm | Trạng thái | Ghi chú |
|---|---|---|
| Đăng nhập/session/CSRF/rate-limit | ✅ Hoạt động thật | `server/src/auth/**`, cookie thật, không mock |
| Daily Dashboard (chào hỏi, dòng tiền, việc cần làm) | ✅ Hoạt động thật (số liệu thật từ JSON) | `GET /api/virtual-rm/daily-dashboard` |
| Hỏi đáp tự do qua chat (Q&A) | ✅ Hoạt động, nhưng **rule-based, không LLM** | 61 intent (xem mục 7) |
| Xem danh sách/chi tiết Account/Transaction/LC/BG/Collection/Loan | ✅ Hoạt động thật, đọc JSON thật | REST + chat đều dùng chung repository |
| **Tạo LC/Bảo lãnh/Nhờ thu** | ✅ Hoạt động thật — ghi thật vào JSON | `POST /trade-finance/lc\|guarantees\|collections`, giới hạn `MAKER`/`ADMIN` |
| **Chuyển tiền (single-transfer)** | ❌ **MOCK HOÀN TOÀN, không có backend** | `single-transfer.page.ts::submit()` chỉ `signal.set(true)` + toast — không gọi API nào, không có route `POST` nào cho payment-orders trong `routes/index.ts` |
| Phê duyệt giao dịch (Approve/Reject) | ✅ Hoạt động thật, ghi thật | `POST /transactions/:id/approve\|reject`, giới hạn `CHECKER`/`ADMIN` — đây là **phê duyệt nghiệp vụ Maker→Checker của ngân hàng**, khác khái niệm "Approval Gate" mà Agent mới cần (xem Risk List) |
| PAYMENT_CREATE / LC_REQUEST / GUARANTEE_REQUEST / APPROVAL_APPROVE / APPROVAL_REJECT (intent chat) | ⚠️ **CHỈ THÔNG BÁO/ĐIỀU HƯỚNG** | Mỗi handler trả về text tĩnh + điều hướng sang form/màn hình có sẵn — **không tự thực hiện gì**. Đây thật ra đã đúng tinh thần "human-in-the-loop" mà nhiệm vụ Gemini Agent yêu cầu — chỉ cần nâng cấp thành workflow thật |
| LC PO-upload Assistant (chat dẫn dắt tải PO → điền form LC) | ✅ Hoạt động, **trích xuất giả lập (mock, không đọc file thật)** | Xây ở phiên trước — tiền lệ gần nhất cho draft→approve, xem mục 2 |
| Voice input/output | ✅ Hoạt động thật (Gemini STT + TTS), fallback Web Speech | Dùng chung `GEMINI_API_KEY` với Agent, không có thì fallback trình duyệt |
| Dấu ấn cá nhân/doanh nghiệp (Canvas infographic) | ✅ Hoạt động thật, số liệu thật | Không liên quan Agent, không đụng tới |

---

## 5. Current Intents

`business-semantics/intents.json`: **59 intent** (đếm trực tiếp bằng script, không suy đoán) trải
trên 12 domain: `ACCOUNT`(7), `TRANSACTION`(8), `PAYMENT`(5), `APPROVAL`(4), `TASK`(2), `ALERT`(2),
`CASH_MANAGEMENT`(5), `PAYROLL`(1), `FX`(3), `TRADE_FINANCE`(16), `LENDING`(3), `PRODUCT`(1),
`CUSTOMER_SERVICE`(2, gồm GREETING/HELP). Cộng thêm **2 intent mở rộng** dựng ngoài pack
(`BUSINESS_BRIEFING`, `TRADE_FINANCE_BRIEFING` trong `semantic-engine.ts`) = **61 intent tổng**.
Riêng lớp Reasoning Engine có thêm **14 `ReasoningUseCase`** độc lập (không phải intent, là "cách
trả lời" — xem mục 3.2).

Không có intent nào tên `create_transfer`/`check_balance`/`track_transaction` như ví dụ trong yêu
cầu — intent **gần nhất** là: `CASH_POSITION`/`ACCOUNT_BALANCE` (đọc số dư — đã có, tương đương
`check_balance`), `PAYMENT_CREATE` (chỉ điều hướng, không tạo thật — tương đương phần "form" của
`create_transfer`), `TRANSACTION_DETAIL`/`TRANSACTION_LIST` theo `documentId` (tương đương
`track_transaction`).

---

## 6. Current Entities

`business-semantics/entities.json` định nghĩa entity theo domain (dùng cho scoring intent, không
phải object trích xuất per-message). Entity **thực sự trích xuất được mỗi câu hỏi**
(`SemanticQuery['entities']` trong `semantic/types.ts`) chỉ có 6 field phẳng, không có
`confidence`/`source` per-field như yêu cầu mục 7:

```ts
entities: { accountId?, accountNo?, beneficiary?, customer?, supplier?, documentId? }
```

`accountNo`/`documentId` trích bằng regex (`\d{9,}`, `\b(LC|BG|COL|LN|INV|PO)-[\w-]+\b`) —
**không phụ thuộc data có sẵn, hoạt động cho số bất kỳ**. `beneficiary`/`customer`/`supplier` thì
**phụ thuộc data có sẵn** như đã nói ở mục 3.1 — không có `amount`/`currency`/`date` như một
"entity" tách riêng (số tiền/ngày được 2 module khác — `amount-parser.ts`/`date-resolver.ts` — xử
lý thành `filters.amount`/`dateResolution`, không nằm trong object `entities`).

---

## 7. Current Mock Tools

`server/src/tools/index.ts` (433 dòng): **34 tool, tất cả là `get_*` (READ-only)**, không có tool
nào tạo/sửa/xoá dữ liệu. Mỗi tool: `(ctx: UserContext, params) => result`, đọc thẳng qua
repository, không gọi tool khác (flat, không compose). Đăng ký tự động vào
`TOOL_SECURITY_REGISTRY` (mục dưới) bằng `registerReadOnlyTool` — **không thể gọi một tool chưa
đăng ký** (fail-closed, có test riêng xác nhận: `security/virtual-rm-auth.test.ts`).

`server/src/tools/tool-security.ts` (57 dòng) — **đã có sẵn đúng taxonomy `RiskLevel` mà yêu cầu
Approval Gate cần**:
```ts
export type RiskLevel = 'READ' | 'ANALYZE' | 'PREPARE' | 'SUBMIT' | 'AUTHORIZE' | 'EXECUTE';
export interface SecureToolDefinition {
  name, riskLevel, readOnly, requiresConfirmation, requiresAuthorization, allowedRoles;
}
```
Hiện tại **cả 34 tool đều `riskLevel: 'READ'`, `requiresConfirmation: false`** — field
`requiresConfirmation`/`requiresAuthorization` đã tồn tại trong type nhưng **chưa có tool nào set
`true`** vì chưa có tool ghi dữ liệu nào cả. Đây là điểm cắm lý tưởng cho Tool Registry mới của
Agent (mục 9) — **tái dùng type có sẵn**, không cần định nghĩa lại `RiskLevel`.

Không có tool `create_transfer`/`execute_transfer`/`create_lc_draft` nào tồn tại — việc tạo LC thật
hiện đi thẳng qua REST controller (`trade-finance.controller.ts::createLc`), **không qua lớp Tool**
này (lớp Tool này chỉ phục vụ Reasoning Engine đọc dữ liệu để trả lời câu hỏi, chưa từng được dùng
để thực thi hành động).

---

## 8. Current Workflow (2 khái niệm "approval" khác nhau — dễ nhầm)

**(A) Human-in-the-loop nghiệp vụ ngân hàng (đã có, thật)**: Maker tạo lệnh (LC/BG/Collection qua
form; Transaction/Payment qua nơi khác) → trạng thái `PENDING_APPROVAL` → Checker
`POST /transactions/:id/approve|reject` (role-gated `CHECKER`/`ADMIN`). Đây là quy trình 2 người
**giữa 2 tài khoản người dùng khác nhau**, xảy ra sau khi lệnh đã được tạo.

**(B) Approval Gate mà nhiệm vụ này yêu cầu (chưa có)**: **cùng một người dùng** xác nhận
draft do AI Agent chuẩn bị, trước khi bất kỳ ghi dữ liệu nào xảy ra — `WAITING_APPROVAL` →
user bấm "Xác nhận" → backend revalidate → execute mock tool. Đây không phải Maker/Checker, đây
là "con người xác nhận AI đã hiểu đúng ý trước khi làm".

**Cả hai đều cần giữ và không được nhầm lẫn khi implement** — action Agent thực thi (vd:
`execute_transfer`) vẫn nên tạo ra bản ghi ở đúng trạng thái mà quy trình (A) mong đợi (vd:
`PENDING_APPROVAL` nếu miêu tả nghiệp vụ ngân hàng thật cần Checker duyệt tiếp), **Approval Gate
(B) không thay thế (A)**, nó là bước phụ trước khi (A) thậm chí bắt đầu.

Không có state machine nào (`UNDERSTANDING → NEEDS_CLARIFICATION → ... → COMPLETED`) tồn tại ở bất
kỳ đâu trong code hiện tại. Không có `workflowId`/`executionId`/idempotency key nào tồn tại.

---

## 9. Current Limitations (tóm tắt, không lặp lại chi tiết ở trên)

1. Semantic Engine không hiểu câu nói tự do ngoài từ khoá đã định nghĩa sẵn — không có NLU thật.
2. `extractEntities()` không trích được tên mới (phải có sẵn trong mock data).
3. Không có write-tool nào trong lớp Tool (Reasoning Engine chỉ đọc).
4. "Chuyển tiền" hoàn toàn không có backend thật — mock 100% ở client.
5. `AIProvider` hiện tại chỉ "phrase facts", không "hiểu" câu hỏi thành JSON có cấu trúc.
6. Không có workflow/state machine, không có approval gate (loại B), không có idempotency.
7. `conversation-context.ts` quá hẹp cho một agent hội thoại nhiều lượt thật sự.
8. Không có Zod, không có `@google/generative-ai`, không có `dotenv` trong dependencies.
9. Route `/api/agent/*` chưa tồn tại.
10. `RMAction.type: 'QUERY' | 'DOWNLOAD' | 'HANDOFF'` là dead code chưa từng dùng.

---

## 10. Target Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Angular Virtual RM (giữ nguyên UI/route hiện có)                 │
│  virtual-rm-chat.page.ts → RmChatSessionService                   │
│  KHÔNG thay askRmRaw() cũ — THÊM 1 method mới song song           │
└───────────────────────────────┬────────────────────────────────────┘
                                 │ POST /api/agent/message  { message, sessionId? }
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  server/src/agent/  (THƯ MỤC MỚI — không sửa server/src/ai hiện có)│
│                                                                    │
│  agent.controller.ts → agent-orchestrator.ts                      │
│         │                          │                              │
│         ▼                          ▼                              │
│  gemini-semantic-engine.ts   workflow-engine.ts (state machine)   │
│         │                          │                              │
│         ▼                          ▼                              │
│  gemini-client.ts            agent-tool-registry.ts (MỚI, tách    │
│  (@google/generative-ai)      khỏi tools/tool-security.ts READ,   │
│         │                     tái dùng cùng RiskLevel type)        │
│         │                          │                              │
│         └──────────┬───────────────┘                              │
│                     ▼                                              │
│              approval-gate.ts (WAITING_APPROVAL, idempotency)     │
│                     ▼                                              │
│              agent-mock-tools.ts (ghi thật vào JSON qua           │
│              repository có sẵn — giống trade-finance.service.ts)  │
│                     ▼                                              │
│              Agent Result → response tự nhiên (Gemini hoặc        │
│              template, có fallback về Semantic Engine cũ khi lỗi) │
└──────────────────────────────────────────────────────────────────┘
```

**Nguyên tắc tách bạch (giữ đúng yêu cầu mục 0/12/19):**
- `GeminiClient` (LLM) chỉ trả JSON có cấu trúc (intent/entities/missingFields/confidence) —
  **không bao giờ tự gọi tool, không bao giờ tự set trạng thái APPROVED**.
- `AgentOrchestrator`/`WorkflowEngine` là nơi DUY NHẤT quyết định bước tiếp theo.
- `AgentToolRegistry` là whitelist tường minh — tool không đăng ký = không gọi được (giống hệt
  cơ chế `assertToolAllowed` đã có ở `tool-security.ts`, tái dùng ý tưởng, không viết lại từ đầu).
- `ApprovalGate` là chặn cứng bắt buộc cho mọi tool `riskLevel` SUBMIT/EXECUTE.

**Vì sao đặt ở `server/src/agent/` (thư mục mới) thay vì chèn vào `server/src/ai/` như literal
trong yêu cầu ban đầu (`server/src/ai/GeminiClient.ts`, `SemanticEngine.ts`)?**
- `server/src/semantic/semantic-engine.ts` đã tồn tại — thêm `server/src/ai/SemanticEngine.ts`
  cạnh đó (khác thư mục, tên gần giống, PascalCase khác kebab-case) sẽ rất dễ nhầm khi đọc code.
- `server/src/ai/conversation-context.ts` đã tồn tại với đúng cái tên `ConversationContext` nhưng
  nghĩa hẹp hơn nhiều — không thể dùng lại tên đó cho object mới mà không sửa file cũ (rủi ro phá
  vỡ 2 luồng follow-up hiện có, xem mục 3.5).
- Toàn bộ codebase này 100% dùng kebab-case cho tên file (`ai-client.ts`, `model-router.ts`,
  `reasoning-engine.ts`...), không có ngoại lệ PascalCase nào. Đặt `GeminiClient.ts` cạnh chúng phá
  vỡ quy ước nhất quán.
- Việc tách thư mục KHÔNG làm mất khả năng tái dùng: `server/src/agent/` vẫn `import` thẳng từ
  `server/src/tools`, `server/src/repositories`, `server/src/semantic/semantic-engine.ts`
  (`buildSecurityContext`), `server/src/auth/**` — không viết lại bất kỳ thứ nào ở trên.

**Khuyến nghị (sẽ áp dụng trừ khi bạn muốn khác):** giữ tên file kebab-case
(`gemini-client.ts`, `gemini-semantic-engine.ts`, `prompt-builder.ts`, `workflow-engine.ts`,
`approval-gate.ts`, `agent-tool-registry.ts`, `agent-conversation.ts`) để nhất quán 100% với phần
còn lại của repo — nội dung/API/behavior vẫn đúng y như đặc tả (GeminiClient class,
`generateStructuredResponse()`, v.v.), chỉ khác quy ước đặt tên file.

---

## 11. Migration Plan (theo đúng 11 phase A→K trong yêu cầu)

| Phase | Việc chính | File chính bị/được thay đổi |
|---|---|---|
| A | Audit (tài liệu này) | `docs/GEMINI_AGENT_AUDIT.md` |
| B | Cài `@google/generative-ai`, `zod`; thêm `GEMINI_API_KEY`/`GEMINI_MODEL` vào `.env.example`; `server/src/agent/gemini-client.ts` (timeout/retry/error/no-log-key, theo đúng mẫu `server/src/voice/openai-voice-client.ts` đã có) | `server/package.json`, `.env.example`, `server/src/agent/gemini-client.ts` |
| C | `server/src/agent/schemas/*.ts` (Zod: intent/entity/missingFields/confidence); `prompt-builder.ts` + `prompts/semantic-system.prompt.ts`; `gemini-semantic-engine.ts` gọi Gemini → validate Zod → fallback sang Semantic Engine cũ nếu lỗi | `server/src/agent/**` (mới hoàn toàn) |
| D | `workflow-engine.ts` (state machine `UNDERSTANDING→...→COMPLETED/FAILED/CANCELLED`), `agent-conversation.ts` (context nhiều lượt, in-memory, khác `ai/conversation-context.ts`) | `server/src/agent/**` |
| E | `agent-tool-registry.ts` + tool mới: `get_balance` (bọc `getAccountBalance` có sẵn), `search_transaction` (bọc `getTransactions`), `create_transfer_draft`/`execute_transfer` (**mới, ghi thật vào `payment-orders.json`/`transactions.json` theo đúng pattern `trade-finance.service.ts::createLc`**), `create_lc_draft`/`submit_lc_mock` (bọc `tradeFinanceService.createLc` có sẵn), tương tự guarantee/collection, `search_product_information` (bọc `getProducts`/`getRecommendations`) | `server/src/agent/agent-tool-registry.ts`, `server/src/agent/agent-mock-tools.ts` |
| F | `approval-gate.ts` (WAITING_APPROVAL, revalidate, idempotency key in-memory) | `server/src/agent/approval-gate.ts` |
| G | `POST /api/agent/message`, `POST /api/agent/workflow/:id/approve` (routes mới, không đụng route cũ); frontend: **method MỚI** `RmChatSessionService.askAgent()` (không xoá `submit()` cũ), UI approval-card/typing/clarification tái dùng `RMMessage`/`RMAction` có sẵn (`CONFIRM` cho approve, giống LC-assist đã làm) | `server/src/routes/index.ts`, `server/src/agent/agent.controller.ts`, `rm-chat-session.service.ts`, `rm-message-builder.ts` |
| H | Fallback (Gemini lỗi → Semantic Engine cũ → câu hỏi làm rõ chung), input/output validation Zod, prompt-injection test, structured log (không log key/PII) | `server/src/agent/**`, `server/src/auth/audit-log.ts` (tái dùng nếu hợp) |
| I | `server/test/agent-*.test.ts` — 8 test case bắt buộc trong yêu cầu + biến thể tiếng Việt | `server/test/**`, đăng ký vào `server/test/run-all.ts` |
| J | 8 file doc tiếng Việt dưới `docs/` | `docs/GEMINI_SETUP.md`, `AI_AGENT_ARCHITECTURE.md`, `SEMANTIC_MODEL.md`, `WORKFLOW_MODEL.md`, `TOOL_REGISTRY.md`, `SECURITY.md`, `TEST_SCENARIOS.md` |
| K | Chạy `npm run dev`, test thủ công qua Playwright (đã xác nhận có sẵn trong môi trường này — xem `docs/browser-capability-report.md`) toàn bộ luồng + tính năng cũ, chụp before/after | Không sửa file, chỉ verify |

**Không đụng đến** (đúng yêu cầu "giữ nguyên"): `server/src/semantic/**`,
`server/src/ai/reasoning-engine.ts`/`model-router.ts`/`mock-reasoning-provider.ts`, mọi route REST
hiện có, mọi trang Angular ngoài chat, thiết kế visual.

---

## 12. Risk List

| # | Rủi ro | Mức độ | Giảm thiểu |
|---|---|---|---|
| 1 | Nhầm "Approval Gate" (Agent) với "Maker→Checker approval" (ngân hàng) đã có — code sai chỗ nào set trạng thái nào | Cao | Đặt tên rõ ràng khác nhau (`WAITING_APPROVAL` cho Agent workflow vs `PENDING_APPROVAL` cho PaymentOrder/LC status — 2 field khác nhau, không dùng chung enum) |
| 2 | Trùng tên `ConversationContext`/`SemanticEngine` với module cũ → dễ import nhầm | Trung bình | Đặt agent code trong `server/src/agent/`, đặt tên khác (`AgentConversationContext`, `gemini-semantic-engine.ts`) — đã quyết ở mục 10 |
| 3 | Không có `AI_API_KEY`/`GEMINI_API_KEY` thật trong môi trường này — không test được gọi Gemini thật end-to-end, chỉ test được với mock/unit test có Gemini response giả lập | Cao (giới hạn xác minh) | Viết `GeminiClient` sao cho testable bằng cách mock ở tầng HTTP/class; test case 7/8 (invalid JSON, timeout) dùng client giả; ghi rõ trong `TEST_SCENARIOS.md` phần nào đã test thật, phần nào chưa test được với key thật |
| 4 | "Chuyển tiền" chưa từng có backend → viết mới `create_transfer`/`execute_transfer` có thể lệch quy ước với `payment-orders.json`'s schema hiện có (`PaymentOrder` không có field `note`, UI hiện tại có field `note` không lưu đi đâu) | Trung bình | Bám sát đúng `PaymentOrder` interface hiện có (`server/src/models/index.ts`), không tự thêm field mới vào model trừ khi cần thiết |
| 5 | Rate limit hiện có (`virtualRmRateLimiter`) được thiết kế cho query đọc, gọi Gemini thật (chậm hơn, tốn quota free-tier) có thể cần rate-limit riêng | Thấp | Route `/api/agent/*` dùng limiter riêng hoặc tái dùng `virtualRmRateLimiter` với ngưỡng thấp hơn, quyết định ở Phase G |
| 6 | Prompt injection — Gemini phải luôn trả JSON theo schema, không được đổi system instruction | Cao (bảo mật) | System prompt cấm rõ + Zod parse fail = fallback ngay, không cố "sửa" JSON hỏng; test case riêng cho injection |
| 7 | Double-approve / double-click race condition | Trung bình | Idempotency key kiểm tra trước khi execute, in-memory Map giống `ai/conversation-context.ts`'s store pattern |
| 8 | File Gemini SDK `@google/generative-ai` — cần kiểm tra có tải được qua npm registry trong môi trường Cloud này không (đã xác nhận `registry.npmjs.org` nằm trong no_proxy allowlist của agent-proxy — xem `docs/browser-capability-report.md` — nên khả năng cao tải được, nhưng chưa thử `npm install` thật) | Thấp | Thử cài ở đầu Phase B, báo ngay nếu lỗi mạng |
| 9 | 640 test hiện có phải KHÔNG được regress — mọi file mới phải chạy `npm test --prefix server` sau mỗi phase | Cao nếu bỏ qua | Đã lên kế hoạch chạy test sau mỗi phase (mục 11, cột Phase I và ngầm định ở mọi phase khác) |

---

## Tóm tắt cho quyết định tiếp theo

Audit xác nhận: **kiến trúc hiện tại rất phù hợp để mở rộng, không cần viết lại**. Cụ thể đã có sẵn
và sẽ tái dùng: `AIProvider` factory pattern (env-gated fallback), `RiskLevel` taxonomy trong
`tool-security.ts`, `RMMessage`/`RMAction` UI contract (kể cả `CONFIRM`/`UPLOAD` đã dùng thật ở
LC-assist), `JsonFileRepository` write pattern, session/role/CSRF middleware, quy ước
`.env.example` + no-dotenv, và toàn bộ 61 intent + 34 read-tool không đổi. Phần thực sự mới 100%:
lớp hiểu-ngôn-ngữ-tự-nhiên bằng Gemini, workflow state machine, write-tool có approval gate,
conversation context nhiều lượt.

3 quyết định cần bạn xác nhận trước khi code (đã có khuyến nghị, sẽ theo khuyến nghị nếu không có
phản hồi khác): (1) đặt code Agent ở `server/src/agent/` thay vì `server/src/ai/` để tránh trùng
tên; (2) dùng kebab-case cho tên file thay vì PascalCase để nhất quán với repo; (3) tạo backend
thật cho "chuyển tiền" (ghi vào `payment-orders.json`) thay vì giữ kiểu mock-100%-client hiện tại
của `single-transfer.page.ts`.
