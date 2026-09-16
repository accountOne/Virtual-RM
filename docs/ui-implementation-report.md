# UI Redesign — Implementation Report

Ngày: 16/09/2026. Toàn bộ 11 phase của đặc tả "Install Huashu Design Skill and Redesign Virtual RM
UI" đã thực hiện xong trên nhánh `claude/virtual-rm-demo-platform-k36qiq`, mỗi phase 1 commit riêng
(xem `git log`), có test + build + Playwright kiểm chứng sống ở mỗi bước — không chỉ tin vào kế
hoạch. Tài liệu này là báo cáo cuối theo đúng khuôn Phase 11 yêu cầu.

## 1. Cài đặt skill (Phase 1)

`npx skills add alchaincyf/huashu-design` chạy thành công — cài vào `.agents/skills/huashu-design/`,
symlink `.claude/skills/huashu-design` để Claude Code gọi được. Xác minh bằng cách đọc `SKILL.md`
(583 dòng) thật.

**Phát hiện quan trọng làm thay đổi cách dùng skill**: `SKILL.md` tự ghi rõ "生产级Web
App、SEO网站、需要后端的动态系统——这些不走本 skill" (production web app / hệ thống cần backend
không dùng skill này) — đúng trường hợp Virtual RM. Đã hỏi người dùng và được chọn phương án
khuyến nghị: **chỉ mượn nguyên tắc thẩm mỹ** (chống "AI slop" — không gradient tím, không emoji làm
icon chính, không card bo tròn+border-accent lạm dụng; kỷ luật lưới kiểu Thuỵ Sĩ — phân cấp bằng
cỡ chữ/khoảng cách chứ không trang trí), **không chạy quy trình nặng** của skill (3 subagent song
song ra HTML tĩnh, WebSearch fact-check, gate file, xuất video) vì quy trình đó dành cho mockup
tĩnh/slide/demo, không map được vào việc sửa component Angular thật. `.agents/`/`.claude/`/
`skills-lock.json` đã thêm vào `.gitignore` — đây là công cụ dev cục bộ, không phải dependency của
app, không commit vào repo.

Phase 1 cũng khảo sát toàn bộ repo (routes, components, style, form, Maker/Checker, responsive)
trước khi sửa bất kỳ dòng code nào — kết quả khảo sát nằm trong Phase 2.

## 2-3. Audit + Design System (docs đã có)

- `docs/ui-ux-audit.md` — 37 phát hiện cụ thể trên 16 nhóm (điều hướng, dashboard, Virtual RM, chat,
  form ngân hàng, Maker/Checker, cảnh báo, responsive, accessibility, typography...), mỗi dòng có
  Current issue/Impact/Recommended change/Priority/Target/Functional-vs-Presentational, tất cả có
  căn cứ file:line thật (không suy đoán).
- `docs/design-system.md` — chính thức hoá màu/typography/spacing/radius/shadow/button/form
  field state/table/alert/badge/modal/breakpoint/accessibility trên nền `docs/msb-design-system.md`
  đã có sẵn (không viết lại từ đầu — app đã có ngôn ngữ thị giác nhất quán trước khi audit này bắt
  đầu). Sửa 1 chỗ tài liệu cũ lỗi thời (Satoshi → Be Vietnam Pro, đã đổi trong code từ trước).

## 4. Kiến trúc thông tin (IA)

| Đích | Trạng thái trước | Đã làm |
|---|---|---|
| Tổng quan, Tài khoản, Thanh toán | Đã có | Giữ nguyên |
| Tài trợ thương mại | Nhóm tên "Trade Finance" | Đổi tên nhóm |
| **Lệnh giao dịch** | Backend `GET /api/commands` có sẵn nhưng không UI nào gọi | Trang mới `my-commands.page.ts`, route `/payments/my-commands` (+ `/payments/my-commands/:id` dùng lại `command-detail.page.ts` ở chế độ đọc) |
| Chờ duyệt | Nhãn "Phê duyệt" | Đổi nhãn |
| **Thông báo** | Chỉ có dropdown chuông trong header | Trang mới `notifications.page.ts`, route `/notifications` |
| Trợ lý RM ảo | Nhãn "Virtual RM" | Đổi nhãn hiển thị |
| **Lịch sử hoạt động** | Chỉ có audit trail theo từng lệnh (Checker-only) | Trang mới `activity-history.page.ts` + `GET /api/activity-history` (scoped theo role: Maker chỉ thấy lệnh của mình, Checker/Admin thấy hết — đúng phạm vi đã lộ qua Checker queue không lọc) |
| **Cài đặt** | Không tồn tại | Trang mới `settings.page.ts` — thông tin tài khoản đọc-only + toggle giọng đọc RM (chuyển từ header chat sang đây) |

## 5. Virtual RM

Thay đổi kiến trúc thật (không phải chỉnh nhỏ): trang chat trước đây full-screen trên **mọi** kích
thước màn hình (quyết định có chủ đích của lần redesign trước, `phase-5.6-full-screen-redesign.md`)
— đặc tả mới yêu cầu rõ side-panel/popup ở desktop để giữ ngữ cảnh trang đang làm. Đã hỏi người
dùng trước khi đảo ngược quyết định cũ, được chọn: **thêm side-panel cho desktop (≥1024px), giữ
full-screen cho mobile**.

