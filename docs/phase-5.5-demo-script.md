# Phase 5.5 — Demo Script

All six scenarios below were run live against `POST /api/virtual-rm/query` on real seeded data
(`msb_ck` / CHECKER) and the output captured verbatim, not hand-written — same practice as
`docs/phase-6-demo-script.md`.

## Demo 1 — Simple: "Số dư tài khoản chính là bao nhiêu?"

Shows: Semantic → Tool → Answer, no reasoning at all (no `reasoningMeta` in the response).

```
semantic: {"intent":"ACCOUNT_BALANCE","confidence":1}
summary: Số dư tài khoản Tài khoản thanh toán VNĐ hiện tại là 12.500.000.000 VNĐ.
action: {"label":"Xem tài khoản","type":"NAVIGATE","target":"OPEN_ACCOUNT"}
```

## Demo 2 — Reasoning (AGGREGATION/MODERATE): "Dòng tiền tháng này thế nào?"

Shows: multiple tools + calculation + insight.

```
semantic: {"intent":"CASHFLOW_ANALYSIS","reasoningRequired":true,
           "reasoningMeta":{"type":"AGGREGATION","complexity":"MODERATE","verificationStatus":"VERIFIED"}}
summary: Tiền vào 1,4 tỷ, tiền ra 3,4 tỷ, net cashflow -2 tỷ.
insights: ["Dòng tiền đang âm."]
```

## Demo 3 — Diagnostic (new, COMPLEX): "Tại sao dòng tiền tháng này giảm?"

Shows: current period vs. previous period, variance, named drivers, evidence-backed.

```
semantic: {"intent":"CASHFLOW_DIAGNOSTIC","reasoningRequired":true,
           "reasoningMeta":{"type":"DIAGNOSTIC","complexity":"COMPLEX","verificationStatus":"VERIFIED"}}
summary: Dòng tiền kỳ này tăng 1,7 tỷ (46%) so với kỳ trước.
metrics: Net cashflow kỳ này: -2 tỷ · kỳ trước: -3,8 tỷ · Chênh lệch: +1,7 tỷ (46%)
insights: ["Nguyên nhân chính theo dữ liệu hiện có là: Thu từ \"Customer Collection\" tăng 90 triệu so với kỳ trước."]
```

Note this run's actual seeded data shows an *increase*, not a decrease — the engine correctly
titles/phrases it as "tăng" (increase) rather than forcing the demo's own question ("giảm") onto
a false conclusion. This is itself a no-hallucination demonstration: the answer follows the real
numbers, not the way the question was phrased.

## Demo 4 — Trade Finance risk ranking: "LC nào có rủi ro cao nhất?"

Shows: LC + deadline + documents + discrepancy + risk scoring, then navigation.

```
semantic: {"intent":"LC_RISK_PRIORITIZATION","reasoningRequired":true,
           "reasoningMeta":{"type":"COMPARISON","complexity":"COMPLEX","verificationStatus":"VERIFIED"}}
summary: 4 LC đang theo dõi, 1 ở mức rủi ro cao. LC cần xử lý trước: LC-2026-001.
records[0]: {"lcNumber":"LC-2026-001","score":100,"level":"HIGH",
             "reasons":["Shipment deadline còn 2 ngày","1 sai biệt đang mở","2 chứng từ thiếu/chờ xử lý"]}
actions: [Xem LC-2026-001 → /trade-finance/lc/LC-2026-001, Xem LC-2026-007, Xem LC-2026-002, Xem tất cả LC]
```

Clicking "Xem LC-2026-001" navigates to the dedicated `/trade-finance/lc/LC-2026-001` screen
(Phase 7), not a chat-only answer.

## Demo 5 — CFO Copilot (new, cross-domain ADVISORY): "Tôi nên xử lý việc gì quan trọng nhất hôm nay?"

Shows: top 3 priorities ranked across Tasks/Approvals/Payables/LC/Guarantee/Collection.

```
semantic: {"intent":"DAILY_PRIORITY","reasoningRequired":true,
           "reasoningMeta":{"type":"ADVISORY","complexity":"COMPLEX","verificationStatus":"VERIFIED"}}
summary: Có 22 việc đang cần chú ý trên toàn bộ nghiệp vụ. 3 việc quan trọng nhất: Nhờ thu COL-2026-020; Duyệt giao dịch; Thanh toán MSB - Phòng Tín dụng.
records: [
  { rank: 1, entityType: "Collection", entityId: "COL-2026-020", priorityScore: 63, priority: "HIGH",
    reasons: ["Đã quá hạn thanh toán"] },
  { rank: 2, entityType: "Task", entityId: "task-001", priorityScore: 56, priority: "MEDIUM",
    reasons: ["Đến hạn 2026-09-09", "Việc cần làm đang mở"] },
  { rank: 3, entityType: "Payable", entityId: "pay-004", priorityScore: 56, priority: "MEDIUM",
    reasons: ["Còn 5 ngày đến hạn", "Giá trị 2.000.000.000 VND"] },
]
actions: [Xem Nhờ thu COL-2026-020 → /trade-finance/collections/COL-2026-020,
          Xem Duyệt giao dịch → /payments/approval, Xem Thanh toán MSB - Phòng Tín dụng → /payments]
```

## Demo 6 — Liquidity: "Tuần sau công ty có đủ tiền để trả các khoản phải trả không?"

Shows: projected cash, liquidity gap, risk-implied recommendation.

```
semantic: {"intent":"LIQUIDITY_ANALYSIS","reasoningRequired":true,
           "reasoningMeta":{"type":"ADVISORY","complexity":"MODERATE","verificationStatus":"VERIFIED"}}
summary: Số dư khả dụng: 12,5 tỷ. Nghĩa vụ sắp tới: phải trả 745 triệu, trả nợ vay 2 tỷ. Dự kiến còn 9,8 tỷ.
insights: ["Hiện tại đủ khả năng đáp ứng nghĩa vụ."]
```

## Running it yourself

```bash
cd server && npx ts-node src/server.ts &
curl -s -X POST http://localhost:3000/api/virtual-rm/query \
  -H "Content-Type: application/json" \
  -d '{"message":"Tại sao dòng tiền tháng này giảm?","userId":"msb_ck","role":"CHECKER"}'
```

Add `SEMANTIC_DEBUG=true` to also see `plan`/`toolsUsed`/`calculationsUsed`/`evidenceSummary` in
`semantic.reasoning` (never exposed by default).
