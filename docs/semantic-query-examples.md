# Semantic Query Examples

Real, captured request/response pairs from `POST /api/virtual-rm/query` — not
hand-written illustrations. Reproduce any of these with:

```bash
curl -s -X POST http://localhost:3000/api/virtual-rm/query \
  -H "Content-Type: application/json" \
  -d '{"message":"...", "userId":"msb_ck", "role":"CHECKER"}'
```

## 1. Approval queue (aggregation: COUNT + SUM + MAX)

Request:
```json
{ "message": "Tôi còn giao dịch nào cần duyệt không?", "userId": "msb_ck", "role": "CHECKER" }
```

Response (production mode, `SEMANTIC_DEBUG` unset):
```json
{
  "success": true,
  "semantic": { "intent": "APPROVAL_PENDING", "confidence": 1 },
  "answer": {
    "title": "Giao dịch chờ duyệt",
    "summary": "Anh/chị đang có 3 giao dịch cần duyệt, tổng giá trị 850.000.000 VNĐ. Lớn nhất: 350.000.000 VNĐ — Delta Logistics.",
    "metrics": [
      { "label": "Số giao dịch", "value": "3" },
      { "label": "Tổng giá trị", "value": "850.000.000 VNĐ" },
      { "label": "Lớn nhất", "value": "350.000.000 VNĐ — Delta Logistics" }
    ],
    "records": [ "...3 full Transaction records..." ],
    "action": { "label": "Xem danh sách chờ duyệt", "type": "NAVIGATE", "target": "OPEN_APPROVAL" }
  }
}
```

## 2. Debug mode (`SEMANTIC_DEBUG=true`)

Same request as above, run with `SEMANTIC_DEBUG=true npm run dev --prefix server`:

```json
{
  "success": true,
  "semantic": {
    "intent": "APPROVAL_PENDING",
    "confidence": 1,
    "matchedTerms": ["duyệt", "cần duyệt"],
    "entities": {},
    "filters": {
      "companyId": "CIF00012345",
      "userId": "msb_ck",
      "approverUserId": "msb_ck",
      "status": "PENDING_APPROVAL"
    }
  },
  "answer": { "...same as above..." }
}
```

Note `filters.companyId` — always injected server-side from the single seeded customer
record, never taken from `message`, even in debug mode.

## 3. Greeting (no data lookup)

```json
{ "message": "Xin chào" }
```
```json
{
  "success": true,
  "semantic": { "intent": "GREETING", "confidence": 1 },
  "answer": {
    "title": "Virtual RM",
    "summary": "Chào anh/chị, ABC Manufacturing JSC 👋 Tôi có thể giúp gì cho anh/chị hôm nay?",
    "metrics": [], "records": [],
    "action": { "label": "Về Dashboard", "type": "NAVIGATE", "target": "OPEN_DASHBOARD" }
  }
}
```

## 4. Business Briefing (cross-domain — 6 datasets in one answer)

```
GET /api/virtual-rm/briefing?userId=msb_ck&role=CHECKER
```
```json
{
  "success": true,
  "semantic": { "intent": "BUSINESS_BRIEFING", "confidence": 1 },
  "answer": {
    "title": "Business Briefing",
    "summary": "Chào anh/chị, ABC Manufacturing JSC 👋 Đây là Business Briefing hôm nay.",
    "metrics": [
      { "label": "💰 Thanh khoản", "value": "12,5 tỷ" },
      { "label": "📥 Tiền vào hôm nay", "value": "0 đ" },
      { "label": "📤 Tiền ra hôm nay", "value": "850 triệu" },
      { "label": "📝 Chờ duyệt", "value": "3 giao dịch — 850 triệu" },
      { "label": "⚠️ Cảnh báo", "value": "5 cảnh báo" },
      { "label": "📄 Trade Finance", "value": "1 LC sắp hết hạn" }
    ],
    "records": [],
    "action": { "label": "Về Dashboard", "type": "NAVIGATE", "target": "OPEN_DASHBOARD" }
  }
}
```

## 5. Amount filter (entity extraction: operator + magnitude + currency)

```json
{ "message": "Có giao dịch nào trên 100 triệu không?" }
```
→ `semantic.intent = "TRANSACTION_BY_AMOUNT"`, `filters.amount = { operator: "GT", value: 100000000, currency: "VND" }`
(debug mode), and `answer.records` contains only transactions with `amount > 100_000_000`.

## 6. Cross-domain: FX exposure (BUY vs SELL combined)

```json
{ "message": "Công ty mua bán ngoại tệ nhiều hơn bên nào?" }
```
```json
{
  "semantic": { "intent": "FX_EXPOSURE", "confidence": 1 },
  "answer": {
    "title": "Trạng thái ngoại tệ",
    "summary": "Thời gian gần đây: doanh nghiệp mua ngoại tệ nhiều hơn — mua 1.150.000.000 VNĐ, bán 280.000.000 VNĐ.",
    "metrics": [
      { "label": "Mua vào", "value": "1.150.000.000 VNĐ" },
      { "label": "Bán ra", "value": "280.000.000 VNĐ" }
    ]
  }
}
```

## 7. Clarification (never hallucinates)

```json
{ "message": "asdkjaslkdj xyz random gibberish 12345" }
```
```json
{
  "success": true,
  "semantic": { "intent": "CLARIFICATION_NEEDED", "confidence": 0 },
  "answer": {
    "title": "Cần làm rõ thêm",
    "summary": "Tôi chưa hiểu rõ câu hỏi này. Anh/chị có thể thử một trong các câu hỏi gợi ý bên dưới không?",
    "metrics": [], "records": [],
    "suggestedQuestions": ["Số dư tài khoản hiện tại là bao nhiêu?", "Tài khoản nào còn nhiều tiền nhất?", "..."]
  }
}
```

## 8. Navigation-only intent (no data, pure action)

```json
{ "message": "Tôi muốn phê duyệt giao dịch này" }
```
→ `semantic.intent = "APPROVAL_APPROVE"` (*may currently route to `APPROVAL_PENDING`
depending on exact phrasing — see [`semantic-engine.md`](./semantic-engine.md#known-limitations)*),
`answer.action.target = "OPEN_APPROVAL"`, which the frontend resolves to
`/payments/approval`.
