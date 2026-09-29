# Hệ thống sổ thu chi cá nhân — TASK_00030

Nền tảng quản lý tài chính cá nhân viết bằng TypeScript, Express, Prisma và PostgreSQL. Ngoài nghiệp vụ thu chi cốt lõi, hệ thống có phiên đăng nhập đa thiết bị, OAuth, tự động hóa, nhắc hóa đơn, cộng tác gia đình, PWA và trợ lý phân tích thông minh.

## Môi trường

| Thành phần          | Phiên bản                                                       |
| ------------------- | --------------------------------------------------------------- |
| Node.js             | 22 LTS (image `node:22-alpine`)                                 |
| PostgreSQL          | 17 (image `postgres:17-alpine`; chạy tại máy cần 15+)           |
| Docker              | Docker Engine có Docker Compose v2                              |
| Ngôn ngữ, framework | TypeScript 5.9, Express 4, Prisma 6, Zod 3                      |
| Kiểm thử            | Vitest 4 + Supertest, coverage V8; Playwright cho E2E giao diện |

## Chạy nhanh bằng Docker

```bash
docker compose up --build
```

Một lệnh khởi động đủ ba thành phần: `db` (PostgreSQL), `mailpit` (hộp thư nhận email hệ thống) và `api` (backend kèm giao diện web). Container `api` chờ database healthy, tự chạy migration, tự tạo tài khoản test rồi mới nhận request.

Sau khi các container ở trạng thái hoạt động:

- Giao diện web: `http://localhost:3000`
- API: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api-docs`
- Health check: `http://localhost:3000/health`
- PostgreSQL: `localhost:5432`
- Hộp thư demo (Mailpit): `http://localhost:8025`. Mọi email hệ thống gửi (quên mật khẩu, xác minh email) hiện ở đây.

Trợ lý AI là tùy chọn. Không có khóa nhà cung cấp AI thì toàn bộ chức năng khác vẫn chạy, chỉ màn Trợ lý thông minh báo chưa cấu hình. Muốn bật, đặt `DEEPSEEK_API_KEY` (hoặc `AI_PROVIDER=openai` + `OPENAI_API_KEY`) trong môi trường trước khi chạy `docker compose up`.

## Gửi email thật (quên mật khẩu, xác minh email)

| Môi trường                                                | Email đi đâu                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `docker compose` không có khóa Brevo                      | Mailpit `http://localhost:8025`: hộp thư giả để xem thư, không gửi ra Internet |
| Có `BREVO_API_KEY` (máy dev, compose hoặc Render)         | Gửi thật tới hộp thư người nhận qua API HTTPS của Brevo                        |
| `npm run dev` với `SMTP_HOST=localhost`, `SMTP_PORT=1025` | Mailpit `http://localhost:8025` (cần `docker compose up -d mailpit`)           |
| `npm run dev` không cấu hình gì                           | Liên kết in ra console của server                                              |

