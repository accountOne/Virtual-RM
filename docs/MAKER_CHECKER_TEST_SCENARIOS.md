# Kịch bản kiểm thử — Maker/Checker BankingCommand

Toàn bộ nội dung dưới đây mô tả **test đã viết và đã chạy thật** (743/743 test toàn dự án pass,
tăng từ 702 trước khi bắt đầu nâng cấp này), không phải kế hoạch. 3 file test chính:

- `server/test/commands-domain.test.ts` — tầng thuần logic (Zod schema, business rule, không HTTP).
- `server/test/commands-http.test.ts` — tầng HTTP thật qua `TestClient`/`getMakerClient()`/
  `getCheckerClient()`/`getAdminClient()`.
- `server/test/agent-semantic.test.ts` (bổ sung) — Agent hand-off sang BankingCommand.

Chạy: `npm test --prefix server`.

## 1. 9 kịch bản bắt buộc — đối chiếu trực tiếp

| # | Kịch bản | Nơi kiểm thử | Kết quả |
|---|---|---|---|
| 1 | Maker tạo chuyển tiền → backend lưu DRAFT → validate OK → submit → PENDING_CHECKER | `commands-http.test.ts` Scenario 1 (qua HTTP thật: create/validate/submit) | ✅ Pass |
| 2 | Checker mở queue → thấy đúng reference/amount/beneficiary/bank/warnings giống Maker | `commands-http.test.ts` Scenario 2 | ✅ Pass |
| 3 | Thiếu field bắt buộc → cảnh báo BLOCKING → không cho submit | `commands-http.test.ts` Scenario 3 (submit → `422`) | ✅ Pass |
| 4 | Warning nhất quán: Maker thấy warning X lúc validate → Checker mở command → thấy đúng warning X (cùng code/severity) | `commands-http.test.ts` Scenario 4 | ✅ Pass |
| 5 | Checker reject → bắt buộc có reason → status REJECTED → Maker xem được reason | `commands-http.test.ts` Scenario 5 (thiếu reason → `400`; có reason → `REJECTED` + `rejectReason` đúng) | ✅ Pass |
| 6 | Checker approve → backend revalidate → status APPROVED → tạo 1 execution record thật | `commands-http.test.ts` Scenario 6 (kiểm tra `Transaction` thật tồn tại, số dư tài khoản giảm đúng) | ✅ Pass |
| 7 | Double approve (click 2 lần) → chỉ 1 execution, lần 2 bị từ chối | `commands-http.test.ts` Scenario 7 (2 test: cùng key lần 2 fail + không tạo giao dịch trùng; sai key → `409`) | ✅ Pass |
| 8 | Maker không tự approve lệnh của chính mình → `403 FORBIDDEN` | `commands-http.test.ts` Scenario 8 (dùng ADMIN vì demo chỉ có 1 Maker — ADMIN tự tạo rồi tự duyệt vẫn bị chặn, áp dụng cho cả approve lẫn reject) | ✅ Pass |
| 9 | Checker gửi API sửa formData → `403`/`405` | `commands-http.test.ts` Scenario 9 (`PUT /api/commands/:id` với session Checker → `403` do role gate) | ✅ Pass |

## 2. Quyền sở hữu (ngoài 9 kịch bản chuẩn, phát hiện thêm cần thiết)

| Kịch bản | Kết quả |
|---|---|
| Maker A không xem được draft của Maker/Admin khác — `404`, không lộ thông tin tồn tại dưới dạng `403` | ✅ Pass |
| Checker không được tạo lệnh (`POST /api/commands` với role Checker) | ✅ Pass (`403`) |
| Người dùng chưa đăng nhập gọi bất kỳ route commands nào | ✅ Pass (`401`) |

## 3. LC / Bảo lãnh / Nhờ thu (Slice 6 — vá lỗ hổng #2)

