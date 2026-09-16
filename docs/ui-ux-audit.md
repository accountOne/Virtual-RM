# UI/UX Audit — Virtual RM Demo Platform

Ngày: 16/09/2026. Phương pháp: đọc code thật (`git log`, component/route/model source), không suy
đoán — mọi dòng dưới đây có căn cứ file:line thu thập qua khảo sát trực tiếp repo ở trạng thái
hiện tại (HEAD `10c6734`, sau khi Maker/Checker BankingCommand đã hoàn tất 7 slice).

> **Bối cảnh quan trọng**: đây không phải một app chưa có design system. `docs/msb-design-system.md`
> + `tailwind.config.js` + `src/styles.scss` đã hình thành một ngôn ngữ thị giác nhất quán từ trước
> (brand-500 `#ef4b2a`, thang `ink-*`, `.card`/`.btn-*`/`.badge`, header+sidebar+Virtual RM shell).
> Virtual RM cũng đã qua 2 lần redesign trước đó (`phase-5.6-full-screen-redesign.md`,
> `phase-5.6-conversational-ux.md`). Audit này vì vậy tập trung vào **khoảng cách thật** so với đặc
> tả 11-phase mới, không viết lại từ đầu những gì đã ổn.

## Cách đọc bảng

- **Priority**: P0 = chặn nghiệp vụ hoặc sai lệch rõ với đặc tả bắt buộc; P1 = ảnh hưởng chất lượng/
  nhất quán rõ rệt nhưng không chặn; P2 = tinh chỉnh, có thể làm sau.
- **F/P**: `Functional` = đổi sẽ ảnh hưởng hành vi/dữ liệu; `Presentational` = chỉ đổi hiển thị, an
  toàn để sửa mà không đụng logic nghiệp vụ.

## 1. Visual hierarchy & navigation

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 1 | Sidebar không có mục **"Lệnh giao dịch"** — Maker không có màn hình xem lại các BankingCommand chính mình đã tạo (chỉ có Checker queue). `CommandsService.list()` (`src/app/core/services/commands.service.ts:93`) gọi `GET /api/commands` đã có sẵn ở backend nhưng **không có page nào gọi nó**. | Maker gửi lệnh xong không có nơi tra cứu trạng thái/lịch sử của chính mình — phải hỏi Virtual RM hoặc chờ Checker xử lý mới biết kết quả. | Thêm page `features/payments/pages/my-commands/` list các lệnh của Maker (mọi status), nối vào sidebar dưới nhóm "Chuyển khoản & thanh toán". | **P0** | `src/app/features/payments/pages/`, `sidebar.component.ts` | Functional (route + UI mới, không đổi backend) |
| 2 | Không có mục **"Thông báo"** — thông báo chỉ tồn tại dưới dạng dropdown chuông trong header (`header.component.ts:96-133`), không có trang riêng, không có lịch sử. | Người dùng không xem lại được thông báo cũ sau khi dropdown đóng. | Thêm page `/notifications` đọc lại từ nguồn `rmData.alerts()` đã có, chỉ là UI mới. | P1 | `header.component.ts`, route mới | Presentational |
| 3 | Không có mục **"Lịch sử hoạt động"** toàn cục — chỉ có audit trail theo từng command (`command-detail.page.ts`, Checker-only, xem từng lệnh một). | Không ai (kể cả Admin) xem được nhật ký hoạt động xuyên suốt hệ thống ở một chỗ. | Thêm page tổng hợp đọc `AuditEvent` theo `userId`/toàn hệ thống (Admin), tái dùng `AUDIT_EVENT_LABEL` đã có. | P1 | route mới, `commands.controller.ts` (cần route mới `GET /api/audit-events`) | Functional (route backend mới) |
| 4 | Không có mục **"Cài đặt"** ở đâu trong `app.routes.ts`. | Không có nơi đổi các tuỳ chọn cá nhân (vd tắt/bật giọng đọc hiện đang chỉ lưu `localStorage` per-component). | Thêm page `/settings` tối thiểu (thông tin tài khoản đọc-only + toggle giọng đọc chuyển vào đây thay vì chỉ nằm trong header chat). | P2 | route mới | Presentational |
| 5 | Nhãn sidebar dùng "Virtual RM" (tiếng Anh), đặc tả yêu cầu "Trợ lý RM ảo". Nhãn "Phê duyệt" thay vì "Chờ duyệt". | Không sai nghiệp vụ, nhưng lệch thuật ngữ Việt hoá nhất quán mà đặc tả IA yêu cầu rõ. | Đổi nhãn hiển thị (label only, route giữ nguyên) trong `sidebar.component.ts`. | P1 | `sidebar.component.ts` | Presentational |
| 6 | Trade Finance hiện là 1 nhóm với 4 dòng con (Tổng quan/LC/Bảo lãnh/Nhờ thu) thay vì 1 mục "Tài trợ thương mại" duy nhất như đặc tả liệt kê. | Khác cấu trúc mong muốn nhưng nhóm con hiện tại thực ra rõ ràng hơn (không cần gộp lại). | Giữ nguyên — nhóm con là hợp lý hơn 1 mục gộp; chỉ đổi tên nhóm cha thành "Tài trợ thương mại". | P2 | `sidebar.component.ts` | Presentational |
| 7 | Không có "Lệnh giao dịch" làm điểm hội tụ chung cho tất cả 4 loại — hiện Maker phải nhớ vào đúng trang loại nào (Payments vs Trade Finance) để xem lệnh của mình. | Điều hướng phân mảnh theo loại thay vì theo trạng thái công việc. | Page mới ở mục #1 giải quyết luôn — hiển thị cả 4 `commandType` trong 1 bảng, lọc theo loại. | P0 | (gộp với #1) | Functional |