Render bản miễn phí chặn cổng SMTP (25, 465, 587) từ 26/9/2025, nên SMTP như Gmail không gửi được từ đó. Hệ thống gửi qua API HTTPS của [Brevo](https://www.brevo.com) (miễn phí 300 thư/ngày, không cần tên miền riêng):

1. Tạo tài khoản Brevo; ở **Senders, Domains & Dedicated IPs → Senders**, thêm và xác minh email người gửi (ví dụ Gmail của bạn).
2. Ở **SMTP & API → API Keys**, tạo khóa API.
3. Trên Render (Environment của Web Service) đặt `BREVO_API_KEY` = khóa vừa tạo và `MAIL_FROM` = email người gửi đã xác minh, rồi deploy lại.

Thư từ địa chỉ Gmail gửi qua dịch vụ trung gian có thể rơi vào mục Spam; người nhận nên kiểm tra cả thư mục này.

## Tài khoản test

`docker compose up` và bản triển khai Render đều tạo sẵn tài khoản sau (biến `SEED_DEMO=true`). Seed chạy mỗi lần khởi động: không tạo trùng dữ liệu, và luôn đưa tài khoản về đúng mật khẩu, hạng VIP.

| Định danh                        | Mật khẩu   | Hạng                                              | Dữ liệu có sẵn                                                                                        |
| -------------------------------- | ---------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `demo` (hoặc `demo@example.com`) | `Demo@123` | VIP: dùng Trợ lý AI không giới hạn lượt theo ngày | 2 ví (Tiền mặt 2.000.000 ₫, Tài khoản ngân hàng 10.000.000 ₫), 3 danh mục (Lương, Ăn uống, Di chuyển) |

Đây là tài khoản dùng chung nên được bảo vệ: không đổi được mật khẩu, email/số điện thoại và không xóa được (trả 403 `DEMO_ACCOUNT_PROTECTED`). Để thử các chức năng đó, hãy đăng ký một tài khoản riêng. Trợ lý AI chỉ hoạt động khi máy chủ có khóa nhà cung cấp AI.

Chạy tại máy (không dùng Docker) thì tạo tài khoản này bằng `npm run db:seed`. Muốn thử luồng người dùng mới, đăng ký tài khoản khác ngay trên giao diện hoặc qua `POST /api/v1/auth/register`. Email quên mật khẩu/xác minh xem ở Mailpit `http://localhost:8025` (hoặc hộp thư thật nếu đã cấu hình Brevo, xem mục trên).

> Mật khẩu `Demo@123` là công khai. Với hệ thống thật chứa dữ liệu người dùng, tắt `SEED_DEMO`.

## Triển khai miễn phí trên Render

Repository có sẵn Blueprint [`render.yaml`](./render.yaml), tự tạo một Web Service Docker và một PostgreSQL Free tại Singapore. JWT secret được Render sinh ngẫu nhiên; migration chạy tự động khi container khởi động.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/AnDpTri/Viettel-Software)

Sau khi đăng nhập Render và xác nhận Blueprint, địa chỉ ứng dụng có dạng `https://so-moc-finance-xxxx.onrender.com`. Hệ thống tự nhận hostname này cho CORS, cookie HTTPS, liên kết xác minh và callback OAuth. Nội dung hóa đơn được lưu trong PostgreSQL nên không bị mất khi Web Service sleep hoặc redeploy.

Giới hạn free tier cần biết:

- Web Service sleep sau thời gian không có truy cập; lần mở đầu tiên có thể mất khoảng một phút.
- Render PostgreSQL Free có dung lượng 1 GB và hết hạn sau 30 ngày. Để lưu dữ liệu lâu dài miễn phí, tạo PostgreSQL trên Neon/Supabase rồi thay `DATABASE_URL` trên Render trước khi database Render hết hạn.
- Google/GitHub OAuth chỉ xuất hiện sau khi thêm client ID/secret và đăng ký callback theo domain Render thực tế.
- Blueprint bật `SEED_DEMO=true` để người đánh giá đăng nhập ngay bằng `demo` / `Demo@123` (VIP). Muốn tắt, xóa biến này trên Render.

## Chạy tại máy phát triển

Yêu cầu: Node.js 22+, npm và PostgreSQL 15+.

```bash
cp .env.example .env          # Windows: copy .env.example .env — rồi điền JWT secret riêng
docker compose up -d db mailpit   # hoặc dùng PostgreSQL có sẵn, sửa DATABASE_URL trong .env
npm install
npm run prisma:generate
npm run migrate:dev
npm run db:seed
npm run build:web                 # build giao diện một lần; khi sửa giao diện thì chạy thêm npm run dev:web
npm run dev
```

Các lệnh chính:

| Lệnh                                            | Tác dụng                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`                                   | Chạy API và tự reload (phục vụ giao diện đã build trong `web/dist`)                             |
| `npm run dev:web`                               | Chạy giao diện bằng Vite ở `http://localhost:5173`, tự reload, chuyển `/api` sang cổng 3000     |
| `npm run build`                                 | Build API vào `dist` và giao diện vào `web/dist` (kiểm tra TypeScript cả hai phần)              |
| `npm start`                                     | Chạy bản đã build                                                                               |
| `npm test`                                      | Unit test + test API, xuất báo cáo coverage và áp ngưỡng 80% (cần PostgreSQL, xem mục Kiểm thử) |
| `npm run test:e2e`                              | Kiểm thử 119 luồng API trên stack đang chạy và tự dọn dữ liệu test                              |
| `npm run test:agent-batch`                      | Kiểm tra nhóm thay đổi của Agent trên database thật, không gọi AI                               |
| `npm run test:agent`                            | Kịch bản Agent với nhà cung cấp AI thật; tự bỏ qua khi máy chủ chưa có khóa AI                  |
| `npm run test:ui`                               | Kiểm thử 25 hành trình UI/UX desktop và mobile                                                  |
| `npm run docs:openapi`                          | Xuất đặc tả OpenAPI sinh từ code ra `openapi.json`                                              |
| `npm run migrate:dev`                           | Tạo/chạy migration trong môi trường dev                                                         |
| `npm run migrate:deploy`                        | Chạy các migration đã duyệt trong môi trường triển khai                                         |
| `npm run db:seed`                               | Tạo tài khoản và dữ liệu demo                                                                   |
| `npm run db:seed:prod`                          | Seed từ mã đã build trong container                                                             |
| `npm run vip:grant -- user1,user2 [YYYY-MM-DD]` | Cấp VIP vĩnh viễn hoặc đến ngày chỉ định                                                        |
| `npm run vip:revoke -- user1,user2`             | Thu hồi VIP và đưa tài khoản về FREE                                                            |

