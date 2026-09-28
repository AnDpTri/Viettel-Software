# Hệ thống sổ thu chi cá nhân — TASK_00030

Nền tảng quản lý tài chính cá nhân viết bằng TypeScript, Express, Prisma và PostgreSQL. Ngoài nghiệp vụ thu chi cốt lõi, hệ thống có phiên đăng nhập đa thiết bị, OAuth, tự động hóa, nhắc hóa đơn, cộng tác gia đình, PWA và trợ lý phân tích thông minh.

## Chạy nhanh bằng Docker

Yêu cầu: Docker Engine có Docker Compose v2.

```bash
docker compose up --build
```

Sau khi hai container ở trạng thái hoạt động:

- Giao diện web: `http://localhost:3000`
- API: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api-docs`
- Health check: `http://localhost:3000/health`
- PostgreSQL: `localhost:5432`

Migration được chạy tự động trước khi API khởi động. Muốn tạo dữ liệu demo:

```bash
docker compose exec api npm run db:seed:prod
```

Tài khoản demo sau khi seed:

- Định danh: `demo`
- Mật khẩu: `Demo@123`

> Tài khoản trên chỉ dùng cho môi trường phát triển. Không chạy seed hoặc giữ mật khẩu mẫu trong production.

## Triển khai miễn phí trên Render

Repository có sẵn Blueprint [`render.yaml`](./render.yaml), tự tạo một Web Service Docker và một PostgreSQL Free tại Singapore. JWT secret được Render sinh ngẫu nhiên; migration chạy tự động khi container khởi động.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/AnDpTri/Viettel-Software)

Sau khi đăng nhập Render và xác nhận Blueprint, địa chỉ ứng dụng có dạng `https://so-moc-finance-xxxx.onrender.com`. Hệ thống tự nhận hostname này cho CORS, cookie HTTPS, liên kết xác minh và callback OAuth. Nội dung hóa đơn được lưu trong PostgreSQL nên không bị mất khi Web Service sleep hoặc redeploy.

Giới hạn free tier cần biết:

- Web Service sleep sau thời gian không có truy cập; lần mở đầu tiên có thể mất khoảng một phút.
- Render PostgreSQL Free có dung lượng 1 GB và hết hạn sau 30 ngày. Để lưu dữ liệu lâu dài miễn phí, tạo PostgreSQL trên Neon/Supabase rồi thay `DATABASE_URL` trên Render trước khi database Render hết hạn.
- Google/GitHub OAuth chỉ xuất hiện sau khi thêm client ID/secret và đăng ký callback theo domain Render thực tế.
- Không seed tài khoản demo trên server public.

## Chạy tại máy phát triển

Yêu cầu: Node.js 22+, npm và PostgreSQL 15+.

```bash
copy .env.example .env
npm install
npm run prisma:generate
npm run migrate:dev
npm run db:seed
npm run dev
```

Các lệnh chính:

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy API và tự reload |
| `npm run build` | Kiểm tra TypeScript và tạo thư mục `dist` |
| `npm start` | Chạy bản đã build |
| `npm test` | Chạy unit test, xuất báo cáo coverage và áp ngưỡng 80% |
| `npm run test:e2e` | Kiểm thử 103 luồng API trên stack đang chạy và tự dọn dữ liệu test |
| `npm run test:ui` | Kiểm thử 24 hành trình UI/UX desktop và mobile |
| `npm run migrate:dev` | Tạo/chạy migration trong môi trường dev |
| `npm run migrate:deploy` | Chạy các migration đã duyệt trong môi trường triển khai |
| `npm run db:seed` | Tạo tài khoản và dữ liệu demo |
| `npm run db:seed:prod` | Seed từ mã đã build trong container |

## Biến cấu hình