## 2. Dashboard (Tổng quan)

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 8 | `virtual-rm-dashboard.page.ts` (route `/virtual-rm`) và `/dashboard` là 2 trang riêng biệt cùng có tính chất "tổng quan" — dễ gây nhầm lẫn "trang nào mới là Tổng quan thật". | Người dùng mới có thể bối rối giữa 2 route gần giống nhau. | Không gộp (2 trang phục vụ mục đích khác nhau: `/dashboard` = điều hướng nghiệp vụ, `/virtual-rm` = briefing AI) — chỉ cần làm rõ label + thêm liên kết chéo. | P2 | `dashboard.page.ts`, `virtual-rm-dashboard.page.ts` | Presentational |
| 9 | Dashboard tổng quan hiện tại không có thẻ tổng hợp riêng cho "Lệnh giao dịch đang chờ" theo 4 loại BankingCommand (chỉ có `pendingApprovals` tính theo model cũ theo audit trước). | Maker không thấy nhanh có bao nhiêu lệnh mình đang treo ở trạng thái nào ngay từ dashboard. | Thêm 1 card nhỏ đọc từ `GET /api/commands?makerUserId=me` (đã có), nhóm theo status. | P1 | `daily-dashboard.service.ts`, dashboard page | Functional |

## 3. Virtual RM — popup/panel behaviour

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 10 | Đặc tả Phase 5 yêu cầu **popup/side panel** trên desktop (phải/nổi) + **full-screen bottom sheet** trên mobile. Thực tế hiện tại: `virtual-rm-chat.page.ts` là **full-screen trên MỌI kích thước màn hình** (`position: fixed; inset:0`), không có chế độ side-panel nào cho desktop — panel cũ (`rm-widget.component.ts`, side rail 320px) đã bị xoá hẳn ở lần redesign trước. | Trên desktop, mở Virtual RM hiện che toàn bộ màn hình thay vì giữ ngữ cảnh trang đang làm việc bên cạnh (yêu cầu rõ trong đặc tả: giữ context dashboard/form khi mở RM). | Đây là thay đổi kiến trúc thật, không phải sửa nhỏ — cần quyết định: khôi phục side-panel cho desktop (≥lg) trong khi giữ full-screen cho mobile, hay giữ full-screen như hiện tại (đã là quyết định có chủ đích ở lần redesign trước, có tài liệu, có lý do UX ghi lại). | **P0** (nếu theo đúng đặc tả mới) | `virtual-rm-chat.page.ts`, `rm-chat-launcher.component.ts` | Functional — cần chốt hướng với người dùng trước khi code (xem mục kiến nghị cuối tài liệu) |
| 11 | Launcher nổi (`rm-chat-launcher.component.ts`) không có breakpoint riêng, không có badge "tin nhắn chưa đọc" — đặc tả Phase 5 yêu cầu rõ "unread badge". | Người dùng không biết RM có tin nhắn/cập nhật mới đang chờ. | Thêm `unreadCount` signal, hiển thị badge nhỏ góc launcher. | P1 | `rm-chat-launcher.component.ts` | Functional (cần state theo dõi đã đọc) |
| 12 | Header chat hiện có tagline nhưng không có đúng cụm trạng thái "Đang sẵn sàng hỗ trợ" như đặc tả liệt kê tường minh. | Thiếu tín hiệu trạng thái tường minh mà đặc tả yêu cầu đúng chữ. | Thêm dòng trạng thái cố định dưới tên RM trong header. | P2 | `virtual-rm-chat.page.ts` (header block) | Presentational |