## Biến cấu hình

| Biến                                       |       Bắt buộc | Mặc định / mô tả                                                                                                                                                            |
| ------------------------------------------ | -------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             |             Có | Chuỗi kết nối PostgreSQL                                                                                                                                                    |
| `JWT_ACCESS_SECRET`                        |             Có | Bí mật ký access token, ít nhất 32 ký tự                                                                                                                                    |
| `JWT_REFRESH_SECRET`                       |             Có | Bí mật ký refresh token, ít nhất 32 ký tự và khác access secret                                                                                                             |
| `JWT_ACCESS_EXPIRES_IN`                    |          Không | `15m`                                                                                                                                                                       |
| `JWT_REFRESH_EXPIRES_IN`                   |          Không | `7d`                                                                                                                                                                        |
| `RESET_TOKEN_EXPIRES_MINUTES`              |          Không | `15` phút                                                                                                                                                                   |
| `PORT`                                     |          Không | `3000`                                                                                                                                                                      |
| `APP_URL`                                  |          Không | URL công khai của backend/frontend xử lý reset password                                                                                                                     |
| `CORS_ORIGIN`                              |          Không | Danh sách origin phân tách bằng dấu phẩy                                                                                                                                    |
| `MAX_UPLOAD_MB`                            |          Không | `5`; chỉ nhận JPG, PNG và PDF                                                                                                                                               |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`    |     Production | Máy chủ gửi email                                                                                                                                                           |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`      |       Tùy SMTP | Thông tin xác thực và người gửi                                                                                                                                             |
| `BREVO_API_KEY`                            |     Production | Khóa API Brevo để gửi email thật qua HTTPS. Có khóa này thì bỏ qua SMTP                                                                                                     |
| `MAIL_FROM`, `MAIL_FROM_NAME`              | Khi dùng Brevo | Email người gửi (phải xác minh trong Brevo) và tên hiển thị, mặc định `Sổ Mộc`. Không đặt thì dùng `SMTP_FROM`                                                              |
| `COOKIE_NAME`, `COOKIE_SECURE`             |          Không | Cookie refresh HttpOnly; bật Secure khi chạy HTTPS                                                                                                                          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |   OAuth Google | Thông tin ứng dụng Google; callback `/api/v1/auth/oauth/google/callback`                                                                                                    |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |   OAuth GitHub | Thông tin OAuth App GitHub; callback `/api/v1/auth/oauth/github/callback`                                                                                                   |
| `OAUTH_CALLBACK_BASE_URL`                  |          OAuth | URL public của hệ thống, ví dụ `https://finance.example.com`                                                                                                                |
| `AI_PROVIDER`                              |          Không | `deepseek` (mặc định) hoặc `openai`; không hỗ trợ mô hình local                                                                                                             |
| `AI_REQUEST_TIMEOUT_MS`                    |          Không | Timeout gọi nhà cung cấp AI; mặc định `30000` ms                                                                                                                            |
| `AI_DAILY_LIMIT`                           |          Không | Số lượt gọi AI tối đa mỗi người dùng mỗi ngày; mặc định `30`                                                                                                                |
| `AI_RATE_LIMIT_PER_MINUTE`                 |          Không | Giới hạn thao tác agent mỗi phút; mặc định `6`                                                                                                                              |
| `AI_IMAGE_MAX_MB`                          |          Không | Dung lượng tối đa của ảnh hóa đơn gửi agent; mặc định `5` MB                                                                                                                |
| `OPENAI_API_KEY`, `OPENAI_MODEL`           |          Không | Khóa và model khi chọn OpenAI; thiếu khóa thì chỉ Trợ lý AI bị tắt                                                                                                          |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`       |          Không | Lưu khóa trong secret manager/biến môi trường; model mặc định `deepseek-flash`                                                                                              |
| `NODE_ENV`                                 |          Không | `development` (mặc định), `test` hoặc `production`. Production mặc định cookie Secure; thiếu cấu hình email thì báo lỗi `EMAIL_DELIVERY_FAILED` thay vì ghi liên kết ra log |
| `LOG_HTTP_DETAILS`                         |          Không | `false`; `true` ghi thêm khu vực tính năng, tên trường body/query và mã lỗi vào log mỗi request (không ghi giá trị)                                                         |
| `SEED_DEMO`                                |          Không | `false`; `true` tạo/khôi phục tài khoản dùng thử `demo` (VIP) khi container khởi động, hiện gợi ý tài khoản trên trang đăng nhập và khóa đổi mật khẩu/xóa tài khoản đó      |
| `TEST_DATABASE_URL`                        |  Khi chạy test | Schema PostgreSQL riêng cho `npm test`, mặc định `…/personal_finance?schema=vitest`; bắt buộc có `?schema=` khác `public`                                                   |

Mẫu đầy đủ nằm trong [`.env.example`](.env.example).

## Kiểm thử

```bash
docker compose up -d db   # PostgreSQL cho test
npm test
```

`npm test` chạy 158 test Vitest trên **toàn bộ mã nguồn backend** (chỉ bỏ `src/server.ts`, tệp khởi động tiến trình) và fail nếu statements, branches, functions hoặc lines dưới 80%. Kết quả hiện tại: statements 97%, branches 88%, functions 97%, lines 99%. Báo cáo chi tiết ở `coverage/index.html`.

- **Unit test thuần**: tính số dư, cây danh mục, CSV, JWT, validation, cấu hình, phân tích câu tiếng Việt, thông báo lỗi tiếng Việt, tài liệu OpenAPI.
- **Test API** (`tests/api-*.test.ts`): gọi app Express thật bằng Supertest qua middleware, validation và Prisma trên một schema PostgreSQL riêng. Schema này được xóa, tạo lại và chạy migration mỗi lần test, nên không đụng dữ liệu dev. Nhà cung cấp AI, email (Brevo, SMTP) và OAuth được giả lập; test không bao giờ gọi mạng ngoài và luôn bỏ qua khóa AI trong `.env`.
- **Test Agent** (`tests/agent-service.test.ts`, `tests/api-assistant.test.ts`): đề xuất → xác nhận → hoàn tác cho từng công cụ ghi, nhóm nhiều bước tham chiếu lẫn nhau, và vòng lặp gọi mô hình với phản hồi DeepSeek giả lập.

### Hướng dẫn người dùng mới

Tài khoản mới có luồng thiết lập bốn bước dựa trên dữ liệu thật: hoàn thiện hồ sơ, tạo ví, thiết lập danh mục và ghi giao dịch đầu tiên. Lần đăng nhập đầu, một chuỗi slide hỏi người dùng muốn Sổ Mộc giúp gì, tiền đang ở đâu (tạo ví kèm số dư), nhóm thu chi hay dùng (chỉ tạo các nhóm được chọn) và ghi thử khoản chi đầu tiên; bước nào đã có dữ liệu thì bỏ qua. Sau đó là hướng dẫn tại chỗ: làm tối màn hình, chỉ sáng từng nút kèm một câu giải thích. Mỗi màn (Giao dịch, Báo cáo, Kế hoạch, Trợ lý) có hướng dẫn ngắn tự hiện ở lần mở đầu tiên. Xem lại bằng **Hướng dẫn nhanh** cuối menu; làm lại thiết lập trong Hồ sơ.

Menu chính gồm Tổng quan (tab Báo cáo), Giao dịch, Kế hoạch (tab Ngân sách, Mục tiêu, Định kỳ, Hóa đơn, Nhãn, Gia đình) và Trợ lý; Ví và Danh mục nằm trong nhóm Thiết lập. Mục tiêu liên kết ví tiết kiệm thì mỗi lần góp là một giao dịch chuyển khoản thật từ ví được chọn (`fromWalletId`).

Giao diện và Agent dùng chung trạng thái thiết lập. Agent nhận biết màn hình hiện tại, có công cụ đọc tiến độ, ví, danh mục và hướng dẫn từng khu vực; từ đó chỉ gợi ý bước gần nhất và có thể đưa người dùng đến đúng màn hình. Trên điện thoại có nút ghi giao dịch nhanh, điều hướng giữ URL theo từng màn hình, biểu mẫu giao dịch ẩn các trường nâng cao và báo cáo có trực quan hóa thu/chi.

### Agent tài chính Sổ Mộc

Mục Trợ lý thông minh là một agent trong một khung chat duy nhất. Agent lưu hội thoại, tạo tóm tắt ngữ cảnh và ghi nhớ dài hạn khi người dùng yêu cầu. DeepSeek/OpenAI tự quyết định trả lời trực tiếp hay gọi công cụ native; không có nhánh hardcode riêng cho chào hỏi, hỏi khả năng, nhớ/quên hoặc câu nói thông thường.

Agent có thể tìm kiếm/tổng hợp giao dịch, chuẩn bị CSV, xem hóa đơn sắp đến hạn; tạo, sửa, xóa và phân loại giao dịch; chuyển khoản; quản lý ví, danh mục, ngân sách, mục tiêu, hóa đơn, lịch định kỳ và quy tắc tự động; đóng góp mục tiêu, đối soát số dư và hỗ trợ người dùng mới theo đúng ngữ cảnh. Mọi thay đổi được hiển thị dưới dạng bản xem trước và chỉ thực hiện sau khi người dùng xác nhận. Hành động có nhật ký audit và cơ chế hoàn tác phù hợp với từng loại thao tác.

Khi dùng nhà cung cấp AI bên ngoài, người dùng phải đồng ý trong giao diện. Nội dung hội thoại và ghi chú giao dịch do người dùng chủ động nhập, kể cả thông tin cá nhân nhạy cảm, có thể được gửi để xử lý đúng yêu cầu; mật khẩu, token và khóa bí mật luôn bị loại khỏi ngữ cảnh. Khóa API chỉ đọc từ biến môi trường; hệ thống áp dụng quota ngày và giới hạn theo phút.

Tài khoản mới mặc định là `FREE`. Quản trị viên cấp `VIP` bằng lệnh quản trị cho username cụ thể; migration không tự nâng hạng tài khoản nào. Ngoại lệ duy nhất là tài khoản dùng thử `demo`, được seed ở hạng VIP khi bật `SEED_DEMO`. VIP có thể vĩnh viễn hoặc có ngày hết hạn, không bị quota AI theo ngày nhưng vẫn chịu giới hạn tốc độ ngắn hạn để chống spam và chi phí ngoài ý muốn.

Đăng ký chỉ cần tên đăng nhập và mật khẩu; email và số điện thoại là tùy chọn; email dùng để khôi phục mật khẩu. Đăng nhập bằng tên đăng nhập hoặc email (email không phân biệt hoa thường). Quên mật khẩu yêu cầu nhập **email** của tài khoản (không nhận tên đăng nhập) để nhận liên kết đặt lại, hết hạn sau `RESET_TOKEN_EXPIRES_MINUTES` phút và chỉ dùng một lần. Báo cáo tổng hợp và đối soát xuất CSV bằng `?format=csv`.

Khi không cấu hình `SMTP_HOST` ở development, link đặt lại mật khẩu chỉ được ghi vào console. Ở production, hệ thống không ghi token reset ra log.

Trợ lý chỉ nhận hồ sơ tối thiểu, phần hội thoại gần đây, tóm tắt hội thoại và các ghi nhớ người dùng đã xác nhận. Dữ liệu tài chính chi tiết chỉ được lấy qua công cụ khi mô hình thấy cần. Backend kiểm tra schema, quyền sở hữu và quy tắc nghiệp vụ của từng lời gọi công cụ; công cụ đọc chạy ngay, còn công cụ ghi chỉ tạo bản xem trước chờ xác nhận. Tin nhắn có trạng thái xử lý/thành công/thất bại và có thể thử lại. Khi nhà cung cấp trả nội dung rỗng, lỗi hoặc quá timeout, API trả lỗi rõ ràng, ghi log an toàn và không chuyển sang mô hình local.

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

### Tài liệu API tự sinh

Tài liệu OpenAPI 3 được **sinh tự động từ mã nguồn** bằng thư viện [`@asteasolutions/zod-to-openapi`](https://github.com/asteasolutions/zod-to-openapi), không có tệp đặc tả viết tay:

- Danh sách endpoint, phương thức, tham số đường dẫn và yêu cầu đăng nhập được đọc thẳng từ bảng route của Express (`src/docs/openapi.ts`). Route mới tự xuất hiện trong tài liệu.
- Body và query lấy từ **chính schema Zod mà handler dùng để kiểm tra dữ liệu**, nên ràng buộc (bắt buộc, độ dài, enum, định dạng) trong tài liệu luôn khớp với API.
- Mỗi router mô tả endpoint của mình ngay trong file route bằng `documentRoutes(...)` (tóm tắt, mã lỗi nghiệp vụ). Test `tests/openapi.test.ts` sẽ fail nếu có route chưa được mô tả.

| Đường dẫn              | Nội dung                                                              |
| ---------------------- | --------------------------------------------------------------------- |
| `/api-docs`            | Swagger UI, thử API trực tiếp (bấm **Authorize** và dán access token) |
| `/api-docs.json`       | Đặc tả OpenAPI dạng JSON, import được vào Postman                     |
| `npm run docs:openapi` | Xuất đặc tả ra tệp `openapi.json`                                     |

## Chức năng

- Đăng ký bằng tên đăng nhập và mật khẩu, email/số điện thoại tùy chọn; đăng nhập bằng tên đăng nhập hoặc email; quên mật khẩu bằng liên kết gửi tới email.
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
- Trợ lý bắt buộc dùng DeepSeek hoặc OpenAI, không có mô hình AI local hay fallback local; luôn trả nguồn xử lý và yêu cầu người dùng xác nhận trước mọi thay đổi dữ liệu.
- Dashboard responsive, hỗ trợ bàn phím, dark mode và PWA có cache app shell.

## Cấu trúc thư mục

```text
src/
  app.ts          Dựng ứng dụng Express: bảo mật, route, tài liệu API, giao diện tĩnh, xử lý lỗi
  container.ts    Composition root: khởi tạo repository → service → controller, tiêm phụ thuộc qua constructor
  routes.ts       Bảng gắn router của từng module vào /api/v1
  core/           Hạ tầng dùng chung: cấu hình, Prisma, lỗi, HTTP, bảo mật, log, audit, email
  shared/         Hàm nghiệp vụ thuần: số dư ví, cây danh mục, CSV, lịch định kỳ, hạng tài khoản
  modules/<x>/    Mỗi nghiệp vụ một module: schemas → controller → service → repository, routes
  modules/agent/  Agent AI: bảng công cụ (tools/), gọi mô hình, vòng hỏi đáp, xác nhận/hoàn tác
  docs/           Sinh tài liệu OpenAPI từ route và schema Zod
