# Báo cáo kết quả TASK_00030

## 1. Thông tin chung

- Mã task: `TASK_00030`
- Tên: Xây dựng hệ thống sổ thu chi cá nhân (Backend)
- Giai đoạn: Giai đoạn 2 — Đào tạo kiến thức nghiệp vụ
- Nhóm thực hiện: Đặng Hoàng An, Nguyễn Trọng Đại, Hoàng Thanh Diệu, Phan Hữu Phước
- Phạm vi báo cáo: mã nguồn backend, cơ sở dữ liệu, đóng gói, kiểm thử và tài liệu vận hành

## 2. Kết quả theo yêu cầu

| Nhóm yêu cầu | Kết quả triển khai | Trạng thái |
|---|---|---|
| Xác thực | Đăng ký, đăng nhập, logout, refresh token, đổi/quên/reset mật khẩu | Hoàn thành |
| Hồ sơ | Xem và cập nhật hồ sơ, múi giờ, tiền tệ | Hoàn thành |
| Danh mục | CRUD danh mục cây, kiểm tra loại và vòng lặp | Hoàn thành |
| Ví | CRUD, lưu trữ/khôi phục, số dư tính từ sổ cái | Hoàn thành |
| Giao dịch | Thu/chi/chuyển khoản, CRUD, lọc, phân trang, chi tiết | Hoàn thành |
| CSV và hóa đơn | CSV UTF-8, upload/tải JPG/PNG/PDF có phân quyền | Hoàn thành |
| Ngân sách | CRUD, kỳ ngân sách, tiến độ chi tiêu | Hoàn thành |
| Mục tiêu | CRUD, đóng góp/điều chỉnh, tự cập nhật trạng thái | Hoàn thành |
| Báo cáo | Tổng hợp thu chi, theo danh mục/tháng, đối soát số dư ví | Hoàn thành |
| Response/exception | Envelope thống nhất và middleware xử lý lỗi tập trung | Hoàn thành |
| API Docs | OpenAPI 3.0 và Swagger UI | Hoàn thành |
| Migration | Schema đầy đủ kèm index, FK và check constraint | Hoàn thành |
| Đóng gói | Dockerfile nhiều stage và một `docker-compose.yml` | Hoàn thành |
| Test | 158 unit/API test trên toàn bộ `src`, ngưỡng coverage 80% (đạt statements 97%, branches 88%, functions 97%, lines 99%) | Hoàn thành |
| README | Môi trường, cách chạy, biến cấu hình, tài khoản demo | Hoàn thành |

## 3. Sản phẩm bàn giao

1. Mã nguồn TypeScript trong `src/`.
2. Prisma schema, migration SQL và seed trong `prisma/`.
3. Đặc tả API OpenAPI 3 sinh tự động từ route Express và schema Zod (`@asteasolutions/zod-to-openapi`), xem tại `/api-docs` (Swagger UI) hoặc `/api-docs.json`.
4. `Dockerfile` và `docker-compose.yml` chạy API cùng PostgreSQL.
5. Unit test và test API trong `tests/` (Vitest + Supertest trên schema PostgreSQL riêng), báo cáo HTML sinh tại `coverage/` khi chạy.
6. README và tài liệu thiết kế tiếng Việt.
7. CI kiểm tra build/test khi push hoặc tạo pull request vào `main`.

## 4. Tiêu chí nghiệm thu đề xuất

- `docker compose up --build` khởi động được database và API; `/health` trả HTTP 200.
- `npm run migrate:deploy` tạo đủ bảng trên database rỗng.
- Đăng ký tạo được ví/danh mục mặc định; đăng nhập nhận hai token.
- Người dùng A không truy cập được UUID tài nguyên của người dùng B.
- Số dư trước/sau thu, chi và chuyển khoản đúng; tổng hai ví không đổi khi chuyển nội bộ.
- CSV mở được tiếng Việt; hóa đơn sai định dạng hoặc quá dung lượng bị từ chối.
- Ngân sách và báo cáo phản ánh đúng khoảng ngày.
- `npm run build` và `npm test` thành công, coverage không dưới ngưỡng cấu hình.

## 5. Rủi ro và giới hạn

- Lưu tệp local volume phù hợp một node; production nhiều node cần object storage.
- Chưa có rate limiting, MFA, xác minh email/phone và antivirus cho file upload.
- Báo cáo tính trực tiếp từ giao dịch; dữ liệu rất lớn cần snapshot/materialized view.
- Quên mật khẩu dùng Email (đề bài cho chọn SMS hoặc Email). Gửi thư thật cần cấu hình `BREVO_API_KEY` và `MAIL_FROM`; Render bản miễn phí chặn cổng SMTP nên không dùng SMTP trực tiếp.
- `npm test` cần PostgreSQL đang chạy (`docker compose up -d db`) vì test API dùng database thật trên schema riêng.

## 6. Kết luận

Phiên bản bàn giao đáp ứng trọn luồng nghiệp vụ cốt lõi và các yêu cầu phi chức năng của task. Cấu trúc hiện tại thích hợp cho đào tạo, demo và làm nền MVP; các mục ở phần rủi ro là điều kiện cần bổ sung trước khi vận hành production ở quy mô lớn.