## 4. Chat & typing indicator

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 13 | Bong bóng tin nhắn không có ARIA live-region — đã tự ghi nhận là "known gap" trong `phase-5.6-conversational-ux.md`, chưa từng được sửa. | Người dùng screen-reader không được thông báo khi có tin nhắn RM mới xuất hiện. | Thêm `aria-live="polite"` vào container danh sách tin nhắn. | P1 | `virtual-rm-chat.page.ts` | Presentational (không đổi logic, chỉ thêm ARIA attr) |
| 14 | Typing indicator (`rm-typing.component.ts`) đã tôn trọng `prefers-reduced-motion` — không có vấn đề. | — | Không cần sửa. | — | — | — |
| 15 | Không có test TestBed/component cho `virtual-rm-chat.page.ts` — chỉ có test cho `message-builder.ts` logic (39 test) và Playwright thủ công, đã tự ghi nhận là "honest gap". | Thay đổi UI chat trong task này có nguy cơ regress mà unit test không bắt được. | Không bắt buộc phải lấp gap này trong scope hiện tại, nhưng nên chạy Playwright thủ công kỹ ở Phase 10 để bù. | P2 | — | — |

## 5. Voice interaction

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 16 | Nút mic bị disable (`opacity-30`) khi trình duyệt không hỗ trợ `SpeechRecognition`, nhưng không có tooltip/label giải thích tại sao — chỉ mờ đi. | Người dùng trên trình duyệt không hỗ trợ (vd Firefox) thấy nút mờ, không hiểu vì sao. | Thêm `title`/`aria-label` giải thích khi disabled. | P2 | chat input bar trong `virtual-rm-chat.page.ts` | Presentational |
| 17 | 2 cơ chế giọng nói tách biệt (mic STT trong input bar, toggle TTS trong header) — không có 1 điểm hiển thị trạng thái hợp nhất "đang ghi âm/đang phiên dịch/lỗi" theo đúng 4 trạng thái đặc tả yêu cầu (recording/transcribing/error/permission-denied). | Trạng thái lỗi quyền micro có thể không được phản ánh rõ ràng bằng UI chuyên biệt. | Kiểm tra `RmVoiceService` có expose đủ 4 state chưa; nếu thiếu, bổ sung UI cho trạng thái lỗi/từ chối quyền. | P1 | `rm-voice.service.ts`, chat input | Functional |

## 6. Banking forms — chung

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 18 | 3 wizard Trade Finance (LC/Bảo lãnh/Nhờ thu) trộn lẫn nhãn tiếng Anh (Beneficiary, Applicant, Issuing Bank, Drawee, Drawer, Expiry Date) và tiếng Việt (Loại LC, Giá trị, Chứng từ yêu cầu) **trong cùng 1 form**. | Vi phạm trực tiếp yêu cầu "modern enterprise **corporate banking**" nhất quán ngôn ngữ — không chuyên nghiệp với người dùng doanh nghiệp Việt Nam, gây khó hiểu cho user không rành thuật ngữ SWIFT tiếng Anh. | Việt hoá toàn bộ nhãn còn lại (Beneficiary→Người thụ hưởng, Applicant→Bên yêu cầu, Issuing Bank→Ngân hàng phát hành, Drawee→Bên bị ký phát, Drawer→Bên ký phát). | **P0** | `lc-create.page.ts`, `guarantee-create.page.ts`, `collection-create.page.ts` | Presentational (label-only, không đổi field name/logic) |
| 19 | `.input` class định nghĩa cục bộ lặp lại giống hệt nhau ở `single-transfer.page.ts:181` và `command-detail.page.ts:105` thay vì 1 class dùng chung toàn cục. | Vi phạm DRY — sửa style input phải sửa nhiều nơi, dễ lệch dần theo thời gian. | Chuyển `.input` vào `@layer components` trong `src/styles.scss`, xoá bản cục bộ. | P1 | `src/styles.scss`, 2 file trên | Presentational |
| 20 | Cả 4 form đều đã có: nhãn rõ, validate/warning trước submit, review trước khi gửi, mobile-friendly (Tailwind responsive) — không có vấn đề lớn ở phần hành vi chung. | — | Không cần sửa hành vi chung. | — | — | — |

