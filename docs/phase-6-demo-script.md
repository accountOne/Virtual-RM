# Phase 6 Demo Script — Trade Finance

~10 minutes. Every output below is copy-pasted from a real run against the actual seeded
data (`cd server && npx ts-node src/server.ts`, then `POST /api/virtual-rm/query`) during
this pass's verification — not hand-written illustrations. Re-run any of them yourself:

```bash
cd server && npx ts-node src/server.ts
# in another terminal:
curl -s -X POST http://localhost:3000/api/virtual-rm/query \
  -H "Content-Type: application/json" \
  -d '{"message":"...", "userId":"msb_ck", "role":"CHECKER"}'
```

## Flow

1. Open Business Banking → log in as Checker → open the Virtual RM chat widget.
2. Ask for the Trade Finance Briefing (also click the 📰 quick-action chip).
3. Ask the two risk-prioritization questions (also click the 📄/🏦 chips) — watch the
   ranked LC/guarantee list with real scores and reasons.
4. Send a bare LC number right after the LC risk answer — multi-turn resolves it to that
   LC's full detail, no re-explaining which LC you mean.
5. Same for a bare guarantee number after the guarantee risk answer.
6. Ask exposure, limit, overview, and "what needs attention today" (also click the 💱
   chip) — cross-domain reasoning over LC + guarantee + collection data.
7. Ask the four deterministic single-lookup questions (document checklist, discrepancy,
   guarantee claim, overdue collection).
8. Show the dedicated `GET /api/virtual-rm/trade-finance-briefing` endpoint working the
   same as the chat trigger.

## 1. Trade Finance Briefing

**"Trade Finance briefing hôm nay"**
```
Trade Finance Briefing
Chào anh/chị, ABC Manufacturing JSC 👋 Đây là Trade Finance Briefing hôm nay.
📄 LC hiệu lực: 3        🏦 Bảo lãnh hiệu lực: 3        📬 Nhờ thu đang xử lý: 3
⚠️ Cần chú ý: 3 việc     💳 Hạn mức Trade Finance: 68% đã sử dụng
→ 3 việc Trade Finance cần chú ý hôm nay — LC rủi ro cao: 1, bảo lãnh rủi ro cao: 1,
  nhờ thu quá hạn: 1.
[ Xem Trade Finance ]
```

## 2–3. Risk prioritization

**"LC nào rủi ro cao nhất?"** — `reasoningRequired: true`, use case `LC_RISK_PRIORITIZATION`
```
Ưu tiên xử lý LC
3 LC đang theo dõi, 1 ở mức rủi ro cao. LC cần xử lý trước: LC-2026-001.
→ LC-2026-001: Shipment deadline còn 2 ngày; 1 sai biệt đang mở; 2 chứng từ thiếu/chờ xử lý.

Xếp hạng đầy đủ (score, mức, lý do):
  LC-2026-001  100  HIGH    shipment ≤3 ngày + 1 sai biệt mở + 2 chứng từ thiếu
  LC-2026-002   25  MEDIUM  1 chứng từ thiếu/chờ xử lý
  LC-2026-006    0  LOW     (LC sạch — không có vấn đề gì)
[ Xem Trade Finance ]
```

**"Bảo lãnh nào cần chú ý?"** — use case `GUARANTEE_RISK_PRIORITIZATION`
```
Ưu tiên xử lý bảo lãnh
3 bảo lãnh đang theo dõi, 1 ở mức rủi ro cao. Bảo lãnh cần xử lý trước: BG-2026-013.
→ BG-2026-013: 1 yêu cầu gọi bảo lãnh đang xử lý.

  BG-2026-013  50  HIGH    1 yêu cầu gọi bảo lãnh đang xử lý (active claim)
  BG-2026-011  30  MEDIUM  cần gia hạn
  BG-2026-012   0  LOW     (bảo lãnh sạch)
[ Xem Trade Finance ]
```

## 4–5. Multi-turn: bare document number resolves to detail

**"LC-2026-001"** (sent right after the LC risk answer above) — resolves via
`resolveDocumentFollowUp` to `LC_DETAIL`, no clarification needed:
```
Chi tiết LC
LC-2026-001 — giá trị 1.800.000.000 VNĐ, hết hạn 2026-09-20.
Beneficiary: Shenzhen Precision Components Co.  Issuing bank: MSB
Documents: 4/5 nhận, 1 discrepant (Certificate of Origin), 1 missing (Insurance Certificate)
Risk flags: SHIPMENT_DEADLINE_NEAR, DOCUMENT_DISCREPANCY
[ Xem Trade Finance ]
```
*(This specific sequence — a ranked-list answer immediately followed by a bare LC
number — didn't work on the first pass; see `docs/phase-6-evaluation.md` for the bug
and the fix.)*

