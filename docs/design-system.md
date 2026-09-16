# Design System — Modern Enterprise Corporate Banking

Tài liệu này **hợp nhất và mở rộng** `docs/msb-design-system.md` thành đặc tả đầy đủ theo yêu cầu
Phase 3 (đặc tả redesign UI). Không viết lại token đã đúng — chỉ chính thức hoá những gì code đã
làm nhất quán nhưng chưa có văn bản (button variants, form field states, table styles, alert
styles, badge styles, modal/drawer styles) và sửa 1 chỗ tài liệu cũ đã lỗi thời (font).

> **Về Huashu Design skill**: theo quyết định của người dùng, chỉ mượn **nguyên tắc thẩm mỹ** của
> skill này (chống "AI slop", nguyên tắc Swiss-grid), không chạy quy trình 3-hướng-song-song của nó
> (quy trình đó dành cho mockup HTML tĩnh, tự loại trừ "production web app cần backend" — xem
> `SKILL.md` dòng 3, 53). 2 nguyên tắc áp dụng trực tiếp vào hướng thiết kế bên dưới:
> - **Chống AI slop**: không dùng gradient tím, không dùng emoji làm icon chính, không dùng card bo
>   tròn + border-accent bên trái (tổ hợp "2020-2024 SaaS" đã bị lạm dụng), không nền tối đồng đều
>   + neon glow chung chung. App này đã tránh được các lỗi này từ trước — giữ nguyên.
> - **Kỷ luật lưới Thuỵ Sĩ**: phân cấp bằng cỡ chữ/khoảng cách, không bằng trang trí; căn trái, không
>   căn giữa; lưới nhất quán. Đã khớp với cách dùng Tailwind hiện tại (căn trái, `.card` phẳng, không
>   trang trí thừa).

## 1. Color tokens

Nguồn thật: `tailwind.config.js` + `src/styles/design-tokens.scss` (2 file phải khớp nhau).

| Token | Value | Dùng cho |
|---|---|---|
| `brand-500` | `#ef4b2a` | Hành động chính, nav active, link |
| `brand-50…900` | thang 9 bậc | Gradient hero, badge info, hover |
| `ink-50…900` | thang 9 bậc | Chữ, viền, nền surface |
| `positive` | `#0d9488` | Số tiền ghi có, trạng thái thành công |
| `negative` | `#dc2626` | Số tiền ghi nợ, lỗi, hành động phá huỷ |
| `warn` | `#d97706` | Cảnh báo, việc ưu tiên trung bình |

Nền trang: `ink-50`. Surface (card/header/sidebar): trắng.