## 7. Transfer form (12-field checklist)

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 21 | Đối chiếu 12 field bắt buộc với `single-transfer.page.ts`: 8/12 khớp đầy đủ (Tài khoản nguồn, Tên người thụ hưởng, STK thụ hưởng, Ngân hàng thụ hưởng, Số tiền, Loại tiền, Nội dung, Người chịu phí). **"Tên tài khoản nguồn" và "Số dư khả dụng" chỉ hiển thị lồng bên trong text của `<option>` dropdown**, không phải field/label độc lập. **"Ghi chú" hoàn toàn không tồn tại**. "Ngày hiệu lực" hiện đang optional với label "Ngày thực hiện (tuỳ chọn)" khác cách gọi trong đặc tả. | Không đạt đúng yêu cầu tường minh "12 field bắt buộc" của đặc tả — đặc biệt "Số dư khả dụng" ẩn trong dropdown khiến người dùng khó kiểm tra trước khi nhập số tiền lớn hơn số dư. | Sau khi chọn tài khoản nguồn: hiện riêng 2 dòng read-only "Tên tài khoản nguồn" + "Số dư khả dụng" ngay dưới select. Thêm field "Ghi chú" (textarea, optional, tách khỏi Nội dung chuyển tiền). | **P0** | `single-transfer.page.ts` | Functional (thêm field mới vào form + `BankingCommand.formData`, không đổi validation engine bắt buộc) |
| 22 | Form có thêm field "Mục đích chuyển tiền" (`transferPurpose`, required) không nằm trong 12-list của đặc tả. | Không sai, nhưng thừa so với đặc tả — cần quyết định giữ hay gộp vào "Nội dung". | Giữ nguyên (đã có business value — dùng để phân loại mục đích cho báo cáo) nhưng làm rõ trong UI đây là field bổ sung ngoài 12 field chuẩn, không phải trùng lặp. | P2 | `single-transfer.page.ts` | Presentational |

## 8. Maker workspace (Lệnh giao dịch)

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 23 | Như mục #1/#7 — hoàn toàn chưa có UI, dù backend đã sẵn sàng 100% (`GET /api/commands`, `PUT`, `POST .../submit`). | Maker không "xem trạng thái/audit trail lệnh của mình" được — 1 trong các hành vi bắt buộc liệt kê ở Phase 7. | Trang mới (đã lên kế hoạch ở #1) — bảng + filter theo status/loại, click vào xem chi tiết dùng lại `command-detail.page.ts` ở chế độ read-only cho Maker. | **P0** | trang mới | Functional |