- `virtual-rm-chat.page.ts`: container giờ responsive — `fixed inset-0` (mobile, không đổi) →
  `lg:inset-auto lg:top-20 lg:right-6 lg:bottom-6 lg:w-[420px] lg:rounded-2xl lg:shadow-pop` (desktop,
  panel nổi bên phải, dashboard/form phía sau vẫn thấy được). Sidebar/hamburger nhúng bên trong chỉ
  còn cần thiết ở mobile (`lg:hidden`) vì desktop đã có sidebar thật phía sau panel.
- Header đổi tên hiển thị "Virtual RM" → "Trợ lý RM ảo", thêm đúng dòng trạng thái bắt buộc "Đang
  sẵn sàng hỗ trợ".
- Badge tin nhắn chưa đọc trên launcher nổi (`RmChatSessionService.unreadCount`, reset khi mở trang
  chat) — trước đây launcher không có tín hiệu gì khi RM có tin mới.
- `aria-live="polite"` trên danh sách tin nhắn — vá 1 gap đã tự ghi nhận nhưng chưa từng sửa từ lần
  redesign trước (`phase-5.6-conversational-ux.md`).
- Launcher `aria-label` giờ nêu rõ tên trợ lý + số tin chưa đọc.

**Không đổi** (đã đủ tốt, xác nhận qua khảo sát code thật): typing indicator tôn trọng
`prefers-reduced-motion`; voice input có đủ trạng thái nghe/dịch/lỗi cơ bản; suggested actions +
welcome state đã đúng tinh thần đặc tả (gợi ý theo cả nghiệp vụ thường lẫn Trade Finance).

## 6. Banking forms

- **Transfer (12 field bắt buộc)**: trước đây 8/12 khớp trực tiếp, "Tên tài khoản nguồn"/"Số dư khả
  dụng" chỉ nằm lồng trong text `<option>`, "Ghi chú" hoàn toàn không có. Đã thêm 2 field đọc-only
  hiện ra sau khi chọn tài khoản nguồn + field "Ghi chú" thật (Zod schema, formData, xem trước,
  Checker detail đều cập nhật đồng bộ). Đủ 12/12.
- **LC/Bảo lãnh/Nhờ thu**: nhãn form trộn tiếng Anh (Beneficiary/Applicant/Issuing Bank/Drawer/
  Drawee/Expiry-Due Date) và tiếng Việt trong cùng 1 form — Việt hoá toàn bộ nhãn còn lại ở cả 3
  wizard tạo mới lẫn màn hình xem lại của Checker (`command-detail.page.ts`), không đổi tên field
  nội bộ nên không phá dữ liệu/test cũ.

## 7. Maker/Checker

- Nhãn trạng thái (`statusLabel()`) đổi khớp đúng chữ đặc tả: "Chờ kiểm soát" (thay "Chờ duyệt"),
  "Từ chối" (thay "Đã từ chối"). Giữ nguyên "Nháp"/"Đã duyệt"/"Đã hủy"/"Thất bại" (đã khớp sẵn).
  **"Hoàn tất" không thêm** — quyết định có chủ đích: hệ thống hiện thực thi đồng bộ ngay khi duyệt
  (APPROVED đã bao hàm "đã thực hiện xong"), không có trạng thái lấp lửng "đã duyệt nhưng chưa thực
  hiện" nào cần phân biệt thêm; thêm 1 status mới sẽ là breaking change cho state machine + 743 test
  đã pass, rủi ro cao/lợi ích thấp cho 1 demo app.
- Checker queue (`approval.page.ts`) trước đây hardcode `PENDING_CHECKER`, không filter gì — đã
  thêm filter Loại/Trạng thái/Người lập lệnh/Khoảng số tiền, cột Trạng thái riêng, và sửa badge
  cảnh báo mức INFO trước đây bị gộp màu với WARNING.
- Trang "Lệnh giao dịch" (mục 4) lấp đúng gap "Maker xem trạng thái/audit trail lệnh của mình" —
  dùng lại 100% endpoint Maker-legal đã có sẵn (`GET /api/commands`, `GET /api/commands/:id`,
  `GET /api/commands/:id/audit-events`), không thêm quyền mới.
- **Không đổi** (đã đúng từ trước, xác nhận lại không phá): Maker không tự duyệt được lệnh mình,
  Checker không sửa được form data, reject bắt buộc lý do, không duyệt trùng 2 lần — cả 4 vẫn có
  test HTTP thật pass.

## 8. Cảnh báo/Alert

`app-warning-panel` dùng chung Chat*/Banking form/Review/Maker detail/Checker detail — xác nhận 5/6
điểm chạm đúng yêu cầu (*Chat và Notification center dùng model khác — xem lý do kiến trúc trong
`docs/design-system.md` §7, không phải thiếu sót). Sửa màu INFO ở Checker queue.

