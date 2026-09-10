# Phase 5 Demo Script

~5–10 minutes. Every output below is copy-pasted from a real run against the actual
seeded data (`npx ts-node server/src/server.ts`, then `POST /api/virtual-rm/query`) during
this pass's verification — not hand-written illustrations. Re-run any of them yourself:

```bash
cd server && npx ts-node src/server.ts
# in another terminal:
curl -s -X POST http://localhost:3000/api/virtual-rm/query \
  -H "Content-Type: application/json" \
  -d '{"message":"...", "userId":"demo_u", "role":"CHECKER"}'
```

## Flow

1. Open Business Banking → log in → open the Virtual RM chat widget.
2. Ask the 5 basic questions (still the plain, deterministic Semantic Engine — Phase 5
   doesn't touch these).
3. Ask the reasoning questions — watch the "● Đang phân tích..." indicator, then a
   summary + metrics + an insight line (and sometimes a recommendation).
4. Ask the multi-turn follow-up sequence to show conversation context.
5. Ask for the business briefing to show the added RM Insight line.

## 1–5. Basic (unchanged, deterministic)

**"Số dư tài khoản?"**
```
Số dư tài khoản Tài khoản thanh toán VNĐ hiện tại là 12.500.000.000 VNĐ.
```

**"Tài khoản nào nhiều tiền nhất?"**
```
Tài khoản Tài khoản thanh toán VNĐ đang có số dư lớn nhất — 12.500.000.000 VNĐ.
```

**"Hôm nay công ty chi bao nhiêu?"**
```
Tiền ra ngày 2026-09-09: 850.000.000 VNĐ từ 3 giao dịch.
```

**"Giao dịch nào lớn nhất?"**
```
Giao dịch lớn nhất trong thời gian gần đây: 1.250.000.000 VNĐ — Nội bộ - Chi lương.
```

**"Tôi còn giao dịch nào cần duyệt?"**
```
Anh/chị đang có 3 giao dịch cần duyệt, tổng giá trị 850.000.000 VNĐ.
Lớn nhất: 350.000.000 VNĐ — Delta Logistics.
```

## 6–14. Reasoning (Phase 5)

**"Dòng tiền tháng này thế nào?"** — `reasoningRequired: true`, use case `CASHFLOW_ANALYSIS`
```
📊 Dòng tiền tháng này
Tiền vào 1,4 tỷ, tiền ra 3,4 tỷ, net cashflow -2 tỷ.
→ Dòng tiền đang âm.
```
*(Honest note: this month-to-date is genuinely negative in the seeded data — the engine
reports what's actually there, it doesn't round up to a nicer-looking demo number.)*

**"Có đủ tiền trả các khoản sắp tới không?"** — use case `LIQUIDITY_ANALYSIS`
```
💰 Khả năng thanh khoản
Số dư khả dụng: 12,5 tỷ. Nghĩa vụ sắp tới: phải trả 745 triệu, trả nợ vay 2 tỷ.
Dự kiến còn 9,8 tỷ.
→ Hiện tại đủ khả năng đáp ứng nghĩa vụ.
```

**"Tôi có khoản tiền nhàn rỗi nào không?"** — use case `IDLE_CASH_ANALYSIS`
```
💡 Phân tích tiền nhàn rỗi
Ước tính 9,8 tỷ có thể chưa cần sử dụng trong 30 ngày tới.
Anh/chị có thể xem xét: tiền gửi kỳ hạn, chứng chỉ tiền gửi, giải pháp quản lý dòng tiền.
[ Xem sản phẩm ]
```

**"Tuần này tôi nên ưu tiên thanh toán khoản nào?"** — use case `PAYMENT_PRIORITIZATION`
```
✍️ Ưu tiên thanh toán
1. 350 triệu — Delta Logistics
   Đến hạn: hôm nay
   ⚠️ Ưu tiên cao
2. 250 triệu — ABC Construction Materials
   Đến hạn: 4 ngày nữa
   🔵 Ưu tiên thấp
3. 2 tỷ — MSB - Phòng Tín dụng
   Đến hạn: 5 ngày nữa
   🔵 Ưu tiên thấp
```

**"Hôm nay tôi nên duyệt giao dịch nào trước?"** — use case `APPROVAL_PRIORITIZATION`
```
✍️ Ưu tiên phê duyệt
1. 350 triệu — Delta Logistics 🔵 Ưu tiên thấp
2. 300 triệu — FPT Software 🔵 Ưu tiên thấp
3. 200 triệu — Chi nhánh Đà Nẵng 🔵 Ưu tiên thấp
```
*(All three rank LOW today — none is due-today or ≥5 tỷ in the current seeded queue.
Ranking is still real and would reorder the moment a larger or more urgent approval is
added via the admin demo-data editor.)*

**"Hôm nay tôi nên xử lý việc gì trước?"** — deterministic `TASK_DUE` (not a new
reasoning use case — see `docs/phase-5-evaluation.md` #Known-limitations)
```
1 việc sắp đến hạn hoặc đã quá hạn. Gần nhất: "Duyệt giao dịch" — hạn 2026-09-09.
```

**"Tình hình tài chính công ty thế nào?"** — deterministic `CASH_POSITION`
```
Tổng thanh khoản hiện tại: 12.500.000.000 VNĐ trên 2 tài khoản.
```

**"Có khoản thu nào đủ để trả khoản vay sắp đến hạn?"** — use case `LIQUIDITY_ANALYSIS`
(same underlying calculation as scenario 7 — a receivables-vs-obligations question is
answered by the same liquidity-gap math)
```
Số dư khả dụng: 12,5 tỷ. Nghĩa vụ sắp tới: phải trả 745 triệu, trả nợ vay 2 tỷ.
Dự kiến còn 9,8 tỷ. → Hiện tại đủ khả năng đáp ứng nghĩa vụ.
```

**"LC nào cần chú ý?"** — genuinely ambiguous, correctly asks to clarify rather than
guess (spec §21's no-hallucination policy in action):
```
Anh/chị muốn hỏi về "Tài trợ thương mại"? Anh/chị có thể hỏi cụ thể hơn được không?
```
Use **"LC nào sắp hết hạn?"** instead for a clean deterministic `LC_EXPIRY` answer during
the actual demo.

**"Có sản phẩm nào phù hợp với dòng tiền hiện tại?"** — use case
`PRODUCT_RECOMMENDATION_REASONING`
```
💡 Gợi ý sản phẩm
Dựa trên dòng tiền hiện tại, doanh nghiệp có khoảng 9,8 tỷ có khả năng nhàn rỗi
trong 30 ngày.
Sản phẩm phù hợp: Term Deposit, Cash Management
[ Xem sản phẩm ]
```

## Multi-turn context (spec §17)

Three turns, same `userId`, showing context carried across turns:

**"Tài khoản nào nhiều tiền nhất?"**
```
Tài khoản Tài khoản thanh toán VNĐ đang có số dư lớn nhất — 12.500.000.000 VNĐ.
```

**"Còn tài khoản USD?"**
```
Tài khoản Tài khoản ngoại tệ USD đang có số dư lớn nhất (USD) — 185.000 USD.
```
*(The engine replayed `ACCOUNT_HIGHEST_BALANCE` with a USD filter — it didn't need to
re-parse "tài khoản nào nhiều tiền nhất" from a 3-word follow-up.)*

**"Có nên chuyển bớt sang tiền gửi không?"**
```
💡 Gợi ý sản phẩm
Dựa trên dòng tiền hiện tại, doanh nghiệp có khoảng 9,8 tỷ có khả năng nhàn rỗi
trong 30 ngày.
Sản phẩm phù hợp: Term Deposit, Cash Management
```

## 15. Business briefing

**"Cho tôi business briefing hôm nay."**
```
☀️ Business Briefing
💰 Thanh khoản: 12,5 tỷ
📥 Tiền vào hôm nay: 0 đ
📤 Tiền ra hôm nay: 850 triệu
📝 Chờ duyệt: 3 giao dịch — 850 triệu
⚠️ Cần chú ý: 5 cảnh báo
📄 Trade Finance: 1 LC sắp hết hạn

💡 RM Insight
Tuần tới nghĩa vụ thanh toán khoảng 2,7 tỷ, thanh khoản hiện tại đủ đáp ứng.
```