## 9. Checker queue

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 24 | `approval.page.ts` gọi cứng `checkerQueue('PENDING_CHECKER')` — **không có UI filter theo loại/số tiền/maker/status** dù đây là yêu cầu tường minh của Phase 7 ("filters (type/amount/maker/status)"). | Checker không lọc được hàng chờ khi số lượng lệnh lớn; không xem lại được các lệnh đã duyệt/từ chối từ cùng màn hình. | Thêm dropdown/filter bar (loại, khoảng số tiền, maker, status — kể cả xem lại APPROVED/REJECTED không chỉ PENDING_CHECKER). | **P0** | `approval.page.ts` | Functional (mở rộng query params, backend `checkerQueue()` cần nhận thêm filter — kiểm tra service hiện có hỗ trợ chưa) |
| 25 | Badge cảnh báo trong bảng chỉ dùng 3 màu (đỏ/cam/hổ phách) cho 4 mức severity — INFO bị gộp chung màu với WARNING. | Mất phân biệt trực quan giữa "chỉ để biết" (INFO) và "cần chú ý" (WARNING) ngay ở bảng danh sách. | Thêm màu riêng cho INFO (sky) khớp với `warning-panel.component.ts` đã định nghĩa sẵn. | P1 | `approval.page.ts` | Presentational |
| 26 | 2 bảng riêng biệt trên cùng trang (`BankingCommand` mới + `Transaction` cũ) — bảng cũ hiển thị action duyệt/từ chối ngay trên dòng (khác hẳn luồng modal xác nhận của bảng mới). | Không nhất quán trải nghiệm giữa 2 luồng — nhưng đây là **có chủ đích** (dữ liệu lịch sử, không có lệnh mới nào đi qua đường cũ nữa). | Giữ nguyên hành vi, chỉ cần label rõ hơn "Lịch sử cũ (trước nâng cấp)" để không gây hiểu nhầm là 2 hàng chờ song song đang hoạt động. | P2 | `approval.page.ts` | Presentational |