## 9. Kế hoạch triển khai

Thực hiện tuần tự đúng theo audit: Phase 4 (IA, rủi ro thấp nhất) → Phase 6 (form field, contained)
→ Phase 5 (Virtual RM panel, rủi ro kiến trúc cao nhất, làm sau khi đã có nền tảng ổn định) → Phase
7/8 gộp vào các commit liên quan. Mỗi bước: build production sạch + `tsc --noEmit` + full test suite
+ Playwright sống trước khi qua bước sau — không có bước nào chỉ dựa vào kế hoạch mà không code.

## Files đã tạo mới

```
docs/ui-ux-audit.md
docs/design-system.md
docs/ui-implementation-report.md          (tài liệu này)
src/app/features/payments/pages/my-commands/my-commands.page.ts
src/app/features/notifications/notifications.page.ts
src/app/features/activity-history/activity-history.page.ts
src/app/features/settings/settings.page.ts
server/src/controllers/commands.controller.ts    (thêm activityHistory handler)
server/src/services/commands.service.ts          (thêm activityHistoryFor())
```

## Files đã sửa (chính)

```
src/app/shared/components/sidebar/sidebar.component.ts     nhãn + nav item mới
src/app/shared/components/header/header.component.ts       link "Xem tất cả" trong dropdown chuông
src/app/features/payments/pages/approval/approval.page.ts  filter + status column + màu INFO
src/app/features/payments/pages/command-detail/command-detail.page.ts   dual-mode Maker/Checker, nhãn status, nhãn LC/GT/Collection
src/app/features/payments/pages/single-transfer/single-transfer.page.ts  đủ 12 field
src/app/features/trade-finance/pages/{lc,guarantee,collection}-create.page.ts   Việt hoá nhãn
src/app/features/virtual-rm/pages/virtual-rm-chat/virtual-rm-chat.page.ts   side-panel desktop
src/app/features/virtual-rm/interaction/rm-chat-session.service.ts   unreadCount/markAllRead
src/app/features/virtual-rm/components/rm-chat-launcher/rm-chat-launcher.component.ts  badge
src/app/core/services/commands.service.ts   makerAuditTrail(), activityHistory(), checkerQueue() tuỳ chọn status
src/styles.scss                              gộp .input dùng chung
server/src/domain/rules/transfer.rules.ts   thêm field notes
server/src/routes/index.ts                  route GET /api/activity-history
docs/msb-design-system.md                    sửa lỗi tài liệu (font)
```

## Known limitations

- Trang "Lịch sử hoạt động"/"Thông báo" mới, chưa có test đơn vị riêng ở tầng Angular (chỉ có
  test HTTP server-side cho `GET /api/activity-history` — 3 test mới, 746/746 tổng cộng) và xác
  minh sống bằng Playwright — khớp đúng mức độ test hiện có cho các trang tương tự khác trong app
  (vd `footprint.page.ts` cũng không có unit test riêng).
- "Hoàn tất" không có trong `CommandStatus` — nêu rõ lý do kiến trúc ở mục 7, không phải thiếu sót
  bị bỏ quên.
- Virtual RM desktop side-panel không có animation mở/đóng riêng biệt (chỉ route transition mặc
  định của Angular) — đủ dùng cho demo, có thể tinh chỉnh thêm nếu cần chuyển động mượt hơn.
- `docs/msb-design-system.md` và `docs/design-system.md` tồn tại song song (1 file cũ + 1 file mới
  formalize thêm) thay vì gộp làm 1 — giữ vậy để không phá liên kết nội bộ đã có tới file cũ.

## Kết quả kiểm chứng

- **Server**: 746/746 test pass (`npm test --prefix server`), `tsc --noEmit` sạch.
- **Frontend**: `ng build --configuration production` sạch, 39/39 interaction test pass
  (`npm run test:interaction`).
- **Playwright sống** (không chỉ tin kế hoạch): 43/43 kiểm tra ở regression cuối cùng — toàn bộ
  route chính trên desktop (1440px)/tablet (768px)/mobile (390px) cho cả 3 vai trò (Maker/Checker/
  Admin), luồng Maker tạo lệnh chuyển tiền thật → Checker thấy đúng lệnh → phê duyệt → trạng thái
  "Đã duyệt" hiển thị đúng; sidebar drawer mobile mở/đóng được; không có console error mới ngoài 1
  lỗi môi trường đã biết từ trước (proxy TLS chặn tải Google Fonts trong sandbox — không phải lỗi
  ứng dụng).

## Đề xuất bước tiếp theo (không nằm trong phạm vi lần này)

1. Animation mở/đóng cho Virtual RM side-panel (hiện là instant route transition).
2. Unit test tầng Angular cho các trang mới (my-commands/notifications/activity-history/settings) —
   hiện chỉ có test HTTP backend + Playwright.
3. Cân nhắc gộp `docs/msb-design-system.md` vào `docs/design-system.md` thành 1 file duy nhất khi
   có dịp làm lại toàn bộ tài liệu design (hiện giữ 2 file để không phá link cũ).
