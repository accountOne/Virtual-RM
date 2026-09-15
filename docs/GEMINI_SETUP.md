# Hướng dẫn cài đặt Gemini AI Agent

Tài liệu này hướng dẫn cách bật tính năng AI Agent (Gemini Free Tier) cho Virtual RM. Xem thêm
`docs/AI_AGENT_ARCHITECTURE.md` để hiểu kiến trúc, `docs/GEMINI_AGENT_AUDIT.md` để hiểu bối cảnh
nâng cấp.

## 1. Lấy API key miễn phí từ Google AI Studio

1. Mở [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Đăng nhập bằng tài khoản Google.
3. Bấm **Create API key** (hoặc **Get API key** nếu lần đầu).
4. Chọn hoặc tạo một Google Cloud project (project miễn phí là đủ).
5. Copy API key vừa tạo — **không chia sẻ key này cho ai, không commit vào Git**.

## 2. Cấu hình biến môi trường

Dự án này **không dùng `dotenv`** — đúng quy ước sẵn có của repo (xem comment đầu file
`.env.example`: mọi biến `AI_*`/`OPENAI_*` đều được export trực tiếp trong shell trước khi chạy,
không đọc từ file `.env`). Làm tương tự với Gemini:

```bash
export GEMINI_API_KEY=your_gemini_api_key
export GEMINI_MODEL=gemini-flash-latest
```

Hoặc gộp vào lệnh chạy server:

```bash
GEMINI_API_KEY=your_gemini_api_key GEMINI_MODEL=gemini-flash-latest npm run dev --prefix server
```

Xem `.env.example` (đã cập nhật ở Phase B) để biết toàn bộ biến môi trường liên quan và comment
giải thích từng biến.

**Không có `GEMINI_API_KEY` thì sao?** Hệ thống **không lỗi** — `server/src/agent/gemini-client.ts`
tự phát hiện thiếu key (`geminiConfigured()` trả `false`) và toàn bộ luồng hiểu ngôn ngữ tự nhiên
tự động chuyển sang bộ quy tắc dự phòng xác định (`fallback-rule-engine.ts`) — xem
`docs/SEMANTIC_MODEL.md` §3. Đây chính là môi trường mặc định của repo này (không có key nào được
commit), và toàn bộ 687 test tự động của dự án (bao gồm cả phần Agent) chạy pass hoàn toàn trong
chế độ không có key.

**Model nào để dùng Free Tier?** Kiểm tra danh sách model hiện hành và giới hạn miễn phí tại
[ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models) — tên model
có thể đổi theo thời gian, ví dụ `gemini-2.0-flash` hoặc `gemini-flash-latest`. Đặt đúng tên vào
`GEMINI_MODEL`.

## 3. Cài dependency (chỉ cần làm 1 lần)

```bash
cd server
npm install
```

`@google/generative-ai` và `zod` đã được thêm vào `server/package.json` (Phase B) — `npm install`
sẽ tự tải về.

## 4. Chạy backend

```bash
# Từ thư mục gốc repo
npm run start:server
# hoặc
cd server && npm run dev
```

Server chạy ở `http://localhost:3000`.

## 5. Kiểm tra nhanh

### 5.1 Health check

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}
```

### 5.2 Đăng nhập lấy session (Agent yêu cầu đăng nhập, giống mọi API khác trong app)

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"msb_mk","password":"msb_mk@2026"}'
```

### 5.3 Gọi thử Agent

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/agent/message \
  -H "Content-Type: application/json" \
  -d '{"message":"Tài khoản của tôi còn bao nhiêu?"}'
```

Nếu có `GEMINI_API_KEY` thật hợp lệ, phần hiểu ngôn ngữ đi qua Gemini thật; nếu không, đi qua bộ
quy tắc dự phòng — cả hai trường hợp đều trả về JSON hợp lệ, không bao giờ lỗi 500 vì thiếu key.

## 6. Chạy frontend + trải nghiệm trong chat thật

```bash
npm run dev   # chạy cả client (ng serve) lẫn server (nodemon) cùng lúc, từ thư mục gốc
```

Mở `http://localhost:4200`, đăng nhập, vào **Virtual RM → Chat**, bấm nút **🤖 Agent** ở góc trên
bên phải header để bật chế độ AI Agent (mặc định tắt — không ảnh hưởng chat cũ), rồi gõ thử.

## 7. Lưu ý bảo mật

- **Không bao giờ commit `GEMINI_API_KEY` thật.** `.env`/`.env.local` đã có trong `.gitignore`.
- API key chỉ tồn tại ở backend (`server/src/agent/gemini-client.ts`) — Angular không bao giờ nhìn
  thấy hoặc cần biết key này.
- Đây là bản demo dùng **Free Tier** — không kết nối hệ thống ngân hàng thật, không dùng dữ liệu
  khách hàng thật, không thực hiện giao dịch thật (mọi hành động "chuyển tiền"/"mở LC"/... đều ghi
  vào file JSON mock, không đi qua hệ thống thanh toán/SWIFT thật nào).

## 8. Sự cố thường gặp

| Vấn đề | Nguyên nhân | Cách xử lý |
|---|---|---|
| `POST /api/agent/message` trả 401 | Chưa đăng nhập / session hết hạn | Đăng nhập lại (`POST /api/auth/login`) |
| Trả lời luôn là câu hỏi làm rõ dù đã cung cấp đủ thông tin | Đang chạy chế độ dự phòng (không có `GEMINI_API_KEY`) — bộ quy tắc dự phòng không trích xuất được tên người thụ hưởng tự do | Cấu hình `GEMINI_API_KEY` thật để dùng NLU đầy đủ — xem `docs/SEMANTIC_MODEL.md` §3 về giới hạn đã biết của chế độ dự phòng |
| `429`/lỗi quota từ Gemini | Vượt giới hạn Free Tier | Hệ thống tự động rơi về chế độ dự phòng, không crash — thử lại sau hoặc nâng cấp gói |
| Sửa code trong `server/src/agent/` không thấy hiệu lực | Chạy `node dist/server.js` (bản build cũ) thay vì `npm run dev` (nodemon, tự reload) | Dùng `npm run dev`/`npm run start:server` khi phát triển |