| Kịch bản | Kết quả |
|---|---|
| LC: approve tạo `LetterOfCredit` thật qua `tradeFinanceService.createLc` có sẵn | ✅ Pass — `lcNumber` thật trong `executionResult`, bản ghi thật xuất hiện trong `letter-of-credits.json` |
| LC: reject không tạo LC nào | ✅ Pass |
| Bảo lãnh: approve tạo `BankGuarantee` thật | ✅ Pass — `bgNumber` thật |
| Nhờ thu: approve tạo `Collection` thật | ✅ Pass — `collectionNumber` thật |
| Checker vẫn không tạo được lệnh LC (role gate không đổi khi mở rộng sang loại mới) | ✅ Pass |
| Business rule LC: `expiryDate` trước `latestShipmentDate` → cảnh báo BLOCKING | ✅ Pass (unit test) |
| Business rule LC: không có chứng từ yêu cầu → cảnh báo WARNING không chặn | ✅ Pass |
| Business rule Bảo lãnh: giá trị vượt hạn mức Trade Finance khả dụng (`credit-limits.json`) → cảnh báo WARNING | ✅ Pass |
| Business rule Nhờ thu: ngày đến hạn đã qua → cảnh báo WARNING | ✅ Pass |

## 4. Virtual RM Agent hand-off (Slice 5 + 6)

| Kịch bản | Kết quả |
|---|---|
| `create_transfer` với đủ entity (amount+beneficiaryName) → tạo thật 1 `BankingCommand` DRAFT `TRANSFER`, `semanticData` lưu đúng | ✅ Pass (unit test qua `dispatchIntent()` với `Understanding` giả lập — xem §5 về lý do cần giả lập) |
| Workflow của Agent đạt `COMPLETED` (không còn `WAITING_APPROVAL` cho write-intent nào nữa) | ✅ Pass |
| `create_lc`/`create_guarantee`/`create_collection` cũng hand-off đúng loại `commandType` tương ứng | ✅ Pass (3 test riêng) |

## 5. Giới hạn cần biết khi đọc kết quả test

Môi trường test **không có `GEMINI_API_KEY`** — mọi test hand-off của Agent gọi thẳng
`dispatchIntent()` với một `Understanding` dựng sẵn (giả lập kết quả Gemini đã hiểu xong), **không**
đi qua `understand()`/fallback rule engine thật. Đây là giới hạn đã biết từ trước (xem
`docs/SEMANTIC_MODEL.md` §6): bộ dự phòng không trích xuất được tên thụ hưởng tự do, nên không thể
tự nhiên đạt đủ entity để hand-off qua chat text thật trong môi trường không có key. Cách kiểm
chứng đầy đủ: cấu hình `GEMINI_API_KEY` thật rồi thử trực tiếp qua giao diện chat (`🤖 Agent`).

Warning-panel dùng chung giữa Maker và Checker được kiểm chứng ở **2 tầng**: HTTP test (Scenario 4,
so sánh response JSON) và Playwright trực tiếp (ảnh chụp — xem log phiên làm việc, không lưu vào
repo) xác nhận component `<app-warning-panel>` render đúng màu/icon theo severity trên cả 2 màn
hình.

## 6. Kiểm thử trực tiếp bằng Playwright (không chỉ tin vào test tự động)

Theo đúng kỷ luật đã áp dụng xuyên suốt dự án — mỗi slice đều chạy sống ít nhất 1 lần bằng trình
duyệt thật trước khi coi là hoàn tất:

- **Slice 3**: Maker điền form chuyển tiền đầy đủ → xem trước có mã tham chiếu `TRF-...` → cảnh báo
  không chặn (vượt hạn mức tham khảo) vẫn cho gửi → gửi thành công.
- **Slice 4**: Checker thấy đúng lệnh Maker vừa gửi trong hàng chờ mới → mở chi tiết → phê duyệt
  qua dialog xác nhận thật → timeline hiển thị đủ `Tạo bản nháp → Gửi duyệt → Checker đã xem → Đã
  phê duyệt → Đã thực hiện`.
- **Slice 6**: Maker tạo yêu cầu Bảo lãnh qua wizard 4 bước → gửi → Checker thấy trong **cùng 1
  hàng chờ hợp nhất** (không phải màn hình riêng cho từng loại) → mở chi tiết (hiển thị đúng field
  riêng của Bảo lãnh) → phê duyệt → tạo `BankGuarantee` thật.
- Hồi quy: Dashboard, danh sách LC, trang phê duyệt giao dịch cũ (Transaction — vẫn giữ nguyên cho
  dữ liệu lịch sử), 39/39 test tương tác Virtual RM (`npm run test:interaction`) — không có gì bị
  vỡ sau 6 slice thay đổi.

## 7. Cách chạy lại

```bash
cd server && npm test              # 743 test, gồm cả commands-domain/commands-http/agent-semantic
npm run build --prefix ..          # hoặc `ng build --configuration production` ở thư mục gốc
npm run test:interaction --prefix ..
```