**"BG-2026-013"** (right after the guarantee risk answer) — resolves to `GUARANTEE_LIST`
with `documentId` set, which narrows to that one record's detail:
```
Chi tiết bảo lãnh
BG-2026-013 — giá trị 12.000.000.000 VNĐ, trạng thái CLAIMED, hết hạn 2027-01-10.
1 claim: 3.000.000.000 VNĐ, UNDER_REVIEW (2026-09-05)
Risk flags: ACTIVE_CLAIM
[ Xem Trade Finance ]
```

## 6. Cross-domain reasoning: exposure, limit, overview, attention

**"Tổng exposure Trade Finance là bao nhiêu?"** — use case `TRADE_FINANCE_EXPOSURE`
```
Exposure Trade Finance
Tổng exposure Trade Finance: 20,2 tỷ.
→ LC: 4,8 tỷ. Bảo lãnh: 13,2 tỷ. Nhờ thu: 2,2 tỷ.
[ Xem Trade Finance ]
```
*(Reported per currency — all three happen to be VND in the seeded data; a mixed-currency
book would show one line per currency with no conversion, per spec §31/§46.)*

**"Hạn mức Trade Finance còn bao nhiêu?"** — use case `TRADE_FINANCE_LIMIT_ANALYSIS`
```
Hạn mức Trade Finance
Hạn mức Trade Finance: 5 tỷ, đã dùng 3,4 tỷ (68%), còn khả dụng 1,6 tỷ.
→ Hạn mức còn dư địa sử dụng.
[ Xem Trade Finance ]
```

**"Tổng quan Trade Finance thế nào?"** — use case `TRADE_FINANCE_OVERVIEW` (5-tool plan)
```
Tổng quan Trade Finance
Đang có 3 LC, 3 bảo lãnh hiệu lực, 3 bộ nhờ thu đang xử lý. Tổng exposure: 20,2 tỷ.
→ Hạn mức Trade Finance đang sử dụng 68%.
[ Xem Trade Finance ]
```

**"Trade Finance cần chú ý gì hôm nay?"** — use case `TRADE_FINANCE_ATTENTION`
```
Trade Finance cần chú ý hôm nay
5 việc Trade Finance cần chú ý hôm nay, trong đó 3 ở mức ưu tiên cao.

  LC        LC-2026-001    100  HIGH    shipment gần + sai biệt mở + chứng từ thiếu
  Bảo lãnh  BG-2026-013     50  HIGH    yêu cầu gọi bảo lãnh đang xử lý
  Nhờ thu   COL-2026-020    50  HIGH    đã quá hạn
  Bảo lãnh  BG-2026-011     30  MEDIUM  cần gia hạn
  LC        LC-2026-002     25  MEDIUM  1 chứng từ thiếu/chờ xử lý
[ Xem Trade Finance ]
```
*(One ranked list combining all three instrument types by risk score — this is the
question a relationship manager would actually open the day with.)*

## 7. Deterministic single-lookup intents

**"Chứng từ LC còn thiếu gì không?"** — `LC_DOCUMENT_STATUS`
```
Checklist chứng từ LC
Hồ sơ LC-2026-001 chưa đầy đủ — thiếu 1, đang chờ/sai biệt 1.
Đã nhận: 4/5   Thiếu: INSURANCE_CERTIFICATE   Đang chờ/sai biệt: CERTIFICATE_OF_ORIGIN
[ Xem checklist chứng từ ]
```

**"LC này có sai biệt không?"** — `LC_DISCREPANCY`
```
Sai biệt LC
LC-2026-001 có 1 sai biệt, 1 đang mở.
→ "Certificate of Origin thiếu chữ ký của phòng thương mại" (mở, 2026-09-07)
[ Xem sai biệt ]
```

**"Có yêu cầu gọi bảo lãnh nào không?"** — `GUARANTEE_CLAIM`
```
Yêu cầu gọi bảo lãnh
1 yêu cầu gọi bảo lãnh đang xử lý trên 1 bảo lãnh.
→ BG-2026-013: 3.000.000.000 VNĐ, UNDER_REVIEW (2026-09-05)
[ Xem yêu cầu gọi bảo lãnh ]
```

**"Nhờ thu nào đã quá hạn?"** — `COLLECTION_OVERDUE`
```
Nhờ thu quá hạn
1 bộ nhờ thu đã quá hạn.
→ COL-2026-020 (D/A, inward) — Bangkok Raw Materials Co. — 640.000.000 VNĐ, hạn 2026-08-30
[ Xem Trade Finance ]
```

## 8. Dedicated briefing endpoint

**`GET /api/virtual-rm/trade-finance-briefing?userId=msb_ck&role=CHECKER`** — identical
answer shape to the chat trigger in step 1, proving the endpoint and the chat path share
the same `tradeFinanceBriefing()` code path rather than two implementations drifting
apart.

## What this demo doesn't show

Per `docs/phase-6-evaluation.md`'s explicit-scope section: no dedicated LC/Guarantee/
Collection page (every CTA above lands on `/products`, by design), no LC/BG lifecycle
transitions (statuses are static seeded snapshots), no real AI provider (the mock
provider phrases the same computed facts a real one would receive — see
`docs/phase-5-architecture.md` for that contract, unchanged in Phase 6).