web/
  index.html      Khung trang
  src/main.ts     Điểm vào: gắn sự kiện theo thứ tự và khởi động ứng dụng
  src/core/       Trạng thái, gọi API (tự làm mới phiên), DOM, định dạng, hộp thoại, Markdown
  src/features/   Mỗi màn hình/tính năng một module: giao dịch, ví, báo cáo, trợ lý, hướng dẫn…
  public/         Tệp tĩnh giữ nguyên tên: favicon, manifest, service worker
prisma/
  migrations/     Migration SQL có constraint, index và foreign key
  schema.prisma   Mô hình dữ liệu
  seed.ts         Tài khoản test demo
tests/            Unit test và test API (Vitest + Supertest)
scripts/          E2E API, E2E giao diện, E2E Agent, xuất OpenAPI
docs/             Thiết kế và báo cáo bàn giao
```

## Quy ước Git

Nhánh `main` phải vượt qua `npm run build` và `npm test`. Workflow CI nằm tại `.github/workflows/ci.yml`. Commit dùng Conventional Commits, ví dụ: `feat(wallet): add calculated balance` hoặc `fix(auth): revoke reset sessions`.

Xem thêm [Tài liệu thiết kế hệ thống](docs/THIET_KE_HE_THONG.md) và [Báo cáo kết quả](docs/BAO_CAO_KET_QUA.md).