## 10. Command detail

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 27 | Đầy đủ: status badge, field theo loại, warning-panel dùng chung, approve/reject có dialog xác nhận, reject bắt buộc lý do, audit trail timeline — không có vấn đề chức năng. | — | Không cần sửa hành vi. | — | — | — |
| 28 | Vẫn dùng local `.btn-danger` override thay vì class chung (liên quan #19). | Trùng lặp style nhỏ. | Gộp vào lần sửa #19. | P2 | `command-detail.page.ts` | Presentational |

## 11. Validation messages & warnings

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 29 | `WarningSeverity` thực tế = `INFO/WARNING/HIGH/BLOCKING` (4 mức), đặc tả Phase 8 yêu cầu `INFO/WARNING/BLOCKING_ERROR/SUCCESS`. Không có mức "SUCCESS" trong model hiện tại; "HIGH" không có trong đặc tả mới, "BLOCKING" vs "BLOCKING_ERROR" khác tên. | Không phải lỗi — 2 danh sách severity phục vụ mục đích khác nhau (SUCCESS thường không phải "warning" mà là trạng thái xác nhận riêng). Đổi tên `severity` sẽ là breaking change xuyên suốt 743 test đã pass. | **Không đổi model/type hiện có** (rủi ro cao, lợi ích thấp) — chỉ bổ sung khái niệm "SUCCESS state" như 1 loại card riêng (không phải Warning) cho các màn hình cần xác nhận thành công, giữ nguyên 4 mức Warning hiện tại. | P1 (quyết định kiến trúc, không phải bug) | `server/src/models/index.ts`, `warning-panel.component.ts` | Functional — cần cân nhắc kỹ trước khi đổi |
| 30 | `Warning` hiện tại không có `createdAt`/`resolvable`/`metadata` như đặc tả Phase 8 liệt kê. | Không chặn nghiệp vụ — các field này phục vụ khả năng mở rộng (audit khi nào cảnh báo phát sinh, có tự xử lý được không) chưa có use-case cụ thể trong demo hiện tại. | Không bổ sung nếu không có màn hình nào thật sự dùng đến — tránh "over-engineer" theo đúng nguyên tắc đã nêu trong đặc tả gốc (Phase 9 ban list). | P2 | — | — |

## 12. Approval flow

Đã kiểm tra kỹ ở Slice 4-7 của nâng cấp Maker/Checker trước đó (743/743 test, kể cả Maker≠Checker,
double-approve, idempotency) — không phát hiện vấn đề mới trong audit này. Chỉ có 2 gap UI đã liệt
kê ở mục #23/#24 (Maker không có trang xem lệnh của mình; Checker queue thiếu filter).

## 13. Empty / loading / error states

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 31 | Chưa khảo sát trực tiếp từng trang trong lần audit này (ngoài phạm vi 8 mục Explore đã chạy) — cần xác minh trực quan ở Phase 10 (Playwright) trước khi kết luận có vấn đề hay không. | Chưa rõ. | Xác minh bằng Playwright ở Phase 10: trang rỗng (chưa có lệnh nào), đang tải (network chậm), lỗi API. | P1 (cần xác minh) | nhiều trang | — |

## 14. Mobile responsiveness

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 32 | Sidebar (off-canvas drawer) + header (ẩn/hiện theo breakpoint) đã có responsive thật, không chỉ tài liệu suông — xác nhận qua code thật (`lg:hidden`, `fixed lg:static`, v.v.). | — | Không cần sửa cấu trúc responsive hiện có. | — | — | — |
| 33 | Virtual RM full-screen trên mobile thực ra khớp đúng yêu cầu đặc tả ("mobile: full-screen bottom sheet/panel") — chỉ thiếu phần desktop (xem #10). | — | Gộp vào quyết định #10. | — | — | — |

## 15. Accessibility

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 34 | Không có ARIA live-region cho tin nhắn chat mới (#13), launcher nổi không rõ có `aria-label` đầy đủ hay không (đặc tả Phase 5 yêu cầu tường minh "accessible label" cho launcher). | Người dùng dùng trình đọc màn hình khó dùng được Virtual RM. | Kiểm tra + bổ sung `aria-label` cho `rm-chat-launcher.component.ts`; thêm live-region cho chat. | P1 | `rm-chat-launcher.component.ts`, `virtual-rm-chat.page.ts` | Presentational |

## 16. Typography, spacing, color, radius, buttons, tables

| # | Current issue | Impact | Recommended change | Priority | Target | F/P |
|---|---|---|---|---|---|---|
| 35 | `docs/msb-design-system.md` vẫn ghi font là "Satoshi" nhưng `tailwind.config.js` thực tế đã đổi sang "Be Vietnam Pro" từ trước (lý do: Satoshi không có glyph tiếng Việt) — tài liệu bị lỗi thời, không phải bug code. | Tài liệu sai gây hiểu nhầm khi có người đọc doc để tra token thật. | Sửa `docs/msb-design-system.md` mục Typography — việc này thuộc Phase 3 (design-system.md sẽ thay thế/hợp nhất). | P1 | `docs/msb-design-system.md` | Presentational (chỉ sửa doc) |
| 36 | Bảng màu (`brand`/`ink`/`positive`/`negative`/`warn`), radius (`xl2`), shadow (`card`/`pop`) đã nhất quán, không phát hiện giá trị hex rời rạc ngoài token trong các file đã đọc. | — | Không cần sửa — Phase 3 chỉ cần **formalize** thành `design-system.md` đầy đủ hơn (button variants/table styles/modal styles hiện chưa có tài liệu riêng dù code đã nhất quán). | P2 (formalize, không phải fix) | `docs/design-system.md` (mới) | Presentational |
| 37 | Không có tài liệu chính thức cho **table style** (Checker queue, Maker list) hay **modal/drawer style** (dialog xác nhận approve/reject) — code nhất quán nhưng chưa có token/quy ước bằng văn bản. | Rủi ro trôi dạt phong cách khi thêm bảng/modal mới trong tương lai. | Bổ sung 2 mục này vào `docs/design-system.md` (Phase 3), mô tả đúng pattern đã có trong `approval.page.ts`/`command-detail.page.ts` reject-dialog. | P1 | `docs/design-system.md` (mới) | Presentational |

## Tổng kết ưu tiên

**P0 (6 mục — chặn đúng yêu cầu tường minh của đặc tả)**: #1/#7/#23 (trang "Lệnh giao dịch" cho
Maker), #10 (quyết định kiến trúc Virtual RM desktop panel vs full-screen), #18 (Việt hoá form Trade
Finance), #21 (đủ 12 field Transfer), #24 (filter Checker queue).

**P1 (11 mục)**: chủ yếu là hoàn thiện nhãn/IA (Thông báo, Lịch sử hoạt động, nhãn sidebar), a11y
(ARIA live-region, label), và formalize design system thành văn bản.

**P2 (còn lại)**: tinh chỉnh không cấp thiết.

**Không có mục nào đề xuất xoá bỏ chức năng nghiệp vụ đang hoạt động** — đúng ràng buộc của đặc tả
gốc.