| Biến | Bắt buộc | Mặc định / mô tả |
|---|---:|---|
| `DATABASE_URL` | Có | Chuỗi kết nối PostgreSQL |
| `JWT_ACCESS_SECRET` | Có | Bí mật ký access token, ít nhất 32 ký tự |
| `JWT_REFRESH_SECRET` | Có | Bí mật ký refresh token, ít nhất 32 ký tự và khác access secret |
| `JWT_ACCESS_EXPIRES_IN` | Không | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Không | `7d` |
| `RESET_TOKEN_EXPIRES_MINUTES` | Không | `15` phút |
| `PORT` | Không | `3000` |
| `APP_URL` | Không | URL công khai của backend/frontend xử lý reset password |
| `CORS_ORIGIN` | Không | Danh sách origin phân tách bằng dấu phẩy |
| `MAX_UPLOAD_MB` | Không | `5`; chỉ nhận JPG, PNG và PDF |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Production | Máy chủ gửi email |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Tùy SMTP | Thông tin xác thực và người gửi |
| `COOKIE_NAME`, `COOKIE_SECURE` | Không | Cookie refresh HttpOnly; bật Secure khi chạy HTTPS |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth Google | Thông tin ứng dụng Google; callback `/api/v1/auth/oauth/google/callback` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth GitHub | Thông tin OAuth App GitHub; callback `/api/v1/auth/oauth/github/callback` |
| `OAUTH_CALLBACK_BASE_URL` | OAuth | URL public của hệ thống, ví dụ `https://finance.example.com` |
| `AI_PROVIDER` | Không | `local`, `openai` hoặc `deepseek` |
| `AI_REQUEST_TIMEOUT_MS` | Không | Timeout gọi nhà cung cấp AI; mặc định `30000` ms |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Khi dùng OpenAI | Khóa và model cho trợ lý; không cần khi dùng bộ phân tích nội bộ |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` | Khi dùng DeepSeek | Lưu khóa trong secret manager/biến môi trường; model mặc định `deepseek-flash` |

Khi không cấu hình `SMTP_HOST` ở development, link đặt lại mật khẩu chỉ được ghi vào console. Ở production, hệ thống không ghi token reset ra log.

Trợ lý DeepSeek chỉ nhận bản tổng hợp tài chính 6 tháng (dòng tiền, nhóm chi, tiến độ ngân sách/mục tiêu, hóa đơn và khoản định kỳ), không nhận email, số điện thoại, token, nội dung hóa đơn hoặc dữ liệu giao dịch thô. Khi nhà cung cấp AI lỗi hoặc quá timeout, hệ thống tự chuyển sang bộ phân tích nội bộ và không làm gián đoạn giao diện.

## Chuẩn API

Endpoint nghiệp vụ nằm dưới `/api/v1`. Các endpoint trừ đăng ký, đăng nhập, refresh và quên/đặt lại mật khẩu đều cần header:

```http
Authorization: Bearer <access-token>
```

Response thành công:

```json
{
  "success": true,
  "message": "Thành công.",
  "data": {},
  "meta": { "page": 1, "limit": 20, "total": 25, "totalPages": 2 }
}
```

Response lỗi:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu không hợp lệ.",
    "details": {}
  }
}
```

Danh sách đầy đủ request/response và nút thử API có tại Swagger UI. Tệp nguồn là [openapi.yaml](openapi.yaml).

## Chức năng

- Đăng ký bằng username/mật khẩu và email hoặc số điện thoại; đăng nhập bằng cả ba loại định danh.
- Access token ngắn hạn, refresh token HttpOnly xoay vòng, ghi nhớ đăng nhập, phát hiện tái sử dụng token và quản lý từng thiết bị.
- Đăng nhập liên kết Google/GitHub, xác minh email, quên/đổi mật khẩu và đăng xuất mọi thiết bị.
- Hồ sơ, locale, dark mode, múi giờ, tiền tệ, xuất dữ liệu và vô hiệu hóa tài khoản.
- Danh mục cây có lưu trữ/khôi phục/gộp; ví ngân hàng, tiền mặt, thẻ tín dụng và ví dùng chung gia đình.
- Giao dịch thu/chi/chuyển khoản; trạng thái, nhãn, merchant, split, idempotency, thao tác hàng loạt, thùng rác, CSV và import.
- Hóa đơn đính kèm có kiểm tra ownership; mẫu giao dịch, giao dịch định kỳ và hóa đơn nhắc việc.
- Ngân sách lặp, rollover, ngưỡng cảnh báo; mục tiêu có ưu tiên, tạm dừng và đóng góp liên kết giao dịch.
- Báo cáo dòng tiền, đối soát, tài sản ròng, nhiều tiền tệ và tỷ giá thủ công.
- Trung tâm thông báo, audit log, nhóm gia đình và phân quyền thành viên ở tầng dữ liệu.
- Bộ phân tích nội bộ phát hiện bất thường/thuê bao, dự báo “an toàn có thể chi”, nhập câu tiếng Việt và trích xuất văn bản hóa đơn.
- Trợ lý dùng bộ máy nội bộ mặc định hoặc OpenAI tùy chọn; luôn trả nguồn xử lý và cảnh báo cần người dùng xác nhận.
- Dashboard responsive, hỗ trợ bàn phím, dark mode và PWA có cache app shell.

## Cấu trúc thư mục

```text
src/
  lib/          Tiện ích dùng chung, bảo mật, response, tính số dư
  middleware/   Xác thực và xử lý exception tập trung
  routes/       Các module REST theo nghiệp vụ
  services/     Dịch vụ hạ tầng (email)
prisma/
  migrations/   Migration SQL có constraint, index và foreign key
  schema.prisma Mô hình dữ liệu
  seed.ts       Dữ liệu kiểm thử thủ công
tests/          Unit test
public/         Dashboard web HTML/CSS/JavaScript
docs/           Thiết kế và báo cáo bàn giao
```

## Quy ước Git

Nhánh `main` phải vượt qua `npm run build` và `npm test`. Workflow CI nằm tại `.github/workflows/ci.yml`. Commit dùng Conventional Commits, ví dụ: `feat(wallet): add calculated balance` hoặc `fix(auth): revoke reset sessions`.

Xem thêm [Tài liệu thiết kế hệ thống](docs/THIET_KE_HE_THONG.md) và [Báo cáo kết quả](docs/BAO_CAO_KET_QUA.md).