**Nguyên tắc**: không tự phát minh màu mới ngoài bảng trên (đúng nguyên tắc chống slop — "không
tự phát minh màu tại chỗ" làm giảm độ nhận diện thương hiệu).

## 2. Typography

- Font: **Be Vietnam Pro** (Google Fonts) — *sửa lỗi tài liệu cũ*: `docs/msb-design-system.md`
  từng ghi "Satoshi", nhưng Satoshi không có glyph tiếng Việt (dấu thanh/đ/ư/ơ rơi font) nên đã đổi
  từ trước, chỉ chưa cập nhật tài liệu. `design-system.md` này là nguồn đúng.
- Thang cỡ chữ (khớp `design-tokens.scss`):

| Cấp | Class Tailwind | rem | Dùng cho |
|---|---|---|---|
| H1 | `text-xl font-semibold` | 1.25rem | Tiêu đề trang ("Xin chào, {company}") |
| H2 | `text-sm font-semibold` | 0.875rem | Tiêu đề card/section |
| Body | `text-sm` | 0.875rem | Nội dung mặc định |
| Caption | `text-xs text-ink-400` | 0.75rem | Chú thích, mô tả phụ |
| Micro | `text-[10px]` | 0.625rem | Nhãn số liệu dày đặc (panel RM) |

- Line-height: `leading-snug` (tiêu đề lớn), `leading-relaxed` (nội dung).
- Trọng số: 400 (thường), 500 (medium — nhãn field), 600 (semibold — tiêu đề), 700 (bold — số tiền
  nổi bật).

## 3. Spacing, radius, shadow, breakpoint

- Spacing: thang mặc định Tailwind (hệ 4px/0.25rem — không phải hệ 8px như gợi ý ban đầu của đặc
  tả, nhưng đã nhất quán 100% trong toàn app; đổi sang hệ 8px sẽ là rework diện rộng không cần
  thiết cho một app đã ổn định — **giữ hệ 4px hiện tại**).
- Radius: `rounded-md` (0.375rem — input/control nhỏ), `rounded-lg` (0.5rem — nút, nav item),
  `rounded-xl` (0.75rem — stat tile), `rounded-xl2` (1rem, custom — card), `rounded-full` (badge,
  avatar, dot).
- Shadow: `shadow-card` (card nghỉ), `shadow-pop` (dropdown/sheet/modal).
- Breakpoint: mobile tham chiếu 390px, `lg` = 1024px (điểm chuyển sidebar/RM sang layout desktop),
  desktop tham chiếu 1440px.

## 4. Button variants

Định nghĩa 1 lần tại `src/styles.scss` `@layer components`, dùng lại mọi nơi — không có nút tự
viết style riêng ngoài các trường hợp local override cần dọn (xem mục 10).

| Class | Nền | Chữ | Dùng khi |
|---|---|---|---|
| `.btn-primary` | `brand-500` → hover `brand-600` | trắng | Hành động chính duy nhất trên 1 màn hình (Gửi duyệt, Phê duyệt, Xác nhận) |
| `.btn-secondary` | `ink-100` → hover `ink-200` | `ink-700` | Hành động phụ (Huỷ, Quay lại, Xem thêm) |
| `.btn-ghost` | trong suốt → hover `ink-100` | `ink-600` | Hành động ẩn/thứ 3 (Đóng, Bỏ qua) |
| `.btn-danger` | `negative` | trắng | Hành động phá huỷ/không thể hoàn tác (Từ chối, Huỷ lệnh) |

Trạng thái disabled: `disabled:opacity-50 disabled:cursor-not-allowed` (định nghĩa sẵn trong
`.btn` base). Không có riêng trạng thái "loading" chính thức — nơi cần (submit form) hiện dùng
`disabled` + đổi label tạm thời (vd "Đang gửi…"); giữ nguyên pattern này, không cần thêm spinner
component mới.

## 5. Form field states

Class `.input` hiện bị định nghĩa **cục bộ lặp lại** ở `single-transfer.page.ts` và
`command-detail.page.ts` (giống hệt nhau) — sẽ gộp thành 1 class dùng chung trong `styles.scss`
(việc này thuộc Phase 6). Trạng thái chuẩn hoá từ đây:

| Trạng thái | Style |
|---|---|
| Default | `border-ink-200 rounded-md text-base` (cỡ `text-base` không phải `text-sm` — cố ý, tránh Safari iOS tự zoom khi focus input) |
| Focus | viền `brand-400`, ring `brand-200` (`focus:border-brand-400 focus:ring-2 focus:ring-brand-200`) |
| Error/Blocking | viền `negative`, text lỗi `text-xs text-negative` ngay dưới field (khớp treatment của `app-warning-panel` mức BLOCKING) |
| Warning (không chặn) | viền `warn`, text `text-xs text-warn` dưới field |
| Disabled | `bg-ink-50 text-ink-400 cursor-not-allowed` |
| Readonly (giá trị tính toán, vd Số dư khả dụng sau khi chọn tài khoản) | `bg-ink-50 text-ink-700` không viền input, hiển thị như text tĩnh có nhãn — không cho gõ |

Nhãn field: `text-sm font-medium text-ink-700`, dấu `*` màu `negative` cho field bắt buộc.

## 6. Table styles

Chính thức hoá từ pattern đã dùng nhất quán ở `approval.page.ts`:

- Header: `text-xs font-medium text-ink-400 uppercase` (dùng `$table-header-text-color` = `ink-400`), nền `ink-50`, không viền dọc.
- Row: viền dưới `border-ink-100` (`$table-row-border-color`), padding `py-3 px-3`, hover
  `hover:bg-ink-50` cho row có thể click.
- Số tiền: căn phải, `font-semibold`, màu theo dấu (`positive`/`negative`/mặc định `ink-800`).
- Mobile: bảng dày (Checker queue, Maker list) cần `overflow-x-auto` trên container cha — xác minh ở
  Phase 10 cho từng bảng mới thêm.

## 7. Alert/warning styles

Nguồn thật: `Warning`/`WarningSeverity` (`server/src/models/index.ts`) + `warning-panel.component.ts`
— dùng chung 100% giữa Maker và Checker (yêu cầu bắt buộc đã có sẵn từ nâng cấp Maker/Checker
trước, không đổi trong lần redesign này).

| Severity | Nền | Viền | Chữ | Icon |
|---|---|---|---|---|
| `INFO` | `bg-sky-50` | `border-sky-200` | `text-sky-800` | ℹ️ |
| `WARNING` | `bg-amber-50` | `border-amber-200` | `text-amber-800` | ⚠️ |
| `HIGH` | `bg-orange-50` | `border-orange-300` | `text-orange-800` | 🔶 |
| `BLOCKING` | `bg-red-50` | `border-red-300` | `text-red-800` | ⛔ |

**Quyết định kiến trúc** (xem `docs/ui-ux-audit.md` mục #29): đặc tả Phase 8 gợi ý 4 mức khác
(`INFO/WARNING/BLOCKING_ERROR/SUCCESS`) — **không đổi `WarningSeverity` hiện có** vì đây là type
xuyên suốt 743 test server đã pass; đổi tên sẽ là breaking change rủi ro cao cho lợi ích thấp.
"SUCCESS" không phải là một mức độ cảnh báo — nơi cần xác nhận thành công (vd lệnh đã duyệt xong)
dùng pattern card riêng bên dưới, không đi qua `app-warning-panel`.

**Phạm vi dùng chung** (Phase 8 yêu cầu `<app-warning-panel>` xuất hiện ở Chat/Banking
form/Review/Maker detail/Checker detail/Notification center): đã đúng ở Banking form (cả 4 loại),
Review (cùng màn hình), Maker detail, Checker detail (5/6 điểm chạm — xác nhận qua code). Notification
center (trang `Thông báo` mới) dùng model `Alert` (`CRITICAL/WARNING/INFO`) — một khái niệm nghiệp
vụ khác `Warning` của BankingCommand (nhắc việc chủ động vs. lỗi validate 1 lệnh cụ thể), nên **không**
ép dùng chung component — tương tự Chat: Agent không tự validate/cảnh báo nữa (quyết định kiến trúc
đã chốt ở Slice 5/6 nâng cấp Maker/Checker — Agent chỉ tạo DRAFT, Maker luôn phải mở form thật để
thấy warning thật), nên không có warning nào phát sinh trong Chat để hiển thị.

**Success confirmation card** (pattern đã có ở `single-transfer.page.ts` màn "submitted"): nền
`bg-teal-50`, viền `border-teal-200`, chữ `text-positive`, icon ✅ — không phải Warning, là trạng
thái xác nhận riêng.

## 8. Badge styles

`app-badge` (`src/app/shared/components/badge/badge.component.ts`) — component dùng chung, 8 tone:

| Tone | Style | Dùng cho |
|---|---|---|
| `critical` / `high` | `bg-red-50 text-negative` | Lỗi, rủi ro cao |
| `warning` / `medium` | `bg-amber-50 text-warn` | Cảnh báo, rủi ro trung bình |
| `info` | `bg-brand-50 text-brand-600` | Thông tin trung tính có nhấn |
| `positive` | `bg-teal-50 text-positive` | Thành công, đã duyệt |
| `neutral` / `low` | `bg-ink-100 text-ink-600` | Trung tính, tiền tệ, danh mục |

Status badge cho `CommandStatus` (`command-detail.page.ts:statusClass`) dùng đúng bảng tone trên,
map theo: `DRAFT`→neutral, `PENDING_CHECKER`→warning, `APPROVED`→positive, `REJECTED`→critical,
`CANCELLED`→neutral, `FAILED`→critical.

## 9. Modal/drawer styles

- **Modal xác nhận** (`confirm-dialog.component.ts`, dùng chung toàn app qua `ConfirmDialogService`):
  backdrop `fixed inset-0 z-[60] bg-ink-900/40`, click ngoài để huỷ; nội dung `.card max-w-sm p-5
  shadow-pop`; nút Huỷ (`.btn-secondary`) + nút xác nhận (`.btn-primary` hoặc `.btn-danger` nếu
  `danger: true`). Đây là pattern chuẩn cho **mọi** hộp thoại xác nhận (approve/reject/huỷ lệnh) —
  không tạo modal riêng lẻ cho từng màn hình.
- **Drawer di động** (sidebar): `fixed lg:static`, `-translate-x-full` khi đóng → `translate-x-0`
  khi mở, kèm backdrop `lg:hidden`.
- **Virtual RM panel** (Phase 5, đang triển khai theo quyết định đã chốt với người dùng): desktop
  (`≥lg`) = side-panel nổi bên phải, không che nội dung trang; mobile (`<lg`) = full-screen như
  hiện tại. Xem chi tiết thiết kế tại mục Phase 5 trong `docs/ui-implementation-report.md`.

## 10. Việc dọn dẹp còn nợ (liên kết audit)

| Việc | Ưu tiên | Nguồn |
|---|---|---|
| Gộp `.input` cục bộ (2 nơi) thành class chung trong `styles.scss` | P1 | `ui-ux-audit.md` #19 |
| Sửa `docs/msb-design-system.md` mục Typography (Satoshi → Be Vietnam Pro) | P1 | `ui-ux-audit.md` #35 |
| Thêm màu badge riêng cho `INFO` ở bảng Checker queue (hiện gộp chung màu với `WARNING`) | P1 | `ui-ux-audit.md` #25 |

## 11. Responsive breakpoints

| Breakpoint | Giá trị | Hành vi |
|---|---|---|
| Mobile | `< 1024px` (`< lg`) | Sidebar = drawer off-canvas; Virtual RM = full-screen; header ẩn brand name/help text |
| Desktop | `≥ 1024px` (`≥ lg`) | Sidebar = cột cố định; Virtual RM = side-panel nổi (Phase 5); header đầy đủ |

Không có tầng "tablet" riêng — 1 điểm gãy `lg` duy nhất đã đủ cho toàn bộ layout hiện tại (xác nhận
qua khảo sát code, không có `md:` dùng cho layout lớn, chỉ dùng cho vài chi tiết nhỏ như
`sm:inline`).

## 12. Accessibility rules

- Tương phản: mọi tổ hợp text/nền trong bảng màu ở trên đạt tối thiểu WCAG AA (4.5:1) cho text
  thường — không tự phát minh tổ hợp mới ngoài bảng.
- `prefers-reduced-motion`: typing indicator (`rm-typing.component.ts`) đã tôn trọng — pattern này
  áp dụng cho mọi animation mới thêm (side-panel mở/đóng ở Phase 5 phải tắt animation khi user bật
  reduce-motion).
- Touch target: nút/link tương tác tối thiểu 44×44px trên mobile (chuẩn hiện tại của `.btn` +
  padding đã đạt, kiểm tra riêng cho `rm-chat-launcher` 56px — đạt).
- ARIA: form field bắt buộc cần `aria-required="true"`; danh sách tin nhắn chat cần
  `aria-live="polite"` (gap đã ghi nhận ở audit #13, sẽ vá ở Phase 5); launcher nổi cần
  `aria-label` mô tả rõ chức năng (audit #34).
